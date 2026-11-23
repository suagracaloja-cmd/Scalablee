import { describe, expect, it } from 'vitest'
import { computeScores } from '../../src/diagnostic/engine/score'
import { computePriorities, priorityScore } from '../../src/diagnostic/engine/priorities'
import { DIMENSION_IDS } from '../../src/diagnostic/engine/types'
import { all, byDim } from './helpers'

const prio = (a: ReturnType<typeof all>) => computePriorities(computeScores(a), a)

describe('três principais pontos de atenção', () => {
  it('são três dimensões distintas, com posições 1 a 3', () => {
    const p = prio(byDim({ financeiro: [0, 0, 1, 1, 0], comercial: [1, 2, 2, 1, 2] }))
    expect(p).toHaveLength(3)
    expect(new Set(p.map((x) => x.dim)).size).toBe(3)
    expect(p.map((x) => x.rank)).toEqual([1, 2, 3])
  })

  it('não são simplesmente as menores notas: lacunas de informação mudam a ordem', () => {
    // Atendimento: 7,0 (menor nota), sem lacunas. Gestão: 7,5, mas com uma resposta "não sei".
    const a = byDim(
      { atendimento: [1, 1, 1, 2, 2], gestao: [2, 2, 1, 1, null], financeiro: [3, 3, 3, 3, 3], comercial: [3, 3, 3, 3, 3], operacao: [3, 3, 3, 3, 3] },
      3,
    )
    const s = computeScores(a)
    expect(s.dims.atendimento.score15).toBe(7)
    expect(s.dims.gestao.score15).toBe(7.5)
    const p = computePriorities(s, a)
    // gestão tem nota maior, mas vem primeiro
    expect(p[0].dim).toBe('gestao')
    expect(p[1].dim).toBe('atendimento')
    expect(p[0].orderNote).toMatch(/atendimento e relacionamento/)
    expect(p[0].orderNote).toMatch(/respostas sem informação/)
    expect(p[0].reasons.join(' ')).toMatch(/resposta sem informação/)
  })

  it('processos inexistentes pesam mais que processos informais com a mesma nota', () => {
    // Mesmas notas (5/15): uma dimensão tem três zeros, a outra só informais.
    const a = byDim(
      { operacao: [0, 0, 0, 3, 2], comercial: [1, 1, 1, 1, 1], financeiro: [3, 3, 3, 3, 3], atendimento: [3, 3, 3, 3, 3], gestao: [3, 3, 3, 3, 3] },
      3,
    )
    const s = computeScores(a)
    expect(s.dims.operacao.score15).toBe(s.dims.comercial.score15)
    expect(priorityScore('operacao', s).score).toBeGreaterThan(priorityScore('comercial', s).score)
  })

  it('a importância da dimensão desempata dimensões iguais', () => {
    const a = byDim({ financeiro: [1, 1, 1, 1, 1], atendimento: [1, 1, 1, 1, 1] }, 3)
    const p = prio(a)
    expect(p[0].dim).toBe('financeiro')
    expect(p[1].dim).toBe('atendimento')
  })

  it('"Gestão e indicadores" ganha reforço quando duas ou mais áreas pedem atenção', () => {
    const weak = byDim({ gestao: [2, 2, 2, 2, 2], financeiro: [1, 1, 1, 1, 1], comercial: [1, 1, 1, 1, 1], atendimento: [3, 3, 3, 3, 3], operacao: [3, 3, 3, 3, 3] })
    const calm = byDim({ gestao: [2, 2, 2, 2, 2], financeiro: [3, 3, 3, 3, 3], comercial: [3, 3, 3, 3, 3], atendimento: [3, 3, 3, 3, 3], operacao: [3, 3, 3, 3, 3] })
    const w = priorityScore('gestao', computeScores(weak))
    const c = priorityScore('gestao', computeScores(calm))
    expect(w.foundation).toBe(true)
    expect(c.foundation).toBe(false)
    expect(w.score).toBeGreaterThan(c.score)
    expect(prio(weak).find((x) => x.dim === 'gestao')?.reasons.join(' ')).toMatch(/sem medição/)
  })

  it('explica cada prioridade com sinais objetivos das respostas', () => {
    const p = prio(byDim({ operacao: [0, 0, 1, 0, 1] }, 3))
    expect(p[0].dim).toBe('operacao')
    expect(p[0].reasons.join(' ')).toMatch(/3 de 5 práticas não existem/)
    expect(p[0].reasons.join(' ')).toMatch(/2 de 5 existem só de modo informal/)
    expect(p[0].evidence.length).toBeGreaterThan(0)
  })

  it('dimensão crítica nunca fica de fora', () => {
    for (let i = 0; i < DIMENSION_IDS.length; i++) {
      const spec: Record<string, (0 | 1 | 2 | 3 | null)[]> = {}
      DIMENSION_IDS.forEach((d, j) => (spec[d] = j === i ? [0, 0, 0, 0, 1] : [null, null, null, 2, 2]))
      const a = byDim(spec, 2)
      expect(prio(a).some((x) => x.dim === DIMENSION_IDS[i])).toBe(true)
    }
  })

  it('tudo "não sei" vira prioridade de descoberta, sem nota', () => {
    const p = prio(all(null))
    expect(p.every((x) => x.mode === 'discover')).toBe(true)
    expect(p[0].reasons.join(' ')).toMatch(/respostas sem informação/)
    expect(p[0].headline).toMatch(/informação suficiente/)
  })

  it('tudo 3 vira prioridade de manutenção', () => {
    const p = prio(all(3))
    expect(p).toHaveLength(3)
    expect(p.every((x) => x.mode === 'sustain')).toBe(true)
  })

  it('é determinístico', () => {
    const a = byDim({ financeiro: [0, 1, 2, 3, null], comercial: [1, 1, 0, 2, 2] })
    expect(prio(a)).toEqual(prio(a))
  })
})

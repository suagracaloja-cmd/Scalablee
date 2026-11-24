import { describe, expect, it } from 'vitest'
import {
  bandOf100,
  bandOf15,
  computeDimension,
  computeScores,
  fmtScore,
  isComplete,
  isLowConfidence,
} from '../../src/engine/score'
import { QUESTIONS } from '../../src/data/questions'
import { all, byDim } from './helpers'

describe('pontuação das dimensões', () => {
  it('tudo 3 dá 15 por dimensão, 75 pontos e nota 100', () => {
    const s = computeScores(all(3))
    for (const d of Object.values(s.dims)) {
      expect(d.score15).toBe(15)
      expect(d.band).toBe('established')
    }
    expect(s.overallRaw).toBe(75)
    expect(s.overall100).toBe(100)
    expect(s.band).toBe('established')
    expect(isComplete(all(3))).toBe(true)
  })

  it('tudo 0 dá nota 0 e situação crítica', () => {
    const s = computeScores(all(0))
    expect(s.overall100).toBe(0)
    expect(s.overallRaw).toBe(0)
    expect(s.band).toBe('critical')
    expect(Object.values(s.dims).every((d) => d.band === 'critical' && d.absent === 5)).toBe(true)
  })

  it.each([
    [4, 'critical'],
    [5, 'attention'],
    [8, 'attention'],
    [9, 'developing'],
    [12, 'developing'],
    [13, 'established'],
  ])('soma %i de 15 é classificada como %s', (sum, band) => {
    // Distribui a soma entre as 5 respostas, de 0 a 3.
    const levels: (0 | 1 | 2 | 3)[] = [0, 0, 0, 0, 0]
    let left = sum
    for (let i = 0; i < 5 && left > 0; i++) {
      const v = Math.min(3, left)
      levels[i] = v as 0 | 1 | 2 | 3
      left -= v
    }
    const d = computeDimension('financeiro', byDim({ financeiro: levels }))
    expect(d.raw).toBe(sum)
    expect(d.score15).toBe(sum)
    expect(d.band).toBe(band)
  })

  it('classifica notas com decimais pela parte inteira', () => {
    expect(bandOf15(4.9)).toBe('critical')
    expect(bandOf15(8.9)).toBe('attention')
    expect(bandOf15(12.9)).toBe('developing')
    expect(bandOf15(13)).toBe('established')
  })

  it('usa na escala 0–100 os mesmos cortes da escala 0–15', () => {
    expect(bandOf100(33)).toBe('critical')
    expect(bandOf100(34)).toBe('attention')
    expect(bandOf100(59)).toBe('attention')
    expect(bandOf100(60)).toBe('developing')
    expect(bandOf100(86)).toBe('developing')
    expect(bandOf100(87)).toBe('established')
    // 60/100 equivale a 9/15 e 87/100 passa de 13/15
    expect((60 / 100) * 15).toBe(9)
    expect((87 / 100) * 15).toBeGreaterThan(13)
    expect((86 / 100) * 15).toBeLessThan(13)
  })
})

describe('"Não sei" é lacuna de informação, não nota zero', () => {
  it('não rebaixa a nota da dimensão', () => {
    const withUnknown = computeDimension('financeiro', byDim({ financeiro: [3, 3, 3, 3, null] }))
    expect(withUnknown.score15).toBe(15) // 4 respostas 3, normalizadas para 15
    expect(withUnknown.unknown).toBe(1)
    expect(withUnknown.valid).toBe(4)
    const asZero = computeDimension('financeiro', byDim({ financeiro: [3, 3, 3, 3, 0] }))
    expect(asZero.score15).toBe(12)
    expect(withUnknown.score15).toBeGreaterThan(asZero.score15 as number)
  })

  it('normaliza a dimensão para a escala 0–15', () => {
    // soma 6 em 3 respostas válidas: 6/3*5 = 10
    const d = computeDimension('comercial', byDim({ comercial: [2, 2, 2, null, null] }))
    expect(d.valid).toBe(3)
    expect(d.score15).toBe(10)
    // soma 4 em 3 válidas: 4/3*5 = 6,666... => 6,7
    const e = computeDimension('comercial', byDim({ comercial: [1, 1, 2, null, null] }))
    expect(e.score15).toBe(6.7)
  })

  it('dimensão inteira sem informação não tem nota nem faixa', () => {
    const d = computeDimension('operacao', byDim({ operacao: [null, null, null, null, null] }))
    expect(d.score15).toBeNull()
    expect(d.band).toBeNull()
    expect(d.unknown).toBe(5)
  })

  it('a nota geral considera só as respostas válidas', () => {
    // 20 respostas 2 e 5 "não sei": 40/(3*20) = 66,6...% => 67
    const answers = byDim({ operacao: [null, null, null, null, null] }, 2)
    const s = computeScores(answers)
    expect(s.valid).toBe(20)
    expect(s.unknown).toBe(5)
    expect(s.overall100).toBe(67)
    expect(s.overallRaw).toBeNull()
    expect(s.unknownPct).toBe(20)
    expect(s.knownPct).toBe(80)
    expect(s.band).toBe('developing')
  })

  it('tudo "não sei" não gera nota, e não vira zero', () => {
    const s = computeScores(all(null))
    expect(s.overall100).toBeNull()
    expect(s.band).toBeNull()
    expect(s.unknownPct).toBe(100)
    expect(s.knownPct).toBe(0)
    for (const d of Object.values(s.dims)) expect(d.score15).toBeNull()
  })

  it('o percentual de "não sei" é sobre as 25 perguntas', () => {
    const a = all(3)
    a.fin1 = null
    a.fin2 = null
    a.ate1 = null
    expect(computeScores(a).unknownPct).toBe(12)
    expect(computeScores(a).unknown).toBe(3)
  })

  it('sinaliza leitura frágil quando há 1 ou 2 respostas válidas', () => {
    const d = computeDimension('gestao', byDim({ gestao: [3, 2, null, null, null] }))
    expect(isLowConfidence(d)).toBe(true)
    expect(isLowConfidence(computeDimension('gestao', byDim({ gestao: [3, 2, 2, null, null] })))).toBe(false)
    expect(isLowConfidence(computeDimension('gestao', byDim({ gestao: [null, null, null, null, null] })))).toBe(false)
  })

  it('respostas ainda não dadas não contam como "não sei"', () => {
    const partial = { fin1: 3 as const, fin2: null }
    const s = computeScores(partial)
    expect(s.answered).toBe(2)
    expect(s.unknown).toBe(1)
    expect(isComplete(partial)).toBe(false)
  })
})

describe('formatação', () => {
  it('usa vírgula e omite casa decimal inteira', () => {
    expect(fmtScore(10)).toBe('10')
    expect(fmtScore(6.7)).toBe('6,7')
    expect(fmtScore(null)).toBe('–')
  })
})

it('a cobertura de respostas respeita o total de perguntas', () => {
  expect(QUESTIONS).toHaveLength(25)
})

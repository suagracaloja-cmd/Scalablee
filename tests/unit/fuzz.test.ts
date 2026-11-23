import { describe, expect, it } from 'vitest'
import { QUESTIONS } from '../../src/diagnostic/data/questions'
import { buildReport } from '../../src/diagnostic/engine/report'
import { bandOf100, bandOf15 } from '../../src/diagnostic/engine/score'
import { PROFILE, randomAnswers, textsOf } from './helpers'
import type { TeamSize } from '../../src/diagnostic/engine/types'

const TEAMS: TeamSize[] = ['solo', '2-3', '4-7', '8-15', '16+']

/**
 * Teste de propriedades: 600 conjuntos de respostas aleatórios (com taxas diferentes de "não sei")
 * precisam sempre gerar um relatório coerente.
 */
describe('relatório para respostas aleatórias', () => {
  const rates = [0, 0.1, 0.3, 0.6, 0.9]
  const cases = Array.from({ length: 600 }, (_, i) => ({ seed: i + 1, rate: rates[i % rates.length], team: TEAMS[i % TEAMS.length] }))

  it('mantém as invariantes em todos os casos', () => {
    for (const { seed, rate, team } of cases) {
      const a = randomAnswers(seed, rate)
      const r = buildReport({ ...PROFILE, team }, a, '2026-11-23T12:00:00.000Z')
      const ctx = `seed=${seed} rate=${rate}`

      // pontuação
      expect(r.scores.valid + r.scores.unknown, ctx).toBe(25)
      for (const d of Object.values(r.scores.dims)) {
        expect(d.valid + d.unknown, ctx).toBe(5)
        if (d.score15 === null) {
          expect(d.valid, ctx).toBe(0)
          expect(d.band, ctx).toBeNull()
        } else {
          expect(d.score15, ctx).toBeGreaterThanOrEqual(0)
          expect(d.score15, ctx).toBeLessThanOrEqual(15)
          expect(d.band, ctx).toBe(bandOf15(d.score15))
        }
      }
      if (r.scores.overall100 === null) expect(r.scores.valid, ctx).toBe(0)
      else {
        expect(r.scores.overall100, ctx).toBeGreaterThanOrEqual(0)
        expect(r.scores.overall100, ctx).toBeLessThanOrEqual(100)
        expect(r.scores.band, ctx).toBe(bandOf100(r.scores.overall100))
      }
      expect(r.scores.unknownPct + r.scores.knownPct, ctx).toBeGreaterThanOrEqual(99)
      expect(r.scores.unknownPct + r.scores.knownPct, ctx).toBeLessThanOrEqual(101)

      // prioridades
      expect(r.priorities, ctx).toHaveLength(3)
      expect(new Set(r.priorities.map((p) => p.dim)).size, ctx).toBe(3)
      const critical = Object.values(r.scores.dims)
        .filter((d) => d.band === 'critical')
        .map((d) => d.id)
      for (const id of critical.slice(0, 3)) expect(r.priorities.some((p) => p.dim === id), `${ctx} crítica ${id}`).toBe(true)

      // plano
      expect(r.plan.now.length, ctx).toBeGreaterThanOrEqual(1)
      expect(r.plan.d30.length, ctx).toBeGreaterThanOrEqual(1)
      expect(r.plan.d90.length, ctx).toBeGreaterThanOrEqual(1)
      expect(r.plan.now.length + r.plan.d30.length + r.plan.d90.length, ctx).toBeLessThanOrEqual(13)

      // análise das cinco dimensões
      expect(r.dimensions, ctx).toHaveLength(5)
      for (const d of r.dimensions) {
        expect(d.reveals.length, `${ctx} ${d.id}`).toBeGreaterThan(0)
        expect(d.risks.length, `${ctx} ${d.id}`).toBeGreaterThan(0)
      }

      // texto limpo: sem sobras de template e sem strings vazias
      const all = textsOf(r)
      for (const t of all) expect(t.trim().length, ctx).toBeGreaterThan(0)
      const joined = all.join('\n')
      expect(joined, ctx).not.toMatch(/undefined|NaN|\[object|\$\{|\{\{|null/)

      // determinismo
      expect(buildReport({ ...PROFILE, team }, a, '2026-11-23T12:00:00.000Z'), ctx).toEqual(r)
    }
  })

  it('respostas diferentes geram relatórios diferentes', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      const r = buildReport(PROFILE, randomAnswers(seed, 0.1), 'x')
      seen.add(JSON.stringify([r.priorities.map((p) => p.dim), r.plan.now.map((i) => i.text), r.patterns.map((p) => p.id)]))
    }
    expect(seen.size).toBeGreaterThan(150)
  })

  it('cobre todas as 25 perguntas ao longo dos casos (todas aparecem no plano em algum relatório)', () => {
    const used = new Set<string>()
    for (let seed = 1; seed <= 400; seed++) {
      const r = buildReport(PROFILE, randomAnswers(seed, 0.2), 'x')
      for (const i of [...r.plan.now, ...r.plan.d30, ...r.plan.d90]) if (i.question) used.add(i.question)
    }
    expect([...used].sort()).toEqual(QUESTIONS.map((q) => q.id).sort())
  })
})

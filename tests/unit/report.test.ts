import { describe, expect, it } from 'vitest'
import { QUESTION_BY_ID, QUESTIONS } from '../../src/diagnostic/data/questions'
import { DIM_TEXT, PLAN_REDO, PLAN_TOPUP } from '../../src/diagnostic/engine/content'
import { buildReport } from '../../src/diagnostic/engine/report'
import { all, byDim, PROFILE, randomAnswers, textsOf } from './helpers'

const AT = '2026-11-23T12:00:00.000Z'
const report = (a: ReturnType<typeof all>, p = PROFILE) => buildReport(p, a, AT)

// Cenários do briefing.
const CLINIC_A = byDim({
  financeiro: [0, 0, 1, 0, 0], // crítico
  comercial: [3, 3, 3, 3, 3], // bem estabelecida
  operacao: [2, 2, 3, 2, 3], // em desenvolvimento
  atendimento: [2, 2, 2, 3, 2],
  gestao: [2, 2, 2, 2, 2],
})
const CLINIC_B = byDim({
  financeiro: [3, 3, 3, 3, 3], // bem estabelecida
  comercial: [0, 0, 1, 0, 0], // crítica
  operacao: [0, 1, 0, 0, 0], // crítica
  atendimento: [3, 2, 3, 3, 3],
  gestao: [2, 2, 1, 2, 2],
})

describe('personalização', () => {
  const A = report(CLINIC_A, { ...PROFILE, clinic: 'Clínica A' })
  const B = report(CLINIC_B, { ...PROFILE, clinic: 'Clínica B' })

  it('o briefing: clínica A (financeiro crítico) e B (comercial e operação críticos) recebem prioridades diferentes', () => {
    expect(A.scores.dims.financeiro.band).toBe('critical')
    expect(A.scores.dims.comercial.band).toBe('established')
    expect(A.scores.dims.operacao.band).toBe('developing')
    expect(B.scores.dims.financeiro.band).toBe('established')
    expect(B.scores.dims.comercial.band).toBe('critical')
    expect(B.scores.dims.operacao.band).toBe('critical')

    expect(A.priorities[0].dim).toBe('financeiro')
    expect(B.priorities.slice(0, 2).map((p) => p.dim).sort()).toEqual(['comercial', 'operacao'])
    expect(B.priorities.slice(0, 2).some((p) => p.dim === 'financeiro')).toBe(false)
  })

  it('explicações, padrões, plano e conexões com a SCALABLE são diferentes', () => {
    expect(A.overview.paragraphs).not.toEqual(B.overview.paragraphs)
    expect(A.patterns.map((p) => p.id)).not.toEqual(B.patterns.map((p) => p.id))
    expect(A.plan.now.map((i) => i.text)).not.toEqual(B.plan.now.map((i) => i.text))
    expect(A.plan.d30.map((i) => i.text)).not.toEqual(B.plan.d30.map((i) => i.text))
    expect(A.nextStep.intro).not.toEqual(B.nextStep.intro)

    const capsA = new Set(A.nextStep.connections.flatMap((c) => c.capabilities))
    const capsB = new Set(B.nextStep.connections.flatMap((c) => c.capabilities))
    expect(capsA.has('financeiro')).toBe(true) // A tem o problema no financeiro
    expect(capsB.has('financeiro')).toBe(false)
    expect(capsB.has('pacientes')).toBe(true) // B tem o problema nos contatos
    expect(capsB.has('agenda') || capsB.has('confirmacao')).toBe(true) // B tem o problema na operação (agenda e faltas)
    expect(capsA.has('agenda')).toBe(false)
    // Uma clínica cujo ponto mais fraco são as faltas recebe a conexão real com a agenda e o limite real.
    const faltas = report(byDim({ operacao: [3, 0, 3, 3, 3] }, 3))
    expect(faltas.nextStep.connections.some((c) => c.capabilities.includes('confirmacao'))).toBe(true)
    expect(faltas.nextStep.limits.join(' ')).toMatch(/não calcula a taxa de faltas/)
    expect(faltas.nextStep.start.join(' ')).toMatch(/Agenda/)
  })

  it('os padrões vêm das respostas de cada clínica', () => {
    expect(A.patterns.map((p) => p.id)).toContain('vende-sem-enxergar')
    expect(B.patterns.map((p) => p.id)).toContain('depende-do-dono')
    expect(B.patterns.map((p) => p.id)).not.toContain('vende-sem-enxergar')
  })

  it('cada plano parte da prioridade principal e da equipe da própria clínica', () => {
    expect(A.plan.intro).toMatch(/gestão financeira/)
    expect(B.plan.intro).toMatch(/(operação e processos|gestão comercial)/)
    const solo = report(CLINIC_A, { ...PROFILE, team: 'solo' })
    const big = report(CLINIC_A, { ...PROFILE, team: '16+' })
    expect(solo.plan.intro).not.toBe(big.plan.intro)
  })

  it('o mesmo conjunto de respostas gera o mesmo relatório (só muda o nome da clínica)', () => {
    const x = report(CLINIC_A, { ...PROFILE, clinic: 'Clínica X' })
    const y = report(CLINIC_A, { ...PROFILE, clinic: 'Clínica X' })
    expect(x).toEqual(y)
    const other = report(CLINIC_A, { ...PROFILE, clinic: 'Clínica Y' })
    expect(JSON.stringify(other).replaceAll('Clínica Y', 'Clínica X').replace(/"clinic":"Clínica X"/, '"clinic":"Clínica X"')).toBe(JSON.stringify(x))
  })
})

describe('"Não sei" no relatório', () => {
  it('não é tratado como processo ausente e vira lacuna de informação', () => {
    const a = byDim({ financeiro: [null, null, null, 3, 3] }, 3)
    const r = report(a)
    expect(r.scores.dims.financeiro.score15).toBe(15)
    expect(r.scores.unknown).toBe(3)
    expect(r.scores.unknownPct).toBe(12)
    expect(r.overview.paragraphs.join(' ')).toMatch(/"não sei" em 3 de 25 perguntas \(12%\)/)
    expect(r.overview.paragraphs.join(' ')).toMatch(/não foram contadas como processo ausente/)
    expect(r.patterns[0].id).toBe('informacao-financeiro')
    expect(r.plan.now[0].topic).toBe('Levantamento do que falta saber')
    expect(r.plan.now[0].text).toMatch(/registro de receitas, registro de despesas e fluxo de caixa/)
  })

  it('tudo "não sei": sem nota, plano de descoberta e sem números inventados', () => {
    const r = report(all(null))
    expect(r.scores.overall100).toBeNull()
    expect(r.overview.paragraphs.join(' ')).toMatch(/não foi possível calcular uma nota/)
    expect(r.patterns[0].id).toBe('sem-informacao-total')
    expect(r.plan.now.length).toBeGreaterThan(0)
    expect(r.priorities.every((p) => p.mode === 'discover')).toBe(true)
    expect(JSON.stringify(r)).not.toMatch(/NaN|undefined/)
  })

  it('dimensão com muitas lacunas pede descoberta antes de melhoria', () => {
    const r = report(byDim({ operacao: [null, null, null, null, null] }, 3))
    const d = r.dimensions.find((x) => x.id === 'operacao')!
    expect(d.priorityLevel).toBe('investigar')
    expect(d.headline).toMatch(/informação suficiente/)
    expect(d.priorityAction).toBe(QUESTION_BY_ID.ope1.act.discover)
  })
})

describe('não inventa informações', () => {
  const samples = [CLINIC_A, CLINIC_B, all(0), all(3), all(null), randomAnswers(7), randomAnswers(8, 0.5)]

  it('nenhum valor monetário nem perda financeira aparece em nenhum texto', () => {
    for (const a of samples) {
      const t = textsOf(buildReport(PROFILE, a, AT)).join('\n')
      expect(t).not.toMatch(/R\$|em reais|prejuízo|faturamento de|você perde|a clínica perde|perdendo \d/i)
    }
  })

  it('o único percentual do relatório é o das respostas "não sei", que vem das respostas', () => {
    for (const a of samples) {
      const r = buildReport(PROFILE, a, AT)
      const t = textsOf({ ...r, scores: undefined }).join('\n')
      const found = [...t.matchAll(/\d+%/g)].map((m) => m[0])
      for (const f of found) expect(f).toBe(`${r.scores.unknownPct}%`)
    }
  })

  it('consequências aparecem sempre como possibilidade', () => {
    const hedge = /\b(pode|podem|tende|tendem|difícil|risco|ajuda|evitam|vale|se sustenta)\b/i
    for (const q of QUESTIONS) expect(q.risk).toMatch(hedge)
    const damage = /(prejuízo|perdeu|você perde|a clínica perde)/i
    for (const dim of Object.values(DIM_TEXT)) {
      // Nas faixas com problema, a consequência é possibilidade; na faixa bem estabelecida, é orientação de manutenção.
      for (const band of ['critical', 'attention', 'developing'] as const) expect(dim.risk[band]).toMatch(hedge)
      for (const r of Object.values(dim.risk)) expect(r).not.toMatch(damage)
    }
  })

  it('a seção de próximo passo não cita preço, plano ou condição comercial', () => {
    for (const a of samples) {
      const t = textsOf(buildReport(PROFILE, a, AT).nextStep).join('\n')
      expect(t).not.toMatch(/assinatura|mensalidade|R\$|gr[aá]tis|gratuit|trial|teste gr|cartão|boleto|desconto de/i)
    }
  })
})

describe('plano de evolução', () => {
  it('tem os três horizontes e termina em 90 dias com um novo diagnóstico', () => {
    for (const a of [CLINIC_A, CLINIC_B, all(0), all(3), all(null), randomAnswers(21)]) {
      const p = report(a).plan
      expect(p.now.length).toBeGreaterThanOrEqual(1)
      expect(p.now.length).toBeLessThanOrEqual(4)
      expect(p.d30.length).toBeGreaterThanOrEqual(1)
      expect(p.d30.length).toBeLessThanOrEqual(4)
      expect(p.d90.length).toBeLessThanOrEqual(5)
      expect(p.d90[p.d90.length - 1].text).toBe(PLAN_REDO)
    }
  })

  it('a linha de ação principal evolui de começar a organizar e a sustentar, com os textos da pergunta', () => {
    const a = byDim({ financeiro: [0, 3, 3, 3, 3] }, 3) // só fin1 é crítica
    const p = report(a).plan
    const q = QUESTION_BY_ID.fin1
    expect(p.now[0]).toMatchObject({ question: 'fin1', text: q.act.start })
    expect(p.d30[0]).toMatchObject({ question: 'fin1', text: q.act.organize })
    expect(p.d90[0]).toMatchObject({ question: 'fin1', text: q.act.sustain })
  })

  it('processo informal começa pelo mesmo passo, e "não sei" começa por descobrir', () => {
    const informal = report(byDim({ financeiro: [1, 3, 3, 3, 3] }, 3)).plan
    expect(informal.now[0].text).toBe(QUESTION_BY_ID.fin1.act.start)
    const unknown = report(byDim({ financeiro: [null, 3, 3, 3, 3] }, 3)).plan
    expect(unknown.now[0].text).toBe(QUESTION_BY_ID.fin1.act.discover)
    expect(unknown.d30[0].text).toBe(QUESTION_BY_ID.fin1.act.organize)
  })

  it('processo que já existe mas precisa melhorar começa por organizar', () => {
    const p = report(byDim({ financeiro: [2, 3, 3, 3, 3] }, 3)).plan
    expect(p.now[0].text).toBe(QUESTION_BY_ID.fin1.act.organize)
    expect(p.d30[0].text).toBe(QUESTION_BY_ID.fin1.act.sustain)
  })

  it('tudo bem estabelecido gera ações de manutenção, e não pontos fracos inventados', () => {
    const p = report(all(3)).plan
    expect(p.now.map((i) => i.text)).toContain(PLAN_TOPUP.now)
    expect(p.d30.map((i) => i.text)).toContain(PLAN_TOPUP.d30)
    expect(p.now.every((i) => i.question === null)).toBe(true)
  })

  it('as três prioridades recebem ação no plano quando são pontos fracos', () => {
    const r = report(CLINIC_B)
    const dims = new Set([...r.plan.now, ...r.plan.d30, ...r.plan.d90].map((i) => i.dim))
    for (const p of r.priorities.filter((x) => x.mode === 'urgent' || x.mode === 'build')) expect(dims.has(p.dim), p.dim).toBe(true)
  })

  it('não concentra as três primeiras ações em uma só dimensão quando há outra prioridade urgente', () => {
    // financeiro e operação críticos; financeiro tem muito mais pontos fracos.
    const a = byDim({ financeiro: [0, 0, 0, 0, 0], operacao: [0, 0, 1, 3, 3] }, 3)
    const now = report(a).plan.now
    expect(new Set(now.map((i) => i.dim)).size).toBeGreaterThan(1)
  })
})

describe('estrutura do relatório', () => {
  it('traz identificação, nota, mapa, as cinco análises, três prioridades, plano e próximo passo', () => {
    const r = report(CLINIC_A)
    expect(r.profile.clinic).toBe(PROFILE.clinic)
    expect(r.generatedAt).toBe(AT)
    expect(r.scores.overall100).not.toBeNull()
    expect(r.dimensions).toHaveLength(5)
    expect(r.priorities).toHaveLength(3)
    expect(r.nextStep.start.length).toBeGreaterThanOrEqual(3)
    expect(r.nextStep.intro.length).toBeGreaterThanOrEqual(3)
  })

  it('cada dimensão traz o que as respostas revelam, as consequências possíveis e uma prioridade', () => {
    const r = report(CLINIC_B)
    for (const d of r.dimensions) {
      expect(d.reveals.length, d.id).toBeGreaterThan(0)
      expect(d.risks.length, d.id).toBeGreaterThan(0)
      expect(d.priorityTopic, d.id).not.toBeNull()
      expect(d.priorityAction, d.id).not.toBeNull()
    }
    const op = r.dimensions.find((d) => d.id === 'operacao')!
    expect(op.priorityLevel).toBe('alta')
    expect(r.dimensions.find((d) => d.id === 'financeiro')!.priorityLevel).toBe('manter')
  })

  it('a conexão com a plataforma sempre vem do registro verificado', async () => {
    const { FITS } = await import('../../src/diagnostic/data/capabilities')
    for (const a of [CLINIC_A, CLINIC_B, randomAnswers(3), randomAnswers(4)]) {
      for (const c of report(a).nextStep.connections) {
        expect(c.text).toBe(FITS[c.question].text)
        expect(c.capabilities).toEqual(FITS[c.question].capabilities)
      }
    }
  })
})

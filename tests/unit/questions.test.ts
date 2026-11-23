import { describe, expect, it } from 'vitest'
import { DIMENSIONS, LEVELS, QUESTIONS, QUESTIONS_BY_DIM, UNKNOWN_LABEL } from '../../src/diagnostic/data/questions'

/** O texto exato do briefing: se alguém mudar uma pergunta, este teste avisa. */
const BRIEF: Record<string, string[]> = {
  financeiro: [
    'Sua clínica mantém um registro organizado de todas as receitas?',
    'As despesas fixas e variáveis são registradas e acompanhadas?',
    'Você consegue visualizar o fluxo de caixa da clínica?',
    'Você sabe quanto a clínica realmente gera de resultado financeiro?',
    'Existe planejamento financeiro para os próximos meses?',
  ],
  atendimento: [
    'Existe um processo definido para o primeiro atendimento?',
    'As solicitações dos pacientes são organizadas e acompanhadas?',
    'A equipe possui orientações padronizadas para atender os pacientes?',
    'A clínica acompanha reclamações, feedbacks e insatisfações?',
    'Existe algum processo de relacionamento após o atendimento?',
  ],
  comercial: [
    'Sua clínica registra e acompanha os contatos de potenciais pacientes?',
    'Existe acompanhamento das pessoas que entram em contato, mas não agendam?',
    'Você consegue identificar quantos contatos se transformam em agendamentos?',
    'A clínica acompanha oportunidades de agenda ociosa?',
    'Existe um processo para estimular a continuidade do relacionamento com pacientes?',
  ],
  operacao: [
    'Os agendamentos e as confirmações seguem um processo organizado?',
    'A clínica acompanha faltas e cancelamentos?',
    'As responsabilidades de cada membro da equipe estão bem definidas?',
    'Existem procedimentos estabelecidos para as principais atividades?',
    'A clínica consegue funcionar de maneira organizada mesmo quando o proprietário não está presente?',
  ],
  gestao: [
    'A clínica possui metas definidas?',
    'Você acompanha indicadores importantes da operação?',
    'Existem reuniões ou momentos de acompanhamento da gestão?',
    'As decisões administrativas são tomadas com base em informações concretas?',
    'Quando um problema é identificado, existe um plano de ação para resolvê-lo?',
  ],
}

describe('perguntas', () => {
  it('são 25, em 5 dimensões de 5', () => {
    expect(QUESTIONS).toHaveLength(25)
    expect(DIMENSIONS).toHaveLength(5)
    for (const d of DIMENSIONS) expect(QUESTIONS_BY_DIM[d.id]).toHaveLength(5)
  })

  it('têm ids únicos e posições 1 a 5 em cada dimensão', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(25)
    for (const d of DIMENSIONS) expect(QUESTIONS_BY_DIM[d.id].map((q) => q.n)).toEqual([1, 2, 3, 4, 5])
  })

  it('usam o texto exato do briefing', () => {
    for (const d of DIMENSIONS) expect(QUESTIONS_BY_DIM[d.id].map((q) => q.text)).toEqual(BRIEF[d.id])
  })

  it('todas têm leitura para cada nível, "não sei", risco e as quatro ações', () => {
    for (const q of QUESTIONS) {
      for (const k of ['0', '1', '2', '3', 'u'] as const) expect(q.reveal[k as '0'].length, `${q.id} reveal ${k}`).toBeGreaterThan(10)
      expect(q.hint.length).toBeGreaterThan(10)
      expect(q.risk.length).toBeGreaterThan(10)
      for (const k of ['start', 'organize', 'sustain', 'discover'] as const) expect(q.act[k].length, `${q.id} act ${k}`).toBeGreaterThan(10)
    }
  })

  it('apresentam os quatro níveis do briefing e a opção "Não sei"', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3])
    expect(LEVELS.map((l) => l.label)).toEqual([
      'Não existe esse processo',
      'Existe informalmente, sem organização consistente',
      'Existe, mas ainda precisa melhorar',
      'É organizado e acompanhado regularmente',
    ])
    expect(UNKNOWN_LABEL).toBe('Não sei / Não tenho essa informação')
  })

  it('só descrevem consequências como possibilidade, nunca como prejuízo comprovado', () => {
    const hedge = /\b(pode|podem|tende|tendem|difícil|risco|ajuda|evitam|vale|se sustenta)\b/i
    const forbidden = /(prejuízo|perdeu|perdendo dinheiro|você perde|clínica perde|R\$)/i
    for (const q of QUESTIONS) {
      expect(q.risk, q.id).toMatch(hedge)
      expect(q.risk, q.id).not.toMatch(forbidden)
    }
  })
})

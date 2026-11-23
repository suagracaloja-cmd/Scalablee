/**
 * Tipos do Raio-X da Gestão da Clínica.
 * Todo o motor é determinístico: as mesmas respostas geram sempre o mesmo relatório.
 */

export type DimensionId = 'financeiro' | 'atendimento' | 'comercial' | 'operacao' | 'gestao'

/** 0 = não existe, 1 = informal, 2 = precisa melhorar, 3 = organizado e acompanhado. */
export type Level = 0 | 1 | 2 | 3

/** `null` significa "Não sei / Não tenho essa informação" (lacuna de informação, nunca nota zero). */
export type Answer = Level | null

export type QuestionId =
  | 'fin1' | 'fin2' | 'fin3' | 'fin4' | 'fin5'
  | 'ate1' | 'ate2' | 'ate3' | 'ate4' | 'ate5'
  | 'com1' | 'com2' | 'com3' | 'com4' | 'com5'
  | 'ope1' | 'ope2' | 'ope3' | 'ope4' | 'ope5'
  | 'ges1' | 'ges2' | 'ges3' | 'ges4' | 'ges5'

/** Pergunta ausente do mapa = ainda não respondida. */
export type Answers = Partial<Record<QuestionId, Answer>>

export type Band = 'critical' | 'attention' | 'developing' | 'established'

export type TeamSize = 'solo' | '2-3' | '4-7' | '8-15' | '16+'

export interface Profile {
  name: string
  clinic: string
  specialty: string
  team: TeamSize
  email: string
}

export interface Question {
  id: QuestionId
  dim: DimensionId
  /** Posição dentro da dimensão, 1 a 5. */
  n: number
  text: string
  hint: string
  /** Nome curto do tema, usado em listas e no plano. */
  topic: string
  /** O que a resposta revela, por nível de resposta e para "não sei". */
  reveal: { 0: string; 1: string; 2: string; 3: string; u: string }
  /** Consequência possível (nunca prejuízo comprovado) quando o nível é baixo. */
  risk: string
  /** Ação por estágio: começar, organizar, sustentar, descobrir (para "não sei"). */
  act: { start: string; organize: string; sustain: string; discover: string }
}

export interface Dimension {
  id: DimensionId
  /** 1 a 5, ordem de exibição. */
  number: number
  name: string
  /** Nome curto para eixos do mapa. */
  short: string
  /** Frase mostrada antes da primeira pergunta da dimensão. */
  blurb: string
  /** Peso na priorização (0 a 1). */
  importance: number
  /** Por que a dimensão importa, usado ao explicar prioridades. */
  matters: string
}

export interface DimensionScore {
  id: DimensionId
  /** Soma das respostas válidas. */
  raw: number
  valid: number
  unknown: number
  /** Normalizada para 0–15 com uma casa decimal; `null` quando nenhuma resposta é válida. */
  score15: number | null
  band: Band | null
  /** Quantidade de respostas 0 (processo inexistente) e 1 (informal). */
  absent: number
  informal: number
}

export interface Scores {
  dims: Record<DimensionId, DimensionScore>
  /** Normalizada 0–100 sobre as respostas válidas; `null` quando tudo é "não sei". */
  overall100: number | null
  /** Pontos brutos (0–75), só faz sentido quando não há respostas desconhecidas. */
  overallRaw: number | null
  answered: number
  valid: number
  unknown: number
  unknownPct: number
  knownPct: number
  band: Band | null
}

export interface Priority {
  rank: 1 | 2 | 3
  dim: DimensionId
  /**
   * Modo da recomendação: urgente (crítica/atenção), construir (em desenvolvimento),
   * sustentar (bem estabelecida) ou descobrir (sem informação suficiente para avaliar).
   */
  mode: 'urgent' | 'build' | 'sustain' | 'discover'
  score: number
  headline: string
  /** Sinais objetivos que explicam por que esta dimensão entrou na lista. */
  reasons: string[]
  /** Por que esta dimensão fica nessa posição, quando difere da ordem das notas. */
  orderNote: string | null
  /** O que as respostas dizem de mais relevante nesta dimensão. */
  evidence: string[]
}

export interface PlanItem {
  dim: DimensionId
  question: QuestionId | null
  topic: string
  text: string
}

export interface Plan {
  intro: string
  now: PlanItem[]
  d30: PlanItem[]
  d90: PlanItem[]
}

export interface DimensionAnalysis {
  id: DimensionId
  score: DimensionScore
  headline: string
  reveals: string[]
  strengths: string[]
  risks: string[]
  /** Tema e ação sugerida para a prioridade da dimensão (`null` quando não há o que sugerir). */
  priorityTopic: string | null
  priorityAction: string | null
  priorityLevel: 'alta' | 'media' | 'manter' | 'investigar'
}

export interface Pattern {
  id: string
  title: string
  body: string
}

export interface Connection {
  dim: DimensionId
  question: QuestionId
  topic: string
  /** Nível respondido nesta pergunta (`null` = não sei). */
  level: Answer
  /** Texto de como a plataforma se conecta ao achado (apenas recursos verificados). */
  text: string | null
  capabilities: string[]
  limits: string[]
}

export interface NextStep {
  intro: string[]
  connections: Connection[]
  /** Ids dos recursos reais citados (ver data/capabilities), sem repetição. */
  organize: string[]
  limits: string[]
  start: string[]
}

export interface Report {
  engineVersion: string
  generatedAt: string
  profile: Profile
  scores: Scores
  overview: { paragraphs: string[]; strengths: string[] }
  patterns: Pattern[]
  priorities: Priority[]
  dimensions: DimensionAnalysis[]
  plan: Plan
  nextStep: NextStep
}

export const DIMENSION_IDS: DimensionId[] = ['financeiro', 'atendimento', 'comercial', 'operacao', 'gestao']

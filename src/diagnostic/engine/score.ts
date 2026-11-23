import { DIMENSIONS, QUESTIONS, QUESTIONS_BY_DIM } from '../data/questions'
import {
  DIMENSION_IDS,
  type Answer,
  type Answers,
  type Band,
  type DimensionId,
  type DimensionScore,
  type Scores,
} from './types'

export const ENGINE_VERSION = '1.0.0'
export const TOTAL_QUESTIONS = QUESTIONS.length
export const MAX_LEVEL = 3
export const MAX_PER_DIMENSION = 15
export const MAX_TOTAL = 75

/**
 * Faixas das dimensões (escala 0–15): 0–4 crítica, 5–8 atenção, 9–12 em desenvolvimento, 13–15 bem estabelecida.
 * Notas com decimais (quando há "não sei") são classificadas pela parte inteira.
 */
export function bandOf15(score15: number): Band {
  const s = Math.floor(score15 + 1e-9)
  if (s <= 4) return 'critical'
  if (s <= 8) return 'attention'
  if (s <= 12) return 'developing'
  return 'established'
}

/**
 * Mesmos cortes na escala 0–100, aplicados à nota inteira exibida:
 * 0–33 crítica, 34–59 atenção, 60–86 em desenvolvimento, 87–100 bem estabelecida.
 */
export function bandOf100(score100: number): Band {
  if (score100 <= 33) return 'critical'
  if (score100 <= 59) return 'attention'
  if (score100 <= 86) return 'developing'
  return 'established'
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function isValid(a: Answer | undefined): a is 0 | 1 | 2 | 3 {
  return a === 0 || a === 1 || a === 2 || a === 3
}

export function computeDimension(id: DimensionId, answers: Answers): DimensionScore {
  let raw = 0
  let valid = 0
  let unknown = 0
  let absent = 0
  let informal = 0
  for (const q of QUESTIONS_BY_DIM[id]) {
    const a = answers[q.id]
    if (a === null) unknown++
    else if (isValid(a)) {
      raw += a
      valid++
      if (a === 0) absent++
      if (a === 1) informal++
    }
  }
  // Sem respostas válidas não há nota: a ausência de informação nunca vira zero.
  // Cada resposta vale de 0 a 3; a nota é a fração do máximo possível das respostas válidas, na escala 0–15.
  // Uma única divisão de inteiros: o resultado é idêntico ao da aritmética exata do banco.
  const score15 = valid === 0 ? null : round1((raw * MAX_PER_DIMENSION) / (MAX_LEVEL * valid))
  return { id, raw, valid, unknown, score15, band: score15 === null ? null : bandOf15(score15), absent, informal }
}

export function computeScores(answers: Answers): Scores {
  const dims = Object.fromEntries(DIMENSION_IDS.map((id) => [id, computeDimension(id, answers)])) as Record<
    DimensionId,
    DimensionScore
  >
  let raw = 0
  let valid = 0
  let unknown = 0
  for (const d of DIMENSIONS) {
    raw += dims[d.id].raw
    valid += dims[d.id].valid
    unknown += dims[d.id].unknown
  }
  const answered = valid + unknown
  const overall100 = valid === 0 ? null : Math.round((raw * 100) / (MAX_LEVEL * valid))
  return {
    dims,
    overall100,
    overallRaw: unknown === 0 && valid === TOTAL_QUESTIONS ? raw : null,
    answered,
    valid,
    unknown,
    unknownPct: Math.round((unknown / TOTAL_QUESTIONS) * 100),
    knownPct: Math.round((valid / TOTAL_QUESTIONS) * 100),
    band: overall100 === null ? null : bandOf100(overall100),
  }
}

export function isComplete(answers: Answers): boolean {
  return QUESTIONS.every((q) => answers[q.id] !== undefined)
}

/** Nota com 0 ou 1 casa decimal, no formato do Brasil. */
export function fmtScore(n: number | null): string {
  if (n === null) return '–'
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

/** Dimensão com poucas respostas válidas: a nota é uma leitura frágil. */
export function isLowConfidence(d: DimensionScore): boolean {
  return d.valid > 0 && d.valid <= 2
}

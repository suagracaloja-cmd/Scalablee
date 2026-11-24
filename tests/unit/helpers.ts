import { QUESTIONS } from '../../src/data/questions'
import type { Answer, Answers, DimensionId, Profile, QuestionId } from '../../src/engine/types'

export const PROFILE: Profile = {
  name: 'Mariana Souza',
  clinic: 'Clínica Aurora',
  specialty: 'Odontologia',
  team: '4-7',
  email: 'contato@exemplo.com.br',
}

/** Todas as 25 perguntas com a mesma resposta. */
export function all(a: Answer): Answers {
  return Object.fromEntries(QUESTIONS.map((q) => [q.id, a])) as Answers
}

/** Respostas por dimensão, na ordem das perguntas 1 a 5. Dimensões omitidas ficam com `fill`. */
export function byDim(spec: Partial<Record<DimensionId, Answer[]>>, fill: Answer = 2): Answers {
  const out: Answers = {}
  for (const q of QUESTIONS) {
    const arr = spec[q.dim]
    out[q.id] = arr ? arr[q.n - 1] : fill
  }
  return out
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function randomAnswers(seed: number, unknownRate = 0.15): Answers {
  const r = rng(seed)
  const out: Answers = {}
  for (const q of QUESTIONS) {
    out[q.id as QuestionId] = r() < unknownRate ? null : (Math.floor(r() * 4) as 0 | 1 | 2 | 3)
  }
  return out
}

/** Todos os textos do relatório, achatados, para varreduras de conteúdo. */
export function textsOf(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value)
  else if (Array.isArray(value)) value.forEach((v) => textsOf(v, acc))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => textsOf(v, acc))
  return acc
}

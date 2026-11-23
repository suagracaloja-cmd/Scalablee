import { DIMENSION_BY_ID } from '../data/questions'
import { PLAN_REDO, PLAN_TOPUP, TEAM_NOTE } from './content'
import { weakItems, type WeakItem } from './priorities'
import type { Answers, DimensionId, Plan, PlanItem, Priority, Profile, Question, Scores } from './types'

/** Textos de cada estágio de uma ação, conforme o que a clínica respondeu. */
function stages(w: WeakItem): string[] {
  const a = w.q.act
  if (w.level === null) return [a.discover, a.organize, a.sustain]
  if (w.level === 2) return [a.organize, a.sustain]
  return [a.start, a.organize, a.sustain]
}

interface Candidate {
  item: WeakItem
  rank: number
}

const mk = (q: Question, text: string): PlanItem => ({ dim: q.dim, question: q.id, topic: q.topic, text })

/**
 * Plano de evolução em três horizontes, sempre construído sobre as respostas da própria clínica.
 * Cada ponto fraco vira uma "linha de ação" com até três estágios (começar, organizar, sustentar):
 *  - Agora: primeiro passo das três linhas mais importantes;
 *  - 30 dias: organizar o que foi começado e dar o primeiro passo na quarta linha;
 *  - 90 dias: sustentar e acompanhar, abrir as prioridades que ainda não tiveram ação e repetir o diagnóstico.
 * Pontos que a clínica não conhece ("não sei") começam por descobrir. Quando há três ou mais,
 * viram uma única ação de levantamento em "Agora".
 */
export function buildPlan(scores: Scores, answers: Answers, priorities: Priority[], profile: Profile): Plan {
  const dimWeight = new Map<DimensionId, number>(priorities.map((p) => [p.dim, p.score]))
  const pool: Candidate[] = []
  for (const dim of Object.keys(scores.dims) as DimensionId[]) {
    for (const item of weakItems(dim, answers)) pool.push({ item, rank: item.severity + (dimWeight.get(dim) ?? 0) / 50 })
  }
  pool.sort((x, y) => y.rank - x.rank || x.item.q.id.localeCompare(y.item.q.id))

  const threads = pool.slice(0, 5)

  // Variedade: se as três primeiras linhas são da mesma dimensão e há outra prioridade urgente, ela entra em terceiro.
  const first3 = threads.slice(0, 3)
  if (first3.length === 3 && first3.every((c) => c.item.q.dim === first3[0].item.q.dim)) {
    const other = priorities.find((p) => p.dim !== first3[0].item.q.dim && p.mode === 'urgent')
    const cand = other && pool.find((c) => c.item.q.dim === other.dim)
    if (cand) {
      const at = threads.indexOf(cand)
      if (at >= 0) threads.splice(at, 1)
      threads.splice(2, 0, cand)
      threads.length = Math.min(threads.length, 5)
    }
  }

  const unknownItems = pool.filter((c) => c.item.level === null).map((c) => c.item.q)
  const consolidate = unknownItems.length >= 3
  const stageOf = (t: Candidate | undefined, j: number): PlanItem | null => {
    if (!t) return null
    const text = stages(t.item)[j]
    if (text === undefined) return null
    if (consolidate && t.item.level === null && j === 0) return null
    return mk(t.item.q, text)
  }

  const now: PlanItem[] = []
  if (consolidate) {
    const topics = unknownItems.slice(0, 3).map((q) => q.topic.toLowerCase())
    const list = topics.length > 1 ? `${topics.slice(0, -1).join(', ')} e ${topics[topics.length - 1]}` : topics[0]
    now.push({
      dim: unknownItems[0].dim,
      question: null,
      topic: 'Levantamento do que falta saber',
      text: `Reserve uma hora para levantar o que ficou como "não sei", começando por ${list}. Só depois de saber como cada ponto funciona hoje é possível decidir o que melhorar.`,
    })
  }
  for (const i of [0, 1, 2]) {
    const s = stageOf(threads[i], 0)
    if (s) now.push(s)
  }

  const d30: PlanItem[] = []
  for (const i of [0, 1, 2]) {
    const s = stageOf(threads[i], 1)
    if (s) d30.push(s)
  }
  const t3 = stageOf(threads[3], 0)
  if (t3) d30.push(t3)

  // Prioridades sem nenhuma linha no plano abrem aqui, para que as três recebam atenção em 90 dias.
  const covered = new Set(threads.map((t) => t.item.q.dim))
  const opening: PlanItem[] = []
  for (const p of priorities) {
    if (covered.has(p.dim) || scores.dims[p.dim].band === 'established') continue
    const first = weakItems(p.dim, answers)[0]
    if (first) opening.push(mk(first.q, stages(first)[0]))
  }

  const late = [stageOf(threads[0], 2), stageOf(threads[1], 2), ...opening.slice(0, 2), stageOf(threads[2], 2), stageOf(threads[3], 1), stageOf(threads[4], 0)].filter(
    (x): x is PlanItem => x !== null,
  )
  const d90 = late.slice(0, 4)

  // Poucos pontos fracos: completa com ações de manutenção.
  if (threads.length < 3) {
    const ranked = (Object.keys(scores.dims) as DimensionId[])
      .filter((d) => scores.dims[d].score15 !== null)
      .sort((x, y) => (scores.dims[y].score15 as number) - (scores.dims[x].score15 as number))
    const strongest = ranked[0]
    const weakest = ranked[ranked.length - 1]
    if (strongest) now.push({ dim: strongest, question: null, topic: DIMENSION_BY_ID[strongest].short, text: PLAN_TOPUP.now })
    if (weakest) d30.push({ dim: weakest, question: null, topic: DIMENSION_BY_ID[weakest].short, text: PLAN_TOPUP.d30 })
  }

  d90.push({ dim: priorities[0]?.dim ?? 'gestao', question: null, topic: 'Novo Raio-X', text: PLAN_REDO })

  const lead = priorities[0] ? DIMENSION_BY_ID[priorities[0].dim].name.toLowerCase() : null
  const intro = [
    lead ? `O plano começa por ${lead}, a prioridade mais importante do seu diagnóstico.` : 'O plano parte das respostas do seu diagnóstico.',
    TEAM_NOTE[profile.team],
  ].join(' ')

  return { intro, now: now.slice(0, 4), d30: d30.slice(0, 4), d90: d90.slice(0, 5) }
}

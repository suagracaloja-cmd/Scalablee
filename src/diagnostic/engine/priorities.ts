import { DIMENSION_BY_ID, QUESTIONS_BY_DIM } from '../data/questions'
import { DIM_TEXT, BAND_LABEL } from './content'
import { fmtScore } from './score'
import {
  DIMENSION_IDS,
  type Answer,
  type Answers,
  type DimensionId,
  type Priority,
  type Question,
  type Scores,
} from './types'

/** Peso de cada resposta fraca; "não sei" pesa como processo informal (precisa ser descoberto). */
export const SEVERITY = { 0: 4, 1: 3, u: 3, 2: 1.5 } as const

export interface WeakItem {
  q: Question
  /** Nível da resposta (`null` = não sei). */
  level: Exclude<Answer, 3>
  severity: number
}

/**
 * Perguntas com resposta fraca da dimensão, da mais grave para a menos grave.
 * Empate entre "informal" e "não sei": primeiro o que se sabe ser fraco.
 */
export function weakItems(dim: DimensionId, answers: Answers): WeakItem[] {
  const out: WeakItem[] = []
  for (const q of QUESTIONS_BY_DIM[dim]) {
    const a = answers[q.id]
    if (a === undefined || a === 3) continue
    const severity = a === null ? SEVERITY.u : SEVERITY[a]
    out.push({ q, level: a, severity })
  }
  return out.sort((x, y) => y.severity - x.severity || (x.level === null ? 1 : 0) - (y.level === null ? 1 : 0) || x.q.n - y.q.n)
}

export function revealOf(q: Question, level: Answer): string {
  return level === null ? q.reveal.u : q.reveal[level]
}

/** Peso base de cada ponto de informação ausente ou fraco na priorização. */
const W = { absent: 6, informal: 2, unknown: 5, foundation: 4, neutralGap: 0.5 }

/**
 * Pontuação de prioridade de uma dimensão. Combina:
 *  - a distância até a nota máxima, ponderada pela importância da dimensão;
 *  - respostas que indicam ausência de processo (nível 0);
 *  - processos só informais (nível 1);
 *  - lacunas de informação ("não sei");
 *  - um reforço para "Gestão e indicadores" quando outras duas ou mais dimensões precisam de atenção,
 *    porque sem acompanhamento as demais áreas ficam sem medição.
 */
export function priorityScore(id: DimensionId, scores: Scores): { score: number; foundation: boolean } {
  const d = scores.dims[id]
  const gap = d.score15 === null ? W.neutralGap : 1 - d.score15 / 15
  let score = DIMENSION_BY_ID[id].importance * gap * 100 + d.absent * W.absent + d.informal * W.informal + d.unknown * W.unknown
  let foundation = false
  if (id === 'gestao') {
    const weakOthers = DIMENSION_IDS.filter((o) => o !== 'gestao' && (scores.dims[o].band === 'critical' || scores.dims[o].band === 'attention')).length
    if (weakOthers >= 2) {
      score += W.foundation
      foundation = true
    }
  }
  return { score: Math.round(score * 10) / 10, foundation }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function modeOf(scores: Scores, id: DimensionId): Priority['mode'] {
  const b = scores.dims[id].band
  if (b === null) return 'discover'
  if (b === 'critical' || b === 'attention') return 'urgent'
  return b === 'developing' ? 'build' : 'sustain'
}

function reasonsOf(id: DimensionId, scores: Scores, foundation: boolean): string[] {
  const d = scores.dims[id]
  const out: string[] = []
  if (d.score15 !== null && d.band) out.push(`Nota ${fmtScore(d.score15)} de 15 (${BAND_LABEL[d.band].toLowerCase()})`)
  if (d.absent >= 1) out.push(`${d.absent} de 5 ${d.absent === 1 ? 'prática não existe' : 'práticas não existem'}`)
  if (d.informal >= 2) out.push(`${d.informal} de 5 existem só de modo informal`)
  if (d.unknown >= 1) out.push(plural(d.unknown, 'resposta sem informação', 'respostas sem informação'))
  if (d.band && d.band !== 'established' && d.absent === 0 && d.informal === 0 && d.unknown === 0)
    out.push('Nenhuma prática inexistente: o ganho está em regularidade e acompanhamento')
  if (foundation) out.push('Sem acompanhamento, as áreas mais frágeis ficam sem medição')
  return out
}

/** Dimensão de menor nota entre as candidatas (nota nula não entra na comparação). */
function lowestOf(ids: DimensionId[], scores: Scores): DimensionId | null {
  let best: DimensionId | null = null
  for (const id of ids) {
    const s = scores.dims[id].score15
    if (s === null) continue
    if (best === null || s < (scores.dims[best].score15 as number)) best = id
  }
  return best
}

/** Explica por que `id` vem antes de `rival`, que tem nota menor. */
function explainOrder(id: DimensionId, rival: DimensionId, scores: Scores, foundation: boolean): string {
  const a = scores.dims[id]
  const b = scores.dims[rival]
  const an = DIMENSION_BY_ID[id].name.toLowerCase()
  const bn = DIMENSION_BY_ID[rival].name.toLowerCase()
  const head = `${cap(an)} aparece antes de ${bn}, que tem nota menor, porque`
  if (a.unknown > b.unknown) return `${head} tem mais respostas sem informação (${a.unknown} contra ${b.unknown}): sem saber como está, é mais difícil agir.`
  if (a.absent > b.absent) return `${head} tem mais práticas inexistentes (${a.absent} contra ${b.absent}), e processo que não existe pede um começo, e não um ajuste.`
  if (foundation) return `${head} sustenta o acompanhamento das demais áreas: sem ele, os outros pontos ficam sem medição.`
  if (DIMENSION_BY_ID[id].importance > DIMENSION_BY_ID[rival].importance) return `${head} pesa mais nas decisões da clínica: ${DIMENSION_BY_ID[id].matters.charAt(0).toLowerCase()}${DIMENSION_BY_ID[id].matters.slice(1)}`
  if (a.informal > b.informal) return `${head} reúne mais pontos informais (${a.informal} contra ${b.informal}) e, com a nota próxima, vale organizar primeiro onde há mais a formalizar.`
  return `${head} a ordem considera também processos inexistentes, informais e lacunas de informação, e não só a nota.`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * As três prioridades. Não são simplesmente as três menores notas: a ordem vem da pontuação de prioridade
 * (ver `priorityScore`). Dimensões em situação crítica nunca ficam de fora.
 */
export function computePriorities(scores: Scores, answers: Answers): Priority[] {
  const ranked = DIMENSION_IDS.map((id) => ({ id, ...priorityScore(id, scores) })).sort(
    (x, y) =>
      y.score - x.score ||
      (scores.dims[x.id].score15 ?? 7.5) - (scores.dims[y.id].score15 ?? 7.5) ||
      DIMENSION_BY_ID[y.id].importance - DIMENSION_BY_ID[x.id].importance ||
      DIMENSION_BY_ID[x.id].number - DIMENSION_BY_ID[y.id].number,
  )
  let top = ranked.slice(0, 3)

  // Garante que dimensões críticas (da menor nota para a maior) entrem na lista.
  const critical = ranked
    .filter((r) => scores.dims[r.id].band === 'critical')
    .sort((x, y) => (scores.dims[x.id].score15 as number) - (scores.dims[y.id].score15 as number))
    .slice(0, 3)
  for (const c of critical) {
    if (top.some((t) => t.id === c.id)) continue
    const drop = [...top].reverse().find((t) => scores.dims[t.id].band !== 'critical')
    if (!drop) break
    top = top.filter((t) => t.id !== drop.id).concat(c)
  }
  top.sort((x, y) => ranked.indexOf(x) - ranked.indexOf(y))

  const chosen: DimensionId[] = []
  return top.map((t, i) => {
    const remaining = DIMENSION_IDS.filter((id) => !chosen.includes(id))
    const rival = lowestOf(remaining, scores)
    chosen.push(t.id)
    const tScore = scores.dims[t.id].score15
    const rScore = rival ? scores.dims[rival].score15 : null
    const needsNote = rival && rival !== t.id && tScore !== null && rScore !== null && rScore < tScore
    const items = weakItems(t.id, answers)
    const band = scores.dims[t.id].band
    const evidence = items.slice(0, 3).map((w) => revealOf(w.q, w.level))
    return {
      rank: (i + 1) as 1 | 2 | 3,
      dim: t.id,
      mode: modeOf(scores, t.id),
      score: t.score,
      headline: band ? DIM_TEXT[t.id].headline[band] : 'Ainda não há informação suficiente para avaliar esta área.',
      reasons: reasonsOf(t.id, scores, t.foundation),
      orderNote: needsNote ? explainOrder(t.id, rival as DimensionId, scores, t.foundation) : null,
      evidence,
    }
  })
}

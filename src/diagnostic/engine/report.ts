import { DIMENSIONS, QUESTIONS_BY_DIM } from '../data/questions'
import { DIM_TEXT, NO_INFO_RISK } from './content'
import { buildNextStep } from './nextstep'
import { detectPatterns } from './patterns'
import { buildPlan } from './plan'
import { computePriorities, revealOf, weakItems } from './priorities'
import { ENGINE_VERSION, computeScores, fmtScore } from './score'
import type { Answers, DimensionAnalysis, DimensionId, Priority, Profile, Report, Scores } from './types'

function overviewParagraphs(scores: Scores, profile: Profile): string[] {
  const clinic = profile.clinic
  if (scores.valid === 0) {
    return [
      `Todas as respostas de ${clinic} foram "não sei", e por isso não foi possível calcular uma nota. Isso não significa que os processos não existam: significa que a gestão ainda não entrega essas informações com facilidade.`,
      'O plano abaixo é, antes de tudo, de descoberta: entender como cada área funciona hoje para só então decidir o que melhorar.',
    ]
  }
  const out: string[] = []
  switch (scores.band) {
    case 'critical':
      out.push(
        `${clinic} está no início da estruturação da gestão. A maior parte dos processos avaliados ainda não existe ou funciona de modo informal. Isso não diz nada sobre a qualidade clínica do trabalho: mostra que os bastidores ainda dependem de improviso.`,
      )
      break
    case 'attention':
      out.push(
        `${clinic} tem partes da gestão funcionando, mas a maioria dos processos ainda é informal ou incompleta. A organização depende mais de pessoas do que de rotina.`,
      )
      break
    case 'developing':
      out.push(
        `${clinic} tem uma base de gestão estabelecida. Os processos existem, mas ainda precisam de regularidade e de acompanhamento para funcionar sem esforço extra.`,
      )
      break
    default:
      out.push(`${clinic} tem uma gestão bem estruturada. O trabalho agora é manter a rotina viva e usar as informações para decidir melhor.`)
  }

  const scored = DIMENSIONS.filter((d) => scores.dims[d.id].score15 !== null)
  if (scored.length >= 2) {
    const sorted = [...scored].sort((a, b) => (scores.dims[b.id].score15 as number) - (scores.dims[a.id].score15 as number))
    const top = sorted[0]
    const low = sorted[sorted.length - 1]
    const hi = scores.dims[top.id].score15 as number
    const lo = scores.dims[low.id].score15 as number
    const diff = Math.round((hi - lo) * 10) / 10
    if (diff >= 2) {
      out.push(
        `O ponto mais forte é ${top.name.toLowerCase()} (${fmtScore(hi)} de 15) e o mais frágil é ${low.name.toLowerCase()} (${fmtScore(lo)} de 15): uma diferença de ${fmtScore(diff)} pontos, e é nela que está a maior oportunidade.`,
      )
    } else {
      out.push(`As dimensões avaliadas estão em nível semelhante, entre ${fmtScore(lo)} e ${fmtScore(hi)} de 15.`)
    }
  }

  if (scores.unknown > 0) {
    let t = `Você respondeu "não sei" em ${scores.unknown} de 25 perguntas (${scores.unknownPct}%). Essas respostas não foram contadas como processo ausente: a nota considera apenas o que você soube informar.`
    if (scores.unknown >= 6) t += ' Em si, isso é um achado: parte da gestão ainda não entrega essas informações com facilidade.'
    out.push(t)
  }
  return out
}

function strengthsOf(answers: Answers, scores: Scores, limit = 3): string[] {
  const dims = DIMENSIONS.filter((d) => scores.dims[d.id].score15 !== null).sort(
    (a, b) => (scores.dims[b.id].score15 as number) - (scores.dims[a.id].score15 as number) || a.number - b.number,
  )
  const out: string[] = []
  for (const d of dims) {
    for (const q of QUESTIONS_BY_DIM[d.id]) {
      if (answers[q.id] === 3 && out.length < limit) out.push(q.reveal[3])
    }
    if (out.length >= limit) break
  }
  return out
}

function analyseDimension(id: DimensionId, scores: Scores, answers: Answers): DimensionAnalysis {
  const score = scores.dims[id]
  const band = score.band
  const items = weakItems(id, answers)
  const strengths = QUESTIONS_BY_DIM[id].filter((q) => answers[q.id] === 3).slice(0, 3).map((q) => q.reveal[3])
  const reveals = items.length ? items.slice(0, 4).map((w) => revealOf(w.q, w.level)) : strengths.slice(0, 2)

  const risks: string[] = []
  risks.push(band ? DIM_TEXT[id].risk[band] : NO_INFO_RISK)
  for (const w of items.filter((w) => w.level === 0 || w.level === 1).slice(0, 2)) {
    if (!risks.includes(w.q.risk)) risks.push(w.q.risk)
  }

  let priorityLevel: DimensionAnalysis['priorityLevel']
  let priorityTopic: string | null = null
  let priorityAction: string | null = null
  const first = items[0]
  if (band === null) {
    priorityLevel = 'investigar'
    const q = QUESTIONS_BY_DIM[id].find((x) => answers[x.id] === null)
    if (q) {
      priorityTopic = q.topic
      priorityAction = q.act.discover
    }
  } else if (band === 'established') {
    priorityLevel = 'manter'
    const q = first?.q ?? QUESTIONS_BY_DIM[id][0]
    priorityTopic = q.topic
    priorityAction = q.act.sustain
  } else {
    priorityLevel = band === 'developing' ? 'media' : 'alta'
    if (first) {
      priorityTopic = first.q.topic
      priorityAction = first.level === null ? first.q.act.discover : first.level === 2 ? first.q.act.organize : first.q.act.start
    }
  }

  return {
    id,
    score,
    headline: band ? DIM_TEXT[id].headline[band] : 'Ainda não há informação suficiente para avaliar esta dimensão.',
    reveals,
    strengths,
    risks,
    priorityLevel,
    priorityTopic,
    priorityAction,
  }
}

/**
 * Gera o relatório completo a partir das respostas, sem nenhum dado além do informado.
 * Determinístico: as mesmas respostas e o mesmo perfil geram o mesmo texto (exceto `generatedAt`).
 */
export function buildReport(profile: Profile, answers: Answers, generatedAt: string = new Date().toISOString()): Report {
  const scores = computeScores(answers)
  const priorities: Priority[] = computePriorities(scores, answers)
  return {
    engineVersion: ENGINE_VERSION,
    generatedAt,
    profile,
    scores,
    overview: { paragraphs: overviewParagraphs(scores, profile), strengths: strengthsOf(answers, scores) },
    patterns: detectPatterns(answers, scores, profile),
    priorities,
    dimensions: DIMENSIONS.map((d) => analyseDimension(d.id, scores, answers)),
    plan: buildPlan(scores, answers, priorities, profile),
    nextStep: buildNextStep(scores, answers, priorities, profile),
  }
}


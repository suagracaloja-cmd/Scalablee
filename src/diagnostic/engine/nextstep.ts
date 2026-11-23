import { DIMENSION_BY_ID } from '../data/questions'
import { FITS, LIMITS } from '../data/capabilities'
import { weakItems } from './priorities'
import type { Answers, Connection, DimensionId, NextStep, Priority, Profile, QuestionId, Scores } from './types'


function joinNames(ids: DimensionId[]): string {
  const names = ids.map((d) => DIMENSION_BY_ID[d].short.toLowerCase())
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/**
 * Conexões entre os problemas encontrados e o que a plataforma realmente faz.
 * Para cada prioridade, usa os dois achados mais graves. Só cita recursos do registro de capacidades;
 * onde não há recurso, declara o limite.
 */
export function buildConnections(priorities: Priority[], answers: Answers): Connection[] {
  const out: Connection[] = []
  for (const p of priorities) {
    const items = weakItems(p.dim, answers)
    // Os dois achados mais graves. Se nenhum tem recurso real, mas existe um entre os quatro mais graves, ele entra.
    const chosen = items.slice(0, 2)
    const withText = items.slice(0, 4).find((w) => FITS[w.q.id].text)
    if (withText && !chosen.some((w) => FITS[w.q.id].text)) {
      if (chosen.length >= 2) chosen[1] = withText
      else chosen.push(withText)
    }
    for (const w of chosen) {
      const fit = FITS[w.q.id]
      out.push({ dim: p.dim, question: w.q.id as QuestionId, topic: w.q.topic, level: w.level, text: fit.text, capabilities: fit.capabilities, limits: fit.limits })
    }
  }
  return out
}

/**
 * Seção "O próximo passo da sua clínica": texto personalizado pelos resultados e conexões verificadas.
 * Não cita preço, plano nem condição comercial.
 */
export function buildNextStep(scores: Scores, answers: Answers, priorities: Priority[], profile: Profile): NextStep {
  const connections = buildConnections(priorities, answers)
  const dims = priorities.map((p) => p.dim)
  const clinic = profile.clinic
  const lead = priorities.filter((p) => p.mode === 'urgent' || p.mode === 'build').map((p) => p.dim)

  const intro: string[] = []
  if (scores.valid === 0) {
    intro.push(`O principal achado do diagnóstico de ${clinic} é que muitas informações da gestão ainda não estão à mão.`)
    intro.push('O próximo desafio é reunir essas informações em um só lugar para poder acompanhá-las e decidir com base nelas.')
  } else if (scores.band === 'established') {
    intro.push(`O diagnóstico de ${clinic} mostra uma gestão bem estruturada. O próximo passo é manter a rotina e dar visibilidade ao que já funciona.`)
    intro.push('O desafio agora é não deixar a rotina se perder: acompanhar, reunir as informações em um só lugar e transformar decisões em melhoria contínua.')
  } else if (scores.band === 'developing' && lead.length) {
    intro.push(`O diagnóstico de ${clinic} mostra uma base de gestão em construção. Os pontos que mais pedem regularidade estão em ${joinNames(lead.slice(0, 2))}.`)
    intro.push('O próximo desafio não é apenas identificar o que falta. É conseguir acompanhar, reunir as informações em um só lugar e transformar decisões em melhorias concretas.')
  } else {
    intro.push(`O diagnóstico de ${clinic} identificou pontos que merecem atenção na gestão, principalmente em ${joinNames(lead.length ? lead : dims)}.`)
    intro.push('O próximo desafio não é apenas identificar os pontos fracos. É conseguir acompanhá-los, reunir as informações em um só lugar e transformar decisões em melhorias concretas.')
  }
  const real = connections.filter((c) => c.text).length
  if (real > 0) {
    intro.push(
      `É nessa etapa que a SCALABLE entra. Para ${real === 1 ? 'um dos achados' : `${real} dos achados`} acima, a plataforma já tem recursos que se conectam diretamente ao que você respondeu; onde ela ainda não cobre, dizemos isso com clareza.`,
    )
  } else {
    intro.push('Nos achados acima, a plataforma ainda não tem um recurso direto. Dizemos isso com clareza: o plano acima continua valendo como processo, com ou sem ferramenta.')
  }

  const capIds: string[] = []
  const limitIds: string[] = []
  for (const c of connections) {
    for (const id of c.capabilities) if (c.text && !capIds.includes(id)) capIds.push(id)
    for (const id of c.limits) if (!limitIds.includes(id)) limitIds.push(id)
  }

  const needsWhats =
    (['ate1', 'ate2', 'com1', 'ope5'] as QuestionId[]).some((id) => answers[id] === 0 || answers[id] === 1) ||
    capIds.includes('whatsapp')

  const needsAgenda =
    (['ope1', 'ope2', 'com4'] as QuestionId[]).some((id) => answers[id] === 0 || answers[id] === 1) || capIds.includes('agenda')

  const start = [
    'Crie sua conta na SCALABLE com e-mail e senha, aceite os termos e confirme pelo link enviado ao seu e-mail.',
    'Cadastre a clínica (nome, tipo de clínica e uma descrição) e comece registrando pacientes, atendimentos e contas.',
    'No Início, clique em "Rodar análise": a Coraline AI lê o que foi cadastrado e devolve notificações e tarefas.',
  ]
  if (needsAgenda) start.push('Cadastre os profissionais e os serviços em Clínica e equipe e passe a marcar as consultas na Agenda.')
  if (needsWhats) start.push('Se a clínica atende pelo WhatsApp, conecte a conta do WhatsApp Business para que os contatos entrem como pacientes.')

  return {
    intro,
    connections,
    organize: capIds.slice(0, 6),
    limits: limitIds.map((id) => LIMITS[id]),
    start,
  }
}


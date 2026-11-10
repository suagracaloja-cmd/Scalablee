import { AGENDA_PADRAO, type AgendaConfig, type Agendamento, type Company } from './types'

export const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DIAS_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export const cfgDe = (c: Company | null): AgendaConfig => ({ ...AGENDA_PADRAO, ...(c?.agenda_config ?? {}) })

const fusoMin = (fuso: string) => {
  const m = fuso.match(/^([+-])(\d{2}):(\d{2})$/)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -180
}
/** "AAAA-MM-DD" + "HH:MM" no fuso da clínica → Date */
export const paraUtc = (data: string, hora: string, fuso: string) => new Date(`${data}T${hora.padStart(5, '0')}:00${fuso}`)
/** Date → partes no fuso da clínica */
export function local(d: Date | string, fuso: string) {
  const x = new Date(new Date(d).getTime() + fusoMin(fuso) * 60000)
  const iso = x.toISOString()
  return { data: iso.slice(0, 10), hora: iso.slice(11, 16), dia: x.getUTCDay() }
}
export const hojeLocal = (fuso: string) => local(new Date(), fuso).data
export const somaDias = (data: string, n: number) => {
  const d = new Date(data + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const diaSemana = (data: string) => new Date(data + 'T12:00:00Z').getUTCDay()
export const inicioSemana = (data: string) => somaDias(data, -((diaSemana(data) + 6) % 7)) // segunda
export function dataLonga(data: string) {
  const d = new Date(data + 'T12:00:00Z')
  return `${DIAS_LONGO[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

const ATIVOS = ['agendado', 'confirmado']

/** Horários livres de um dia para um profissional (ou agenda geral, sem profissional). */
export function horariosLivres(opts: { cfg: AgendaConfig; data: string; duracao: number; profissionalId: string | null; agendamentos: Agendamento[]; ignorarId?: string }) {
  const { cfg, data, duracao, profissionalId, agendamentos } = opts
  if (!cfg.dias.includes(diaSemana(data))) return []
  const abre = paraUtc(data, cfg.inicio, cfg.fuso).getTime()
  const fecha = paraUtc(data, cfg.fim, cfg.fuso).getTime()
  const agora = Date.now() + 10 * 60000
  const ocupados = agendamentos.filter((a) => ATIVOS.includes(a.status) && a.id !== opts.ignorarId && (profissionalId ? a.profissional_id === profissionalId : true))
  const out: string[] = []
  for (let t = abre; t + duracao * 60000 <= fecha; t += cfg.intervalo_min * 60000) {
    if (t < agora) continue
    const fim = t + duracao * 60000
    if (!ocupados.some((a) => Date.parse(a.inicio) < fim && Date.parse(a.fim) > t)) out.push(local(new Date(t), cfg.fuso).hora)
  }
  return out
}

/** Link do WhatsApp com mensagem pronta (a pessoa revisa e envia pelo próprio WhatsApp). */
export const linkWhatsApp = (telefone: string, texto: string) => `https://wa.me/${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`

export const erroAgenda = (msg: string) =>
  /agendamentos_sem_conflito|exclusion|conflicting/i.test(msg)
    ? 'Esse horário já está ocupado para esse profissional. Escolha outro.'
    : /agendamentos_check|fim > inicio/i.test(msg)
      ? 'Horário inválido: o fim precisa ser depois do início (máximo de 12 horas).'
      : msg

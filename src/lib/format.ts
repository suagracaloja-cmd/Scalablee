export const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
export const brlShort = (n: number) =>
  Math.abs(n) >= 1000
    ? 'R$ ' + new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : brl(n)
export const today = () => toISO(new Date())
export function toISO(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const fmtDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—')
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86400)} d`
}
export function relativeDay(iso: string | null) {
  if (!iso) return 'Sem data'
  const t = today()
  if (iso < t) return 'Atrasada'
  if (iso === t) return 'Hoje'
  if (iso === addDays(t, 1)) return 'Amanhã'
  if (iso === addDays(t, 2)) return 'Depois de amanhã'
  return fmtDate(iso)
}

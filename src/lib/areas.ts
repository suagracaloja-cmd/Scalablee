import { Briefcase, Megaphone, MessageCircle, Sparkles, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'

export const PLATAFORMA = 'Scalable'
export const AGENT_NAME = 'Coraline AI'

/** Áreas de atuação da Coraline AI (a coluna agent_kind do banco guarda a área). */
export const AREA: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  sales: { label: 'Faturamento', icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-700' },
  marketing: { label: 'Marketing', icon: Megaphone, cls: 'bg-pink-50 text-pink-700' },
  finance: { label: 'Financeiro', icon: Wallet, cls: 'bg-amber-50 text-amber-700' },
  support: { label: 'Atendimento', icon: MessageCircle, cls: 'bg-violet-50 text-violet-700' },
  crm: { label: 'Gestão', icon: Briefcase, cls: 'bg-sky-50 text-sky-700' },
  management: { label: 'Gestão', icon: Briefcase, cls: 'bg-sky-50 text-sky-700' },
  assistant: { label: 'Geral', icon: Sparkles, cls: 'bg-brand-soft text-ink' },
}
export const areaOf = (k?: string | null) => AREA[k ?? 'assistant'] ?? AREA.assistant
export const AREA_FILTERS = ['sales', 'marketing', 'finance', 'support', 'crm'] as const

/** Sugestões iniciais da conversa, cobrindo as áreas da clínica. */
export const SUGGESTIONS = [
  { area: 'support', text: 'Como está a agenda de hoje?' },
  { area: 'support', text: 'Quais horários livres tenho amanhã?' },
  { area: 'sales', text: 'Como está o funil de pacientes?' },
  { area: 'marketing', text: 'Crie uma campanha para pacientes que não voltam há 6 meses' },
  { area: 'finance', text: 'Quanto faturei neste mês e o que vence esta semana?' },
  { area: 'crm', text: 'Monte um plano de ação para esta semana' },
]

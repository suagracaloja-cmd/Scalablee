import { Briefcase, Megaphone, MessageCircle, MessageSquareText, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'

export const PLATAFORMA = 'Scalable'
export const AGENT_NAME = 'Coraline AI'

/** Áreas de atuação da Coraline AI (a coluna agent_kind do banco guarda a área). Ícone e cor neutros: a área se lê pelo nome. */
export const AREA: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  sales: { label: 'Faturamento', icon: TrendingUp, cls: 'bg-panel-2 text-secondary' },
  marketing: { label: 'Marketing', icon: Megaphone, cls: 'bg-panel-2 text-secondary' },
  finance: { label: 'Financeiro', icon: Wallet, cls: 'bg-panel-2 text-secondary' },
  support: { label: 'Atendimento', icon: MessageCircle, cls: 'bg-panel-2 text-secondary' },
  crm: { label: 'Gestão', icon: Briefcase, cls: 'bg-panel-2 text-secondary' },
  management: { label: 'Gestão', icon: Briefcase, cls: 'bg-panel-2 text-secondary' },
  assistant: { label: 'Geral', icon: MessageSquareText, cls: 'bg-panel-2 text-secondary' },
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

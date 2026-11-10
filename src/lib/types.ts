export type Company = {
  id: string
  name: string
  segment: string | null
  description: string | null
  website: string | null
  instagram: string | null
  site_analysis: SiteAnalysis | null
  site_analyzed_at: string | null
  agent_whatsapp?: boolean
  agent_auto_reply?: boolean
  agent_instructions?: string | null
  agent_last_run_at?: string | null
  agenda_config?: Partial<AgendaConfig> | null
}
export type SiteAnalysis = {
  score: number
  summary: string
  business: string
  strengths: string[]
  improvements: string[]
  products: string[]
  checks: Record<string, boolean>
  stats: Record<string, number | string>
  analyzed_url: string
}
export type Customer = {
  id: string
  name: string
  phone: string | null
  email: string | null
  status: 'lead' | 'active' | 'inactive' | 'vip'
  notes: string | null
  last_contact_at: string | null
  created_at: string
  etapa?: Etapa
  proximo_contato?: string | null
  origem?: string | null
  data_nascimento?: string | null
}
export type Sale = {
  id: string
  customer_id: string | null
  description: string
  amount: number
  status: 'paid' | 'pending' | 'cancelled'
  sold_at: string
  created_at: string
}
export type Transaction = {
  id: string
  type: 'income' | 'expense'
  description: string
  category: string | null
  amount: number
  due_date: string
  paid_at: string | null
}
export type Task = {
  id: string
  agent_kind: string | null
  customer_id: string | null
  title: string
  description: string | null
  due_date: string | null
  done: boolean
  created_at: string
}
export type Insight = {
  id: string
  agent_kind: string
  title: string
  body: string
  priority: 'low' | 'normal' | 'high'
  read: boolean
  sources: { title: string; url: string }[] | null
  created_at: string
}
export type Conversation = {
  id: string
  customer_id: string | null
  wa_id: string
  contact_name: string | null
  last_message_at: string
  unread: number
  ai_paused: boolean
}
export type Message = {
  id: string
  conversation_id: string
  direction: 'in' | 'out'
  author: 'customer' | 'agent' | 'owner'
  body: string
  status: 'received' | 'sent' | 'failed' | 'pending_approval' | 'rejected'
  error: string | null
  created_at: string
}
export type ApprovalKind =
  | 'whatsapp_reply'
  | 'whatsapp_outreach'
  | 'action'
  | 'campaign_whatsapp'
  | 'campaign_external'
  | 'email_send'
  | 'finance_create'
  | 'finance_update'
  | 'sale_create'
  | 'customer_upsert'
  | 'record_delete'
export type Approval = {
  id: string
  agent_kind: string
  kind: ApprovalKind
  conversation_id: string | null
  customer_id: string | null
  title: string
  reason: string | null
  draft: string | null
  status: 'pending' | 'approved' | 'rejected'
  payload: Record<string, unknown> | null
  result: string | null
  decided_at: string | null
  decided_by: string | null
  decided_by_email: string | null
  thread_id: string | null
  created_at: string
}
export type Thread = { id: string; title: string; created_at: string; updated_at: string }
export type AgentStep = { tool: string; label: string; area: string | null; areaLabel: string | null; ok: boolean }
export type AgentMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  meta: { steps?: AgentStep[]; approvals?: string[]; ai?: boolean; aiError?: string | null } | null
  created_at: string
}

/** Assinatura pelo Mercado Pago (resposta de /api/assinatura). `enabled: false` = cobrança ainda não ativada. */
export type BillingView =
  | { enabled: false }
  | {
      enabled: true
      enforced: boolean
      sandbox: boolean
      plan: { name: string; value: number; trialDays: number }
      status: 'trial' | 'active' | 'overdue' | 'canceled'
      trialEndsAt: string | null
      daysLeft: number | null
      nextDueDate: string | null
      lastPaymentAt: string | null
      /** Link do Mercado Pago para concluir a assinatura (enquanto não estiver autorizada) */
      invoiceUrl: string | null
      hasSubscription: boolean
      /** Assinatura concluída no Mercado Pago (cobrança automática autorizada) */
      authorized: boolean
      allowed: boolean
    }

// ---------- Clínica: equipe, agenda e funil ----------
export type Papel = 'dono' | 'recepcao' | 'profissional'
export const PAPEL_LABEL: Record<Papel, string> = { dono: 'Dono da conta', recepcao: 'Recepção', profissional: 'Profissional de saúde' }
export type Etapa = 'novo' | 'contato' | 'agendado' | 'compareceu' | 'orcamento' | 'fechado' | 'perdido'
export const ETAPAS: { id: Etapa; label: string; cls: string }[] = [
  { id: 'novo', label: 'Novo', cls: 'bg-sky-50 text-sky-700' },
  { id: 'contato', label: 'Em contato', cls: 'bg-indigo-50 text-indigo-700' },
  { id: 'agendado', label: 'Agendado', cls: 'bg-violet-50 text-violet-700' },
  { id: 'compareceu', label: 'Compareceu', cls: 'bg-teal-50 text-teal-700' },
  { id: 'orcamento', label: 'Orçamento', cls: 'bg-amber-50 text-amber-800' },
  { id: 'fechado', label: 'Paciente', cls: 'bg-emerald-50 text-emerald-700' },
  { id: 'perdido', label: 'Perdido', cls: 'bg-slate-100 text-slate-600' },
]
export const etapaInfo = (e?: string | null) => ETAPAS.find((x) => x.id === e) ?? ETAPAS[0]
export const ORIGENS: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', indicacao: 'Indicação', site: 'Site', google: 'Google', outro: 'Outro' }

export type AgendaConfig = { dias: number[]; inicio: string; fim: string; intervalo_min: number; fuso: string }
export const AGENDA_PADRAO: AgendaConfig = { dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00', intervalo_min: 30, fuso: '-03:00' }
export type Profissional = { id: string; nome: string; especialidade: string | null; cor: string; user_id: string | null; ativo: boolean }
export type Servico = { id: string; nome: string; duracao_min: number; preco: number | null; ativo: boolean }
export type StatusAgenda = 'agendado' | 'confirmado' | 'realizado' | 'faltou' | 'cancelado'
export type Agendamento = {
  id: string
  customer_id: string | null
  profissional_id: string | null
  servico_id: string | null
  inicio: string
  fim: string
  status: StatusAgenda
  tipo: 'consulta' | 'retorno' | 'procedimento' | 'avaliacao'
  origem: 'manual' | 'whatsapp' | 'ia'
  observacoes: string | null
  confirmado_em: string | null
}
export const STATUS_AGENDA: Record<StatusAgenda, { label: string; cls: string }> = {
  agendado: { label: 'A confirmar', cls: 'bg-amber-50 text-amber-800' },
  confirmado: { label: 'Confirmada', cls: 'bg-emerald-50 text-emerald-700' },
  realizado: { label: 'Realizada', cls: 'bg-sky-50 text-sky-700' },
  faltou: { label: 'Faltou', cls: 'bg-rose-50 text-rose-700' },
  cancelado: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500' },
}
export const TIPO_AGENDA: Record<Agendamento['tipo'], string> = { consulta: 'Consulta', retorno: 'Retorno', procedimento: 'Procedimento', avaliacao: 'Avaliação' }
export type Membro = { user_id: string; papel: Exclude<Papel, 'dono'>; nome: string | null; email: string | null; criado_em: string }
export type Convite = { id: string; email: string; papel: Exclude<Papel, 'dono'>; nome: string | null; criado_em: string; aceito_em: string | null }

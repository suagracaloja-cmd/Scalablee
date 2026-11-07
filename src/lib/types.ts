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

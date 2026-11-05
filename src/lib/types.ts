export type AgentKind = 'marketing' | 'sales' | 'finance' | 'crm' | 'support'

export type Company = {
  id: string
  name: string
  segment: string | null
  description: string | null
  website: string | null
  instagram: string | null
  site_analysis: SiteAnalysis | null
  site_analyzed_at: string | null
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
export type Agent = {
  id: string
  kind: AgentKind
  name: string
  avatar_url: string | null
  personality: string | null
  enabled: boolean
  auto_reply: boolean
  last_run_at: string | null
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
  agent_kind: AgentKind | null
  customer_id: string | null
  title: string
  description: string | null
  due_date: string | null
  done: boolean
  created_at: string
}
export type Insight = {
  id: string
  agent_kind: AgentKind | 'assistant'
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
export type Approval = {
  id: string
  agent_kind: string
  kind: 'whatsapp_reply' | 'whatsapp_outreach' | 'action'
  conversation_id: string | null
  customer_id: string | null
  title: string
  reason: string | null
  draft: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

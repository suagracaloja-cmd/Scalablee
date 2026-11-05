import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Agent, AgentKind, Company } from './types'

type Counts = { insights: number; approvals: number; conversations: number }

type Ctx = {
  session: Session | null
  loading: boolean
  company: Company | null
  agents: Agent[]
  agentByKind: (k: AgentKind) => Agent | undefined
  counts: Counts
  reloadCompany: () => Promise<void>
  reloadAgents: () => Promise<void>
  reloadCounts: () => Promise<void>
  toast: (msg: string, type?: 'ok' | 'err') => void
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [counts, setCounts] = useState<Counts>({ insights: 0, approvals: 0, conversations: 0 })
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'ok' | 'err' }[]>([])

  const toast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const reloadCompany = useCallback(async () => {
    const { data } = await supabase.from('companies').select('*').maybeSingle()
    setCompany(data as Company | null)
  }, [])
  const reloadAgents = useCallback(async () => {
    const { data } = await supabase.from('agents').select('*').order('created_at')
    const order: AgentKind[] = ['marketing', 'sales', 'finance', 'crm', 'support']
    setAgents(((data ?? []) as Agent[]).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)))
  }, [])
  const reloadCounts = useCallback(async () => {
    const [i, a, c] = await Promise.all([
      supabase.from('insights').select('id', { count: 'exact', head: true }).eq('read', false),
      supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).gt('unread', 0),
    ])
    setCounts({ insights: i.count ?? 0, approvals: a.count ?? 0, conversations: c.count ?? 0 })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setCompany(null)
        setAgents([])
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([reloadCompany(), reloadAgents(), reloadCounts()]).finally(() => setLoading(false))
  }, [userId, reloadCompany, reloadAgents, reloadCounts])

  // Atualização em tempo real dos contadores
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('counts-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights', filter: `company_id=eq.${company.id}` }, () => reloadCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: `company_id=eq.${company.id}` }, (p) => {
        reloadCounts()
        if (p.eventType === 'INSERT') toast('Nova aprovação aguardando você')
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${company.id}` }, () => reloadCounts())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, reloadCounts, toast])

  const agentByKind = useCallback((k: AgentKind) => agents.find((a) => a.kind === k), [agents])

  return (
    <AppCtx.Provider value={{ session, loading, company, agents, agentByKind, counts, reloadCompany, reloadAgents, reloadCounts, toast }}>
      {children}
      <div className="fixed bottom-20 right-4 z-[60] flex flex-col gap-2 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`reveal-up rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
              t.type === 'err' ? 'border-rose-500/40 bg-rose-950/90 text-rose-100' : 'border-brand/40 bg-panel/95 text-slate-100'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  )
}

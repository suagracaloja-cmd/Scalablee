import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, OPENED_FROM_RECOVERY_LINK, supabase } from './supabase'
import type { BillingView, Company, Papel } from './types'

type Counts = { insights: number; approvals: number; conversations: number }

type Ctx = {
  session: Session | null
  loading: boolean
  company: Company | null
  /** Papel de quem está logado na clínica (dono, recepção ou profissional) */
  papel: Papel
  counts: Counts
  reloadCompany: () => Promise<void>
  reloadCounts: () => Promise<void>
  toast: (msg: string, type?: 'ok' | 'err') => void
  /** Sessão aberta pelo link de recuperação: a pessoa precisa definir uma nova senha. */
  recovery: boolean
  endRecovery: () => void
  /** Assinatura (null enquanto carrega ou se a cobrança não estiver ativada) */
  billing: BillingView | null
  reloadBilling: () => Promise<void>
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [papel, setPapel] = useState<Papel>('dono')
  const [counts, setCounts] = useState<Counts>({ insights: 0, approvals: 0, conversations: 0 })
  const [recovery, setRecovery] = useState(OPENED_FROM_RECOVERY_LINK)
  const [billing, setBilling] = useState<BillingView | null>(null)
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'ok' | 'err' }[]>([])

  const toast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const reloadCompany = useCallback(async () => {
    let { data } = await supabase.from('companies').select('*').maybeSingle()
    // Quem foi convidado entra na clínica automaticamente no primeiro acesso
    if (!data) {
      const { data: entrou } = await supabase.rpc('aceitar_convite')
      if (entrou) ({ data } = await supabase.from('companies').select('*').maybeSingle())
    }
    const { data: p } = await supabase.rpc('meu_papel')
    setPapel(((p as Papel | null) ?? 'dono') as Papel)
    setCompany(data as Company | null)
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
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      if (!s) {
        setRecovery(false)
        setCompany(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([reloadCompany(), reloadCounts()]).finally(() => setLoading(false))
  }, [userId, reloadCompany, reloadCounts])

  const companyId = company?.id
  const reloadBilling = useCallback(async () => {
    if (!companyId) return setBilling(null)
    setBilling(await api<BillingView>('assinatura', { action: 'status' }).catch(() => null))
  }, [companyId])
  useEffect(() => {
    reloadBilling()
  }, [reloadBilling])

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

  return (
    <AppCtx.Provider value={{ session, loading, company, papel, counts, reloadCompany, reloadCounts, toast, recovery, endRecovery: () => setRecovery(false), billing, reloadBilling }}>
      {children}
      <div className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`reveal-up max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${t.type === 'err' ? 'bg-rose-600 text-white' : 'bg-ink text-white'}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Approval } from '../lib/types'
import { AREA_FILTERS, AGENT_NAME, areaOf } from '../lib/areas'
import { Empty, PageHeader, Reveal, Spinner } from '../components/ui'
import ApprovalCard from '../components/ApprovalCard'

export default function Approvals() {
  const { company } = useApp()
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [area, setArea] = useState<string>('all')
  const [items, setItems] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    let q = supabase.from('approvals').select('*').order(tab === 'pending' ? 'created_at' : 'decided_at', { ascending: false, nullsFirst: false }).limit(200)
    q = tab === 'pending' ? q.eq('status', 'pending') : q.neq('status', 'pending')
    const { data } = await q
    setItems((data ?? []) as Approval[])
    setLoading(false)
  }, [tab])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('appr-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, load])

  const norm = (k: string) => (k === 'management' ? 'crm' : k)
  const shown = items.filter((a) => area === 'all' || norm(a.agent_kind) === area)

  return (
    <div>
      <PageHeader title="Central de Aprovações" subtitle={`A ${AGENT_NAME} prepara envios, campanhas, lançamentos e exclusões — nada acontece sem a sua decisão. Cada decisão fica registrada.`} />
      <Reveal i={1} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-full bg-panel p-1 text-sm">
          {(['pending', 'done'] as const).map((t) => (
            <button key={t} onClick={() => (setLoading(true), setTab(t))} className={`h-9 rounded-full px-5 font-semibold ${tab === t ? 'bg-ink text-white' : 'text-muted'}`}>
              {t === 'pending' ? 'Pendentes' : 'Histórico'}
            </button>
          ))}
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {['all', ...AREA_FILTERS].map((k) => (
            <button key={k} onClick={() => setArea(k)} className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold ${area === k ? 'bg-ink text-white' : 'bg-panel text-ink'}`}>
              {k === 'all' ? 'Todas as áreas' : areaOf(k).label}
            </button>
          ))}
        </div>
      </Reveal>
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={22} />
        </div>
      ) : shown.length === 0 ? (
        <Reveal i={2} className="card">
          <Empty
            icon={<CheckCircle2 size={24} />}
            title={tab === 'pending' ? 'Nada aguardando aprovação' : 'Nenhuma decisão registrada'}
            text={`Quando a ${AGENT_NAME} preparar uma operação que precisa da sua autorização, ela aparece aqui.`}
          />
        </Reveal>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {shown.map((a, i) => (
            <Reveal key={a.id} i={Math.min(i, 8) + 2} step={60}>
              <ApprovalCard a={a} onChange={load} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  )
}

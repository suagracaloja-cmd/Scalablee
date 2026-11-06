import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Circle, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Task } from '../lib/types'
import { addDays, relativeDay, today } from '../lib/format'
import { AgentMark, AreaChip, Empty, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'

export default function Tasks() {
  const { company, toast } = useApp()
  const [items, setItems] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [form, setForm] = useState<{ title: string; description: string; due_date: string } | null>(null)

  const load = async () => {
    const { data } = await supabase.from('tasks').select('*').eq('done', showDone).order('due_date', { nullsFirst: false }).limit(200)
    setItems((data ?? []) as Task[])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [showDone]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(t: Task) {
    setItems((x) => x.filter((i) => i.id !== t.id))
    await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id)
    if (!t.done) toast('Tarefa concluída ✅')
  }
  async function remove(t: Task) {
    await supabase.from('tasks').delete().eq('id', t.id)
    load()
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    const { error } = await supabase.from('tasks').insert({ company_id: company.id, title: form.title, description: form.description || null, due_date: form.due_date || null })
    if (error) return toast(error.message, 'err')
    setForm(null)
    load()
  }

  const t = today()
  const groups = [
    { label: 'Atrasadas', items: items.filter((x) => x.due_date && x.due_date < t) },
    { label: 'Hoje', items: items.filter((x) => x.due_date === t) },
    { label: 'Amanhã', items: items.filter((x) => x.due_date === addDays(t, 1)) },
    { label: 'Próximos dias', items: items.filter((x) => x.due_date && x.due_date > addDays(t, 1)) },
    { label: 'Sem data', items: items.filter((x) => !x.due_date) },
  ].filter((g) => g.items.length)

  let idx = 0
  return (
    <div>
      <PageHeader
        title="Tarefas"
        subtitle="O Agente SCALABLE antecipa tarefas para hoje, amanhã e depois. Você também pode criar as suas."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Ver pendentes' : 'Ver concluídas'}
            </button>
            <button className="btn-primary" onClick={() => setForm({ title: '', description: '', due_date: addDays(t, 1) })}>
              <Plus size={16} /> Nova tarefa
            </button>
          </>
        }
      />
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Reveal i={1} className="card">
          <Empty icon={<ClipboardList size={26} />} title={showDone ? 'Nenhuma tarefa concluída' : 'Nenhuma tarefa pendente'} text="Rode a análise no Dashboard para o Agente SCALABLE sugerir tarefas." />
        </Reveal>
      ) : (
        <div className="space-y-5">
          {(showDone ? [{ label: 'Concluídas', items }] : groups).map((g) => (
            <div key={g.label}>
              <Reveal i={idx++} className={`mb-2 text-xs font-semibold uppercase tracking-wide ${g.label === 'Atrasadas' ? 'text-rose-600' : 'text-muted'}`}>
                {g.label} · {g.items.length}
              </Reveal>
              <div className="card divide-y divide-line">
                {g.items.map((x) => {
                  return (
                    <Reveal key={x.id} i={idx++} step={40} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => toggle(x)} className="text-muted hover:text-emerald-600">
                        {x.done ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Circle size={20} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${x.done ? 'text-muted line-through' : ''}`}>{x.title}</div>
                        {x.description && <div className="truncate text-xs text-muted">{x.description}</div>}
                      </div>
                      {x.agent_kind && (
                        <span className="hidden items-center gap-1.5 sm:flex" title="Criada pelo Agente SCALABLE">
                          <AgentMark size={18} rounded="rounded-md" />
                          <AreaChip kind={x.agent_kind} />
                        </span>
                      )}
                      <span className="text-[11px] text-muted">{relativeDay(x.due_date)}</span>
                      <button onClick={() => remove(x)} className="p-1 text-muted hover:text-rose-600">
                        <Trash2 size={14} />
                      </button>
                    </Reveal>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title="Nova tarefa">
        {form && (
          <form onSubmit={save} className="space-y-3">
            <Field label="Tarefa">
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Detalhes">
              <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Para quando">
              <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
            <button className="btn-primary w-full">Salvar</button>
          </form>
        )}
      </Modal>
    </div>
  )
}

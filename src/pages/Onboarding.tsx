import { useState, type FormEvent } from 'react'
import { supabase, api } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Field, Logo, Reveal, Spinner } from '../components/ui'

const SEGMENTS = ['Loja de roupas / moda', 'Alimentação / restaurante', 'Beleza / estética', 'Serviços', 'E-commerce', 'Saúde / clínica', 'Educação / cursos', 'Imobiliária', 'Academia / fitness', 'Outro']

export default function Onboarding() {
  const { reloadCompany, reloadCounts, toast } = useApp()
  const [f, setF] = useState({ name: '', segment: '', description: '', website: '', instagram: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('companies').insert({
      name: f.name.trim(),
      segment: f.segment || null,
      description: f.description || null,
      website: f.website || null,
      instagram: f.instagram ? '@' + f.instagram.replace(/^@/, '').replace(/.*instagram\.com\//, '').replace(/\/$/, '') : null,
    })
    if (error) {
      toast(error.message, 'err')
      setBusy(false)
      return
    }
    await Promise.all([reloadCompany(), reloadCounts()])
    if (f.website) api('site', { url: f.website }).then(() => toast('Análise do seu site concluída! Veja nas notificações.')).catch(() => {})
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f2f4f7] to-[#e3efff] p-4 sm:p-6">
      <form onSubmit={submit} className="card w-full max-w-xl p-6 sm:p-10">
        <Reveal>
          <Logo size={42} />
        </Reveal>
        <Reveal i={1} className="mt-8">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Vamos conhecer sua empresa</h1>
          <p className="mt-2 text-sm text-muted">O Agente SCALABLE usa essas informações para trabalhar por você em vendas, marketing, financeiro, atendimento e gestão. Se tiver site, ele também avalia o seu site.</p>
        </Reveal>
        <div className="mt-8 space-y-4">
          <Reveal i={2}>
            <Field label="Nome da empresa *">
              <input maxLength={120} className="input h-12" required value={f.name} onChange={set('name')} placeholder="Ex: Loja da Maria" />
            </Field>
          </Reveal>
          <Reveal i={3}>
            <Field label="Segmento">
              <select className="input h-12" value={f.segment} onChange={set('segment')}>
                <option value="">Selecione…</option>
                {SEGMENTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </Reveal>
          <Reveal i={4}>
            <Field label="O que você vende? (ajuda o atendimento no WhatsApp)">
              <textarea maxLength={2000} className="input min-h-24" value={f.description} onChange={set('description')} placeholder="Produtos, preços, horário de funcionamento, entrega…" />
            </Field>
          </Reveal>
          <Reveal i={5} className="grid gap-4 sm:grid-cols-2">
            <Field label="Site (opcional)">
              <input maxLength={300} className="input h-12" value={f.website} onChange={set('website')} placeholder="minhaloja.com.br" />
            </Field>
            <Field label="Instagram (opcional)">
              <input maxLength={120} className="input h-12" value={f.instagram} onChange={set('instagram')} placeholder="@minhaloja" />
            </Field>
          </Reveal>
          <Reveal i={6} className="pt-2">
            <button className="btn-primary h-12 w-full" disabled={busy || !f.name.trim()}>
              {busy && <Spinner />} Criar empresa e ativar o Agente SCALABLE
            </button>
            <button type="button" className="mt-3 w-full text-center text-xs text-muted hover:text-ink" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </Reveal>
        </div>
      </form>
    </div>
  )
}

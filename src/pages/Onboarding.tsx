import { useState, type FormEvent } from 'react'
import { supabase, api } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Logo } from '../components/Layout'
import { Field, Reveal, Spinner } from '../components/ui'

const SEGMENTS = ['Loja de roupas / moda', 'Alimentação / restaurante', 'Beleza / estética', 'Serviços', 'E-commerce', 'Saúde / clínica', 'Educação / cursos', 'Imobiliária', 'Academia / fitness', 'Outro']

export default function Onboarding() {
  const { reloadCompany, reloadAgents, reloadCounts, toast } = useApp()
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
    await Promise.all([reloadCompany(), reloadAgents(), reloadCounts()])
    if (f.website) api('site', { url: f.website }).then(() => toast('Análise do seu site concluída! Veja nas notificações.')).catch(() => {})
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-lg p-6 sm:p-8">
        <Reveal>
          <Logo />
        </Reveal>
        <Reveal i={1} className="mt-6">
          <h1 className="text-2xl font-bold">Vamos conhecer sua empresa</h1>
          <p className="mt-1 text-sm text-muted">Seus agentes usam essas informações para trabalhar por você. Se tiver site, a IA vai entrar nele e avaliar tudo.</p>
        </Reveal>
        <div className="mt-6 space-y-4">
          <Reveal i={2}>
            <Field label="Nome da empresa *">
              <input className="input" required value={f.name} onChange={set('name')} placeholder="Ex: Loja da Maria" />
            </Field>
          </Reveal>
          <Reveal i={3}>
            <Field label="Segmento">
              <select className="input" value={f.segment} onChange={set('segment')}>
                <option value="">Selecione…</option>
                {SEGMENTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </Reveal>
          <Reveal i={4}>
            <Field label="O que você vende? (ajuda o atendimento no WhatsApp)">
              <textarea className="input min-h-20" value={f.description} onChange={set('description')} placeholder="Produtos, preços, horário de funcionamento, entrega…" />
            </Field>
          </Reveal>
          <Reveal i={5} className="grid gap-4 sm:grid-cols-2">
            <Field label="Site (opcional)">
              <input className="input" value={f.website} onChange={set('website')} placeholder="minhaloja.com.br" />
            </Field>
            <Field label="Instagram (opcional)">
              <input className="input" value={f.instagram} onChange={set('instagram')} placeholder="@minhaloja" />
            </Field>
          </Reveal>
          <Reveal i={6}>
            <button className="btn-primary w-full" disabled={busy || !f.name.trim()}>
              {busy && <Spinner />} Criar minha empresa e ativar agentes
            </button>
            <button type="button" className="mt-3 w-full text-center text-xs text-muted hover:text-slate-300" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </Reveal>
        </div>
      </form>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { supabase, api } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Field, Logo, Reveal, Spinner } from '../components/ui'

const SEGMENTS = ['Clínica médica', 'Clínica odontológica', 'Estética / harmonização facial', 'Dermatologia', 'Clínica multiprofissional', 'Fisioterapia / reabilitação', 'Psicologia / saúde mental', 'Nutrição', 'Hospital', 'Laboratório / exames de imagem', 'Clínica veterinária', 'Outro']

export default function Onboarding() {
  const { reloadCompany, reloadCounts, toast } = useApp()
  const [f, setF] = useState({ name: '', segment: '', description: '', website: '', instagram: '' })
  const [busy, setBusy] = useState(false)
  const [convite, setConvite] = useState<{ clinica: string; papel: string } | null>(null)
  useEffect(() => {
    supabase.rpc('convite_pendente').then(({ data }) => setConvite(((data as { clinica: string; papel: string }[] | null) ?? [])[0] ?? null))
  }, [])
  async function entrarNaEquipe() {
    setBusy(true)
    const { data, error } = await supabase.rpc('aceitar_convite')
    if (error || !data) {
      toast(error?.message ?? 'Não encontramos um convite para este e-mail.', 'err')
      setBusy(false)
      return
    }
    await Promise.all([reloadCompany(), reloadCounts()])
  }
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
          {convite && (
            <div className="mb-6 rounded-3xl bg-brand-soft p-4">
              <p className="text-sm">
                Você foi convidado para a equipe da <b>{convite.clinica}</b> como <b>{convite.papel === 'recepcao' ? 'recepção' : 'profissional de saúde'}</b>.
              </p>
              <button type="button" className="btn-primary mt-3 w-full" onClick={entrarNaEquipe} disabled={busy}>
                {busy && <Spinner />} Entrar na equipe
              </button>
              <p className="mt-2 text-center text-xs text-muted">Ou crie a sua própria clínica abaixo.</p>
            </div>
          )}
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Vamos conhecer sua clínica</h1>
          <p className="mt-2 text-sm text-muted">A Coraline AI usa essas informações para atender seus pacientes no WhatsApp e ajudar na agenda, no funil, no marketing e na gestão. Se tiver site, ele também é avaliado.</p>
        </Reveal>
        <div className="mt-8 space-y-4">
          <Reveal i={2}>
            <Field label="Nome da clínica *">
              <input maxLength={120} className="input h-12" required value={f.name} onChange={set('name')} placeholder="Ex: Clínica Sorriso" />
            </Field>
          </Reveal>
          <Reveal i={3}>
            <Field label="Tipo de clínica">
              <select className="input h-12" value={f.segment} onChange={set('segment')}>
                <option value="">Selecione…</option>
                {SEGMENTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </Reveal>
          <Reveal i={4}>
            <Field label="Sobre a clínica (ajuda o atendimento no WhatsApp)">
              <textarea maxLength={2000} className="input min-h-24" value={f.description} onChange={set('description')} placeholder="Especialidades, convênios aceitos, endereço, estacionamento, formas de pagamento…" />
            </Field>
          </Reveal>
          <Reveal i={5} className="grid gap-4 sm:grid-cols-2">
            <Field label="Site (opcional)">
              <input maxLength={300} className="input h-12" value={f.website} onChange={set('website')} placeholder="minhaclinica.com.br" />
            </Field>
            <Field label="Instagram (opcional)">
              <input maxLength={120} className="input h-12" value={f.instagram} onChange={set('instagram')} placeholder="@minhaclinica" />
            </Field>
          </Reveal>
          <Reveal i={6} className="pt-2">
            <button className="btn-primary h-12 w-full" disabled={busy || !f.name.trim()}>
              {busy && <Spinner />} Criar clínica e ativar a Coraline AI
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

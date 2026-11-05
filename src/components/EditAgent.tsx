import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Agent } from '../lib/types'
import { AGENT_META, AVATAR_STYLES, presetAvatar } from '../lib/agents'
import { AgentAvatar, Field, Modal, Spinner } from './ui'

/** Editar nome, foto, personalidade e opções do agente. */
export default function EditAgent({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { toast, company, reloadAgents } = useApp()
  const [f, setF] = useState({ ...agent })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function upload(fl: File) {
    if (!company) return
    if (fl.size > 2 * 1024 * 1024) return toast('Imagem muito grande (máx. 2MB)', 'err')
    setUploading(true)
    const ext = fl.name.split('.').pop() || 'png'
    const path = `${company.id}/${agent.kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, fl, { upsert: true, contentType: fl.type })
    setUploading(false)
    if (error) return toast(error.message, 'err')
    setF({ ...f, avatar_url: supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl })
  }

  async function save() {
    if (!f.name.trim()) return toast('Dê um nome ao agente', 'err')
    setBusy(true)
    const { error } = await supabase
      .from('agents')
      .update({ name: f.name.trim(), avatar_url: f.avatar_url, personality: f.personality, enabled: f.enabled, auto_reply: f.auto_reply })
      .eq('id', agent.id)
    setBusy(false)
    if (error) return toast(error.message, 'err')
    await reloadAgents()
    toast('Agente atualizado!')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Personalizar agente de ${AGENT_META[agent.kind].label}`} wide>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <AgentAvatar agent={f} size={76} rounded="rounded-3xl" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-dark h-10 text-xs" onClick={() => file.current?.click()} disabled={uploading}>
              {uploading ? <Spinner size={12} /> : <Upload size={14} />} Enviar foto
            </button>
            {f.avatar_url && (
              <button className="btn-ghost h-10 text-xs" onClick={() => setF({ ...f, avatar_url: null })}>
                Usar ícone padrão
              </button>
            )}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        </div>
        <div>
          <span className="label">Ou escolha um avatar</span>
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
            {AVATAR_STYLES.map((s) => {
              const url = presetAvatar(s, f.name || agent.kind)
              return (
                <button key={s} onClick={() => setF({ ...f, avatar_url: url })} className={`aspect-square overflow-hidden rounded-2xl border-2 bg-panel-2 transition ${f.avatar_url === url ? 'border-brand' : 'border-transparent hover:border-line'}`}>
                  <img src={url} alt={s} className="h-full w-full" loading="lazy" />
                </button>
              )
            })}
          </div>
        </div>
        <Field label="Nome do agente">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} />
        </Field>
        <Field label="Personalidade e instruções">
          <textarea
            className="input min-h-24"
            value={f.personality ?? ''}
            onChange={(e) => setF({ ...f, personality: e.target.value })}
            placeholder="Ex: Fala de forma descontraída, usa emojis, sempre oferece frete grátis acima de R$ 200…"
          />
        </Field>
        <label className="flex items-center justify-between rounded-2xl bg-panel-2 p-4 text-sm font-semibold">
          Agente ativo
          <input type="checkbox" className="h-5 w-5 accent-[#268bfd]" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        </label>
        {agent.kind === 'support' && (
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-panel-2 p-4 text-sm">
            <span>
              <span className="font-semibold">Responder sozinho no WhatsApp</span>
              <span className="mt-0.5 block text-xs text-muted">Desligado: toda resposta passa pela sua aprovação. Ligado: só pede aprovação quando necessário (descontos, reclamações, dúvidas sem resposta).</span>
            </span>
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#268bfd]" checked={f.auto_reply} onChange={(e) => setF({ ...f, auto_reply: e.target.checked })} />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}

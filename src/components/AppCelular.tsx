import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BellRing, CheckCircle2, Download, Share, Smartphone } from 'lucide-react'
import { useApp } from '../lib/store'
import {
  ativarNotificacoes,
  desativarNotificacoes,
  ehAndroid,
  ehIOS,
  estadoNotificacoes,
  instalado,
  instalar,
  mudarPreferencia,
  ouvirApp,
  podeInstalar,
  testarNotificacao,
  type EstadoNotif,
  type Preferencias,
} from '../lib/app'
import { Reveal, Spinner } from './ui'

/** Configurações → App no celular: instalar e ativar as notificações neste aparelho. */
export function AppCelular({ i = 5 }: { i?: number }) {
  const { papel, toast } = useApp()
  const recebeAvisos = papel === 'dono' || papel === 'recepcao'
  const [, atualizar] = useState(0)
  const [estado, setEstado] = useState<EstadoNotif | null>(null)
  const [pref, setPref] = useState<Preferencias | null>(null)
  const [busy, setBusy] = useState(false)

  const loc = useLocation()
  useEffect(() => {
    if (loc.hash === '#app') setTimeout(() => document.getElementById('app')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [loc.hash])

  const carregar = useCallback(async () => {
    const r = await estadoNotificacoes().catch(() => ({ estado: 'sem-suporte' as EstadoNotif, pref: null }))
    setEstado(r.estado)
    setPref(r.pref)
  }, [])
  useEffect(() => {
    carregar()
    return ouvirApp(() => atualizar((n) => n + 1))
  }, [carregar])

  async function fazer(acao: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    try {
      await acao()
      if (ok) toast(ok)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
      carregar()
    }
  }

  const appInstalado = instalado()

  return (
    <Reveal i={i} className="card p-5 lg:col-span-2" >
      <div id="app">
        <h2 className="flex items-center gap-2 font-semibold">
          <Smartphone size={18} /> App no celular
        </h2>
        <p className="mt-1 text-sm text-muted">Use a Scalable como um aplicativo: ícone na tela inicial, tela cheia e avisos no celular. Grátis, sem loja de aplicativos.</p>

        {/* Instalar */}
        <div className="mt-4 rounded-2xl bg-panel-2 p-4 text-sm">
          {appInstalado ? (
            <p className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle2 size={16} /> Você está usando o app instalado.
            </p>
          ) : podeInstalar() ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Instale a Scalable neste aparelho.</span>
              <button className="btn-primary" onClick={() => fazer(instalar)} disabled={busy}>
                <Download size={16} /> Instalar o app
              </button>
            </div>
          ) : ehIOS() ? (
            <div>
              <p className="font-medium">Para instalar no iPhone ou iPad:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                <li>Abra este site no <b className="text-ink">Safari</b>.</li>
                <li>
                  Toque em <b className="text-ink">Compartilhar</b> <Share size={13} className="inline -translate-y-px" /> (o quadrado com a seta).
                </li>
                <li>
                  Escolha <b className="text-ink">Adicionar à Tela de Início</b> e confirme.
                </li>
              </ol>
            </div>
          ) : ehAndroid() ? (
            <p className="text-muted">
              No <b className="text-ink">Chrome</b>, toque no menu <b className="text-ink">⋮</b> e escolha <b className="text-ink">Instalar app</b> (ou &quot;Adicionar à tela inicial&quot;).
            </p>
          ) : (
            <p className="text-muted">
              No celular, abra <b className="text-ink">scalablee.vercel.app</b> e use &quot;Adicionar à tela inicial&quot;. No computador, o Chrome e o Edge mostram um botão de instalar na barra de endereço.
            </p>
          )}
        </div>

        {/* Notificações */}
        {recebeAvisos && (
          <div className="mt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BellRing size={16} /> Notificações neste aparelho
            </h3>
            <p className="mt-1 text-xs text-muted">Avisos de mensagem nova no WhatsApp e de aprovação pendente. Mostram só o nome do contato, nunca o conteúdo da conversa.</p>
            <div className="mt-3 text-sm">
              {estado === null ? (
                <Spinner />
              ) : estado === 'precisa-instalar' ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">No iPhone, as notificações funcionam no app instalado (iOS 16.4 ou mais novo). Instale como explicado acima e abra a Scalable pelo ícone para ativar.</p>
              ) : estado === 'sem-suporte' ? (
                <p className="rounded-xl bg-panel-2 px-3 py-2 text-muted">Este navegador não recebe notificações. Use o Chrome no Android, o Safari no iPhone (app instalado) ou o Chrome/Edge no computador.</p>
              ) : estado === 'bloqueadas' ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (Notificações → scalablee.vercel.app) e volte aqui.</p>
              ) : estado === 'desligadas' ? (
                <button className="btn-primary" onClick={() => fazer(() => ativarNotificacoes(), 'Notificações ativadas neste aparelho')} disabled={busy}>
                  {busy ? <Spinner /> : <BellRing size={16} />} Ativar notificações neste aparelho
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 font-medium text-emerald-700">
                    <CheckCircle2 size={16} /> Ativadas neste aparelho
                  </p>
                  {(['whatsapp', 'aprovacoes'] as const).map((campo) => (
                    <label key={campo} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-panel-2 px-3 py-2.5">
                      <span>{campo === 'whatsapp' ? 'Mensagens novas no WhatsApp' : 'Aprovações pendentes'}</span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#48a8fc]"
                        checked={!!pref?.[campo]}
                        disabled={busy}
                        onChange={(e) => fazer(() => mudarPreferencia(campo, e.target.checked))}
                      />
                    </label>
                  ))}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        fazer(async () => {
                          const r = await testarNotificacao()
                          if (!r.enviados) throw new Error('O aviso de teste não foi entregue. Desative e ative de novo neste aparelho.')
                          toast('Aviso de teste enviado. Ele chega em alguns segundos.')
                        })
                      }
                    >
                      Enviar notificação de teste
                    </button>
                    <button className="btn-ghost text-rose-600" disabled={busy} onClick={() => fazer(desativarNotificacoes, 'Notificações desativadas neste aparelho')}>
                      Desativar neste aparelho
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Reveal>
  )
}

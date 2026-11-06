import { useState, type ReactNode } from 'react'
import { Check, CheckCircle2, Mail, Megaphone, MessageCircle, Send, ShoppingBag, Trash2, UserPlus, Wallet, X } from 'lucide-react'
import { api } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Approval, ApprovalKind } from '../lib/types'
import { brl, fmtDate } from '../lib/format'
import { AgentMark, AreaChip, Spinner } from './ui'

type Info = { label: string; icon: typeof Send; editable?: boolean; manual?: boolean }
export const KIND_INFO: Record<ApprovalKind, Info> = {
  whatsapp_reply: { label: 'Resposta no WhatsApp', icon: MessageCircle, editable: true },
  whatsapp_outreach: { label: 'Mensagem de WhatsApp', icon: Send, editable: true },
  campaign_whatsapp: { label: 'Campanha no WhatsApp', icon: Megaphone, editable: true },
  campaign_external: { label: 'Campanha (publicação manual)', icon: Megaphone, manual: true },
  email_send: { label: 'E-mail (envio manual)', icon: Mail, manual: true },
  finance_create: { label: 'Lançamento financeiro', icon: Wallet },
  finance_update: { label: 'Alteração financeira', icon: Wallet },
  sale_create: { label: 'Registro de venda', icon: ShoppingBag },
  customer_upsert: { label: 'Cadastro de cliente', icon: UserPlus },
  record_delete: { label: 'Exclusão de dados', icon: Trash2 },
  action: { label: 'Ação', icon: CheckCircle2 },
}

const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const TABLE_LABEL: Record<string, string> = { sales: 'Venda', customers: 'Cliente', transactions: 'Lançamento financeiro', tasks: 'Tarefa' }
const STATUS_LABEL: Record<string, string> = { lead: 'Lead', active: 'Ativo', vip: 'VIP', inactive: 'Inativo', paid: 'Pago', pending: 'Pendente' }

function Row({ k, v }: { k: string; v: ReactNode }) {
  if (v === null || v === undefined || v === '') return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted">{k}</span>
      <span className="min-w-0 flex-1 break-words font-medium">{v}</span>
    </div>
  )
}

/** Dados envolvidos na operação, de forma legível. */
function Details({ a }: { a: Approval }) {
  const p = (a.payload ?? {}) as Record<string, unknown>
  switch (a.kind) {
    case 'finance_create':
      return (
        <>
          <Row k="Tipo" v={p.type === 'income' ? 'Receita' : 'Despesa'} />
          <Row k="Descrição" v={String(p.description ?? '')} />
          <Row k="Valor" v={brl(Number(p.amount))} />
          <Row k="Vencimento" v={p.due_date ? fmtDate(String(p.due_date)) : null} />
          <Row k="Categoria" v={(p.category as string) ?? null} />
          <Row k="Já pago" v={p.paid ? 'Sim' : 'Não'} />
        </>
      )
    case 'finance_update': {
      const ch = (p.changes ?? {}) as Record<string, unknown>
      const before = (p.antes ?? {}) as Record<string, unknown>
      return (
        <>
          <Row k="Lançamento" v={String(before.description ?? p.id)} />
          {'paid' in ch && <Row k="Pagamento" v={ch.paid ? 'Marcar como pago' : 'Marcar como em aberto'} />}
          {'amount' in ch && <Row k="Valor" v={`${brl(Number(before.amount))} → ${brl(Number(ch.amount))}`} />}
          {'due_date' in ch && <Row k="Vencimento" v={`${fmtDate(String(before.due_date))} → ${fmtDate(String(ch.due_date))}`} />}
          {'description' in ch && <Row k="Descrição" v={String(ch.description)} />}
          {'category' in ch && <Row k="Categoria" v={String(ch.category)} />}
        </>
      )
    }
    case 'sale_create':
      return (
        <>
          <Row k="Produto" v={String(p.description ?? '')} />
          <Row k="Valor" v={brl(Number(p.amount))} />
          <Row k="Data" v={p.sold_at ? fmtDate(String(p.sold_at)) : null} />
          <Row k="Status" v={STATUS_LABEL[String(p.status)] ?? String(p.status ?? '')} />
        </>
      )
    case 'customer_upsert':
      return (
        <>
          <Row k="Nome" v={String(p.name ?? '')} />
          <Row k="Telefone" v={(p.phone as string) ?? null} />
          <Row k="E-mail" v={(p.email as string) ?? null} />
          <Row k="Status" v={p.status ? STATUS_LABEL[String(p.status)] ?? String(p.status) : null} />
          <Row k="Observações" v={(p.notes as string) ?? null} />
        </>
      )
    case 'record_delete':
      return (
        <>
          <Row k="Tipo" v={TABLE_LABEL[String(p.table)] ?? String(p.table)} />
          <Row k="Registro" v={String(p.label ?? p.id)} />
        </>
      )
    case 'whatsapp_outreach':
      return <Row k="Telefone" v={p.telefone ? `+${String(p.telefone).replace(/\D/g, '')}` : null} />
    case 'whatsapp_reply':
      return (
        <>
          <Row k="Cliente" v={(p.cliente as string) ?? null} />
          <Row k="Mensagem do cliente" v={(p.mensagem_do_cliente as string) ?? null} />
        </>
      )
    case 'email_send':
      return (
        <>
          <Row k="Para" v={String(p.para ?? '')} />
          <Row k="Assunto" v={String(p.assunto ?? '')} />
        </>
      )
    case 'campaign_whatsapp':
    case 'campaign_external': {
      const cl = (Array.isArray(p.clientes) ? p.clientes : []) as { nome: string }[]
      return (
        <>
          <Row k="Campanha" v={String(p.nome ?? '')} />
          <Row k="Canal" v={String(p.canal ?? '')} />
          <Row k="Público" v={String(p.publico ?? '')} />
          <Row k="Contatos" v={`${cl.length}${cl.length ? ` (${cl.slice(0, 4).map((c) => c.nome).join(', ')}${cl.length > 4 ? '…' : ''})` : ''}`} />
          <Row k="Observações" v={(p.observacoes as string) ?? null} />
        </>
      )
    }
    default:
      return null
  }
}

/** Só mostra o quadro de dados quando há algo a mostrar (aprovações antigas podem não ter payload). */
function hasDetails(a: Approval) {
  const p = (a.payload ?? {}) as Record<string, unknown>
  if (a.kind === 'whatsapp_outreach') return !!p.telefone
  if (a.kind === 'whatsapp_reply') return !!(p.cliente || p.mensagem_do_cliente)
  if (a.kind === 'action') return false
  return a.payload !== null && a.payload !== undefined
}

export default function ApprovalCard({ a, onChange, compact = false }: { a: Approval; onChange?: () => void; compact?: boolean }) {
  const { toast, reloadCounts } = useApp()
  const info = KIND_INFO[a.kind] ?? KIND_INFO.action
  const showsText = a.draft !== null && (info.editable || a.kind === 'email_send' || a.kind === 'campaign_external')
  const [text, setText] = useState(a.draft ?? '')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  async function decide(action: 'approve' | 'reject') {
    setBusy(action)
    try {
      const r = await api<{ result?: string }>('aprovacoes', { action, id: a.id, text: info.editable ? text : undefined })
      toast(action === 'approve' ? r.result ?? 'Aprovado' : 'Recusado')
      reloadCounts()
      onChange?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
      onChange?.()
    } finally {
      setBusy(null)
    }
  }

  const statusChip =
    a.status === 'pending' ? (
      <span className="chip bg-amber-50 text-amber-700">Aguardando aprovação</span>
    ) : a.status === 'approved' ? (
      <span className="chip bg-emerald-50 text-emerald-700">Aprovado</span>
    ) : (
      <span className="chip bg-rose-50 text-rose-700">Recusado</span>
    )

  return (
    <div className={`rounded-3xl border border-line bg-panel ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-panel-2 text-ink">
          <info.icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted">{info.label}</span>
            <AreaChip kind={a.agent_kind} />
          </div>
          <div className="mt-0.5 font-semibold leading-snug">{a.title}</div>
          {a.reason && <div className="mt-0.5 text-sm text-muted">{a.reason}</div>}
        </div>
        {statusChip}
      </div>

      {!compact && hasDetails(a) && (
        <div className="mt-4 space-y-1.5 rounded-2xl bg-panel-2 p-4">
          <Details a={a} />
        </div>
      )}
      {!compact && !hasDetails(a) && !a.draft && <p className="mt-4 text-sm text-muted">Sem dados adicionais.</p>}
      {compact && hasDetails(a) && a.kind !== 'whatsapp_reply' && a.kind !== 'whatsapp_outreach' && (
        <div className="mt-3 space-y-1 rounded-2xl bg-panel-2 p-3">
          <Details a={a} />
        </div>
      )}

      {showsText &&
        (a.status === 'pending' && info.editable ? (
          <div className="mt-3">
            <span className="label">Mensagem (você pode editar antes de aprovar)</span>
            <textarea className="input min-h-24 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        ) : (
          <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-panel-2 p-3 text-sm">{a.draft}</p>
        ))}

      {info.manual && a.status === 'pending' && (
        <p className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Integração ainda não configurada: aprovar apenas registra a decisão. O envio/publicação deve ser feito manualmente.
        </p>
      )}
      {a.result && <p className={`mt-3 text-xs ${a.result.startsWith('Falhou') ? 'text-rose-600' : 'text-emerald-700'}`}>{a.result}</p>}

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <AgentMark size={18} rounded="rounded-md" />
          <span>
            Solicitado em {dt(a.created_at)}
            {a.decided_at && (
              <>
                {' · '}
                {a.status === 'approved' ? 'Aprovado' : 'Recusado'} em {dt(a.decided_at)}
                {a.decided_by_email ? ` por ${a.decided_by_email}` : ''}
              </>
            )}
          </span>
        </div>
        {a.status === 'pending' && (
          <div className="flex gap-2">
            <button className="btn-danger h-9 px-4 text-xs" disabled={!!busy} onClick={() => decide('reject')}>
              {busy === 'reject' ? <Spinner size={12} /> : <X size={14} />} Recusar
            </button>
            <button className="btn-primary h-9 px-4 text-xs" disabled={!!busy || (info.editable && !text.trim())} onClick={() => decide('approve')}>
              {busy === 'approve' ? <Spinner size={12} /> : <Check size={14} />} Aprovar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { CreditCard, ExternalLink, Lock, Receipt, ShieldCheck } from 'lucide-react'
import { api } from '../lib/supabase'
import { useApp } from '../lib/store'
import { brl, fmtDate } from '../lib/format'
import { Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'

type Fatura = { id: string; dueDate: string; value: number; status: string; invoiceUrl: string | null }
const STATUS_FATURA: Record<string, { l: string; c: string }> = {
  PAID: { l: 'Paga', c: 'bg-emerald-50 text-emerald-700' },
  SCHEDULED: { l: 'Agendada', c: 'bg-brand-soft text-ink' },
  FAILED: { l: 'Recusada — nova tentativa', c: 'bg-rose-50 text-rose-700' },
  CANCELLED: { l: 'Cancelada', c: 'bg-slate-100 text-slate-600' },
}

/** Assinatura da Scalable (Mercado Pago): status, assinar, cobranças e cancelamento. */
export default function Billing() {
  const { billing, reloadBilling, session, toast } = useApp()
  const [faturas, setFaturas] = useState<Fatura[] | null>(null)
  const [form, setForm] = useState<null | { email: string }>(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)

  const hasSub = !!billing && billing.enabled && billing.hasSubscription
  useEffect(() => {
    if (!hasSub) return setFaturas(null)
    api<{ faturas: Fatura[] }>('assinatura', { action: 'faturas' })
      .then((r) => setFaturas(r.faturas))
      .catch(() => setFaturas([]))
  }, [hasSub])

  if (!billing) return <div className="flex justify-center py-20"><Spinner /></div>
  if (!billing.enabled)
    return (
      <div>
        <PageHeader title="Assinatura" subtitle="As assinaturas ainda não foram ativadas nesta plataforma." />
      </div>
    )

  const b = billing
  const chip =
    b.status === 'active'
      ? { l: 'Ativa', c: 'bg-emerald-50 text-emerald-700' }
      : b.status === 'trial'
        ? { l: b.allowed ? `Teste grátis · ${b.daysLeft} dia(s) restante(s)` : 'Teste grátis encerrado', c: b.allowed ? 'bg-brand-soft text-ink' : 'bg-rose-50 text-rose-700' }
        : b.status === 'overdue'
          ? { l: 'Pagamento pendente', c: 'bg-amber-50 text-amber-800' }
          : { l: 'Cancelada', c: 'bg-slate-100 text-slate-600' }

  async function subscribe(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    try {
      const r = await api<{ invoiceUrl: string | null }>('assinatura', { action: 'assinar', email: form.email })
      await reloadBilling()
      setForm(null)
      if (r.invoiceUrl) {
        setLink(r.invoiceUrl)
        window.open(r.invoiceUrl, '_blank', 'noopener')
      }
      toast('Conclua a assinatura na página do Mercado Pago.')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!confirm('Cancelar a assinatura? Não haverá novas cobranças e o acesso continua até o fim do período já pago.')) return
    setBusy(true)
    try {
      await api('assinatura', { action: 'cancelar' })
      await reloadBilling()
      toast('Assinatura cancelada')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  const payUrl = link ?? b.invoiceUrl
  const canSubscribe = !b.hasSubscription

  return (
    <div>
      <PageHeader title="Assinatura" subtitle="Seu plano da Scalable, faturas e forma de pagamento." />
      {!b.allowed && (
        <Reveal className="mb-4 flex items-start gap-3 rounded-3xl bg-rose-50 p-4 text-sm text-rose-800">
          <Lock size={18} className="mt-0.5 shrink-0" />
          <span>
            O acesso está pausado porque a assinatura não está em dia. Assine ou pague a fatura para voltar a usar tudo. Seus dados continuam guardados e você pode exportá-los em Configurações.
          </span>
        </Reveal>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Reveal i={1} className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Plano</div>
              <div className="mt-1 text-2xl font-bold">{b.plan.name}</div>
              <div className="mt-1 text-sm text-muted">
                <b className="text-ink">{brl(b.plan.value)}</b> por mês · cobrança automática pelo Mercado Pago
              </div>
            </div>
            <span className={`chip ${chip.c}`}>{chip.l}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {b.status === 'trial' && b.trialEndsAt && <Info k="Teste grátis até" v={fmtDate(b.trialEndsAt)} />}
            {b.nextDueDate && b.status !== 'canceled' && <Info k="Próximo vencimento" v={fmtDate(b.nextDueDate)} />}
            {b.lastPaymentAt && <Info k="Último pagamento" v={fmtDate(b.lastPaymentAt)} />}
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {canSubscribe && (
              <button className="btn-primary" onClick={() => setForm({ email: session?.user.email ?? '' })}>
                <CreditCard size={16} /> {b.status === 'canceled' ? 'Assinar de novo' : 'Assinar agora'}
              </button>
            )}
            {!canSubscribe && payUrl && !b.authorized && (
              <a className="btn-primary" href={payUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Concluir assinatura no Mercado Pago
              </a>
            )}
            {b.hasSubscription && (
              <button className="btn-ghost text-rose-600" onClick={cancel} disabled={busy}>
                Cancelar assinatura
              </button>
            )}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck size={14} /> Pagamento processado pelo Mercado Pago. A Scalable não vê nem guarda dados do seu cartão.
            {b.sandbox && <span className="chip bg-amber-50 text-amber-800">Ambiente de testes</span>}
          </p>
        </Reveal>

        <Reveal i={2} className="card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Receipt size={18} /> Cobranças
          </h2>
          {!b.hasSubscription ? (
            <p className="mt-3 text-sm text-muted">As cobranças aparecem aqui depois que você assinar.</p>
          ) : faturas === null ? (
            <div className="py-6 text-center"><Spinner /></div>
          ) : faturas.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{b.authorized ? 'A primeira cobrança aparece aqui na data do vencimento.' : 'Nenhuma cobrança ainda. Conclua a assinatura no Mercado Pago.'}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {faturas.map((f) => {
                const st = STATUS_FATURA[f.status] ?? { l: f.status, c: 'bg-slate-100 text-slate-600' }
                return (
                  <li key={f.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="w-24 shrink-0 text-muted">{fmtDate(f.dueDate)}</span>
                    <span className="flex-1 font-semibold">{brl(f.value)}</span>
                    <span className={`chip ${st.c}`}>{st.l}</span>
                    {f.invoiceUrl && (
                      <a href={f.invoiceUrl} target="_blank" rel="noreferrer" className="icon-btn h-8 w-8" title="Abrir fatura">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Reveal>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Assinar a Scalable">
        {form && (
          <form onSubmit={subscribe} className="space-y-3">
            <p className="text-sm text-muted">
              {brl(b.plan.value)} por mês, cobrados automaticamente.{' '}
              {b.status === 'trial' && b.allowed ? 'A primeira cobrança só acontece no fim do seu teste grátis.' : 'A primeira cobrança acontece hoje.'} Você pode cancelar quando quiser.
            </p>
            <Field label="E-mail da sua conta do Mercado Pago">
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ email: e.target.value })} />
            </Field>
            <p className="rounded-xl bg-panel-2 px-3 py-2 text-xs text-muted">
              Use o mesmo e-mail com que você entra no Mercado Pago. Na próxima tela, o Mercado Pago pede o pagamento com segurança.
            </p>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner size={14} />} Continuar no Mercado Pago
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-panel-2 p-3">
      <div className="text-[11px] text-muted">{k}</div>
      <div className="font-semibold">{v}</div>
    </div>
  )
}

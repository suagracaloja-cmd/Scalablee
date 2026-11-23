import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { cfgDe, hojeLocal, local, paraUtc, somaDias } from '../lib/agenda'
import { STATUS_AGENDA, type Agendamento } from '../lib/types'
import { Reveal } from './ui'

type Linha = Agendamento & { paciente: string | null; prof: { nome: string; cor: string } | null }

/** Cartão "Hoje na agenda" do início: consultas do dia, confirmadas e a confirmar. */
export function HojeNaAgenda({ i = 1 }: { i?: number }) {
  const { company } = useApp()
  const cfg = cfgDe(company)
  const [linhas, setLinhas] = useState<Linha[] | null>(null)

  useEffect(() => {
    const hoje = hojeLocal(cfg.fuso)
    const de = paraUtc(hoje, '00:00', cfg.fuso).toISOString()
    const ate = paraUtc(somaDias(hoje, 1), '00:00', cfg.fuso).toISOString()
    Promise.all([
      supabase.from('agendamentos').select('*').gte('inicio', de).lt('inicio', ate).neq('status', 'cancelado').order('inicio'),
      supabase.from('profissionais').select('id,nome,cor'),
    ]).then(async ([a, p]) => {
      // Nomes só dos pacientes de hoje (antes baixava todos os pacientes da clínica)
      const ids = [...new Set(((a.data ?? []) as Agendamento[]).map((x) => x.customer_id).filter(Boolean) as string[])]
      const c = ids.length ? await supabase.from('customers').select('id,name').in('id', ids) : { data: [] }
      const pac = new Map((c.data ?? []).map((x) => [x.id as string, x.name as string]))
      const pro = new Map((p.data ?? []).map((x) => [x.id as string, { nome: x.nome as string, cor: x.cor as string }]))
      setLinhas(((a.data ?? []) as Agendamento[]).map((x) => ({ ...x, paciente: x.customer_id ? (pac.get(x.customer_id) ?? null) : null, prof: x.profissional_id ? (pro.get(x.profissional_id) ?? null) : null })))
    })
  }, [cfg.fuso])

  const n = (s: string) => (linhas ?? []).filter((x) => x.status === s).length
  const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`
  const resumo =
    linhas === null
      ? 'Carregando…'
      : linhas.length === 0
        ? 'Nenhuma consulta hoje'
        : `${plural(linhas.length, 'consulta', 'consultas')} · ${n('agendado')} a confirmar · ${plural(n('confirmado'), 'confirmada', 'confirmadas')}`
  // Assinatura da agenda: uma linha azul fina marca "agora" entre as consultas que já passaram e as próximas
  const agoraMs = Date.now()
  const lista = (linhas ?? []).slice(0, 6)
  const posAgora = lista.findIndex((a) => new Date(a.inicio).getTime() > agoraMs)
  const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: cfg.fuso })
  const linhaAgora = (
    <li key="agora" aria-label={`Agora, ${horaAgora}`} className="col-span-full flex items-center gap-2 py-0.5 text-xs font-medium tabular-nums text-brand-ink">
      <span>{horaAgora}</span>
      <span className="h-px flex-1 bg-brand" />
    </li>
  )
  return (
    <Reveal i={i} className="card mb-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Hoje na agenda</h2>
        <Link to="/agenda" className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-brand-ink hover:underline">
          Abrir agenda <ChevronRight size={16} strokeWidth={1.5} />
        </Link>
      </div>
      <p className="text-sm text-muted">{resumo}</p>
      {lista.length > 0 && (
        <ul className="mt-4 grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {lista.flatMap((a, k) => {
            const item = (
              <li key={a.id} className={`flex min-w-0 items-center gap-3 rounded-ctl px-2 py-2 ${new Date(a.inicio).getTime() <= agoraMs ? 'opacity-60' : ''}`}>
                <span className="w-11 shrink-0 text-sm font-medium tabular-nums">{local(a.inicio, cfg.fuso).hora}</span>
                <span className="h-8 w-0.5 shrink-0 rounded-full" style={{ background: a.prof?.cor ?? '#c3c7cf' }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.paciente ?? 'Sem paciente'}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.prof?.nome ?? 'Agenda geral'} · {STATUS_AGENDA[a.status].label}
                  </span>
                </span>
              </li>
            )
            return k === posAgora && posAgora > 0 ? [linhaAgora, item] : [item]
          })}
          {posAgora === -1 && lista.length > 0 && linhaAgora}
        </ul>
      )}
      {linhas && linhas.length > 6 && (
        <Link to="/agenda" className="mt-3 inline-block text-sm font-medium text-brand-ink hover:underline">
          Ver as outras {linhas.length - 6} na agenda
        </Link>
      )}
    </Reveal>
  )
}

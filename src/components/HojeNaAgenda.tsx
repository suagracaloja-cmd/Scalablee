import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays } from 'lucide-react'
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
      supabase.from('customers').select('id,name'),
      supabase.from('profissionais').select('id,nome,cor'),
    ]).then(([a, c, p]) => {
      const pac = new Map((c.data ?? []).map((x) => [x.id as string, x.name as string]))
      const pro = new Map((p.data ?? []).map((x) => [x.id as string, { nome: x.nome as string, cor: x.cor as string }]))
      setLinhas(((a.data ?? []) as Agendamento[]).map((x) => ({ ...x, paciente: x.customer_id ? (pac.get(x.customer_id) ?? null) : null, prof: x.profissional_id ? (pro.get(x.profissional_id) ?? null) : null })))
    })
  }, [cfg.fuso])

  const n = (s: string) => (linhas ?? []).filter((x) => x.status === s).length
  return (
    <Reveal i={i} className="card mb-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
            <CalendarDays size={17} />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-tight">Hoje na agenda</h2>
            <p className="text-xs text-muted">{linhas === null ? 'Carregando…' : `${linhas.length} consulta(s) · ${n('agendado')} a confirmar · ${n('confirmado')} confirmada(s)`}</p>
          </div>
        </div>
        <Link to="/agenda" className="icon-btn" aria-label="Abrir a agenda">
          <ArrowUpRight size={17} />
        </Link>
      </div>
      {linhas && linhas.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {linhas.slice(0, 6).map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-panel-2 px-3 py-2.5" style={{ borderLeft: `4px solid ${a.prof?.cor ?? '#94a3b8'}` }}>
              <span className="w-12 shrink-0 text-sm font-bold">{local(a.inicio, cfg.fuso).hora}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{a.paciente ?? 'Sem paciente'}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[11px] text-muted">{a.prof?.nome ?? 'Agenda geral'}</span>
                  {/* No celular o status fica embaixo do nome, para o nome aparecer inteiro */}
                  <span className={`chip px-2 py-0.5 text-[10px] min-[420px]:hidden ${STATUS_AGENDA[a.status].cls}`}>{STATUS_AGENDA[a.status].label}</span>
                </span>
              </span>
              <span className={`chip max-[419px]:hidden ${STATUS_AGENDA[a.status].cls}`}>{STATUS_AGENDA[a.status].label}</span>
            </li>
          ))}
        </ul>
      )}
      {linhas && linhas.length > 6 && (
        <Link to="/agenda" className="mt-3 inline-block text-sm font-semibold text-brand-dark hover:underline">
          Ver as outras {linhas.length - 6} na agenda
        </Link>
      )}
    </Reveal>
  )
}

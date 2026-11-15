import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, History, Minus, Package, Pencil, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { brl, fmtDate, fmtTime, today } from '../lib/format'
import { CATEGORIAS, DIAS_AVISO_VALIDADE, TIPO_MOV, UNIDADES, fmtQtd, lerNumero, normalizarItem, situacao, type ItemEstoque, type MovEstoque, type TipoMov } from '../lib/estoque'
import { useTelaLarga } from '../hooks/useTelaLarga'
import { Count, Empty, Field, Modal, PageHeader, Reveal, Spinner, StatusCard } from '../components/ui'
import { useConfirmar } from '../components/Confirmar'

type Filtro = 'todos' | 'acabando' | 'vencendo' | 'vencidos' | 'arquivados'
type FormItem = { nome: string; categoria: string; unidade: string; quantidade: string; minimo: string; validade: string; custo: string; fornecedor: string; observacoes: string }
const itemVazio: FormItem = { nome: '', categoria: '', unidade: 'un', quantidade: '', minimo: '', validade: '', custo: '', fornecedor: '', observacoes: '' }

/** Ordem da lista: o que precisa de atenção primeiro. */
const peso = (i: ItemEstoque, hoje: string) => {
  const s = situacao(i, hoje)
  return s.validade === 'vencido' ? 0 : s.nivel === 'acabou' ? 1 : s.nivel === 'baixo' ? 2 : s.validade === 'vencendo' ? 3 : 4
}

function Selos({ item, hoje }: { item: ItemEstoque; hoje: string }) {
  const s = situacao(item, hoje)
  return (
    <span className="flex flex-wrap gap-1">
      {s.nivel === 'acabou' && <span className="chip bg-rose-50 text-rose-700">Acabou</span>}
      {s.nivel === 'baixo' && <span className="chip bg-amber-50 text-amber-800">Acabando</span>}
      {s.validade === 'vencido' && <span className="chip bg-rose-50 text-rose-700">Vencido</span>}
      {s.validade === 'vencendo' && <span className="chip bg-amber-50 text-amber-800">Vence logo</span>}
      {s.nivel === 'ok' && !s.validade && <span className="chip bg-emerald-50 text-emerald-700">OK</span>}
    </span>
  )
}

export default function Estoque() {
  const { papel, session, toast, company } = useApp()
  const gerencia = papel === 'dono' || papel === 'recepcao'
  const confirmar = useConfirmar()
  const larga = useTelaLarga()
  const hoje = today()

  const [itens, setItens] = useState<ItemEstoque[]>([])
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [categoria, setCategoria] = useState('')
  const [limite, setLimite] = useState(100)
  useEffect(() => setLimite(100), [q, filtro, categoria])

  const [form, setForm] = useState<FormItem | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [mov, setMov] = useState<{ item: ItemEstoque; tipo: TipoMov; quantidade: string; validade: string; motivo: string } | null>(null)
  const [hist, setHist] = useState<{ item: ItemEstoque; lista: MovEstoque[] | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const todos: ItemEstoque[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('estoque_itens').select('*').order('nome').range(de, de + 999)
      if (error) {
        toast(error.message, 'err')
        break
      }
      todos.push(...((data ?? []) as ItemEstoque[]).map(normalizarItem))
      if (!data || data.length < 1000) break
    }
    setItens(todos)
    setLoading(false)
  }, [toast])

  useEffect(() => {
    load()
    // Nomes de quem registrou cada movimento (equipe); o dono não está em "membros"
    supabase
      .from('membros')
      .select('user_id, nome, email')
      .then(({ data }) => setNomes(new Map((data ?? []).map((m: { user_id: string; nome: string | null; email: string | null }) => [m.user_id, m.nome || m.email || 'Equipe']))))
  }, [load])

  // Tempo real: alguém da equipe registrou uma saída em outro computador
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('estoque-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque_itens', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, load])

  const ativos = useMemo(() => itens.filter((i) => i.ativo), [itens])
  const resumo = useMemo(() => {
    const s = ativos.map((i) => situacao(i, hoje))
    return {
      total: ativos.length,
      acabando: s.filter((x) => x.nivel !== 'ok').length,
      vencendo: s.filter((x) => x.validade === 'vencendo').length,
      vencidos: s.filter((x) => x.validade === 'vencido').length,
    }
  }, [ativos, hoje])
  const categorias = useMemo(() => [...new Set(itens.map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [itens])

  const shown = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return itens
      .filter((i) => (filtro === 'arquivados' ? !i.ativo : i.ativo))
      .filter((i) => {
        if (filtro === 'todos' || filtro === 'arquivados') return true
        const s = situacao(i, hoje)
        return filtro === 'acabando' ? s.nivel !== 'ok' : filtro === 'vencendo' ? s.validade === 'vencendo' : s.validade === 'vencido'
      })
      .filter((i) => !categoria || i.categoria === categoria)
      .filter((i) => !termo || [i.nome, i.categoria, i.fornecedor].some((x) => x?.toLowerCase().includes(termo)))
      .sort((a, b) => peso(a, hoje) - peso(b, hoje) || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [itens, filtro, categoria, q, hoje])

  // ---------- cadastro ----------
  function novo() {
    setEditId(null)
    setForm({ ...itemVazio })
  }
  function editar(i: ItemEstoque) {
    setEditId(i.id)
    setForm({
      nome: i.nome,
      categoria: i.categoria ?? '',
      unidade: i.unidade,
      quantidade: '',
      minimo: i.minimo ? fmtQtd(i.minimo) : '',
      validade: i.validade ?? '',
      custo: i.custo_unitario === null ? '' : String(i.custo_unitario).replace('.', ','),
      fornecedor: i.fornecedor ?? '',
      observacoes: i.observacoes ?? '',
    })
  }

  async function salvarItem(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    const nome = form.nome.trim()
    if (!nome) return toast('Informe o nome do item.', 'err')
    const minimo = form.minimo.trim() ? lerNumero(form.minimo) : 0
    if (!Number.isFinite(minimo) || minimo < 0) return toast('Quantidade mínima inválida. Use, por exemplo, 5 ou 2,5.', 'err')
    const inicial = !editId && form.quantidade.trim() ? lerNumero(form.quantidade) : 0
    if (!Number.isFinite(inicial) || inicial < 0) return toast('Quantidade inválida. Use, por exemplo, 10 ou 2,5.', 'err')
    const custo = form.custo.trim() ? lerNumero(form.custo.replace(/[R$]/g, '')) : null
    if (custo !== null && (!Number.isFinite(custo) || custo < 0)) return toast('Custo inválido. Use, por exemplo, 35,90.', 'err')
    const row = {
      nome,
      categoria: form.categoria.trim() || null,
      unidade: form.unidade.trim() || 'un',
      minimo,
      validade: form.validade || null,
      custo_unitario: custo,
      fornecedor: form.fornecedor.trim() || null,
      observacoes: form.observacoes.trim() || null,
    }
    setBusy(true)
    try {
      if (editId) {
        const { error } = await supabase.from('estoque_itens').update({ ...row, atualizado_em: new Date().toISOString() }).eq('id', editId)
        if (error) throw error
        toast('Item atualizado')
      } else {
        const { data, error } = await supabase.from('estoque_itens').insert({ ...row, company_id: company.id }).select('id').single()
        if (error) throw error
        if (inicial > 0) {
          const { error: e2 } = await supabase.rpc('estoque_movimentar', { p_item: data.id, p_tipo: 'entrada', p_quantidade: inicial, p_motivo: 'Estoque inicial', p_validade: form.validade || null })
          if (e2) throw e2
        }
        toast('Item cadastrado')
      }
      setForm(null)
      load()
    } catch (err) {
      const m = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      toast(/estoque_itens_nome_unico|duplicate key/.test(m) ? `Já existe um item chamado "${nome}". Use as entradas e saídas dele.` : m, 'err')
    } finally {
      setBusy(false)
    }
  }

  async function arquivar(i: ItemEstoque) {
    if (i.ativo) {
      const ok = await confirmar({
        titulo: `Arquivar "${i.nome}"?`,
        texto: 'O item sai da lista e não recebe mais entradas e saídas. O histórico fica guardado e você pode reativar depois em "Arquivados".',
        botao: 'Arquivar item',
      })
      if (!ok) return
    }
    const { error } = await supabase.from('estoque_itens').update({ ativo: !i.ativo, atualizado_em: new Date().toISOString() }).eq('id', i.id)
    if (error) return toast(/estoque_itens_nome_unico|duplicate key/.test(error.message) ? `Já existe outro item ativo chamado "${i.nome}".` : error.message, 'err')
    toast(i.ativo ? 'Item arquivado' : 'Item reativado')
    load()
  }

  // ---------- entradas e saídas ----------
  async function movimentar(e: FormEvent) {
    e.preventDefault()
    if (!mov) return
    const n = lerNumero(mov.quantidade)
    if (!Number.isFinite(n) || n < 0 || (mov.tipo !== 'ajuste' && n === 0)) return toast('Informe uma quantidade válida, por exemplo 2 ou 2,5.', 'err')
    setBusy(true)
    const { error } = await supabase.rpc('estoque_movimentar', {
      p_item: mov.item.id,
      p_tipo: mov.tipo,
      p_quantidade: n,
      p_motivo: mov.motivo.trim() || null,
      p_validade: mov.tipo === 'entrada' && mov.validade ? mov.validade : null,
    })
    setBusy(false)
    if (error) return toast(error.message, 'err')
    toast(mov.tipo === 'entrada' ? 'Entrada registrada' : mov.tipo === 'saida' ? 'Saída registrada' : 'Conferência registrada')
    setMov(null)
    load()
  }

  async function abrirHistorico(item: ItemEstoque) {
    setHist({ item, lista: null })
    const { data, error } = await supabase.from('estoque_movimentos').select('*').eq('item_id', item.id).order('criado_em', { ascending: false }).limit(200)
    if (error) return toast(error.message, 'err')
    setHist({ item, lista: ((data ?? []) as MovEstoque[]).map((x) => ({ ...x, quantidade: Number(x.quantidade), saldo: Number(x.saldo) })) })
  }
  const quem = (id: string | null) => (!id ? '—' : id === session?.user.id ? 'Você' : (nomes.get(id) ?? 'Dono(a)'))

  const previa = (() => {
    if (!mov) return null
    const n = lerNumero(mov.quantidade)
    if (!Number.isFinite(n) || n < 0) return null
    const fica = mov.tipo === 'entrada' ? mov.item.quantidade + n : mov.tipo === 'saida' ? mov.item.quantidade - n : n
    return fica
  })()

  const acoes = (i: ItemEstoque, compacto = false) =>
    i.ativo ? (
      <>
        <button className={`btn-ghost h-9 text-xs ${compacto ? 'min-w-0 flex-1 px-2' : 'px-3'}`} onClick={() => setMov({ item: i, tipo: 'entrada', quantidade: '', validade: '', motivo: '' })} aria-label={`Entrada de ${i.nome}`}>
          <Plus size={14} className="text-emerald-600" /> Entrada
        </button>
        <button className={`btn-ghost h-9 text-xs ${compacto ? 'min-w-0 flex-1 px-2' : 'px-3'}`} onClick={() => setMov({ item: i, tipo: 'saida', quantidade: '', validade: '', motivo: '' })} aria-label={`Saída de ${i.nome}`} disabled={i.quantidade <= 0}>
          <Minus size={14} className="text-rose-600" /> Saída
        </button>
        <button className="icon-btn h-9 w-9 shrink-0" onClick={() => abrirHistorico(i)} title="Histórico" aria-label={`Histórico de ${i.nome}`}>
          <History size={14} />
        </button>
        {gerencia && (
          <>
            <button className="icon-btn h-9 w-9 shrink-0" onClick={() => editar(i)} title="Editar" aria-label={`Editar ${i.nome}`}>
              <Pencil size={14} />
            </button>
            <button className="icon-btn h-9 w-9 shrink-0 hover:text-rose-600" onClick={() => arquivar(i)} title="Arquivar" aria-label={`Arquivar ${i.nome}`}>
              <Archive size={14} />
            </button>
          </>
        )}
      </>
    ) : (
      <>
        <button className="icon-btn h-9 w-9 shrink-0" onClick={() => abrirHistorico(i)} title="Histórico" aria-label={`Histórico de ${i.nome}`}>
          <History size={14} />
        </button>
        {gerencia && (
          <button className="btn-ghost h-9 px-3 text-xs" onClick={() => arquivar(i)} aria-label={`Reativar ${i.nome}`}>
            <ArchiveRestore size={14} /> Reativar
          </button>
        )}
      </>
    )

  const filtros: { id: Filtro; label: string; n?: number }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'acabando', label: 'Acabando', n: resumo.acabando },
    { id: 'vencendo', label: 'Vencendo', n: resumo.vencendo },
    { id: 'vencidos', label: 'Vencidos', n: resumo.vencidos },
    { id: 'arquivados', label: 'Arquivados' },
  ]

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Materiais e medicamentos da clínica: quanto tem, o que está acabando e o que vai vencer."
        actions={
          gerencia ? (
            <button className="btn-primary" onClick={novo}>
              <Plus size={16} /> Novo item
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatusCard i={1} tone="blue" label="Itens no estoque" value={<Count value={resumo.total} delay={200} />} sub="itens ativos" />
        <StatusCard i={2} tone={resumo.acabando ? 'amber' : 'slate'} label="Acabando" value={<Count value={resumo.acabando} delay={300} />} sub={resumo.acabando ? 'no mínimo ou zerados' : 'nada acabando'} />
        <StatusCard i={3} tone={resumo.vencendo ? 'amber' : 'slate'} label="Vencendo" value={<Count value={resumo.vencendo} delay={400} />} sub={`nos próximos ${DIAS_AVISO_VALIDADE} dias`} />
        <StatusCard i={4} tone={resumo.vencidos ? 'rose' : 'slate'} label="Vencidos" value={<Count value={resumo.vencidos} delay={500} />} sub={resumo.vencidos ? 'retire do uso' : 'nada vencido'} />
      </div>

      <Reveal i={5} className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input className="glass h-11 w-full rounded-full pl-11 pr-4 text-sm outline-none ring-brand/20 placeholder:text-muted focus:ring-4" placeholder="Buscar item, categoria ou fornecedor…" aria-label="Buscar no estoque" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtros.map((f) => (
            <button key={f.id} onClick={() => setFiltro(f.id)} className={`h-9 rounded-full px-4 text-xs font-semibold ${filtro === f.id ? 'bg-ink text-white' : 'glass text-ink'}`}>
              {f.label}
              {!!f.n && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${filtro === f.id ? 'bg-white/20' : 'bg-amber-100 text-amber-800'}`}>{f.n}</span>}
            </button>
          ))}
          {categorias.length > 0 && (
            <select className="glass h-9 rounded-full px-3 text-xs font-semibold outline-none" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </Reveal>

      <Reveal i={6} className="card mt-4 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <Empty
            icon={<Package size={26} />}
            title={itens.length === 0 ? 'Nenhum item no estoque ainda' : 'Nada por aqui'}
            text={
              itens.length === 0
                ? gerencia
                  ? 'Cadastre o que a clínica usa (luvas, seringas, medicamentos, produtos de limpeza…) com a quantidade mínima. Quando chegar ao mínimo, o item aparece como "Acabando".'
                  : 'O dono ou a recepção cadastram os itens. Depois, você registra aqui o que usar.'
                : 'Nenhum item com esse filtro.'
            }
            action={itens.length === 0 && gerencia ? <button className="btn-primary" onClick={novo}><Plus size={16} /> Cadastrar o primeiro item</button> : undefined}
          />
        ) : (
          <>
            {larga ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-panel-2 text-left text-xs font-semibold text-muted">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-3 py-3 text-right">Quantidade</th>
                    <th className="px-3 py-3">Validade</th>
                    <th className="px-3 py-3">Situação</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.slice(0, limite).map((i) => (
                    <tr key={i.id} className={i.ativo ? '' : 'opacity-60'}>
                      <td className="px-5 py-3">
                        <div className="font-semibold">{i.nome}</div>
                        <div className="text-xs text-muted">{[i.categoria, i.fornecedor].filter(Boolean).join(' · ') || '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="font-bold">
                          {fmtQtd(i.quantidade)} <span className="text-xs font-medium text-muted">{i.unidade}</span>
                        </div>
                        {i.minimo > 0 && <div className="text-xs text-muted">mínimo {fmtQtd(i.minimo)}</div>}
                      </td>
                      <td className="px-3 py-3 text-muted">{i.validade ? fmtDate(i.validade) : '—'}</td>
                      <td className="px-3 py-3">{i.ativo ? <Selos item={i} hoje={hoje} /> : <span className="chip bg-slate-100 text-slate-600">Arquivado</span>}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">{acoes(i)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <ul className="divide-y divide-line">
                {shown.slice(0, limite).map((i) => (
                  <li key={i.id} className={`p-4 ${i.ativo ? '' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{i.nome}</div>
                        <div className="truncate text-xs text-muted">{[i.categoria, i.fornecedor].filter(Boolean).join(' · ') || '—'}</div>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <div className="text-lg font-bold leading-tight">
                          {fmtQtd(i.quantidade)} <span className="text-xs font-medium text-muted">{i.unidade}</span>
                        </div>
                        {i.minimo > 0 && <div className="text-xs text-muted">mínimo {fmtQtd(i.minimo)}</div>}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {i.ativo ? <Selos item={i} hoje={hoje} /> : <span className="chip bg-slate-100 text-slate-600">Arquivado</span>}
                      {i.validade && <span>Validade {fmtDate(i.validade)}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-1">{acoes(i, true)}</div>
                  </li>
                ))}
              </ul>
            )}
            {shown.length > limite && (
              <div className="border-t border-line p-3 text-center">
                <button className="btn-ghost h-10 px-5 text-sm" onClick={() => setLimite((l) => l + 100)}>
                  Mostrar mais ({shown.length - limite} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </Reveal>

      {/* Cadastro / edição */}
      <Modal open={!!form} onClose={() => setForm(null)} title={editId ? 'Editar item' : 'Novo item no estoque'} wide>
        {form && (
          <form onSubmit={salvarItem} className="space-y-3">
            <Field label="Nome do item">
              <input className="input" maxLength={120} required autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Luva de procedimento M" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria">
                <input className="input" maxLength={60} list="estoque-categorias" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Descartáveis" />
              </Field>
              <Field label="Unidade">
                <input className="input" maxLength={20} required list="estoque-unidades" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="Ex.: caixa" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {!editId && (
                <Field label="Quantidade que tem agora">
                  <input className="input" inputMode="decimal" maxLength={15} value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} placeholder="Ex.: 10" />
                </Field>
              )}
              <Field label="Avisar quando chegar a (mínimo)">
                <input className="input" inputMode="decimal" maxLength={15} value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} placeholder="Ex.: 3" />
              </Field>
              <Field label="Validade (a mais próxima)">
                <input className="input" type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
              </Field>
              <Field label="Custo por unidade (opcional)">
                <input className="input" inputMode="decimal" maxLength={20} value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} placeholder="Ex.: 35,90" />
              </Field>
            </div>
            <Field label="Fornecedor (opcional)">
              <input className="input" maxLength={120} value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            </Field>
            <Field label="Observações (opcional)">
              <textarea className="input min-h-[70px]" maxLength={1000} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Ex.: guardar na geladeira" />
            </Field>
            {editId && <p className="text-xs text-muted">Para mudar a quantidade, use Entrada, Saída ou Conferência: assim fica tudo no histórico.</p>}
            <datalist id="estoque-categorias">
              {[...new Set([...CATEGORIAS, ...categorias])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <datalist id="estoque-unidades">
              {UNIDADES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} {editId ? 'Salvar alterações' : 'Cadastrar item'}
            </button>
          </form>
        )}
      </Modal>

      {/* Entrada / saída / conferência */}
      <Modal open={!!mov} onClose={() => setMov(null)} title={mov ? `${TIPO_MOV[mov.tipo]} · ${mov.item.nome}` : ''}>
        {mov && (
          <form onSubmit={movimentar} className="space-y-3">
            <div className={`grid gap-1 rounded-full bg-panel-2 p-1 text-sm ${gerencia ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {(gerencia ? (['entrada', 'saida', 'ajuste'] as const) : (['entrada', 'saida'] as const)).map((t) => (
                <button key={t} type="button" onClick={() => setMov({ ...mov, tipo: t })} className={`h-9 rounded-full font-semibold ${mov.tipo === t ? 'bg-ink text-white' : 'text-muted'}`}>
                  {TIPO_MOV[t]}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">
              Tem agora: <b className="text-ink">{fmtQtd(mov.item.quantidade)} {mov.item.unidade}</b>
              {mov.tipo === 'ajuste' && ' · informe quanto você contou de verdade'}
            </p>
            <Field label={mov.tipo === 'entrada' ? 'Quanto chegou' : mov.tipo === 'saida' ? 'Quanto saiu' : 'Total contado'}>
              <input className="input" inputMode="decimal" maxLength={15} required autoFocus value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} placeholder={`Ex.: 2 (${mov.item.unidade})`} />
            </Field>
            {mov.tipo === 'entrada' && (
              <Field label="Validade do que chegou (opcional)">
                <input className="input" type="date" value={mov.validade} onChange={(e) => setMov({ ...mov, validade: e.target.value })} />
              </Field>
            )}
            <Field label="Motivo (opcional)">
              <input
                className="input"
                maxLength={300}
                value={mov.motivo}
                onChange={(e) => setMov({ ...mov, motivo: e.target.value })}
                placeholder={mov.tipo === 'entrada' ? 'Ex.: compra na distribuidora' : mov.tipo === 'saida' ? 'Ex.: uso nos atendimentos do dia' : 'Ex.: contagem do mês'}
              />
            </Field>
            {previa !== null && (
              <p className={`rounded-xl px-3 py-2 text-sm ${previa < 0 ? 'bg-rose-50 text-rose-700' : 'bg-panel-2 text-muted'}`}>
                {previa < 0 ? `Não dá: só há ${fmtQtd(mov.item.quantidade)} ${mov.item.unidade}.` : <>Vai ficar com <b className="text-ink">{fmtQtd(previa)} {mov.item.unidade}</b>{mov.item.minimo > 0 && previa <= mov.item.minimo ? ' (no mínimo ou abaixo: hora de comprar)' : ''}</>}
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || (previa !== null && previa < 0)}>
              {busy && <Spinner />} Registrar {TIPO_MOV[mov.tipo].toLowerCase()}
            </button>
          </form>
        )}
      </Modal>

      {/* Histórico */}
      <Modal open={!!hist} onClose={() => setHist(null)} title={hist ? `Histórico · ${hist.item.nome}` : ''} wide>
        {hist &&
          (hist.lista === null ? (
            <div className="py-6 text-center">
              <Spinner />
            </div>
          ) : hist.lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhuma entrada ou saída registrada ainda.</p>
          ) : (
            <>
              {hist.item.custo_unitario !== null && (
                <p className="mb-3 text-xs text-muted">
                  Custo por unidade: {brl(hist.item.custo_unitario)} · valor em estoque: <b className="text-ink">{brl(hist.item.custo_unitario * hist.item.quantidade)}</b>
                </p>
              )}
              <ul className="divide-y divide-line">
                {hist.lista.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 py-3 text-sm">
                    <span className={`mt-0.5 w-24 shrink-0 font-semibold ${m.tipo === 'entrada' ? 'text-emerald-700' : m.tipo === 'saida' ? 'text-rose-700' : 'text-ink'}`}>
                      {m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '−' : '='} {fmtQtd(m.quantidade)} {hist.item.unidade}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {TIPO_MOV[m.tipo]}
                        {m.motivo ? ` · ${m.motivo}` : ''}
                        {m.validade ? ` · validade ${fmtDate(m.validade)}` : ''}
                      </span>
                      <span className="block text-xs text-muted">
                        {fmtDate(m.criado_em)} às {fmtTime(m.criado_em)} · {quem(m.criado_por)} · ficou {fmtQtd(m.saldo)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ))}
      </Modal>
    </div>
  )
}

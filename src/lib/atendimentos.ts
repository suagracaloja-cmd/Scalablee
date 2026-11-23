import { supabase } from './supabase'
import type { Sale } from './types'

/**
 * Somas dos atendimentos para o Início, Pacientes e Financeiro.
 * Se o banco já tem as funções de soma (migração 0018), a conta é feita lá e o navegador recebe só os totais.
 * Se não tem, a conta é feita aqui, como sempre foi: baixa os atendimentos (1000 por vez) e soma. Os números são os mesmos.
 */

let semFuncoesNoBanco = false
const funcaoNaoExiste = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST202' || /could not find the function|schema cache/i.test(e.message ?? ''))

/** Todas as linhas de uma consulta, em páginas de 1000 (o limite do banco por resposta). */
async function todas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999)
    if (error) throw new Error(error.message)
    linhas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return linhas
}

// ---------- Início ----------
export type Painel = {
  dias: { dia: string; status: Sale['status']; total: number; qtd: number }[]
  produtos: { descricao: string; total: number }[]
  recentes: (Sale & { paciente: string | null })[]
}

export async function painelAtendimentos(desde: string, produtosDesde: string): Promise<Painel> {
  if (!semFuncoesNoBanco) {
    const { data, error } = await supabase.rpc('painel_atendimentos', { p_desde: desde, p_produtos_desde: produtosDesde })
    if (!error && data) return normalizarPainel(data as Painel)
    if (funcaoNaoExiste(error)) semFuncoesNoBanco = true
  }
  const vendas = await todas<Sale>((de, ate) => supabase.from('sales').select('id,customer_id,description,amount,status,sold_at,created_at').gte('sold_at', desde).order('sold_at').order('id').range(de, ate) as never)
  const porDia = new Map<string, { dia: string; status: Sale['status']; total: number; qtd: number }>()
  const porProduto = new Map<string, number>()
  for (const v of vendas) {
    const k = `${v.sold_at}|${v.status}`
    const d = porDia.get(k) ?? { dia: v.sold_at, status: v.status, total: 0, qtd: 0 }
    d.total += Number(v.amount)
    d.qtd += 1
    porDia.set(k, d)
    if (v.sold_at >= produtosDesde && v.status !== 'cancelled') porProduto.set(v.description, (porProduto.get(v.description) ?? 0) + Number(v.amount))
  }
  const recentes = vendas
    .filter((v) => v.status !== 'cancelled')
    .sort((a, b) => (a.sold_at === b.sold_at ? (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1) : a.sold_at < b.sold_at ? 1 : -1))
    .slice(0, 6)
  const ids = [...new Set(recentes.map((v) => v.customer_id).filter(Boolean) as string[])]
  const nomes = new Map<string, string>()
  if (ids.length) {
    const { data } = await supabase.from('customers').select('id,name').in('id', ids)
    for (const c of data ?? []) nomes.set(c.id as string, c.name as string)
  }
  return {
    dias: [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0)),
    produtos: [...porProduto].map(([descricao, total]) => ({ descricao, total })).sort((a, b) => b.total - a.total),
    recentes: recentes.map((v) => ({ ...v, amount: Number(v.amount), paciente: v.customer_id ? (nomes.get(v.customer_id) ?? null) : null })),
  }
}

function normalizarPainel(p: Painel): Painel {
  return {
    dias: (p.dias ?? []).map((x) => ({ ...x, total: Number(x.total), qtd: Number(x.qtd) })),
    produtos: (p.produtos ?? []).map((x) => ({ ...x, total: Number(x.total) })),
    recentes: (p.recentes ?? []).map((x) => ({ ...x, amount: Number(x.amount) })),
  }
}

// ---------- Pacientes ----------
export type TotalPaciente = { customer_id: string; total: number; ultimo: string }

/** Total pago e último atendimento de cada paciente. */
export async function totaisPorPaciente(): Promise<TotalPaciente[]> {
  if (!semFuncoesNoBanco) {
    const { data, error } = await supabase.rpc('atendimentos_por_paciente')
    if (!error && data) return (data as { customer_id: string; total: number | string; ultimo: string }[]).map((x) => ({ customer_id: x.customer_id, total: Number(x.total), ultimo: x.ultimo }))
    if (funcaoNaoExiste(error)) semFuncoesNoBanco = true
  }
  let linhas: { customer_id: string | null; amount: number; sold_at: string }[] = []
  try {
    linhas = await todas((de, ate) => supabase.from('sales').select('customer_id,amount,sold_at').eq('status', 'paid').not('customer_id', 'is', null).order('id').range(de, ate) as never)
  } catch {
    /* sem a lista, a tela mostra os pacientes sem o total pago */
  }
  const m = new Map<string, TotalPaciente>()
  for (const x of linhas) {
    if (!x.customer_id) continue
    const cur = m.get(x.customer_id) ?? { customer_id: x.customer_id, total: 0, ultimo: '' }
    cur.total += Number(x.amount)
    if (x.sold_at > cur.ultimo) cur.ultimo = x.sold_at
    m.set(x.customer_id, cur)
  }
  return [...m.values()]
}

// ---------- Financeiro ----------
/** Soma dos atendimentos de uma situação (a partir de uma data, se informada) e quantos são. */
export async function somarAtendimentos(status: 'paid' | 'pending', desde?: string) {
  if (!semFuncoesNoBanco) {
    const { data, error } = await supabase.rpc('atendimentos_soma', { p_status: status, p_desde: desde ?? null })
    if (!error) {
      const r = ((data ?? []) as { total: number | string; quantidade: number | string }[])[0]
      return { total: Number(r?.total ?? 0), n: Number(r?.quantidade ?? 0) }
    }
    if (funcaoNaoExiste(error)) semFuncoesNoBanco = true
  }
  let total = 0
  let n = 0
  const linhas = await todas<{ amount: number }>((de, ate) => {
    let q = supabase.from('sales').select('amount').eq('status', status).order('id').range(de, ate)
    if (desde) q = q.gte('sold_at', desde)
    return q as never
  })
  for (const x of linhas) total += Number(x.amount)
  n = linhas.length
  return { total, n }
}

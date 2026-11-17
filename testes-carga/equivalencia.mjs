// O Início calcula os MESMOS números com os totais do banco (novo) e com todos os atendimentos (antigo)?
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pg = require('pg')
const c = new pg.Client({ host: '127.0.0.1', user: 'postgres', password: process.env.PGPASSWORD ?? '', database: process.env.DB ?? 'carga' }); await c.connect()
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => toISO(new Date())
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toISO(d) }
const comoUsuario = async (uid, sql, params = []) => { await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub', '${uid}', true)`); const r = await c.query(sql, params); await c.query('commit'); return r.rows }
const pct = (a, b) => (b ? ((a - b) / b) * 100 : null)
function antigo(sales, range) {
  const t = today(), monthStart = t.slice(0, 8) + '01', d = new Date()
  const prevStart = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)), prevSame = toISO(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()))
  const valid = sales.filter((s) => s.status !== 'cancelled'), sum = (a) => a.reduce((x, y) => x + y.amount, 0)
  const month = valid.filter((s) => s.sold_at >= monthStart), prev = valid.filter((s) => s.sold_at >= prevStart && s.sold_at <= prevSame)
  const revenue = sum(month), ticket = month.length ? revenue / month.length : 0, prevTicket = prev.length ? sum(prev) / prev.length : 0
  const series = []; for (let i = range - 1; i >= 0; i--) { const day = addDays(t, -i); series.push(sum(valid.filter((s) => s.sold_at === day))) }
  const products = new Map(); for (const s of valid.filter((s) => s.sold_at >= addDays(t, -30))) products.set(s.description, (products.get(s.description) ?? 0) + s.amount)
  const months = []; for (let k = 3; k >= 0; k--) { const f = toISO(new Date(d.getFullYear(), d.getMonth() - k, 1)), l = toISO(new Date(d.getFullYear(), d.getMonth() - k + 1, 0)); months.push(sum(valid.filter((s) => s.sold_at >= f && s.sold_at <= l && s.status === 'paid'))) }
  return { revenue, delta: pct(revenue, sum(prev)), count: month.length, ticket, ticketDelta: pct(ticket, prevTicket), series, top: [...products].sort((a, b) => b[1] - a[1]), months, recent: [...valid].sort((a, b) => (b.sold_at + b.created_at).localeCompare(a.sold_at + a.created_at) || b.id.localeCompare(a.id)).slice(0, 6).map((s) => s.id) }
}
function novo(p, range) {
  const t = today(), monthStart = t.slice(0, 8) + '01', d = new Date()
  const prevStart = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)), prevSame = toISO(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()))
  const valid = p.dias.filter((s) => s.status !== 'cancelled'), sum = (a) => a.reduce((x, y) => x + y.total, 0), qtd = (a) => a.reduce((x, y) => x + y.qtd, 0)
  const month = valid.filter((s) => s.dia >= monthStart), prev = valid.filter((s) => s.dia >= prevStart && s.dia <= prevSame)
  const revenue = sum(month), ticket = qtd(month) ? revenue / qtd(month) : 0, prevTicket = qtd(prev) ? sum(prev) / qtd(prev) : 0
  const series = []; for (let i = range - 1; i >= 0; i--) { const day = addDays(t, -i); series.push(sum(valid.filter((s) => s.dia === day))) }
  const months = []; for (let k = 3; k >= 0; k--) { const f = toISO(new Date(d.getFullYear(), d.getMonth() - k, 1)), l = toISO(new Date(d.getFullYear(), d.getMonth() - k + 1, 0)); months.push(sum(valid.filter((s) => s.dia >= f && s.dia <= l && s.status === 'paid'))) }
  return { revenue, delta: pct(revenue, sum(prev)), count: qtd(month), ticket, ticketDelta: pct(ticket, prevTicket), series, top: p.produtos.map((x) => [x.descricao, x.total]).sort((a, b) => b[1] - a[1]), months, recent: p.recentes.map((s) => s.id) }
}
const perto = (a, b) => JSON.stringify(a, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)) === JSON.stringify(b, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))
let falhas = 0
const usuarios = (process.env.USUARIOS ?? '1,7,42,99,150,200').split(',').map((n) => `10000000-0000-4000-8000-${n.padStart(12, '0')}`)
for (const uid of usuarios) {
  const since = addDays(today(), -150)
  const vendas = (await comoUsuario(uid, `select id, customer_id, description, amount::float8 as amount, status, sold_at::text, created_at::text from public.sales where sold_at >= $1`, [since]))
  const [{ r }] = await comoUsuario(uid, `select public.painel_atendimentos($1, $2) as r`, [since, addDays(today(), -30)])
  const p = { dias: r.dias.map((x) => ({ ...x, total: Number(x.total), qtd: Number(x.qtd) })), produtos: r.produtos.map((x) => ({ ...x, total: Number(x.total) })), recentes: r.recentes }
  for (const range of [7, 30, 90]) {
    const a = antigo(vendas, range), b = novo(p, range)
    for (const k of Object.keys(a)) if (!perto(a[k], b[k])) { falhas++; console.log(`DIFERENTE ${uid.slice(-3)} faixa ${range} ${k}:`, JSON.stringify(a[k]).slice(0, 120), '≠', JSON.stringify(b[k]).slice(0, 120)) }
  }
  console.log(`clínica ${uid.slice(-3)}: ${vendas.length} atendimentos em 150 dias; resposta antiga ${(JSON.stringify(vendas).length / 1024).toFixed(0)} KB → nova ${(JSON.stringify(r).length / 1024).toFixed(0)} KB`)
}
console.log(falhas ? `\n${falhas} diferença(s)` : '\nnúmeros idênticos em todas as clínicas e faixas (7, 30 e 90 dias)')
await c.end(); process.exit(falhas ? 1 : 0)

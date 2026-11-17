// Teste de carga do banco como o Supabase o usa: pool fixo de conexões (como o PostgREST), cada pedido numa
// transação com o papel "authenticated" e a identidade do usuário (RLS de verdade). Usuários virtuais navegam
// com pausas realistas. Mede latência (P50/P95/P99) incluindo a espera na fila do pool, vazão, erros e CPU do banco.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const pg = require('pg')
const ACOES = (await import(process.env.ACOES ?? './acoes.mjs')).ACOES
const USUARIOS = Number(process.env.USUARIOS ?? 100)
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 60)
const POOL = Number(process.env.POOL ?? 10)
const PAUSA = Number(process.env.PAUSA ?? 20) // média de segundos entre uma tela e outra
const TIMEOUT = 10_000 // pedido que espera mais que isso na fila conta como erro (como um gateway faria)
const pool = new pg.Pool({ host: '127.0.0.1', user: 'postgres', password: process.env.PGPASSWORD ?? '', database: 'carga', max: POOL, connectionTimeoutMillis: TIMEOUT })
const uid = (n, papel) => `${papel === 'recepcao' ? '2' : '1'}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// mistura de telas e gravações
const MIX = [['inicio', 25], ['agenda', 20], ['pacientes', 12], ['atendimentos', 13], ['whatsapp', 10], ['financeiro', 5], ['estoque', 5], ['gravar', 10]]
const total = MIX.reduce((s, [, p]) => s + p, 0)
const sortear = () => { let r = Math.random() * total; for (const [n, p] of MIX) { if ((r -= p) < 0) return n } return 'inicio' }
const GRAVAR = [
  (n) => `insert into public.sales(company_id, customer_id, description, amount, status, sold_at) select public.my_company_id(), (select id from public.customers order by created_at desc limit 1), 'Consulta', 150, 'paid', current_date`,
  (n) => `select public.estoque_movimentar((select id from public.estoque_itens where ativo order by nome limit 1), 'entrada', 1, 'carga', null)::text as r`,
  (n) => `update public.tasks set done = not done where id = (select id from public.tasks order by due_date limit 1)`,
]

const lat = [], porTela = {}
let erros = 0, pedidos = 0, telas = 0, baixado = 0
async function pedido(sqls, n, papel) {
  const t0 = performance.now()
  let c
  try {
    c = await pool.connect()
    for (const sql of sqls) {
      await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub', '${uid(n, papel)}', true)`)
      const r = await c.query(sql); baixado += r.rows?.[0]?.r?.length ?? 0; await c.query('commit'); pedidos++
    }
  } catch (e) { erros++; if (c) await c.query('rollback').catch(() => {}) } finally { c?.release() }
  return performance.now() - t0
}
let ativo = true
async function usuario(i) {
  const n = 1 + (i % 200), papel = i % 3 === 0 ? 'recepcao' : 'dono'
  await new Promise((r) => setTimeout(r, Math.random() * PAUSA * 1000)) // chegada espalhada
  while (ativo) {
    const tela = sortear()
    const sqls = tela === 'gravar' ? [GRAVAR[Math.floor(Math.random() * 3)](n)] : [...ACOES[tela](), ...ACOES.contadores()]
    const ms = await pedido(sqls, n, papel)
    if (ativo) { lat.push(ms); (porTela[tela] ??= []).push(ms); telas++ }
    await new Promise((r) => setTimeout(r, -Math.log(1 - Math.random()) * PAUSA * 1000)) // pausa aleatória (média PAUSA s)
  }
}
const cpu = () => Number(execSync(`for p in $(pgrep -f postgres); do cat /proc/$p/stat 2>/dev/null | awk '{print $14+$15}'; done | paste -sd+ | bc`).toString())
const conexoes = async () => (await pg.Client.prototype.constructor && null)
const c0 = cpu(), t0 = Date.now(), n0 = process.cpuUsage()
const vus = Array.from({ length: USUARIOS }, (_, i) => usuario(i))
await new Promise((r) => setTimeout(r, SEGUNDOS * 1000))
ativo = false
const dur = (Date.now() - t0) / 1000, cpuSeg = (cpu() - c0) / 100, nodeCpu = process.cpuUsage(n0)
const p = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0 }
const f = (x) => `${Math.round(x)}`.padStart(6)
console.log(`${String(USUARIOS).padStart(5)} usuários | pool ${POOL} | telas/s ${(telas / dur).toFixed(1).padStart(5)} | consultas/s ${(pedidos / dur).toFixed(0).padStart(5)} | P50 ${f(p(lat, .5))} ms | P95 ${f(p(lat, .95))} ms | P99 ${f(p(lat, .99))} ms | erros ${(100 * erros / Math.max(1, telas + erros)).toFixed(1)}% | CPU do banco ${(100 * cpuSeg / dur).toFixed(0)}% de 1 núcleo | CPU do gerador ${(100 * (nodeCpu.user + nodeCpu.system) / 1e6 / dur).toFixed(0)}% | dados ${(baixado / 1048576 / dur).toFixed(1)} MB/s`)
if (process.env.DETALHE) for (const [t, a] of Object.entries(porTela)) console.log(`   ${t.padEnd(13)} P50 ${f(p(a, .5))}  P95 ${f(p(a, .95))}  n=${a.length}`)
await Promise.race([Promise.all(vus), new Promise((r) => setTimeout(r, 15000))])
await pool.end().catch(() => {})
process.exit(0)

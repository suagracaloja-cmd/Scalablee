// Custo de cada tela para UM usuário (banco limitado a 1 núcleo): tempo e tamanho da resposta.
import { createRequire } from 'node:module'
import { ACOES } from './acoes.mjs'
const require = createRequire(import.meta.url)
const pg = require('pg')
const pool = new pg.Pool({ host: '127.0.0.1', user: 'postgres', password: process.env.PGPASSWORD ?? '', database: process.env.DB ?? 'carga', max: 1 })
const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
async function rodar(sqls, n) {
  const c = await pool.connect()
  let bytes = 0
  const t0 = performance.now()
  try {
    for (const sql of sqls) {
      await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub', '${uid(n)}', true)`)
      const r = await c.query(sql); bytes += r.rows[0].r.length
      await c.query('commit')
    }
  } finally { c.release() }
  return { ms: performance.now() - t0, kb: bytes / 1024 }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
console.log('tela'.padEnd(14), 'consultas', 'tempo mediano', ' resposta')
for (const [nome, f] of Object.entries(ACOES)) {
  const res = []
  for (let i = 0; i < 12; i++) res.push(await rodar(f(), 1 + ((i * 37) % 200)))
  console.log(nome.padEnd(14), String(f().length).padStart(9), `${med(res.map((r) => r.ms)).toFixed(0).padStart(10)} ms`, `${med(res.map((r) => r.kb)).toFixed(0).padStart(7)} KB`)
}
await pool.end()

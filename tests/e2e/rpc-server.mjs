// Servidor local que imita o endpoint RPC do PostgREST/Supabase para o diagnóstico,
// executando a migração REAL (supabase/migrations/0004_diagnostic.sql) em um Postgres (PGlite).
// Cada chamada roda com o papel `anon`, como no Supabase: a segurança testada é a do banco, não a de um mock.
//
// Rotas de apoio ao teste (não existem no Supabase):
//   POST /__fail      {"on": true}   faz diag_save_answer responder 503 (simula falta de conexão)
//   GET  /__sessions                 linhas de diagnostic_sessions (como superusuário)
//   GET  /__answers?email=...        respostas gravadas de uma sessão
//   GET  /__events                   eventos gravados
//   GET  /__metrics                  diagnostic_metrics() como service_role
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATION = resolve(here, '../../supabase/migrations/0004_diagnostic.sql')

const ARGS = {
  diag_start: [['p_profile', 'jsonb'], ['p_consent', 'boolean'], ['p_marketing', 'boolean'], ['p_consent_version', 'text']],
  diag_save_answer: [['p_token', 'text'], ['p_question', 'text'], ['p_value', 'integer']],
  diag_get: [['p_token', 'text']],
  diag_complete: [['p_token', 'text'], ['p_answers', 'jsonb'], ['p_report', 'jsonb'], ['p_engine_version', 'text']],
  diag_track: [['p_token', 'text'], ['p_event', 'text'], ['p_props', 'jsonb']],
  diag_delete: [['p_token', 'text']],
}

export async function startRpcServer(port) {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `)
  await db.exec(readFileSync(MIGRATION, 'utf8'))

  let failSaves = false
  let queue = Promise.resolve()
  const serial = (fn) => {
    const run = queue.then(fn, fn)
    queue = run.catch(() => {})
    return run
  }

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  }
  const send = (res, status, body) => {
    res.writeHead(status, { ...cors, 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const readBody = (req) =>
    new Promise((ok) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => ok(b ? JSON.parse(b) : {}))
    })

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {})
    const url = new URL(req.url, 'http://x')

    if (url.pathname === '/__fail') {
      failSaves = !!(await readBody(req)).on
      return send(res, 200, { failSaves })
    }
    if (url.pathname === '/__sessions') return send(res, 200, (await serial(() => db.query('select id, status, contact_name, clinic_name, specialty, team_size, email, marketing_consent, consent_version, last_question from public.diagnostic_sessions order by created_at'))).rows)
    if (url.pathname === '/__answers') {
      const r = await serial(() => db.query(`select a.question_key, a.value, a.is_unknown from public.diagnostic_answers a join public.diagnostic_sessions s on s.id = a.session_id where s.email = $1 order by a.question_key`, [url.searchParams.get('email')]))
      return send(res, 200, r.rows)
    }
    if (url.pathname === '/__results') return send(res, 200, (await serial(() => db.query('select s.email, r.overall_score, r.band, r.valid_count, r.unknown_count, r.known_pct, r.priorities from public.diagnostic_results r join public.diagnostic_sessions s on s.id = r.session_id order by r.generated_at'))).rows)
    if (url.pathname === '/__events') return send(res, 200, (await serial(() => db.query('select s.email, e.event, e.props from public.diagnostic_events e join public.diagnostic_sessions s on s.id = e.session_id order by e.id'))).rows)
    if (url.pathname === '/__metrics') {
      return send(res, 200, await serial(async () => {
        await db.exec('set role service_role')
        try { return (await db.query('select public.diagnostic_metrics() as m')).rows[0].m } finally { await db.exec('reset role') }
      }))
    }

    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (!m || !ARGS[m[1]]) return send(res, 404, { code: 'PGRST202', message: 'Could not find the function', details: null, hint: null })
    const fn = m[1]
    if (failSaves && fn === 'diag_save_answer') return send(res, 503, { message: 'Service Unavailable' })

    const body = await readBody(req)
    const defs = ARGS[fn]
    const params = defs.map(([k, t]) => (t === 'jsonb' ? JSON.stringify(body[k] ?? null) : (body[k] ?? null)))
    const sql = `select public.${fn}(${defs.map(([k, t], i) => `${k} => $${i + 1}::${t}`).join(', ')}) as r`
    try {
      const out = await serial(async () => {
        await db.exec('set role anon')
        try { return await db.query(sql, params) } finally { await db.exec('reset role') }
      })
      return send(res, 200, out.rows[0].r)
    } catch (e) {
      const msg = String(e.message || e)
      const code = /permission denied/.test(msg) ? '42501' : 'P0001'
      return send(res, code === '42501' ? 403 : 400, { code, message: msg, details: null, hint: null })
    }
  })
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok))
  return { server, db, close: async () => { server.close(); await db.close() } }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 54321)
  await startRpcServer(port)
  console.log(`RPC local do diagnóstico em http://127.0.0.1:${port}`)
}

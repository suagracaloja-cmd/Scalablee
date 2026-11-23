import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { QUESTIONS } from '../../src/diagnostic/data/questions'
import { buildReport } from '../../src/diagnostic/engine/report'
import { computeScores } from '../../src/diagnostic/engine/score'
import { DIMENSION_IDS, type Answers } from '../../src/diagnostic/engine/types'
import { all, PROFILE, randomAnswers } from '../unit/helpers'
import { asRole, createDb, MIGRATION, PROFILE_JSON, rpc, start } from './harness'

let db: PGlite
beforeAll(async () => {
  db = await createDb()
})
afterAll(async () => {
  await db.close()
})

const ENGINE = '1.0.0'
const complete = (token: string, a: Answers) => rpc(db, 'anon', 'diag_complete', token, a, buildReport(PROFILE, a, '2026-11-23T12:00:00.000Z'), ENGINE)
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

describe('acesso direto às tabelas', () => {
  const tables = ['diagnostic_sessions', 'diagnostic_answers', 'diagnostic_results', 'diagnostic_events']

  it('RLS está ligada nas quatro tabelas e não existe nenhuma política', async () => {
    const rls = await q<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname = any($1)`, [tables])
    expect(rls).toHaveLength(4)
    expect(rls.every((r) => r.relrowsecurity)).toBe(true)
    const pol = await q<{ n: number }>(`select count(*)::int as n from pg_policies where tablename = any($1)`, [tables])
    expect(pol[0].n).toBe(0)
  })

  it.each(['anon', 'authenticated'] as const)('%s não consegue ler, inserir, alterar nem apagar nada', async (role) => {
    await start(db) // garante que há dados
    for (const t of tables) {
      await expect(asRole(db, role, () => db.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/)
      await expect(asRole(db, role, () => db.query(`delete from public.${t}`))).rejects.toThrow(/permission denied/)
      await expect(asRole(db, role, () => db.query(`update public.${t} set created_at = now()`).catch((e) => Promise.reject(e)))).rejects.toThrow(
        /permission denied|column .* does not exist/,
      )
    }
    await expect(
      asRole(db, role, () => db.query(`insert into public.diagnostic_sessions (token_hash, contact_name, clinic_name, team_size, email, consent_version) values ('\\x00', 'a', 'b', 'solo', 'a@b.co', 'v1')`)),
    ).rejects.toThrow(/permission denied/)
  })

  it('anon não executa funções internas nem as de operação', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(rpc(db, role, 'diag_score', {})).rejects.toThrow(/permission denied/)
      await expect(rpc(db, role, 'diag_session_id', 'x'.repeat(64))).rejects.toThrow(/permission denied/)
      await expect(rpc(db, role, 'diagnostic_metrics')).rejects.toThrow(/permission denied/)
      await expect(rpc(db, role, 'diagnostic_purge', '400 days')).rejects.toThrow(/permission denied/)
    }
    const m = await rpc<{ started: number }>(db, 'service_role', 'diagnostic_metrics')
    expect(m.started).toBeGreaterThanOrEqual(0)
  })

  it('a migração é aditiva: só cria objetos do diagnóstico e não toca no produto existente', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--.*$/gm, '')
    expect(sql).not.toMatch(/\bdrop\s/i)
    const created = [...sql.matchAll(/create\s+(?:table|function|index)\s+(?:if not exists\s+)?(?:public\.)?(\w+)/gi)].map((m) => m[1])
    for (const name of created) expect(name, name).toMatch(/^(diagnostic|diag)_/)
    expect(sql).not.toMatch(/alter\s+table\s+public\.(companies|agents|customers|sales|transactions|tasks|insights|conversations|messages|approvals|assistant_messages|whatsapp_configs)\b/i)
    expect(sql).not.toMatch(/auth\.users|storage\.|supabase_realtime/i)
  })
})

describe('início da sessão', () => {
  it('exige consentimento', async () => {
    await expect(rpc(db, 'anon', 'diag_start', PROFILE_JSON, false, false, 'v1')).rejects.toThrow(/consent_required/)
    await expect(rpc(db, 'anon', 'diag_start', PROFILE_JSON, null, false, 'v1')).rejects.toThrow(/consent_required/)
  })

  it.each([
    ['nome vazio', { name: '  ' }],
    ['clínica vazia', { clinic: '' }],
    ['e-mail inválido', { email: 'sem-arroba' }],
    ['e-mail sem domínio', { email: 'a@b' }],
    ['equipe inválida', { team: '9999' }],
    ['nome longo demais', { name: 'x'.repeat(121) }],
  ])('rejeita perfil inválido: %s', async (_, over) => {
    await expect(rpc(db, 'anon', 'diag_start', { ...PROFILE_JSON, ...over }, true, false, 'v1')).rejects.toThrow(/invalid_profile/)
  })

  it('devolve um token forte e guarda só o hash dele', async () => {
    const token = await start(db, { email: 'hash@exemplo.com.br' })
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const row = (await q<{ h: string }>(`select encode(token_hash, 'hex') as h from public.diagnostic_sessions where email = 'hash@exemplo.com.br'`))[0]
    expect(row.h).toBe(createHash('sha256').update(token).digest('hex'))
    // o token não aparece em nenhuma coluna de texto de nenhuma tabela
    const dump = await q<{ t: string }>(`select row_to_json(s)::text as t from public.diagnostic_sessions s union all select row_to_json(e)::text from public.diagnostic_events e`)
    expect(dump.some((d) => d.t.includes(token))).toBe(false)
  })

  it('gera tokens distintos e registra o evento de início, o consentimento e a preferência de contato', async () => {
    const a = await start(db, { email: 'u1@exemplo.com.br' })
    const b = await start(db, { email: 'u2@exemplo.com.br' }, true)
    expect(a).not.toBe(b)
    const rows = await q<{ email: string; marketing_consent: boolean; consent_version: string; consent_at: string }>(
      `select email, marketing_consent, consent_version, consent_at from public.diagnostic_sessions where email in ('u1@exemplo.com.br','u2@exemplo.com.br') order by email`,
    )
    expect(rows.map((r) => r.marketing_consent)).toEqual([false, true]) // contato de marketing é opt-in
    expect(rows.every((r) => r.consent_version === 'v1' && r.consent_at)).toBe(true)
    const ev = await q<{ n: number }>(`select count(*)::int as n from public.diagnostic_events e join public.diagnostic_sessions s on s.id = e.session_id where e.event = 'started' and s.email like 'u_@exemplo.com.br'`)
    expect(ev[0].n).toBe(2)
  })

  it('limita sessões por e-mail por hora', async () => {
    for (let i = 0; i < 10; i++) await start(db, { email: 'spam@exemplo.com.br' })
    await expect(start(db, { email: 'spam@exemplo.com.br' })).rejects.toThrow(/rate_limited/)
    await start(db, { email: 'outro@exemplo.com.br' }) // outro e-mail não é afetado
  })
})

describe('isolamento entre sessões', () => {
  it('cada token enxerga somente a própria sessão', async () => {
    const a = await start(db, { name: 'Ana', clinic: 'Clínica A', email: 'ana@exemplo.com.br' })
    const b = await start(db, { name: 'Bruno', clinic: 'Clínica B', email: 'bruno@exemplo.com.br' })
    await rpc(db, 'anon', 'diag_save_answer', a, 'fin1', 3)
    await rpc(db, 'anon', 'diag_save_answer', b, 'fin1', 0)

    const ga = await rpc<{ profile: { clinic: string; email: string }; answers: Record<string, number | null> }>(db, 'anon', 'diag_get', a)
    const gb = await rpc<{ profile: { clinic: string; email: string }; answers: Record<string, number | null> }>(db, 'anon', 'diag_get', b)
    expect(ga.profile).toMatchObject({ clinic: 'Clínica A', email: 'ana@exemplo.com.br' })
    expect(ga.answers).toEqual({ fin1: 3 })
    expect(gb.profile).toMatchObject({ clinic: 'Clínica B', email: 'bruno@exemplo.com.br' })
    expect(gb.answers).toEqual({ fin1: 0 })
  })

  it('token inexistente, adulterado ou vazio não revela nem altera nada, e todos respondem igual', async () => {
    const a = await start(db, { email: 'iso@exemplo.com.br' })
    const bad = [a.slice(0, -1) + (a.endsWith('0') ? '1' : '0'), a.toUpperCase(), ` ${a}`, `${a} `, '', 'x'.repeat(64), 'x'.repeat(10), "' or 1=1 --"]
    for (const t of bad) {
      expect(await rpc(db, 'anon', 'diag_get', t), JSON.stringify(t)).toBeNull()
      expect(await rpc(db, 'anon', 'diag_delete', t), JSON.stringify(t)).toBe(false)
      expect(await rpc(db, 'anon', 'diag_track', t, 'report_viewed', {}), JSON.stringify(t)).toBe(false)
      await expect(rpc(db, 'anon', 'diag_save_answer', t, 'fin1', 1)).rejects.toThrow(/invalid_session/)
      await expect(complete(t, all(2))).rejects.toThrow(/invalid_session/)
    }
    expect(await rpc(db, 'anon', 'diag_get', a)).not.toBeNull() // a sessão real continua intacta
  })

  it('a função authenticated se comporta igual à anon (nenhuma conta dá acesso extra)', async () => {
    const a = await start(db, { email: 'auth@exemplo.com.br' })
    expect(await rpc(db, 'authenticated', 'diag_get', a)).not.toBeNull()
    expect(await rpc(db, 'authenticated', 'diag_get', 'x'.repeat(64))).toBeNull()
  })
})

describe('salvamento das respostas', () => {
  it('salva, atualiza e acompanha a última pergunta respondida', async () => {
    const t = await start(db, { email: 'save@exemplo.com.br' })
    await rpc(db, 'anon', 'diag_save_answer', t, 'fin1', 2)
    await rpc(db, 'anon', 'diag_save_answer', t, 'com3', 1)
    await rpc(db, 'anon', 'diag_save_answer', t, 'fin1', 3) // voltar e alterar
    await rpc(db, 'anon', 'diag_save_answer', t, 'ate2', null) // "Não sei"
    const g = await rpc<{ answers: Record<string, number | null>; last_question: number }>(db, 'anon', 'diag_get', t)
    expect(g.answers).toEqual({ fin1: 3, com3: 1, ate2: null })
    expect(g.last_question).toBe(13) // com3 é a 13ª pergunta
    const rows = await q<{ question_key: string; value: number | null; is_unknown: boolean; dimension: string }>(
      `select a.question_key, a.value, a.is_unknown, a.dimension from public.diagnostic_answers a join public.diagnostic_sessions s on s.id = a.session_id where s.email = 'save@exemplo.com.br' order by 1`,
    )
    expect(rows).toEqual([
      { question_key: 'ate2', value: null, is_unknown: true, dimension: 'atendimento' },
      { question_key: 'com3', value: 1, is_unknown: false, dimension: 'comercial' },
      { question_key: 'fin1', value: 3, is_unknown: false, dimension: 'financeiro' },
    ])
  })

  it.each([
    ['pergunta inexistente', 'xyz9', 1],
    ['pergunta fora do padrão', 'fin6', 1],
    ['valor acima de 3', 'fin1', 4],
    ['valor negativo', 'fin1', -1],
  ])('rejeita resposta inválida: %s', async (_, key, value) => {
    const t = await start(db, { email: `inv${Math.random().toString(36).slice(2, 8)}@exemplo.com.br` })
    await expect(rpc(db, 'anon', 'diag_save_answer', t, key, value)).rejects.toThrow(/invalid_answer/)
  })

  it('cobre os 25 identificadores de pergunta e todos os 4 níveis mais "não sei"', async () => {
    const t = await start(db, { email: 'cover@exemplo.com.br' })
    for (const [i, question] of QUESTIONS.entries()) {
      const value = [0, 1, 2, 3, null][i % 5]
      await expect(rpc(db, 'anon', 'diag_save_answer', t, question.id, value)).resolves.toBe(true)
    }
    const g = await rpc<{ answers: Record<string, number | null>; last_question: number }>(db, 'anon', 'diag_get', t)
    expect(Object.keys(g.answers)).toHaveLength(25)
    expect(g.last_question).toBe(25)
    expect(new Set(Object.values(g.answers))).toEqual(new Set([0, 1, 2, 3, null]))
  })
})

describe('conclusão e pontuação', () => {
  it('exige as 25 respostas válidas', async () => {
    const t = await start(db, { email: 'inc@exemplo.com.br' })
    const a = all(2) as Record<string, number | null>
    const missing = { ...a }
    delete missing.ges5
    await expect(complete(t, missing)).rejects.toThrow(/incomplete_answers/)
    await expect(complete(t, { ...a, fin1: 5 as never })).rejects.toThrow(/invalid_answer/)
    await expect(complete(t, { ...a, fin1: '2' as never })).rejects.toThrow(/invalid_answer/)
    await expect(complete(t, { ...a, fin1: 2.5 as never })).rejects.toThrow(/invalid_answer/)
    await expect(complete(t, { ...a, zzz9: 1 as never })).rejects.toThrow(/invalid_answer/)
    await expect(rpc(db, 'anon', 'diag_complete', t, [1, 2, 3], {}, ENGINE)).rejects.toThrow(/invalid_payload/)
    await expect(rpc(db, 'anon', 'diag_complete', t, a, null, ENGINE)).rejects.toThrow(/invalid_payload/)
    expect((await rpc<{ status: string }>(db, 'anon', 'diag_get', t)).status).toBe('in_progress')
  })

  it('grava respostas, pontuação, lacunas e relatório, e a conclusão é idempotente', async () => {
    const t = await start(db, { email: 'done@exemplo.com.br' })
    const a: Answers = { ...all(3), fin1: null, fin2: null, ope1: 0 }
    const r1 = await complete(t, a)
    expect(r1).toEqual({ overall100: 96, band: 'established' }) // 66 pontos em 69 possíveis (23 válidas)
    const r2 = await complete(t, all(0)) // repetir não regrava nem muda nada
    expect(r2).toEqual(r1)

    const g = await rpc<{ status: string; completed_at: string; answers: Record<string, number | null>; report: { scores: { overall100: number } } }>(db, 'anon', 'diag_get', t)
    expect(g.status).toBe('completed')
    expect(g.completed_at).toBeTruthy()
    expect(g.answers.fin1).toBeNull()
    expect(g.answers.ope1).toBe(0)
    expect(Object.keys(g.answers)).toHaveLength(25)
    expect(g.report.scores.overall100).toBe(96)

    const res = (await q<{ overall_score: number; raw_total: number | null; valid_count: number; unknown_count: number; unknown_pct: number; known_pct: number; band: string; priorities: string[]; engine_version: string }>(
      `select r.* from public.diagnostic_results r join public.diagnostic_sessions s on s.id = r.session_id where s.email = 'done@exemplo.com.br'`,
    ))[0]
    expect(res).toMatchObject({ overall_score: 96, raw_total: null, valid_count: 23, unknown_count: 2, unknown_pct: 8, known_pct: 92, band: 'established', engine_version: ENGINE })
    expect(res.priorities).toHaveLength(3)
  })

  it('não permite alterar respostas depois de concluído', async () => {
    const t = await start(db, { email: 'lock@exemplo.com.br' })
    await complete(t, all(1))
    await expect(rpc(db, 'anon', 'diag_save_answer', t, 'fin1', 3)).rejects.toThrow(/already_completed/)
  })

  it('tudo "não sei": sem nota, e nada vira zero', async () => {
    const t = await start(db, { email: 'unk@exemplo.com.br' })
    expect(await complete(t, all(null))).toEqual({ overall100: null, band: null })
    const res = (await q<{ overall_score: number | null; unknown_count: number; known_pct: number; dimension_scores: Record<string, { score15: number | null }> }>(
      `select r.* from public.diagnostic_results r join public.diagnostic_sessions s on s.id = r.session_id where s.email = 'unk@exemplo.com.br'`,
    ))[0]
    expect(res.overall_score).toBeNull()
    expect(res.unknown_count).toBe(25)
    expect(res.known_pct).toBe(0)
    expect(Object.values(res.dimension_scores).every((d) => d.score15 === null)).toBe(true)
  })

  it('a pontuação do banco é idêntica à do front-end em 500 conjuntos de respostas', async () => {
    for (let seed = 1; seed <= 500; seed++) {
      const a = randomAnswers(seed, [0, 0.1, 0.3, 0.7][seed % 4])
      const sql = await rpc<{
        overall100: number | null
        raw_total: number | null
        valid: number
        unknown: number
        unknown_pct: number
        known_pct: number
        band: string | null
        dims: Record<string, { raw: number; valid: number; unknown: number; score15: number | null; band: string | null }>
      }>(db, 'postgres', 'diag_score', a)
      const ts = computeScores(a)
      const ctx = `seed=${seed}`
      expect(sql.overall100, ctx).toBe(ts.overall100)
      expect(sql.raw_total, ctx).toBe(ts.overallRaw)
      expect(sql.valid, ctx).toBe(ts.valid)
      expect(sql.unknown, ctx).toBe(ts.unknown)
      expect(sql.unknown_pct, ctx).toBe(ts.unknownPct)
      expect(sql.known_pct, ctx).toBe(ts.knownPct)
      expect(sql.band, ctx).toBe(ts.band)
      for (const id of DIMENSION_IDS) {
        const s = sql.dims[id]
        const d = ts.dims[id]
        expect(s.raw, `${ctx} ${id}`).toBe(d.raw)
        expect(s.valid, `${ctx} ${id}`).toBe(d.valid)
        expect(s.unknown, `${ctx} ${id}`).toBe(d.unknown)
        expect(s.score15 === null ? null : Number(s.score15), `${ctx} ${id}`).toBe(d.score15)
        expect(s.band, `${ctx} ${id}`).toBe(d.band)
      }
    }
  })

  it('as fronteiras das faixas coincidem entre banco e front-end', async () => {
    for (const s15 of [0, 4, 4.9, 5, 8, 8.9, 9, 12, 12.9, 13, 15]) {
      const b = await rpc<string>(db, 'postgres', 'diag_band15', s15)
      expect(b, String(s15)).toBe((await import('../../src/diagnostic/engine/score')).bandOf15(s15))
    }
    for (let n = 0; n <= 100; n++) {
      const b = await rpc<string>(db, 'postgres', 'diag_band100', n)
      expect(b, String(n)).toBe((await import('../../src/diagnostic/engine/score')).bandOf100(n))
    }
  })
})

describe('eventos', () => {
  it('aceita só os eventos do navegador e guarda apenas o local do clique', async () => {
    const t = await start(db, { email: 'ev@exemplo.com.br' })
    expect(await rpc(db, 'anon', 'diag_track', t, 'report_viewed', {})).toBe(true)
    expect(await rpc(db, 'anon', 'diag_track', t, 'cta_clicked', { placement: 'next-step', email: 'vazar@exemplo.com', extra: 'x'.repeat(5000) })).toBe(true)
    for (const e of ['started', 'completed', 'inventado', '']) expect(await rpc(db, 'anon', 'diag_track', t, e, {}), e).toBe(false)
    const rows = await q<{ event: string; props: Record<string, string> }>(
      `select e.event, e.props from public.diagnostic_events e join public.diagnostic_sessions s on s.id = e.session_id where s.email = 'ev@exemplo.com.br' and e.event = 'cta_clicked'`,
    )
    expect(rows[0].props).toEqual({ placement: 'next-step' })
  })

  it('limita o volume de eventos por sessão', async () => {
    const t = await start(db, { email: 'flood@exemplo.com.br' })
    let accepted = 0
    for (let i = 0; i < 215; i++) if (await rpc<boolean>(db, 'anon', 'diag_track', t, 'report_viewed', {})) accepted++
    expect(accepted).toBe(199) // 1 evento 'started' já existia
  })
})

describe('exclusão de dados (LGPD)', () => {
  it('apaga a sessão e tudo que depende dela', async () => {
    const t = await start(db, { email: 'lgpd@exemplo.com.br' })
    await complete(t, all(2))
    await rpc(db, 'anon', 'diag_track', t, 'report_viewed', {})
    expect(await rpc(db, 'anon', 'diag_delete', t)).toBe(true)
    expect(await rpc(db, 'anon', 'diag_get', t)).toBeNull()
    expect(await rpc(db, 'anon', 'diag_delete', t)).toBe(false)
    for (const tbl of ['diagnostic_answers', 'diagnostic_results', 'diagnostic_events']) {
      const n = (await q<{ n: number }>(`select count(*)::int as n from public.${tbl} where session_id not in (select id from public.diagnostic_sessions)`))[0].n
      expect(n, tbl).toBe(0)
    }
    expect((await q<{ n: number }>(`select count(*)::int as n from public.diagnostic_sessions where email = 'lgpd@exemplo.com.br'`))[0].n).toBe(0)
  })
})

describe('métricas da jornada (somente service_role)', () => {
  it('mede início, conclusão, abandono, notas, problemas frequentes, visualizações e cliques sem inventar conversões', async () => {
    const m0 = await rpc<{ started: number; completed: number }>(db, 'service_role', 'diagnostic_metrics')

    // 3 diagnósticos concluídos, 2 abandonados (um na pergunta 7, outro sem responder nada)
    const done: string[] = []
    for (const [i, a] of [all(0), all(3), all(2)].entries()) {
      const t = await start(db, { email: `m${i}@exemplo.com.br` })
      await complete(t, a)
      done.push(t)
    }
    const ab1 = await start(db, { email: 'ab1@exemplo.com.br' })
    for (let i = 0; i < 7; i++) await rpc(db, 'anon', 'diag_save_answer', ab1, QUESTIONS[i].id, 1)
    await start(db, { email: 'ab2@exemplo.com.br' })

    await rpc(db, 'anon', 'diag_track', done[0], 'report_viewed', {})
    await rpc(db, 'anon', 'diag_track', done[0], 'report_viewed', {}) // mesma sessão: conta uma vez
    await rpc(db, 'anon', 'diag_track', done[1], 'report_viewed', {})
    await rpc(db, 'anon', 'diag_track', done[0], 'cta_clicked', { placement: 'next-step' })
    await rpc(db, 'anon', 'diag_track', done[0], 'cta_clicked', { placement: 'next-step' })
    await rpc(db, 'anon', 'diag_track', done[0], 'signup_started', {})
    await rpc(db, 'anon', 'diag_track', done[2], 'pdf_downloaded', {})

    const m = await rpc<{
      started: number
      completed: number
      completion_rate: number
      abandonment_by_last_question: { last_question: number; sessions: number }[]
      score_distribution: { range: string; sessions: number }[]
      frequent_problems: { question: string; weak_pct: number; unknown_pct: number; answers: number }[]
      report_viewed: number
      cta_clicked: number
      signup_started: number
      pdf_downloaded: number
      subscriptions_from_diagnostic: null
    }>(db, 'service_role', 'diagnostic_metrics')

    expect(m.started - m0.started).toBe(5)
    expect(m.completed - m0.completed).toBe(3)
    expect(Number(m.completion_rate)).toBeGreaterThan(0)
    expect(m.abandonment_by_last_question.find((x) => x.last_question === 7)?.sessions).toBeGreaterThanOrEqual(1)
    expect(m.abandonment_by_last_question.find((x) => x.last_question === 0)?.sessions).toBeGreaterThanOrEqual(1)
    expect(m.score_distribution.length).toBeGreaterThan(0)
    expect(m.frequent_problems).toHaveLength(25)
    expect(m.frequent_problems.every((p) => Number(p.weak_pct) >= 0 && Number(p.weak_pct) <= 100)).toBe(true)
    expect(m.report_viewed).toBeGreaterThanOrEqual(2)
    expect(m.cta_clicked).toBeGreaterThanOrEqual(1)
    expect(m.signup_started).toBeGreaterThanOrEqual(1)
    expect(m.pdf_downloaded).toBeGreaterThanOrEqual(1)
    // Não existe integração que ligue o diagnóstico a assinaturas: nenhuma conversão é inventada.
    expect(m.subscriptions_from_diagnostic).toBeNull()
  })

  it('conta cada sessão uma vez por evento', async () => {
    const t = await start(db, { email: 'distinct@exemplo.com.br' })
    const before = await rpc<{ cta_clicked: number }>(db, 'service_role', 'diagnostic_metrics')
    for (let i = 0; i < 5; i++) await rpc(db, 'anon', 'diag_track', t, 'cta_clicked', { placement: 'x' })
    const after = await rpc<{ cta_clicked: number }>(db, 'service_role', 'diagnostic_metrics')
    expect(after.cta_clicked - before.cta_clicked).toBe(1)
  })
})

describe('retenção', () => {
  it('só apaga o que passou do prazo e não aceita prazo curto demais', async () => {
    const old = await start(db, { email: 'velho@exemplo.com.br' })
    const fresh = await start(db, { email: 'novo@exemplo.com.br' })
    await db.query(`update public.diagnostic_sessions set created_at = now() - interval '400 days' where email = 'velho@exemplo.com.br'`)
    await expect(rpc(db, 'service_role', 'diagnostic_purge', '10 days')).rejects.toThrow(/retention_too_short/)
    const n = await rpc<number>(db, 'service_role', 'diagnostic_purge', '365 days')
    expect(n).toBeGreaterThanOrEqual(1)
    expect(await rpc(db, 'anon', 'diag_get', old)).toBeNull()
    expect(await rpc(db, 'anon', 'diag_get', fresh)).not.toBeNull()
  })
})

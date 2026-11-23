import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

export const MIGRATION = resolve(__dirname, '../../supabase/migrations/0004_diagnostic.sql')

export type Role = 'anon' | 'authenticated' | 'service_role' | 'postgres'

/**
 * Sobe um Postgres real em memória com os papéis e os privilégios padrão do Supabase
 * (anon, authenticated e service_role recebem tudo em objetos novos do schema public)
 * e aplica a migração do diagnóstico. Se a migração não revogar o que deve, os testes de segurança falham.
 */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `)
  await db.exec(readFileSync(MIGRATION, 'utf8'))
  return db
}

export async function asRole<T>(db: PGlite, role: Role, fn: () => Promise<T>): Promise<T> {
  if (role !== 'postgres') await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

/** Chama uma função pública do diagnóstico, como o PostgREST faria, com o papel indicado. */
export async function rpc<T = unknown>(db: PGlite, role: Role, fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}`).join(', ')
  const res = await asRole(db, role, () =>
    db.query<{ r: T }>(
      `select public.${fn}(${params}) as r`,
      args.map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a)),
    ),
  )
  return res.rows[0].r
}

export const PROFILE_JSON = { name: 'Mariana Souza', clinic: 'Clínica Aurora', specialty: 'Odontologia', team: '4-7', email: 'contato@exemplo.com.br' }

export async function start(db: PGlite, over: Partial<typeof PROFILE_JSON> = {}, marketing = false): Promise<string> {
  const r = await rpc<{ token: string }>(db, 'anon', 'diag_start', { ...PROFILE_JSON, ...over }, true, marketing, 'v1')
  return r.token
}

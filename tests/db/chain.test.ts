import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { describe, expect, it } from 'vitest'

const dir = resolve(__dirname, '../../supabase/migrations')

/**
 * Aplica TODAS as migrações do produto, na ordem, sobre stubs mínimos do auth e do storage do Supabase,
 * para provar que a migração do diagnóstico não conflita com o esquema existente e que o produto continua funcionando.
 */
describe('migrações do produto + diagnóstico, em sequência', () => {
  it('aplicam sem conflito e o produto existente continua funcionando', async () => {
    const db = new PGlite({ extensions: { pgcrypto } })
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (id uuid primary key default gen_random_uuid());
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
      create publication supabase_realtime;
    `)
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    expect(files.slice(0, 3)).toEqual(['0001_schema.sql', '0002_approvals_customer.sql', '0003_hardening.sql'])
    expect(files[3]).toBe('0004_diagnostic.sql')
    for (const f of files) await db.exec(readFileSync(resolve(dir, f), 'utf8'))

    // o produto existente segue de pé: criar a empresa dispara os 5 agentes padrão
    const user = (await db.query<{ id: string }>(`insert into auth.users default values returning id`)).rows[0].id
    await db.exec(`set role authenticated`)
    await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`)
    await db.exec(`insert into public.companies (name, segment) values ('Clínica Teste', 'Saúde / clínica')`)
    const agents = (await db.query<{ n: number }>(`select count(*)::int as n from public.agents`)).rows[0].n
    await db.exec(`reset role`)
    expect(agents).toBe(5)

    // e o diagnóstico funciona ao lado dele
    const tbls = (await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name like 'diagnostic_%'`)).rows[0].n
    expect(tbls).toBe(4)
    await db.close()
  })
})

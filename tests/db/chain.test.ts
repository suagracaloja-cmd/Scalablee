import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { describe, expect, it } from 'vitest'

const dir = resolve(__dirname, '../../supabase/migrations')

/**
 * Aplica TODAS as migrações do produto, na ordem, sobre stubs mínimos do auth e do storage do Supabase,
 * para provar que a migração do diagnóstico não conflita com o esquema existente e que o produto continua funcionando.
 */
describe('migrações do produto + diagnóstico, em sequência', () => {
  it('aplicam sem conflito e o produto existente continua funcionando', async () => {
    const db = new PGlite({ extensions: { pgcrypto, btree_gist } })
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (id uuid primary key default gen_random_uuid());
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
      create function auth.email() returns text language sql stable as $$ select null::text $$;
      create schema extensions;
      create function extensions.gen_random_bytes(n int) returns bytea language plpgsql as $$ begin return public.gen_random_bytes(n); end $$;
      create function extensions.pgp_sym_encrypt(t text, k text, o text default '') returns bytea language plpgsql as $$ begin return public.pgp_sym_encrypt(t, k, o); end $$;
      create function extensions.pgp_sym_decrypt(b bytea, k text) returns text language plpgsql as $$ begin return public.pgp_sym_decrypt(b, k); end $$;
      create schema vault;
      create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text, created_at timestamptz default now());
      create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$ insert into vault.secrets(name, description, secret) values (new_name, new_description, new_secret) returning id $$;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
      create publication supabase_realtime;
    `)
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    expect(files[0]).toBe('0001_schema.sql')
    expect(files.at(-1)).toBe('0019_diagnostico_raio_x.sql')
    // a numeração é contínua: nenhuma migração do produto foi sobrescrita ou pulada
    expect(files.map((f) => f.slice(0, 4))).toEqual(Array.from({ length: files.length }, (_, i) => String(i + 1).padStart(4, '0')))
    for (const f of files) await db.exec(readFileSync(resolve(dir, f), 'utf8'))

    // o produto existente segue de pé: o dono cria a clínica e as tabelas de agenda, equipe e cobrança continuam lá
    const user = (await db.query<{ id: string }>(`insert into auth.users default values returning id`)).rows[0].id
    await db.exec(`set role authenticated`)
    await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`)
    await db.exec(`insert into public.companies (name, segment) values ('Clínica Teste', 'Clínica médica')`)
    const companies = (await db.query<{ n: number }>(`select count(*)::int as n from public.companies`)).rows[0].n
    await db.exec(`reset role`)
    expect(companies).toBe(1)
    const product = (
      await db.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('agendamentos','profissionais','membros','convites','anamneses','evolucoes','billing','sales','customers')`,
      )
    ).rows.map((r) => r.table_name)
    expect(product.sort()).toEqual(['agendamentos', 'anamneses', 'billing', 'convites', 'customers', 'evolucoes', 'membros', 'profissionais', 'sales'])

    // e o diagnóstico funciona ao lado dele
    const tbls = (await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name like 'diagnostic_%'`)).rows[0].n
    expect(tbls).toBe(4)
    await db.close()
  })
})

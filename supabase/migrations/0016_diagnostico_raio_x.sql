-- Raio-X da Gestão da Clínica: diagnóstico gratuito, sem conta.
--
-- Modelo de segurança
--   * As quatro tabelas têm RLS ligada e NENHUMA política: anon e authenticated não leem nem escrevem nada direto.
--   * Todo acesso anônimo passa por funções SECURITY DEFINER (diag_*), que localizam a sessão por um token secreto.
--   * O token é gerado aqui, no banco, devolvido uma única vez e guardado só como hash (sha256).
--     Quem não tem o token não consegue ler, alterar nem apagar a sessão de ninguém, e as funções
--     respondem do mesmo jeito a um token inexistente e a um token de outra pessoa.
--   * A pontuação é recalculada aqui a partir das respostas, para que as métricas não dependam do navegador.
--   * Métricas e limpeza só existem para service_role.
--
-- Esta migração é aditiva: não altera nenhuma tabela nem função do produto existente.

create table public.diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  clinic_name text not null check (char_length(clinic_name) between 1 and 160),
  specialty text not null default '' check (char_length(specialty) <= 160),
  team_size text not null check (team_size in ('solo', '2-3', '4-7', '8-15', '16+')),
  email text not null check (char_length(email) between 5 and 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  consent_at timestamptz not null default now(),
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  marketing_consent boolean not null default false,
  last_question integer not null default 0 check (last_question between 0 and 25),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index diagnostic_sessions_created_idx on public.diagnostic_sessions (created_at);
create index diagnostic_sessions_status_idx on public.diagnostic_sessions (status, last_question);
create index diagnostic_sessions_email_idx on public.diagnostic_sessions (lower(email), created_at);

create table public.diagnostic_answers (
  session_id uuid not null references public.diagnostic_sessions (id) on delete cascade,
  question_key text not null check (question_key ~ '^(fin|ate|com|ope|ges)[1-5]$'),
  dimension text not null check (dimension in ('financeiro', 'atendimento', 'comercial', 'operacao', 'gestao')),
  -- 0 a 3; nulo = "Não sei / Não tenho essa informação" (lacuna de informação, nunca zero).
  value smallint check (value between 0 and 3),
  is_unknown boolean generated always as (value is null) stored,
  answered_at timestamptz not null default now(),
  primary key (session_id, question_key)
);
create index diagnostic_answers_question_idx on public.diagnostic_answers (question_key, value);

create table public.diagnostic_results (
  session_id uuid primary key references public.diagnostic_sessions (id) on delete cascade,
  overall_score smallint check (overall_score between 0 and 100),
  raw_total smallint check (raw_total between 0 and 75),
  valid_count smallint not null check (valid_count between 0 and 25),
  unknown_count smallint not null check (unknown_count between 0 and 25),
  unknown_pct smallint not null check (unknown_pct between 0 and 100),
  known_pct smallint not null check (known_pct between 0 and 100),
  band text check (band in ('critical', 'attention', 'developing', 'established')),
  dimension_scores jsonb not null,
  priorities text[] not null default '{}',
  report jsonb not null check (octet_length(report::text) <= 200000),
  engine_version text not null check (char_length(engine_version) between 1 and 20),
  generated_at timestamptz not null default now()
);
create index diagnostic_results_band_idx on public.diagnostic_results (band, overall_score);

create table public.diagnostic_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.diagnostic_sessions (id) on delete cascade,
  event text not null check (event in ('started', 'completed', 'report_viewed', 'cta_clicked', 'pdf_downloaded', 'retake_started', 'signup_started')),
  props jsonb not null default '{}' check (octet_length(props::text) <= 500),
  created_at timestamptz not null default now()
);
create index diagnostic_events_event_idx on public.diagnostic_events (event, created_at);
create index diagnostic_events_session_idx on public.diagnostic_events (session_id);

-- RLS ligada e sem políticas: nada é acessível direto. Os privilégios padrão do Supabase
-- concedem tudo a anon/authenticated em tabelas novas, então são revogados explicitamente.
alter table public.diagnostic_sessions enable row level security;
alter table public.diagnostic_answers enable row level security;
alter table public.diagnostic_results enable row level security;
alter table public.diagnostic_events enable row level security;
revoke all on table public.diagnostic_sessions, public.diagnostic_answers, public.diagnostic_results, public.diagnostic_events from public, anon, authenticated;
revoke all on sequence public.diagnostic_events_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares internos (não são concedidos a anon nem a authenticated)
-- ---------------------------------------------------------------------------

create function public.diag_question_index(p_key text) returns integer
language sql immutable as $$
  select case when p_key ~ '^(fin|ate|com|ope|ges)[1-5]$'
    then (array_position(array['fin', 'ate', 'com', 'ope', 'ges'], substr(p_key, 1, 3)) - 1) * 5 + substr(p_key, 4, 1)::int
  end
$$;

create function public.diag_question_dimension(p_key text) returns text
language sql immutable as $$
  select case substr(p_key, 1, 3)
    when 'fin' then 'financeiro' when 'ate' then 'atendimento' when 'com' then 'comercial'
    when 'ope' then 'operacao' when 'ges' then 'gestao' end
$$;

-- Faixas: dimensão (escala 0–15) por parte inteira; geral (escala 0–100) por nota inteira. Mesmos cortes do front-end.
create function public.diag_band15(p_score numeric) returns text
language sql immutable as $$
  select case when p_score is null then null
    when floor(p_score) <= 4 then 'critical' when floor(p_score) <= 8 then 'attention'
    when floor(p_score) <= 12 then 'developing' else 'established' end
$$;

create function public.diag_band100(p_score integer) returns text
language sql immutable as $$
  select case when p_score is null then null
    when p_score <= 33 then 'critical' when p_score <= 59 then 'attention'
    when p_score <= 86 then 'developing' else 'established' end
$$;

create function public.diag_session_id(p_token text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.diagnostic_sessions
  where token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8')) and char_length(coalesce(p_token, '')) between 32 and 128
$$;

-- Pontuação a partir das 25 respostas (jsonb: chave -> 0..3 ou null). Espelha src/diagnostic/engine/score.ts.
create function public.diag_score(p_answers jsonb) returns jsonb
language plpgsql immutable as $$
declare
  d text;
  k text;
  v jsonb;
  dims jsonb := '{}';
  raw_d int; valid_d int; unknown_d int; s15 numeric;
  raw_t int := 0; valid_t int := 0; unknown_t int := 0;
  overall int;
begin
  foreach d in array array['financeiro', 'atendimento', 'comercial', 'operacao', 'gestao'] loop
    raw_d := 0; valid_d := 0; unknown_d := 0;
    for k, v in select key, value from jsonb_each(p_answers) loop
      if public.diag_question_dimension(k) = d then
        if jsonb_typeof(v) = 'null' then unknown_d := unknown_d + 1;
        else raw_d := raw_d + (v #>> '{}')::int; valid_d := valid_d + 1;
        end if;
      end if;
    end loop;
    s15 := case when valid_d = 0 then null else round((raw_d * 15)::numeric / (3 * valid_d), 1) end;
    dims := dims || jsonb_build_object(d, jsonb_build_object(
      'raw', raw_d, 'valid', valid_d, 'unknown', unknown_d, 'score15', s15, 'band', public.diag_band15(s15)));
    raw_t := raw_t + raw_d; valid_t := valid_t + valid_d; unknown_t := unknown_t + unknown_d;
  end loop;
  overall := case when valid_t = 0 then null else round((raw_t * 100)::numeric / (3 * valid_t))::int end;
  return jsonb_build_object(
    'dims', dims, 'overall100', overall,
    'raw_total', case when unknown_t = 0 and valid_t = 25 then raw_t end,
    'valid', valid_t, 'unknown', unknown_t,
    'unknown_pct', round(unknown_t * 100.0 / 25)::int, 'known_pct', round(valid_t * 100.0 / 25)::int,
    'band', public.diag_band100(overall));
end $$;

-- ---------------------------------------------------------------------------
-- API pública (anon e authenticated). Erros usam mensagens estáveis, como 'consent_required'.
-- ---------------------------------------------------------------------------

-- Cria a sessão e devolve o token secreto, uma única vez.
create function public.diag_start(p_profile jsonb, p_consent boolean, p_marketing boolean default false, p_consent_version text default 'v1')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_profile ->> 'name', ''));
  v_clinic text := btrim(coalesce(p_profile ->> 'clinic', ''));
  v_specialty text := btrim(coalesce(p_profile ->> 'specialty', ''));
  v_team text := coalesce(p_profile ->> 'team', '');
  v_email text := lower(btrim(coalesce(p_profile ->> 'email', '')));
  v_token text;
  v_id uuid;
  -- Proteção contra abuso: limites por hora, por e-mail e no total.
  max_per_email constant int := 10;
  max_total constant int := 3000;
begin
  if p_consent is distinct from true then raise exception 'consent_required' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 1 and 120 or char_length(v_clinic) not between 1 and 160
     or char_length(v_specialty) > 160 or v_team not in ('solo', '2-3', '4-7', '8-15', '16+')
     or char_length(v_email) not between 5 and 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(coalesce(p_consent_version, '')) not between 1 and 20 then
    raise exception 'invalid_profile' using errcode = 'P0001';
  end if;
  if (select count(*) from public.diagnostic_sessions where lower(email) = v_email and created_at > now() - interval '1 hour') >= max_per_email
     or (select count(*) from public.diagnostic_sessions where created_at > now() - interval '1 hour') >= max_total then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.diagnostic_sessions (token_hash, contact_name, clinic_name, specialty, team_size, email, consent_version, marketing_consent)
  values (sha256(convert_to(v_token, 'UTF8')), v_name, v_clinic, v_specialty, v_team, v_email, p_consent_version, coalesce(p_marketing, false))
  returning id into v_id;
  insert into public.diagnostic_events (session_id, event) values (v_id, 'started');
  return jsonb_build_object('token', v_token);
end $$;

-- Salva uma resposta (salvamento automático). p_value nulo = "Não sei".
create function public.diag_save_answer(p_token text, p_question text, p_value integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.diag_session_id(p_token);
  v_status text;
begin
  if v_id is null then raise exception 'invalid_session' using errcode = 'P0001'; end if;
  select status into v_status from public.diagnostic_sessions where id = v_id;
  if v_status <> 'in_progress' then raise exception 'already_completed' using errcode = 'P0001'; end if;
  if public.diag_question_index(p_question) is null or (p_value is not null and p_value not between 0 and 3) then
    raise exception 'invalid_answer' using errcode = 'P0001';
  end if;
  insert into public.diagnostic_answers (session_id, question_key, dimension, value)
  values (v_id, p_question, public.diag_question_dimension(p_question), p_value)
  on conflict (session_id, question_key) do update set value = excluded.value, answered_at = now();
  update public.diagnostic_sessions
  set last_question = greatest(last_question, public.diag_question_index(p_question)), updated_at = now()
  where id = v_id;
  return true;
end $$;

-- Recupera a sessão para retomar o questionário ou rever o relatório. Token inválido devolve nulo.
create function public.diag_get(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.diag_session_id(p_token);
begin
  if v_id is null then return null; end if;
  return (
    select jsonb_build_object(
      'status', s.status,
      'profile', jsonb_build_object('name', s.contact_name, 'clinic', s.clinic_name, 'specialty', s.specialty, 'team', s.team_size, 'email', s.email),
      'answers', coalesce((select jsonb_object_agg(a.question_key, a.value) from public.diagnostic_answers a where a.session_id = s.id), '{}'::jsonb),
      'last_question', s.last_question,
      'created_at', s.created_at,
      'completed_at', s.completed_at,
      'report', (select r.report from public.diagnostic_results r where r.session_id = s.id))
    from public.diagnostic_sessions s where s.id = v_id);
end $$;

-- Conclui: valida as 25 respostas, grava, calcula a pontuação e guarda o relatório. Repetir é seguro.
create function public.diag_complete(p_token text, p_answers jsonb, p_report jsonb, p_engine_version text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.diag_session_id(p_token);
  v_status text;
  k text;
  v jsonb;
  v_scores jsonb;
  v_priorities text[];
  n int := 0;
begin
  if v_id is null then raise exception 'invalid_session' using errcode = 'P0001'; end if;
  select status into v_status from public.diagnostic_sessions where id = v_id;
  if v_status = 'completed' then
    return (select jsonb_build_object('overall100', overall_score, 'band', band) from public.diagnostic_results where session_id = v_id);
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or p_report is null or jsonb_typeof(p_report) <> 'object'
     or char_length(coalesce(p_engine_version, '')) not between 1 and 20 then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  for k, v in select key, value from jsonb_each(p_answers) loop
    n := n + 1;
    if public.diag_question_index(k) is null
       or not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'number' and (v #>> '{}') in ('0', '1', '2', '3'))) then
      raise exception 'invalid_answer' using errcode = 'P0001';
    end if;
  end loop;
  if n <> 25 then raise exception 'incomplete_answers' using errcode = 'P0001'; end if;
  if octet_length(p_report::text) > 200000 then raise exception 'invalid_payload' using errcode = 'P0001'; end if;

  insert into public.diagnostic_answers (session_id, question_key, dimension, value)
  select v_id, key, public.diag_question_dimension(key), case when jsonb_typeof(value) = 'null' then null else (value #>> '{}')::smallint end
  from jsonb_each(p_answers)
  on conflict (session_id, question_key) do update set value = excluded.value, answered_at = now();

  v_scores := public.diag_score(p_answers);
  select coalesce(array_agg(x.dim), '{}') into v_priorities
  from (select e ->> 'dim' as dim from jsonb_array_elements(case when jsonb_typeof(p_report -> 'priorities') = 'array' then p_report -> 'priorities' else '[]'::jsonb end) e) x
  where x.dim in ('financeiro', 'atendimento', 'comercial', 'operacao', 'gestao');

  insert into public.diagnostic_results (session_id, overall_score, raw_total, valid_count, unknown_count, unknown_pct, known_pct, band, dimension_scores, priorities, report, engine_version)
  values (v_id, (v_scores ->> 'overall100')::int, (v_scores ->> 'raw_total')::int, (v_scores ->> 'valid')::int, (v_scores ->> 'unknown')::int,
          (v_scores ->> 'unknown_pct')::int, (v_scores ->> 'known_pct')::int, v_scores ->> 'band', v_scores -> 'dims', v_priorities, p_report, p_engine_version);
  update public.diagnostic_sessions set status = 'completed', completed_at = now(), updated_at = now(), last_question = 25 where id = v_id;
  insert into public.diagnostic_events (session_id, event) values (v_id, 'completed');
  return jsonb_build_object('overall100', v_scores -> 'overall100', 'band', v_scores -> 'band');
end $$;

-- Registra um evento da jornada. Só aceita eventos disparados pelo navegador; 'started' e 'completed' são do servidor.
create function public.diag_track(p_token text, p_event text, p_props jsonb default '{}')
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.diag_session_id(p_token);
begin
  if v_id is null or p_event not in ('report_viewed', 'cta_clicked', 'pdf_downloaded', 'retake_started', 'signup_started') then return false; end if;
  if (select count(*) from public.diagnostic_events where session_id = v_id) >= 200 then return false; end if;
  -- Só guarda o local do clique; nenhum outro dado do navegador é aceito.
  insert into public.diagnostic_events (session_id, event, props)
  values (v_id, p_event, jsonb_build_object('placement', left(coalesce(p_props ->> 'placement', ''), 40)));
  return true;
end $$;

-- Direito de exclusão (LGPD): apaga a sessão e tudo que depende dela.
create function public.diag_delete(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.diag_session_id(p_token);
begin
  if v_id is null then return false; end if;
  delete from public.diagnostic_sessions where id = v_id;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Operação interna (só service_role): métricas da jornada e limpeza por prazo de retenção.
-- ---------------------------------------------------------------------------

create function public.diagnostic_metrics()
returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select count(*) as started, count(*) filter (where status = 'completed') as completed from public.diagnostic_sessions),
  ev as (
    select event, count(distinct session_id) as sessions from public.diagnostic_events
    where event in ('report_viewed', 'cta_clicked', 'pdf_downloaded', 'retake_started', 'signup_started') group by event),
  done as (select count(*) as n from public.diagnostic_results)
  select jsonb_build_object(
    'started', (select started from s),
    'completed', (select completed from s),
    'completion_rate', (select case when started = 0 then null else round(completed * 100.0 / started, 1) end from s),
    -- Onde quem não concluiu parou: última pergunta respondida (0 = nenhuma).
    'abandonment_by_last_question', coalesce((
      select jsonb_agg(jsonb_build_object('last_question', last_question, 'sessions', c) order by last_question)
      from (select last_question, count(*) as c from public.diagnostic_sessions where status = 'in_progress' group by last_question) t), '[]'::jsonb),
    'score_distribution', coalesce((
      select jsonb_agg(jsonb_build_object('range', b, 'sessions', c) order by b)
      from (select case when overall_score is null then 'sem nota' when overall_score < 20 then '00-19' when overall_score < 40 then '20-39'
                        when overall_score < 60 then '40-59' when overall_score < 80 then '60-79' else '80-100' end as b, count(*) as c
            from public.diagnostic_results group by 1) t), '[]'::jsonb),
    'overall_bands', coalesce((select jsonb_object_agg(coalesce(band, 'sem nota'), c) from (select band, count(*) as c from public.diagnostic_results group by band) t), '{}'::jsonb),
    'dimension_bands', coalesce((
      select jsonb_object_agg(dimension, bands) from (
        select dimension, jsonb_object_agg(coalesce(band, 'sem nota'), c) as bands
        from (select d.key as dimension, d.value ->> 'band' as band, count(*) as c
              from public.diagnostic_results r, jsonb_each(r.dimension_scores) d group by 1, 2) q group by dimension) t), '{}'::jsonb),
    -- Problemas mais frequentes: % de respostas fracas (0 ou 1) e % de "não sei", por pergunta, entre diagnósticos concluídos.
    'frequent_problems', coalesce((
      select jsonb_agg(jsonb_build_object('question', question_key, 'weak_pct', weak_pct, 'unknown_pct', unknown_pct, 'answers', total) order by weak_pct desc, question_key)
      from (select a.question_key, count(*) as total,
                   round(count(*) filter (where a.value in (0, 1)) * 100.0 / count(*), 1) as weak_pct,
                   round(count(*) filter (where a.is_unknown) * 100.0 / count(*), 1) as unknown_pct
            from public.diagnostic_answers a join public.diagnostic_sessions x on x.id = a.session_id and x.status = 'completed'
            group by a.question_key) t), '[]'::jsonb),
    'report_viewed', coalesce((select sessions from ev where event = 'report_viewed'), 0),
    'pdf_downloaded', coalesce((select sessions from ev where event = 'pdf_downloaded'), 0),
    'retake_started', coalesce((select sessions from ev where event = 'retake_started'), 0),
    'cta_clicked', coalesce((select sessions from ev where event = 'cta_clicked'), 0),
    'signup_started', coalesce((select sessions from ev where event = 'signup_started'), 0),
    -- Não há integração que ligue o diagnóstico a uma assinatura: nada é contado aqui. Cliques e cadastros iniciados não são assinaturas.
    'subscriptions_from_diagnostic', null,
    'notes', 'Contagens de eventos são de sessões distintas. Visitantes que não iniciaram o diagnóstico não são medidos (sem consentimento).');
$$;

create function public.diagnostic_purge(p_older_than interval default interval '365 days')
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_older_than < interval '30 days' then raise exception 'retention_too_short' using errcode = 'P0001'; end if;
  with gone as (delete from public.diagnostic_sessions where created_at < now() - p_older_than returning 1) select count(*) into n from gone;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões de execução: o padrão do Postgres concede a PUBLIC, então é revogado antes de conceder.
-- ---------------------------------------------------------------------------
revoke all on function public.diag_question_index(text), public.diag_question_dimension(text), public.diag_band15(numeric), public.diag_band100(integer),
  public.diag_session_id(text), public.diag_score(jsonb) from public, anon, authenticated;
revoke all on function public.diag_start(jsonb, boolean, boolean, text), public.diag_save_answer(text, text, integer), public.diag_get(text),
  public.diag_complete(text, jsonb, jsonb, text), public.diag_track(text, text, jsonb), public.diag_delete(text),
  public.diagnostic_metrics(), public.diagnostic_purge(interval) from public, anon, authenticated;

grant execute on function public.diag_start(jsonb, boolean, boolean, text), public.diag_save_answer(text, text, integer), public.diag_get(text),
  public.diag_complete(text, jsonb, jsonb, text), public.diag_track(text, text, jsonb), public.diag_delete(text) to anon, authenticated;
grant execute on function public.diagnostic_metrics(), public.diagnostic_purge(interval) to service_role;

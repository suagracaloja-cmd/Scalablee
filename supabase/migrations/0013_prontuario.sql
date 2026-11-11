-- Prontuário digital, parte 1: anamnese, evolução do atendimento e registro de acessos.
--
-- Dados de saúde são dados pessoais SENSÍVEIS (LGPD). Regras desta parte:
--  * Só o dono da conta e os profissionais abrem o prontuário. A recepção não.
--  * Ninguém lê nem grava direto nas tabelas: tudo passa por funções do banco que conferem o papel
--    e registram quem acessou (tabela prontuario_acessos).
--  * Nada é alterado nem apagado: uma anamnese nova vira uma nova versão; correções viram "complemento".
--  * Paciente que tem prontuário não pode ser excluído (vira "inativo").
--  * A Coraline AI não lê estas tabelas.

-- 1) Anamnese: cada salvamento cria uma nova versão
create table public.anamneses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  queixa_principal text,
  historico_medico text,
  medicamentos text,
  alergias text,
  cirurgias_previas text,
  habitos text,
  gestante_lactante text,
  outras_informacoes text,
  criado_por uuid not null,
  criado_por_nome text not null,
  criado_em timestamptz not null default now(),
  constraint anamneses_gestante check (gestante_lactante is null or gestante_lactante in ('nao', 'gestante', 'lactante', 'nao_se_aplica')),
  constraint anamneses_tamanhos check (
    char_length(coalesce(queixa_principal, '')) <= 3000 and char_length(coalesce(historico_medico, '')) <= 5000
    and char_length(coalesce(medicamentos, '')) <= 3000 and char_length(coalesce(alergias, '')) <= 3000
    and char_length(coalesce(cirurgias_previas, '')) <= 3000 and char_length(coalesce(habitos, '')) <= 3000
    and char_length(coalesce(outras_informacoes, '')) <= 5000)
);
create index anamneses_paciente on public.anamneses (company_id, customer_id, criado_em desc);

-- 2) Evolução: um registro por atendimento. "Complemento" aponta para o registro que complementa.
create table public.evolucoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  data_atendimento date not null default current_date,
  tipo text not null default 'consulta',
  titulo text,
  descricao text not null,
  conduta text,
  profissional_id uuid references public.profissionais(id),
  agendamento_id uuid references public.agendamentos(id),
  retifica_id uuid references public.evolucoes(id),
  criado_por uuid not null,
  criado_por_nome text not null,
  criado_em timestamptz not null default now(),
  constraint evolucoes_tipo check (tipo in ('consulta', 'retorno', 'procedimento', 'exame', 'cirurgia', 'outro')),
  constraint evolucoes_tamanhos check (
    char_length(descricao) between 1 and 10000 and char_length(coalesce(titulo, '')) <= 200 and char_length(coalesce(conduta, '')) <= 5000)
);
create index evolucoes_paciente on public.evolucoes (company_id, customer_id, data_atendimento desc, criado_em desc);

-- 3) Registro de acessos (quem abriu ou gravou, e quando). Sem chave estrangeira no paciente: o registro permanece.
create table public.prontuario_acessos (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid,
  user_id uuid not null,
  user_nome text not null,
  papel text not null,
  acao text not null check (acao in ('abriu', 'salvou_anamnese', 'registrou_evolucao', 'exportou')),
  criado_em timestamptz not null default now()
);
create index prontuario_acessos_empresa on public.prontuario_acessos (company_id, criado_em desc);

-- 4) Sem acesso direto: RLS ligado, sem nenhuma política, e sem permissão para os papéis do site
alter table public.anamneses enable row level security;
alter table public.evolucoes enable row level security;
alter table public.prontuario_acessos enable row level security;
revoke all on public.anamneses, public.evolucoes, public.prontuario_acessos from public, anon, authenticated;

-- 5) Os registros do prontuário não podem ser alterados (nem pelo servidor)
create or replace function public.prontuario_bloquear_alteracao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Registros do prontuário não podem ser alterados. Crie uma nova versão ou um complemento.' using errcode = '42501';
end $$;
create trigger anamneses_sem_alteracao before update on public.anamneses for each row execute function public.prontuario_bloquear_alteracao();
create trigger evolucoes_sem_alteracao before update on public.evolucoes for each row execute function public.prontuario_bloquear_alteracao();
create trigger acessos_sem_alteracao before update on public.prontuario_acessos for each row execute function public.prontuario_bloquear_alteracao();

-- 6) Quem está acessando: confere o papel (dono ou profissional) e devolve empresa, usuário e nome
create or replace function public.prontuario_ator(out v_company uuid, out v_user uuid, out v_nome text, out v_papel text)
language plpgsql stable security definer set search_path = '' as $$
begin
  v_user := auth.uid();
  v_company := public.my_company_id();
  v_papel := public.meu_papel();
  if v_user is null or v_company is null or v_papel is null or v_papel not in ('dono', 'profissional') then
    raise exception 'Você não tem permissão para acessar o prontuário.' using errcode = '42501';
  end if;
  v_nome := coalesce(
    (select nullif(btrim(m.nome), '') from public.membros m where m.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user),
    'Usuário');
end $$;
revoke execute on function public.prontuario_ator() from public, anon, authenticated;

-- 7) Abrir o prontuário de um paciente (registra o acesso; no máximo uma vez a cada 5 minutos por pessoa e paciente)
create or replace function public.prontuario_abrir(p_customer uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.prontuario_ator();
  if not exists (select 1 from public.customers c where c.id = p_customer and c.company_id = a.v_company) then
    raise exception 'Paciente não encontrado.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.prontuario_acessos x
    where x.company_id = a.v_company and x.customer_id = p_customer and x.user_id = a.v_user and x.acao = 'abriu' and x.criado_em > now() - interval '5 minutes'
  ) then
    insert into public.prontuario_acessos (company_id, customer_id, user_id, user_nome, papel, acao)
    values (a.v_company, p_customer, a.v_user, a.v_nome, a.v_papel, 'abriu');
  end if;
  return jsonb_build_object(
    'anamnese_versoes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc, x.id desc)
      from (select id, queixa_principal, historico_medico, medicamentos, alergias, cirurgias_previas, habitos, gestante_lactante, outras_informacoes, criado_por_nome, criado_em
            from public.anamneses where company_id = a.v_company and customer_id = p_customer
            order by criado_em desc, id desc limit 50) x), '[]'::jsonb),
    'evolucoes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data_atendimento desc, x.criado_em desc, x.id desc)
      from (select id, data_atendimento, tipo, titulo, descricao, conduta, profissional_id, agendamento_id, retifica_id, criado_por_nome, criado_em
            from public.evolucoes where company_id = a.v_company and customer_id = p_customer
            order by data_atendimento desc, criado_em desc, id desc limit 500) x), '[]'::jsonb),
    'consultas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.inicio desc)
      from (select ag.id, ag.inicio, ag.status, ag.tipo, s.nome as servico, p.nome as profissional
            from public.agendamentos ag
            left join public.servicos s on s.id = ag.servico_id
            left join public.profissionais p on p.id = ag.profissional_id
            where ag.company_id = a.v_company and ag.customer_id = p_customer
            order by ag.inicio desc limit 200) x), '[]'::jsonb));
end $$;

-- 8) Salvar a anamnese (sempre uma nova versão)
create or replace function public.prontuario_salvar_anamnese(p_customer uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_id uuid;
  v_gest text := nullif(btrim(coalesce(p ->> 'gestante_lactante', '')), '');
begin
  select * into a from public.prontuario_ator();
  if not exists (select 1 from public.customers c where c.id = p_customer and c.company_id = a.v_company) then
    raise exception 'Paciente não encontrado.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  if v_gest is not null and v_gest not in ('nao', 'gestante', 'lactante', 'nao_se_aplica') then
    raise exception 'Valor inválido em gestante/lactante.' using errcode = '22023';
  end if;
  if v_gest is null and not exists (
    select 1 from unnest(array['queixa_principal', 'historico_medico', 'medicamentos', 'alergias', 'cirurgias_previas', 'habitos', 'outras_informacoes']) c
    where nullif(btrim(coalesce(p ->> c, '')), '') is not null
  ) then
    raise exception 'Preencha ao menos um campo da anamnese.' using errcode = '22023';
  end if;
  insert into public.anamneses (company_id, customer_id, queixa_principal, historico_medico, medicamentos, alergias, cirurgias_previas, habitos, gestante_lactante, outras_informacoes, criado_por, criado_por_nome)
  values (a.v_company, p_customer,
    nullif(btrim(coalesce(p ->> 'queixa_principal', '')), ''), nullif(btrim(coalesce(p ->> 'historico_medico', '')), ''),
    nullif(btrim(coalesce(p ->> 'medicamentos', '')), ''), nullif(btrim(coalesce(p ->> 'alergias', '')), ''),
    nullif(btrim(coalesce(p ->> 'cirurgias_previas', '')), ''), nullif(btrim(coalesce(p ->> 'habitos', '')), ''),
    v_gest, nullif(btrim(coalesce(p ->> 'outras_informacoes', '')), ''), a.v_user, a.v_nome)
  returning id into v_id;
  insert into public.prontuario_acessos (company_id, customer_id, user_id, user_nome, papel, acao)
  values (a.v_company, p_customer, a.v_user, a.v_nome, a.v_papel, 'salvou_anamnese');
  return v_id;
end $$;

-- 9) Registrar a evolução de um atendimento (ou um complemento a um registro anterior)
create or replace function public.prontuario_registrar_evolucao(p_customer uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_id uuid;
  v_desc text;
  v_tipo text := coalesce(nullif(btrim(coalesce(p ->> 'tipo', '')), ''), 'consulta');
  v_data date;
  v_prof uuid := nullif(btrim(coalesce(p ->> 'profissional_id', '')), '')::uuid;
  v_ag uuid := nullif(btrim(coalesce(p ->> 'agendamento_id', '')), '')::uuid;
  v_ret uuid := nullif(btrim(coalesce(p ->> 'retifica_id', '')), '')::uuid;
begin
  select * into a from public.prontuario_ator();
  if not exists (select 1 from public.customers c where c.id = p_customer and c.company_id = a.v_company) then
    raise exception 'Paciente não encontrado.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  v_desc := nullif(btrim(coalesce(p ->> 'descricao', '')), '');
  if v_desc is null then
    raise exception 'Descreva o atendimento.' using errcode = '22023';
  end if;
  if v_tipo not in ('consulta', 'retorno', 'procedimento', 'exame', 'cirurgia', 'outro') then
    raise exception 'Tipo de atendimento inválido.' using errcode = '22023';
  end if;
  v_data := coalesce(nullif(btrim(coalesce(p ->> 'data_atendimento', '')), '')::date, current_date);
  if v_data > current_date + 1 then
    raise exception 'A data do atendimento não pode ser futura.' using errcode = '22023';
  end if;
  if v_prof is not null and not exists (select 1 from public.profissionais x where x.id = v_prof and x.company_id = a.v_company) then
    raise exception 'Profissional não encontrado.' using errcode = 'P0002';
  end if;
  if v_ag is not null and not exists (select 1 from public.agendamentos x where x.id = v_ag and x.company_id = a.v_company and x.customer_id = p_customer) then
    raise exception 'Consulta não encontrada para este paciente.' using errcode = 'P0002';
  end if;
  if v_ret is not null and not exists (select 1 from public.evolucoes x where x.id = v_ret and x.company_id = a.v_company and x.customer_id = p_customer) then
    raise exception 'Registro a complementar não encontrado.' using errcode = 'P0002';
  end if;
  insert into public.evolucoes (company_id, customer_id, data_atendimento, tipo, titulo, descricao, conduta, profissional_id, agendamento_id, retifica_id, criado_por, criado_por_nome)
  values (a.v_company, p_customer, v_data, v_tipo, nullif(btrim(coalesce(p ->> 'titulo', '')), ''), v_desc,
    nullif(btrim(coalesce(p ->> 'conduta', '')), ''), v_prof, v_ag, v_ret, a.v_user, a.v_nome)
  returning id into v_id;
  insert into public.prontuario_acessos (company_id, customer_id, user_id, user_nome, papel, acao)
  values (a.v_company, p_customer, a.v_user, a.v_nome, a.v_papel, 'registrou_evolucao');
  return v_id;
end $$;

-- 10) Registro de acessos (só o dono vê)
create or replace function public.prontuario_auditoria(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.meu_papel() is distinct from 'dono' then
    raise exception 'Só o dono da conta vê o registro de acessos.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.id desc)
    from (select ac.id, ac.criado_em, ac.user_nome, ac.papel, ac.acao, ac.customer_id, c.name as paciente
          from public.prontuario_acessos ac
          left join public.customers c on c.id = ac.customer_id
          where ac.company_id = public.my_company_id()
          order by ac.id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb);
end $$;

-- 11) Exportar todo o prontuário da clínica (só o dono; fica registrado)
create or replace function public.prontuario_exportar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.prontuario_ator();
  if a.v_papel <> 'dono' then
    raise exception 'Só o dono da conta exporta o prontuário.' using errcode = '42501';
  end if;
  insert into public.prontuario_acessos (company_id, customer_id, user_id, user_nome, papel, acao)
  values (a.v_company, null, a.v_user, a.v_nome, a.v_papel, 'exportou');
  return jsonb_build_object(
    'anamneses', coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em) from (select id, customer_id, queixa_principal, historico_medico, medicamentos, alergias, cirurgias_previas, habitos, gestante_lactante, outras_informacoes, criado_por_nome, criado_em from public.anamneses where company_id = a.v_company) x), '[]'::jsonb),
    'evolucoes', coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em) from (select id, customer_id, data_atendimento, tipo, titulo, descricao, conduta, profissional_id, agendamento_id, retifica_id, criado_por_nome, criado_em from public.evolucoes where company_id = a.v_company) x), '[]'::jsonb));
end $$;

-- 12) Quem pode chamar: só usuários logados (cada função confere o papel por dentro)
revoke execute on function public.prontuario_abrir(uuid), public.prontuario_salvar_anamnese(uuid, jsonb), public.prontuario_registrar_evolucao(uuid, jsonb),
  public.prontuario_auditoria(integer), public.prontuario_exportar() from public, anon;
grant execute on function public.prontuario_abrir(uuid), public.prontuario_salvar_anamnese(uuid, jsonb), public.prontuario_registrar_evolucao(uuid, jsonb),
  public.prontuario_auditoria(integer), public.prontuario_exportar() to authenticated;

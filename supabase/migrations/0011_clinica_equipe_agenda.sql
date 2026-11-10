-- 0011 — Coraline AI para clínicas: equipe com logins e papéis, agenda e funil de pacientes.
-- Só acrescenta (nenhum dado é apagado). Papéis: "dono" (dono da conta da clínica), "recepcao" e "profissional".

-- 1) EQUIPE ---------------------------------------------------------------------------------------
create table if not exists public.membros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  papel text not null check (papel in ('recepcao', 'profissional')),
  nome text check (char_length(coalesce(nome, '')) <= 120),
  email text check (char_length(coalesce(email, '')) <= 254),
  criado_em timestamptz not null default now()
);
create index if not exists membros_company on public.membros(company_id);

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  papel text not null check (papel in ('recepcao', 'profissional')),
  nome text check (char_length(coalesce(nome, '')) <= 120),
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  unique (company_id, email)
);

-- A clínica do usuário: dona OU membro da equipe (todas as regras de acesso usam esta função)
create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.companies where owner_id = auth.uid()),
    (select company_id from public.membros where user_id = auth.uid())
  )
$$;

-- Papel do usuário na clínica
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.companies where owner_id = auth.uid()) then 'dono'
    else (select papel from public.membros where user_id = auth.uid()) end
$$;
revoke execute on function public.meu_papel() from public, anon;
grant execute on function public.meu_papel() to authenticated, service_role;

-- Aceita o convite pendente para o e-mail da conta (chamado no primeiro acesso de quem foi convidado)
create or replace function public.aceitar_convite() returns text
language plpgsql security definer set search_path = public as $$
declare c record; v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then return null; end if;
  if exists (select 1 from public.companies where owner_id = auth.uid()) or exists (select 1 from public.membros where user_id = auth.uid()) then
    return null;
  end if;
  select * into c from public.convites where lower(email) = v_email and aceito_em is null order by criado_em desc limit 1;
  if not found then return null; end if;
  insert into public.membros (user_id, company_id, papel, nome, email) values (auth.uid(), c.company_id, c.papel, c.nome, v_email);
  update public.convites set aceito_em = now() where id = c.id;
  return (select name from public.companies where id = c.company_id);
end $$;
revoke execute on function public.aceitar_convite() from public, anon;
grant execute on function public.aceitar_convite() to authenticated;

-- Convite pendente para o e-mail da conta (para a tela de boas-vindas)
create or replace function public.convite_pendente() returns table (clinica text, papel text)
language sql stable security definer set search_path = public as $$
  select co.name, c.papel from public.convites c join public.companies co on co.id = c.company_id
  where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and c.aceito_em is null
  order by c.criado_em desc limit 1
$$;
revoke execute on function public.convite_pendente() from public, anon;
grant execute on function public.convite_pendente() to authenticated;

alter table public.membros enable row level security;
alter table public.convites enable row level security;
revoke all on public.membros, public.convites from anon;
create policy "equipe ve a equipe" on public.membros for select to authenticated
  using (company_id = (select public.my_company_id()));
create policy "dono altera a equipe" on public.membros for update to authenticated
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono')
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono');
-- Remover alguém da equipe é feito pelo servidor (confere se é o dono)
create policy "dono gerencia convites" on public.convites for all to authenticated
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono')
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono');

-- A equipe enxerga os dados da clínica (nome, configurações); só o dono altera
create policy "equipe ve a clinica" on public.companies for select to authenticated
  using (id = (select public.my_company_id()));

-- Restrições por papel nas áreas sensíveis
alter policy "company rows" on public.transactions
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono')
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono');
alter policy "company reads own billing" on public.billing
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono');
alter policy "company rows" on public.sales
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'));
alter policy "company rows" on public.conversations
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'));
alter policy "company rows" on public.messages
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'));
alter policy "company rows" on public.approvals
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'));

-- Conversas com a IA: cada pessoa vê as próprias (as antigas, sem dono, ficam com o dono da clínica)
alter table public.agent_threads add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter policy "company rows" on public.agent_threads
  using (company_id = (select public.my_company_id()) and (user_id = (select auth.uid()) or (user_id is null and (select public.meu_papel()) = 'dono')))
  with check (company_id = (select public.my_company_id()) and user_id = (select auth.uid()));
alter policy "company rows" on public.assistant_messages
  using (company_id = (select public.my_company_id()) and (thread_id is null or exists (select 1 from public.agent_threads t where t.id = thread_id)))
  with check (company_id = (select public.my_company_id()) and (thread_id is null or exists (select 1 from public.agent_threads t where t.id = thread_id)));

-- WhatsApp: desconectar passa a ser feito pelo servidor (que confere se é o dono)
revoke execute on function public.whatsapp_disconnect() from authenticated;

-- 2) AGENDA ---------------------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

create table if not exists public.profissionais (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  especialidade text check (char_length(coalesce(especialidade, '')) <= 120),
  cor text not null default '#48a8fc' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  user_id uuid references auth.users(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists profissionais_company on public.profissionais(company_id);

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  duracao_min integer not null default 30 check (duracao_min between 5 and 600),
  preco numeric(12, 2) check (preco is null or (preco >= 0 and preco < 1000000000)),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists servicos_company on public.servicos(company_id);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  profissional_id uuid references public.profissionais(id) on delete set null,
  servico_id uuid references public.servicos(id) on delete set null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'agendado' check (status in ('agendado', 'confirmado', 'realizado', 'faltou', 'cancelado')),
  tipo text not null default 'consulta' check (tipo in ('consulta', 'retorno', 'procedimento', 'avaliacao')),
  origem text not null default 'manual' check (origem in ('manual', 'whatsapp', 'ia')),
  observacoes text check (char_length(coalesce(observacoes, '')) <= 2000),
  confirmado_em timestamptz,
  lembrete_enviado_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio and fim - inicio <= interval '12 hours'),
  -- O mesmo profissional não pode ter dois horários sobrepostos (agendados ou confirmados)
  constraint agendamentos_sem_conflito exclude using gist (
    profissional_id with =, tstzrange(inicio, fim) with &&
  ) where (status in ('agendado', 'confirmado') and profissional_id is not null)
);
create index if not exists agendamentos_company_inicio on public.agendamentos(company_id, inicio);
create index if not exists agendamentos_customer on public.agendamentos(customer_id);

-- Horários de atendimento e opções da agenda (fuso de Brasília por padrão)
alter table public.companies add column if not exists agenda_config jsonb not null
  default '{"dias":[1,2,3,4,5],"inicio":"08:00","fim":"18:00","intervalo_min":30,"fuso":"-03:00"}'::jsonb;

do $$
declare t text;
begin
  foreach t in array array['profissionais', 'servicos', 'agendamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "company rows" on public.%I for all to authenticated using (company_id = (select public.my_company_id())) with check (company_id = (select public.my_company_id()))', t);
  end loop;
end $$;
-- Profissionais e serviços: só o dono cadastra/altera (a equipe só consulta)
alter policy "company rows" on public.profissionais
  using (company_id = (select public.my_company_id()))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono');
alter policy "company rows" on public.servicos
  using (company_id = (select public.my_company_id()))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) = 'dono');

-- 3) FUNIL DE PACIENTES ---------------------------------------------------------------------------
alter table public.customers add column if not exists etapa text not null default 'novo'
  check (etapa in ('novo', 'contato', 'agendado', 'compareceu', 'orcamento', 'fechado', 'perdido'));
alter table public.customers add column if not exists proximo_contato date;
alter table public.customers add column if not exists origem text
  check (origem is null or origem in ('whatsapp', 'instagram', 'indicacao', 'site', 'google', 'outro'));
alter table public.customers add column if not exists data_nascimento date;
alter table public.customers add column if not exists etapa_em timestamptz not null default now();
-- Pacientes que já compraram entram como "fechado"
update public.customers set etapa = 'fechado' where status in ('active', 'vip') and etapa = 'novo';

-- Data da última mudança de etapa (para medir o funil)
create or replace function public.customers_etapa_em() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.etapa is distinct from old.etapa then new.etapa_em := now(); end if;
  return new;
end $$;
create trigger customers_etapa_em before update on public.customers
  for each row execute function public.customers_etapa_em();

-- Agente SCALABLE: agente central único.
-- Mudanças só aditivas (nenhuma tabela ou dado é apagado).

-- 1) Histórico de conversas em threads (estilo ChatGPT/Claude)
create table if not exists public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_threads_company on public.agent_threads(company_id, updated_at desc);
alter table public.agent_threads enable row level security;
drop policy if exists "company rows" on public.agent_threads;
create policy "company rows" on public.agent_threads for all to authenticated
  using (company_id = (select public.my_company_id())) with check (company_id = (select public.my_company_id()));

alter table public.assistant_messages add column if not exists thread_id uuid references public.agent_threads(id) on delete cascade;
alter table public.assistant_messages add column if not exists meta jsonb;
create index if not exists assistant_messages_thread on public.assistant_messages(thread_id, created_at);

-- Conversas antigas (geral e de cada agente) viram threads, preservando as mensagens
do $$
declare r record; tid uuid;
begin
  for r in
    select company_id, agent_kind, min(created_at) as first_at, max(created_at) as last_at
    from public.assistant_messages where thread_id is null group by company_id, agent_kind
  loop
    insert into public.agent_threads(company_id, title, created_at, updated_at)
    values (r.company_id,
      case r.agent_kind when 'marketing' then 'Conversa anterior · Marketing' when 'sales' then 'Conversa anterior · Vendas'
        when 'finance' then 'Conversa anterior · Financeiro' when 'crm' then 'Conversa anterior · CRM'
        when 'support' then 'Conversa anterior · Atendimento' else 'Conversa anterior' end,
      r.first_at, r.last_at)
    returning id into tid;
    update public.assistant_messages set thread_id = tid
      where company_id = r.company_id and thread_id is null and agent_kind is not distinct from r.agent_kind;
  end loop;
end $$;

-- 2) Central de Aprovações auditável
alter table public.approvals add column if not exists payload jsonb;
alter table public.approvals add column if not exists decided_by uuid references auth.users(id) on delete set null;
alter table public.approvals add column if not exists decided_by_email text;
alter table public.approvals add column if not exists result text;
alter table public.approvals add column if not exists thread_id uuid references public.agent_threads(id) on delete set null;
alter table public.approvals drop constraint if exists approvals_kind_check;
alter table public.approvals add constraint approvals_kind_check check (kind in (
  'whatsapp_reply','whatsapp_outreach','action',
  'campaign_whatsapp','campaign_external','email_send',
  'finance_create','finance_update','sale_create','customer_upsert','record_delete'));

-- 3) Configuração do agente único (substitui os 5 agentes)
alter table public.companies add column if not exists agent_whatsapp boolean not null default true;
alter table public.companies add column if not exists agent_auto_reply boolean not null default true;
alter table public.companies add column if not exists agent_instructions text;
alter table public.companies add column if not exists agent_last_run_at timestamptz;

update public.companies c set
  agent_whatsapp = a.enabled,
  agent_auto_reply = a.auto_reply,
  agent_instructions = coalesce(c.agent_instructions,
    case when nullif(trim(a.personality), '') is not null
          and a.personality <> 'Simpática e objetiva no atendimento do WhatsApp.'
         then 'Atendimento no WhatsApp: ' || a.personality end)
from public.agents a where a.company_id = c.id and a.kind = 'support';

update public.companies c set agent_last_run_at = x.last
from (select company_id, max(last_run_at) as last from public.agents group by company_id) x
where x.company_id = c.id and c.agent_last_run_at is null;

-- 4) Novas empresas não criam mais 5 agentes (a tabela antiga fica preservada, sem uso)
create or replace function public.create_default_agents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.insights(company_id, agent_kind, title, body, priority) values
    (new.id, 'assistant', 'Bem-vindo à Scalable!', 'O Agente SCALABLE já está pronto. Cadastre vendas, clientes e contas, conecte o WhatsApp e converse com o agente para receber análises e recomendações.', 'normal');
  return new;
end $$;
revoke execute on function public.create_default_agents() from public, anon, authenticated;

-- A mensagem automática de boas-vindas antiga falava em "5 agentes": só ela é reescrita (texto do sistema, sem dados do usuário)
update public.insights
set body = 'O Agente SCALABLE já está pronto. Cadastre vendas, clientes e contas, conecte o WhatsApp e converse com o agente para receber análises e recomendações.'
where agent_kind = 'assistant' and body like 'Seus 5 agentes já estão prontos.%';

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_threads') then
    alter publication supabase_realtime add table public.agent_threads;
  end if;
end $$;

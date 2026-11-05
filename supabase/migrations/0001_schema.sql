-- Scalablee: esquema principal
create extension if not exists pgcrypto;

-- Empresas (1 por usuário dono)
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  segment text,
  description text,
  website text,
  instagram text,
  site_analysis jsonb,
  site_analyzed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Agentes de IA
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('marketing','sales','finance','crm','support')),
  name text not null,
  avatar_url text,
  personality text,
  enabled boolean not null default true,
  auto_reply boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, kind)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  status text not null default 'lead' check (status in ('lead','active','inactive','vip')),
  notes text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.customers(company_id);
create unique index customers_company_phone on public.customers(company_id, phone) where phone is not null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'paid' check (status in ('paid','pending','cancelled')),
  sold_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.sales(company_id, sold_at);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  description text not null,
  category text,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null default current_date,
  paid_at date,
  created_at timestamptz not null default now()
);
create index on public.transactions(company_id, due_date);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_kind text check (agent_kind in ('marketing','sales','finance','crm','support')),
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.tasks(company_id, due_date);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_kind text not null check (agent_kind in ('marketing','sales','finance','crm','support','assistant')),
  title text not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  read boolean not null default false,
  sources jsonb,
  created_at timestamptz not null default now()
);
create index on public.insights(company_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  wa_id text not null,
  contact_name text,
  last_message_at timestamptz not null default now(),
  unread integer not null default 0,
  ai_paused boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, wa_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  author text not null check (author in ('customer','agent','owner')),
  body text not null,
  status text not null default 'sent' check (status in ('received','sent','failed','pending_approval','rejected')),
  wa_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index on public.messages(conversation_id, created_at);
create unique index messages_wa_id on public.messages(wa_message_id) where wa_message_id is not null;

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_kind text not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  title text not null,
  reason text,
  draft text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.approvals(company_id, status);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.assistant_messages(company_id, created_at);

-- Credenciais do WhatsApp Business (Cloud API). Token nunca volta ao navegador.
create table public.whatsapp_configs (
  company_id uuid primary key references public.companies(id) on delete cascade,
  phone_number_id text not null unique,
  display_phone text,
  access_token text not null,
  verify_token text not null default encode(gen_random_bytes(16),'hex'),
  connected boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Helper: empresa do usuário logado
create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.companies where owner_id = auth.uid()
$$;

-- RLS
alter table public.companies enable row level security;
create policy "own company" on public.companies for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['agents','customers','sales','transactions','tasks','insights','conversations','messages','approvals','assistant_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "company rows" on public.%I for all to authenticated using (company_id = (select public.my_company_id())) with check (company_id = (select public.my_company_id()))', t);
  end loop;
end $$;

-- whatsapp_configs: sem acesso direto do cliente; usar view/funções abaixo
alter table public.whatsapp_configs enable row level security;

create or replace function public.whatsapp_status()
returns table(phone_number_id text, display_phone text, verify_token text, connected boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select phone_number_id, display_phone, verify_token, connected, updated_at
  from public.whatsapp_configs where company_id = public.my_company_id()
$$;

create or replace function public.whatsapp_save(p_phone_number_id text, p_access_token text, p_display_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.my_company_id();
begin
  if cid is null then raise exception 'Empresa não encontrada'; end if;
  insert into public.whatsapp_configs(company_id, phone_number_id, access_token, display_phone, connected)
  values (cid, p_phone_number_id, p_access_token, p_display_phone, false)
  on conflict (company_id) do update set
    phone_number_id = excluded.phone_number_id,
    access_token = case when coalesce(p_access_token,'') = '' then whatsapp_configs.access_token else excluded.access_token end,
    display_phone = excluded.display_phone,
    connected = false,
    updated_at = now();
end $$;

create or replace function public.whatsapp_disconnect()
returns void language sql security definer set search_path = public as $$
  delete from public.whatsapp_configs where company_id = public.my_company_id()
$$;

revoke all on function public.whatsapp_status() from public, anon;
revoke all on function public.whatsapp_save(text,text,text) from public, anon;
revoke all on function public.whatsapp_disconnect() from public, anon;
grant execute on function public.whatsapp_status() to authenticated;
grant execute on function public.whatsapp_save(text,text,text) to authenticated;
grant execute on function public.whatsapp_disconnect() to authenticated;

-- Ao criar empresa: cria os 5 agentes padrão
create or replace function public.create_default_agents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.agents(company_id, kind, name, personality) values
    (new.id, 'marketing', 'Luna', 'Criativa, antenada em tendências e redes sociais.'),
    (new.id, 'sales', 'Leo', 'Focado em fechar negócios e não deixar cliente esfriar.'),
    (new.id, 'finance', 'Clara', 'Organizada, cuidadosa com o caixa e prazos.'),
    (new.id, 'crm', 'Davi', 'Atencioso com o relacionamento e o pós-venda.'),
    (new.id, 'support', 'Bia', 'Simpática e objetiva no atendimento do WhatsApp.');
  insert into public.insights(company_id, agent_kind, title, body, priority) values
    (new.id, 'assistant', 'Bem-vindo à Scalablee!', 'Seus 5 agentes já estão prontos. Cadastre vendas, clientes e contas, conecte o WhatsApp e clique em "Rodar análise" para receber as primeiras recomendações.', 'normal');
  return new;
end $$;
create trigger companies_default_agents after insert on public.companies
  for each row execute function public.create_default_agents();

-- Realtime
alter publication supabase_realtime add table public.messages, public.conversations, public.approvals, public.insights, public.sales;

-- Storage para fotos dos agentes
insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict do nothing;
create policy "avatar upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select public.my_company_id())::text);
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select public.my_company_id())::text);
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select public.my_company_id())::text);

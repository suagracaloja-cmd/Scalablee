-- Assinaturas (cobrança pelo Asaas). Mudança só aditiva.
-- O dono da empresa só LÊ a própria assinatura; quem altera o status é o servidor (webhook do Asaas),
-- então ninguém consegue se marcar como "pago" pelo navegador.
create table if not exists public.billing (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'trial' check (status in ('trial','active','overdue','canceled')),
  trial_ends_at timestamptz,
  asaas_customer_id text,
  asaas_subscription_id text unique,
  plan_name text,
  value numeric(12,2),
  next_due_date date,
  last_payment_at timestamptz,
  invoice_url text,
  updated_at timestamptz not null default now()
);
alter table public.billing enable row level security;
drop policy if exists "company reads own billing" on public.billing;
create policy "company reads own billing" on public.billing for select to authenticated
  using (company_id = (select public.my_company_id()));

-- Avisos recebidos do Asaas (idempotência e auditoria). Sem políticas: só o servidor acessa.
create table if not exists public.billing_events (
  id text primary key,
  event text not null,
  company_id uuid references public.companies(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;

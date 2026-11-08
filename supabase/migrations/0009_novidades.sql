-- Inscrição GRATUITA para receber novidades da Scalable por e-mail.
-- Não tem relação com o plano pago. Base legal: consentimento (LGPD, art. 7º, I), com prova do aceite
-- (data, texto e versão) e cancelamento a qualquer momento. O dono da Scalable vê a lista no painel do
-- Supabase (Table Editor → inscricoes_novidades); cada cliente só vê a própria inscrição.
create table if not exists public.inscricoes_novidades (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  email text not null,
  status text not null default 'inscrito' check (status in ('inscrito', 'cancelado')),
  consentimento_em timestamptz not null default now(),
  consentimento_texto text not null,
  consentimento_versao text not null,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.inscricoes_novidades enable row level security;

create policy "novidades: ver a propria" on public.inscricoes_novidades
  for select to authenticated using (user_id = auth.uid());

-- Só com o e-mail da própria conta e com a própria empresa
create policy "novidades: assinar" on public.inscricoes_novidades
  for insert to authenticated
  with check (user_id = auth.uid() and email = (auth.jwt() ->> 'email') and (company_id is null or company_id = public.my_company_id()));

create policy "novidades: alterar a propria" on public.inscricoes_novidades
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and email = (auth.jwt() ->> 'email') and (company_id is null or company_id = public.my_company_id()));

revoke all on public.inscricoes_novidades from anon;

comment on table public.inscricoes_novidades is 'Inscrições gratuitas para receber novidades da Scalable por e-mail (consentimento LGPD). Enviar só para status = inscrito.';

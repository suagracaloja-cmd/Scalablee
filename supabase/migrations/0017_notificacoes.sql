-- Notificações no celular (Web Push, gratuito): avisos de nova mensagem do WhatsApp e de aprovação pendente.
--
--  * push_inscricoes: cada aparelho em que alguém ativou as notificações (endereço do serviço de push do
--    navegador + chaves públicas do aparelho). Cada pessoa vê e apaga só as próprias; gravar é pela função.
--  * push_chaves: o par de chaves VAPID da Scalable (identifica o remetente para o Google, a Apple e a Mozilla).
--    Gerado pelo próprio servidor no primeiro uso; a chave privada fica criptografada com a chave do Vault.
--    Só o servidor lê.

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,30}$'),
  whatsapp boolean not null default true,
  aprovacoes boolean not null default true,
  aparelho text check (char_length(coalesce(aparelho, '')) <= 200),
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz,
  falhas integer not null default 0
);
create index if not exists push_inscricoes_company on public.push_inscricoes(company_id);
create index if not exists push_inscricoes_user on public.push_inscricoes(user_id);

alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from anon, authenticated;
grant select, delete on public.push_inscricoes to authenticated;
grant update (whatsapp, aprovacoes) on public.push_inscricoes to authenticated;
create policy "cada um ve os proprios aparelhos" on public.push_inscricoes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "cada um apaga os proprios aparelhos" on public.push_inscricoes for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "cada um escolhe os proprios avisos" on public.push_inscricoes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ativar neste aparelho. Se o mesmo navegador já estava com outra pessoa (aparelho compartilhado),
-- a inscrição passa para quem está entrando agora.
create or replace function public.push_inscrever(
  p_endpoint text, p_p256dh text, p_auth text, p_whatsapp boolean default true, p_aprovacoes boolean default true, p_aparelho text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid := public.my_company_id(); v_id uuid;
begin
  if auth.uid() is null or v_company is null then
    raise exception 'Entre na sua conta para ativar as notificações.' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or char_length(p_endpoint) > 1000 then
    raise exception 'Endereço de notificação inválido.' using errcode = '22023';
  end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,30}$' then
    raise exception 'Chaves de notificação inválidas.' using errcode = '22023';
  end if;
  delete from public.push_inscricoes where endpoint = p_endpoint;
  insert into public.push_inscricoes (user_id, company_id, endpoint, p256dh, auth, whatsapp, aprovacoes, aparelho)
  values (auth.uid(), v_company, p_endpoint, p_p256dh, p_auth, coalesce(p_whatsapp, true), coalesce(p_aprovacoes, true), left(p_aparelho, 200))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.push_inscrever(text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.push_inscrever(text, text, text, boolean, boolean, text) to authenticated;

create table if not exists public.push_chaves (
  id smallint primary key default 1 check (id = 1),
  publica text not null check (publica ~ '^[A-Za-z0-9_-]{80,100}$'),
  privada text not null check (privada like 'enc:v1:%'),
  criado_em timestamptz not null default now()
);
alter table public.push_chaves enable row level security;
revoke all on public.push_chaves from anon, authenticated;

create or replace function public.push_chaves_criar(p_publica text, p_privada text) returns void
language sql security definer set search_path = '' as $$
  insert into public.push_chaves (id, publica, privada) values (1, p_publica, public.cifrar(p_privada))
  on conflict (id) do nothing
$$;
create or replace function public.push_chaves_obter() returns table (publica text, privada text)
language sql stable security definer set search_path = '' as $$
  select publica, public.decifrar(privada) from public.push_chaves where id = 1
$$;
revoke execute on function public.push_chaves_criar(text, text) from public, anon, authenticated;
revoke execute on function public.push_chaves_obter() from public, anon, authenticated;
grant execute on function public.push_chaves_criar(text, text) to service_role;
grant execute on function public.push_chaves_obter() to service_role;

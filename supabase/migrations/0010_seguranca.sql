-- 0010 — Endurecimento de segurança (só acrescenta proteções; não apaga dados).
--
-- 1) Visitante sem login (papel "anon", que usa a chave pública do site) não acessa NENHUMA tabela nem
--    função do schema public. Antes o RLS já bloqueava as linhas; agora nem a permissão existe.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Funções que o usuário logado continua usando (RLS e tela do WhatsApp)
grant execute on function public.my_company_id() to authenticated, service_role;
grant execute on function public.whatsapp_status() to authenticated;
grant execute on function public.whatsapp_has_app_secret() to authenticated;
grant execute on function public.whatsapp_disconnect() to authenticated;
-- whatsapp_save gravaria o token sem criptografia e não é usada pelo site: fica só para o servidor
revoke execute on function public.whatsapp_save(text, text, text) from authenticated;

-- 2) Tabelas só do servidor: o usuário logado não tem permissão nenhuma (antes: só o RLS bloqueava)
do $$
declare t text;
begin
  foreach t in array array['billing_events', 'whatsapp_configs', 'wa_appointments', 'wa_contacts', 'wa_handoffs', 'wa_messages', 'wa_processed_messages'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;
-- Assinatura: o cliente só lê (quem altera é o servidor, com os avisos do Mercado Pago)
revoke all on public.billing from authenticated;
grant select on public.billing to authenticated;
revoke all on public.inscricoes_novidades from authenticated;
grant select, insert, update on public.inscricoes_novidades to authenticated;

-- 3) Criptografia das credenciais do WhatsApp (token de acesso e App Secret).
--    A chave é gerada dentro do banco e guardada no Vault do Supabase (nunca sai do banco nem aparece no código).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'scalable_chave_dados') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'scalable_chave_dados', 'Chave da Scalable para criptografar credenciais. NÃO APAGUE: sem ela os tokens salvos não podem ser lidos.');
  end if;
end $$;

create or replace function public.cifrar(p text) returns text
language sql volatile security definer set search_path = '' as $$
  select case when p is null or p = '' then null
    else 'enc:v1:' || encode(extensions.pgp_sym_encrypt(p, (select decrypted_secret from vault.decrypted_secrets where name = 'scalable_chave_dados'), 'cipher-algo=aes256'), 'base64') end
$$;

create or replace function public.decifrar(p text) returns text
language sql stable security definer set search_path = '' as $$
  select case when p is null or p = '' then null
    when p like 'enc:v1:%' then extensions.pgp_sym_decrypt(decode(substr(p, 8), 'base64'), (select decrypted_secret from vault.decrypted_secrets where name = 'scalable_chave_dados'))
    else p end
$$;

-- Dados antigos sem criptografia (se existirem) passam a ficar criptografados
update public.whatsapp_configs set access_token = public.cifrar(access_token) where access_token not like 'enc:v1:%' and access_token <> '';
update public.whatsapp_configs set app_secret = public.cifrar(app_secret) where app_secret is not null and app_secret <> '' and app_secret not like 'enc:v1:%';

-- Daqui em diante o banco recusa guardar credencial sem criptografia
alter table public.whatsapp_configs add constraint whatsapp_credenciais_cifradas
  check (access_token like 'enc:v1:%' and (app_secret is null or app_secret like 'enc:v1:%'));

-- Salvar e ler as credenciais: só o servidor (Edge Function) pode chamar
create or replace function public.whatsapp_salvar_credenciais(p_company_id uuid, p_phone_number_id text, p_access_token text, p_app_secret text, p_display_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Token ou App Secret vazios mantêm os já salvos
  update public.whatsapp_configs set
    phone_number_id = p_phone_number_id,
    access_token = coalesce(public.cifrar(p_access_token), access_token),
    app_secret = coalesce(public.cifrar(p_app_secret), app_secret),
    display_phone = p_display_phone,
    updated_at = now()
  where company_id = p_company_id;
  if not found then
    insert into public.whatsapp_configs (company_id, phone_number_id, access_token, app_secret, display_phone, connected)
    values (p_company_id, p_phone_number_id, public.cifrar(p_access_token), public.cifrar(p_app_secret), p_display_phone, false);
  end if;
end $$;

create or replace function public.whatsapp_config_empresa(p_company_id uuid)
returns table (company_id uuid, phone_number_id text, access_token text, app_secret text, verify_token text, connected boolean, display_phone text)
language sql stable security definer set search_path = '' as $$
  select c.company_id, c.phone_number_id, public.decifrar(c.access_token), public.decifrar(c.app_secret), c.verify_token, c.connected, c.display_phone
  from public.whatsapp_configs c where c.company_id = p_company_id
$$;

create or replace function public.whatsapp_config_numeros(p_phone_ids text[])
returns table (company_id uuid, phone_number_id text, access_token text, app_secret text, verify_token text, connected boolean, display_phone text)
language sql stable security definer set search_path = '' as $$
  select c.company_id, c.phone_number_id, public.decifrar(c.access_token), public.decifrar(c.app_secret), c.verify_token, c.connected, c.display_phone
  from public.whatsapp_configs c where c.phone_number_id = any (p_phone_ids)
$$;

revoke execute on function public.cifrar(text), public.decifrar(text) from public, anon, authenticated, service_role;
revoke execute on function public.whatsapp_salvar_credenciais(uuid, text, text, text, text), public.whatsapp_config_empresa(uuid), public.whatsapp_config_numeros(text[]) from public, anon, authenticated;
grant execute on function public.whatsapp_salvar_credenciais(uuid, text, text, text, text), public.whatsapp_config_empresa(uuid), public.whatsapp_config_numeros(text[]) to service_role;

-- 4) Limite de tentativas (rate limit) usado pelo servidor em todas as rotas da API
create table if not exists public.limites_uso (
  chave text primary key,
  janela_inicio timestamptz not null default now(),
  contagem integer not null default 0
);
alter table public.limites_uso enable row level security;
revoke all on public.limites_uso from anon, authenticated;

create or replace function public.limite_registrar(p_chave text, p_limite integer, p_janela_segundos integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.limites_uso as l (chave, janela_inicio, contagem) values (p_chave, now(), 1)
  on conflict (chave) do update set
    contagem = case when l.janela_inicio < now() - make_interval(secs => p_janela_segundos) then 1 else l.contagem + 1 end,
    janela_inicio = case when l.janela_inicio < now() - make_interval(secs => p_janela_segundos) then now() else l.janela_inicio end
  returning contagem into v;
  return v <= p_limite;
end $$;
revoke execute on function public.limite_registrar(text, integer, integer) from public, anon, authenticated;
grant execute on function public.limite_registrar(text, integer, integer) to service_role;

-- 5) Uploads: só imagens comuns (sem SVG, que pode carregar código) e até 2 MB
update storage.buckets
  set file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'avatars';

-- 6) Validação no banco: tamanhos máximos e valores possíveis (vale também para gravações feitas direto do
--    navegador). NOT VALID = não reavalia linhas antigas, só o que for gravado daqui em diante.
alter table public.companies add constraint companies_tamanhos check (
  char_length(name) between 1 and 120 and char_length(coalesce(segment, '')) <= 120 and char_length(coalesce(description, '')) <= 2000
  and char_length(coalesce(website, '')) <= 300 and char_length(coalesce(instagram, '')) <= 120 and char_length(coalesce(agent_instructions, '')) <= 4000) not valid;
alter table public.customers add constraint customers_tamanhos check (
  char_length(name) between 1 and 200 and char_length(coalesce(phone, '')) <= 40 and char_length(coalesce(email, '')) <= 254 and char_length(coalesce(notes, '')) <= 5000) not valid;
alter table public.sales add constraint sales_valores check (char_length(description) <= 500 and amount >= 0 and amount < 1000000000) not valid;
alter table public.transactions add constraint transactions_valores check (
  char_length(description) <= 500 and char_length(coalesce(category, '')) <= 100 and abs(amount) < 1000000000) not valid;
alter table public.tasks add constraint tasks_tamanhos check (char_length(title) between 1 and 300 and char_length(coalesce(description, '')) <= 5000) not valid;
alter table public.agent_threads add constraint agent_threads_tamanhos check (char_length(title) <= 300) not valid;
alter table public.assistant_messages add constraint assistant_messages_tamanhos check (char_length(content) <= 200000) not valid;
alter table public.approvals add constraint approvals_tamanhos check (
  char_length(title) <= 500 and char_length(coalesce(reason, '')) <= 5000 and char_length(coalesce(draft, '')) <= 20000) not valid;
alter table public.insights add constraint insights_tamanhos check (char_length(title) <= 500 and char_length(body) <= 20000) not valid;
alter table public.messages add constraint messages_tamanhos check (char_length(body) <= 10000) not valid;
alter table public.conversations add constraint conversations_tamanhos check (char_length(wa_id) <= 32 and char_length(coalesce(contact_name, '')) <= 200) not valid;
alter table public.inscricoes_novidades add constraint inscricoes_novidades_tamanhos check (char_length(email) <= 254 and char_length(consentimento_texto) <= 2000) not valid;

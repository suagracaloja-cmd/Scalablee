-- WhatsApp: App Secret do app da Meta de cada empresa, usado para validar a assinatura
-- (X-Hub-Signature-256) das mensagens recebidas no webhook. Mudança só aditiva.
-- A tabela whatsapp_configs não tem políticas de RLS: só o servidor lê o segredo.
alter table public.whatsapp_configs add column if not exists app_secret text;

-- O navegador só descobre SE existe um App Secret cadastrado (nunca o valor).
create or replace function public.whatsapp_has_app_secret() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(app_secret, '') <> '' from public.whatsapp_configs where company_id = public.my_company_id()),
    false)
$$;
revoke all on function public.whatsapp_has_app_secret() from public, anon;
grant execute on function public.whatsapp_has_app_secret() to authenticated;

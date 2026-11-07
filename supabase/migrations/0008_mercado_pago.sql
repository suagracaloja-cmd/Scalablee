-- Cobrança passa a ser pelo Mercado Pago (substitui o Asaas, que nunca chegou a ser ativado). Só aditiva.
alter table public.billing add column if not exists provider text not null default 'mercadopago';
alter table public.billing add column if not exists subscription_id text unique;
alter table public.billing add column if not exists provider_status text;
alter table public.billing add column if not exists payer_email text;
comment on column public.billing.asaas_customer_id is 'sem uso: a cobrança migrou para o Mercado Pago';
comment on column public.billing.asaas_subscription_id is 'sem uso: a cobrança migrou para o Mercado Pago';

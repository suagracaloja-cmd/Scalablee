-- Conta isenta de cobrança (demonstração ou uso interno): nunca é cobrada nem bloqueada por falta de pagamento.
-- Só o administrador marca (pelo banco); a clínica só consegue ler a própria linha de billing.
alter table public.billing add column if not exists isento boolean not null default false;
comment on column public.billing.isento is 'Conta de demonstração/interna: sem cobrança e sem bloqueio. Marcada só pelo administrador.';

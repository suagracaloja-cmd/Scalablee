-- Atendimentos (clínica particular): a tela "Vendas" passa a registrar cada atendimento pago.
-- O registro continua na tabela public.sales (nada é perdido); ganha o tipo do atendimento e a forma de pagamento.
-- O paciente ganha o CPF (validado pelos dígitos verificadores e único dentro de cada clínica).

-- 1) CPF válido: 11 dígitos, não repetidos, com os dois dígitos verificadores corretos
create or replace function public.cpf_valido(c text) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  s int;
  d int;
  i int;
begin
  if c is null then
    return true;
  end if;
  if c !~ '^[0-9]{11}$' or c = repeat(substr(c, 1, 1), 11) then
    return false;
  end if;
  s := 0;
  for i in 1..9 loop
    s := s + substr(c, i, 1)::int * (11 - i);
  end loop;
  d := (s * 10) % 11;
  if d = 10 then d := 0; end if;
  if d <> substr(c, 10, 1)::int then
    return false;
  end if;
  s := 0;
  for i in 1..10 loop
    s := s + substr(c, i, 1)::int * (12 - i);
  end loop;
  d := (s * 10) % 11;
  if d = 10 then d := 0; end if;
  return d = substr(c, 11, 1)::int;
end $$;
grant execute on function public.cpf_valido(text) to authenticated, service_role;

-- 2) CPF do paciente (só números). Um CPF aparece no máximo uma vez em cada clínica.
alter table public.customers add column if not exists cpf text;
alter table public.customers add constraint customers_cpf_valido check (public.cpf_valido(cpf)) not valid;
create unique index if not exists customers_company_cpf on public.customers (company_id, cpf) where cpf is not null;

-- 3) Atendimento: tipo e forma de pagamento (ambos opcionais, com valores fixos)
alter table public.sales add column if not exists tipo text;
alter table public.sales add constraint sales_tipo check (
  tipo is null or tipo in ('consulta', 'retorno', 'exame', 'procedimento', 'cirurgia', 'outro')) not valid;
alter table public.sales add column if not exists forma_pagamento text;
alter table public.sales add constraint sales_forma_pagamento check (
  forma_pagamento is null or forma_pagamento in ('pix', 'credito', 'debito', 'dinheiro', 'boleto', 'transferencia', 'outro')) not valid;

comment on table public.sales is 'Atendimentos da clínica (antes "vendas"): paciente, o que foi feito, valor, data, situação do pagamento.';
comment on column public.customers.cpf is 'CPF do paciente, só números. Dado pessoal: não vai para a IA.';

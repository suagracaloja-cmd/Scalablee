-- Correções do teste:
--  1) Telefone do paciente: só números, de 10 a 15 dígitos (ex.: 5511912345678). "123" é recusado.
--     A regra vale quando o telefone é gravado ou trocado; cadastros antigos com telefone errado
--     continuam abertos e só precisam corrigir o número quando ele for editado.
--  2) Agenda: a recepção e o dono podem excluir uma consulta CANCELADA ou que ficou SEM PACIENTE
--     (ex.: paciente excluído). Consultas ativas continuam sem exclusão: elas são canceladas.

create or replace function public.customers_valida_telefone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.phone is not null and new.phone !~ '^[0-9]{10,15}$' then
    raise exception 'Telefone inválido: use DDD + número (ex.: 11 91234-5678).' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger customers_valida_telefone before insert or update of phone on public.customers
  for each row execute function public.customers_valida_telefone();

create policy "equipe exclui consulta cancelada ou sem paciente" on public.agendamentos for delete to authenticated
  using (
    company_id = (select public.my_company_id())
    and (select public.meu_papel()) in ('dono', 'recepcao')
    and (status = 'cancelado' or customer_id is null)
  );

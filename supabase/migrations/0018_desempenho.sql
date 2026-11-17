-- Desempenho para crescer (só acrescenta: índices, funções de soma e ajustes de regra; nenhum dado muda).
-- Base: alertas do próprio Supabase (Database Linter) + medições com dados sintéticos de 200 clínicas.

-- 1) Chaves estrangeiras sem índice. Sem índice, apagar um paciente (ou uma conta) faz o banco varrer a tabela
--    INTEIRA de atendimentos, tarefas, conversas etc. de TODAS as clínicas para conferir as ligações.
--    Índices parciais (where ... is not null) ficam pequenos, porque a maioria dessas colunas fica vazia.
create index if not exists sales_customer_id on public.sales(customer_id) where customer_id is not null;
create index if not exists tasks_customer_id on public.tasks(customer_id) where customer_id is not null;
create index if not exists conversations_customer_id on public.conversations(customer_id) where customer_id is not null;
create index if not exists approvals_customer_id on public.approvals(customer_id) where customer_id is not null;
create index if not exists approvals_conversation_id on public.approvals(conversation_id) where conversation_id is not null;
create index if not exists approvals_message_id on public.approvals(message_id) where message_id is not null;
create index if not exists approvals_thread_id on public.approvals(thread_id) where thread_id is not null;
create index if not exists approvals_decided_by on public.approvals(decided_by) where decided_by is not null;
create index if not exists messages_company_created on public.messages(company_id, created_at desc);
create index if not exists anamneses_customer_id on public.anamneses(customer_id);
create index if not exists evolucoes_customer_id on public.evolucoes(customer_id);
create index if not exists evolucoes_agendamento_id on public.evolucoes(agendamento_id) where agendamento_id is not null;
create index if not exists evolucoes_profissional_id on public.evolucoes(profissional_id) where profissional_id is not null;
create index if not exists evolucoes_retifica_id on public.evolucoes(retifica_id) where retifica_id is not null;
create index if not exists agendamentos_servico_id on public.agendamentos(servico_id) where servico_id is not null;
create index if not exists agendamentos_criado_por on public.agendamentos(criado_por) where criado_por is not null;
create index if not exists agent_threads_user_id on public.agent_threads(user_id) where user_id is not null;
create index if not exists profissionais_user_id on public.profissionais(user_id) where user_id is not null;
create index if not exists convites_criado_por on public.convites(criado_por) where criado_por is not null;
create index if not exists billing_events_company_id on public.billing_events(company_id) where company_id is not null;
create index if not exists inscricoes_novidades_company_id on public.inscricoes_novidades(company_id) where company_id is not null;

-- 2) Listas ordenadas que as telas pedem (sem ordenar a lista toda da clínica a cada abertura)
create index if not exists customers_company_criado on public.customers(company_id, created_at desc);
create index if not exists approvals_company_status_criado on public.approvals(company_id, status, created_at desc);
create index if not exists conversations_company_ultima on public.conversations(company_id, last_message_at desc);

-- 3) Regras de acesso das "novidades" calculavam auth.uid() a cada linha (alerta auth_rls_initplan).
--    Mesma regra, agora calculada uma vez por consulta.
create or replace function pg_temp.uma_vez(expr text) returns text language plpgsql as $f$
begin
  if expr is null then return null; end if;
  if expr !~* 'select\s+auth\.uid\(\)' then expr := regexp_replace(expr, 'auth\.uid\(\)', '(select auth.uid())', 'g'); end if;
  if expr !~* 'select\s+auth\.jwt\(\)' then expr := regexp_replace(expr, 'auth\.jwt\(\)', '(select auth.jwt())', 'g'); end if;
  if expr !~* 'select\s+(public\.)?my_company_id\(\)' then expr := regexp_replace(expr, '(public\.)?my_company_id\(\)', '(select public.my_company_id())', 'g'); end if;
  return expr;
end $f$;
do $$
declare p record;
begin
  for p in select policyname, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'inscricoes_novidades' loop
    if p.qual is not null and pg_temp.uma_vez(p.qual) <> p.qual then
      execute format('alter policy %I on public.inscricoes_novidades using (%s)', p.policyname, pg_temp.uma_vez(p.qual));
    end if;
    if p.with_check is not null and pg_temp.uma_vez(p.with_check) <> p.with_check then
      execute format('alter policy %I on public.inscricoes_novidades with check (%s)', p.policyname, pg_temp.uma_vez(p.with_check));
    end if;
  end loop;
end $$;

-- 4) Somas feitas no banco (em vez de baixar milhares de atendimentos para somar no navegador).
--    SECURITY INVOKER: valem as mesmas regras de acesso (RLS) de quem chama — cada clínica só soma o que é dela.
create or replace function public.atendimentos_por_paciente()
returns table (customer_id uuid, total numeric, ultimo date)
language sql stable security invoker set search_path = '' as $$
  select s.customer_id, sum(s.amount), max(s.sold_at)
  from public.sales s
  where s.status = 'paid' and s.customer_id is not null
  group by s.customer_id
$$;

create or replace function public.atendimentos_soma(p_status text, p_desde date default null)
returns table (total numeric, quantidade bigint)
language sql stable security invoker set search_path = '' as $$
  -- coalesce(...,'-infinity') em vez de "p_desde is null or ...": assim o banco usa o índice de data
  select coalesce(sum(s.amount), 0), count(*)
  from public.sales s
  where s.status = p_status and s.sold_at >= coalesce(p_desde, '-infinity'::date)
$$;

-- Início: totais por dia e por situação, os mais vendidos e os 6 atendimentos mais recentes (com o nome do
-- paciente), já somados no banco. Antes o navegador baixava todos os atendimentos de 150 dias para somar.
create or replace function public.painel_atendimentos(p_desde date, p_produtos_desde date)
returns json
language sql stable security invoker set search_path = '' as $$
  select json_build_object(
    'dias', coalesce((
      select json_agg(json_build_object('dia', d.sold_at, 'status', d.status, 'total', d.total, 'qtd', d.qtd) order by d.sold_at)
      from (select s.sold_at, s.status, sum(s.amount) as total, count(*) as qtd from public.sales s where s.sold_at >= p_desde group by s.sold_at, s.status) d
    ), '[]'::json),
    'produtos', coalesce((
      select json_agg(json_build_object('descricao', p.description, 'total', p.total) order by p.total desc)
      from (select s.description, sum(s.amount) as total from public.sales s where s.sold_at >= p_produtos_desde and s.status <> 'cancelled' group by s.description) p
    ), '[]'::json),
    'recentes', coalesce((
      select json_agg(r)
      from (
        select s.id, s.customer_id, s.description, s.amount, s.status, s.sold_at, s.created_at, c.name as paciente
        from public.sales s left join public.customers c on c.id = s.customer_id
        where s.sold_at >= p_desde and s.status <> 'cancelled'
        order by s.sold_at desc, s.created_at desc, s.id desc
        limit 6
      ) r
    ), '[]'::json)
  )
$$;
revoke execute on function public.painel_atendimentos(date, date) from public, anon;
grant execute on function public.painel_atendimentos(date, date) to authenticated;

-- Índices de cobertura: as somas leem só o índice, sem abrir cada linha da tabela
create index if not exists sales_company_status_data on public.sales(company_id, status, sold_at) include (amount);
create index if not exists sales_pagos_por_paciente on public.sales(company_id, customer_id) include (amount, sold_at)
  where status = 'paid' and customer_id is not null;

revoke execute on function public.atendimentos_por_paciente() from public, anon;
revoke execute on function public.atendimentos_soma(text, date) from public, anon;
grant execute on function public.atendimentos_por_paciente() to authenticated;
grant execute on function public.atendimentos_soma(text, date) to authenticated;

-- 5) Limite de tentativas: a tabela crescia para sempre (uma linha por rota e pessoa).
--    De vez em quando (≈1 a cada 200 chamadas) apaga as janelas vencidas há mais de 1 dia.
create or replace function public.limite_registrar(p_chave text, p_limite integer, p_janela_segundos integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.limites_uso as l (chave, janela_inicio, contagem) values (p_chave, now(), 1)
  on conflict (chave) do update set
    contagem = case when l.janela_inicio < now() - make_interval(secs => p_janela_segundos) then 1 else l.contagem + 1 end,
    janela_inicio = case when l.janela_inicio < now() - make_interval(secs => p_janela_segundos) then now() else l.janela_inicio end
  returning contagem into v;
  if random() < 0.005 then
    delete from public.limites_uso where janela_inicio < now() - interval '1 day';
  end if;
  return v <= p_limite;
end $$;
revoke execute on function public.limite_registrar(text, integer, integer) from public, anon, authenticated;
grant execute on function public.limite_registrar(text, integer, integer) to service_role;

-- ⚠️  SÓ PARA EMERGÊNCIA. NÃO FOI EXECUTADO. Rodar apenas com autorização expressa da responsável pela Scalable.
--
-- Desfaz a migração 0018 (desempenho). NÃO APAGA NENHUM DADO: remove só índices e funções de soma
-- e devolve as regras de acesso das "novidades" ao texto exato que estava na produção antes da 0018.
--
-- ANTES de rodar: volte o site para a versão anterior (Vercel → Deployments → versão anterior → "Promote"),
-- porque o site novo usa as funções painel_atendimentos, atendimentos_soma e atendimentos_por_paciente;
-- sem elas, Início, Pacientes e Financeiro do site novo deixam de carregar.
--
-- Testado no banco local: depois deste arquivo, a estrutura volta a ser idêntica à de antes da 0018.

begin;

drop function if exists public.painel_atendimentos(date, date);
drop function if exists public.atendimentos_soma(text, date);
drop function if exists public.atendimentos_por_paciente();

drop index if exists public.sales_customer_id;
drop index if exists public.tasks_customer_id;
drop index if exists public.conversations_customer_id;
drop index if exists public.approvals_customer_id;
drop index if exists public.approvals_conversation_id;
drop index if exists public.approvals_message_id;
drop index if exists public.approvals_thread_id;
drop index if exists public.approvals_decided_by;
drop index if exists public.messages_company_created;
drop index if exists public.anamneses_customer_id;
drop index if exists public.evolucoes_customer_id;
drop index if exists public.evolucoes_agendamento_id;
drop index if exists public.evolucoes_profissional_id;
drop index if exists public.evolucoes_retifica_id;
drop index if exists public.agendamentos_servico_id;
drop index if exists public.agendamentos_criado_por;
drop index if exists public.agent_threads_user_id;
drop index if exists public.profissionais_user_id;
drop index if exists public.convites_criado_por;
drop index if exists public.billing_events_company_id;
drop index if exists public.inscricoes_novidades_company_id;
drop index if exists public.customers_company_criado;
drop index if exists public.approvals_company_status_criado;
drop index if exists public.conversations_company_ultima;
drop index if exists public.sales_company_status_data;
drop index if exists public.sales_pagos_por_paciente;

-- Regras das "novidades": texto lido da produção em 18/11/2026, antes da 0018
alter policy "novidades: alterar a propria" on public.inscricoes_novidades
  using (user_id = auth.uid())
  with check ((user_id = auth.uid()) and (email = (auth.jwt() ->> 'email'::text)) and ((company_id is null) or (company_id = public.my_company_id())));
alter policy "novidades: assinar" on public.inscricoes_novidades
  with check ((user_id = auth.uid()) and (email = (auth.jwt() ->> 'email'::text)) and ((company_id is null) or (company_id = public.my_company_id())));
alter policy "novidades: ver a propria" on public.inscricoes_novidades
  using (user_id = auth.uid());

commit;

-- Dados sintéticos de crescimento (só no banco de teste "carga"). Sem gatilhos durante a carga, para ser rápido.
\timing on
set session_replication_role = replica;
\set N 200
create temp table cl as select g as n, ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid as id,
  ('10000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid as dono,
  ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid as recep,
  ('30000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid as prof
from generate_series(1, :N) g;
insert into auth.users(id, email) select dono, 'dono' || n || '@carga.test' from cl union all select recep, 'recep' || n || '@carga.test' from cl union all select prof, 'prof' || n || '@carga.test' from cl;
insert into public.companies(id, owner_id, name, segment) select id, dono, 'Clínica ' || n, 'Odontologia' from cl;
insert into public.membros(user_id, company_id, papel, nome) select recep, id, 'recepcao', 'Recepção ' || n from cl union all select prof, id, 'profissional', 'Dra. ' || n from cl;
insert into public.billing(company_id, status, trial_ends_at) select id, 'active', now() + interval '30 days' from cl;
-- pacientes
insert into public.customers(company_id, name, phone, email, status, etapa, created_at, last_contact_at)
select c.id, 'Paciente ' || c.n || '-' || g, '55119' || lpad((c.n * 10000 + g)::text, 8, '0'), 'p' || g || '@x.test',
  (array['lead','active','inactive','vip'])[1 + g % 4], (array['novo','contato','agendado','compareceu','orcamento','fechado','perdido'])[1 + g % 7],
  now() - (g % 730) * interval '1 day', now() - (g % 90) * interval '1 day'
from cl c, generate_series(1, 1500) g;
create temp table pac as select company_id, array_agg(id) ids from public.customers group by company_id;
-- atendimentos (2 anos)
insert into public.sales(company_id, customer_id, description, amount, status, sold_at, created_at, tipo, forma_pagamento)
select c.id, p.ids[1 + (g * 7919) % 1500], (array['Consulta','Limpeza','Clareamento','Restauração','Canal','Extração','Avaliação'])[1 + g % 7],
  (80 + (g * 37) % 900)::numeric, (array['paid','paid','paid','pending','cancelled'])[1 + g % 5], current_date - (g % 730), now() - (g % 730) * interval '1 day',
  (array['consulta','retorno','exame','procedimento'])[1 + g % 4], (array['pix','credito','debito','dinheiro'])[1 + g % 4]
from cl c join pac p on p.company_id = c.id, generate_series(1, 6000) g;
-- financeiro
insert into public.transactions(company_id, type, description, category, amount, due_date, paid_at, created_at)
select c.id, case when g % 5 = 0 then 'income' else 'expense' end, 'Lançamento ' || g, (array['Fornecedores','Aluguel','Salários','Impostos','Outros'])[1 + g % 5],
  (50 + (g * 13) % 3000)::numeric, current_date - (g % 400) + 30, case when g % 4 = 0 then null else current_date - (g % 400) + 30 end, now() - (g % 400) * interval '1 day'
from cl c, generate_series(1, 1000) g;
-- agenda (1 ano para trás, 30 dias para frente), sem profissional fixo para não esbarrar na regra de horário
insert into public.agendamentos(company_id, customer_id, inicio, fim, status, tipo, origem, criado_em)
select c.id, p.ids[1 + (g * 31) % 1500], date_trunc('hour', now()) - ((g % 395) - 30) * interval '1 day' + (g % 10) * interval '1 hour',
  date_trunc('hour', now()) - ((g % 395) - 30) * interval '1 day' + (g % 10) * interval '1 hour' + interval '30 minutes',
  (array['agendado','confirmado','realizado','faltou','cancelado'])[1 + g % 5], 'consulta', 'manual', now() - (g % 395) * interval '1 day'
from cl c join pac p on p.company_id = c.id, generate_series(1, 6000) g;
-- WhatsApp: 150 conversas x 40 mensagens
insert into public.conversations(company_id, customer_id, wa_id, contact_name, last_message_at, unread)
select c.id, p.ids[g], '55119' || lpad((c.n * 10000 + g)::text, 8, '0'), 'Paciente ' || c.n || '-' || g, now() - (g % 60) * interval '1 hour', g % 3
from cl c join pac p on p.company_id = c.id, generate_series(1, 150) g;
insert into public.messages(company_id, conversation_id, direction, author, body, status, created_at)
select v.company_id, v.id, case when g % 2 = 0 then 'in' else 'out' end, case when g % 2 = 0 then 'customer' else 'agent' end,
  'Mensagem de teste número ' || g || ' com um texto de tamanho realista para a conversa.', case when g % 2 = 0 then 'received' else 'sent' end,
  now() - (40 - g) * interval '10 minutes'
from public.conversations v, generate_series(1, 40) g;
-- tarefas, notificações, aprovações
insert into public.tasks(company_id, agent_kind, title, due_date, done, created_at)
select c.id, 'crm', 'Tarefa ' || g, current_date + (g % 30) - 10, g % 3 = 0, now() - (g % 200) * interval '1 day' from cl c, generate_series(1, 300) g;
insert into public.insights(company_id, agent_kind, title, body, priority, read, created_at)
select c.id, 'finance', 'Alerta ' || g, 'Texto do alerta ' || g, (array['low','normal','high'])[1 + g % 3], g % 4 <> 0, now() - g * interval '1 day' from cl c, generate_series(1, 200) g;
insert into public.approvals(company_id, agent_kind, kind, title, status, created_at)
select c.id, 'sales', 'whatsapp_outreach', 'Enviar mensagem ' || g, case when g <= 10 then 'pending' else 'approved' end, now() - g * interval '1 day' from cl c, generate_series(1, 100) g;
-- estoque
insert into public.estoque_itens(company_id, nome, categoria, unidade, quantidade, minimo, validade)
select c.id, 'Item ' || g, (array['Descartáveis','Medicamentos','Materiais clínicos'])[1 + g % 3], 'caixa', (g * 7) % 50, 5, current_date + (g % 400) - 30 from cl c, generate_series(1, 150) g;
insert into public.estoque_movimentos(company_id, item_id, tipo, quantidade, saldo, motivo, criado_em)
select i.company_id, i.id, case when g % 3 = 0 then 'entrada' else 'saida' end, 1 + g % 5, 10, 'Uso', now() - g * interval '1 day'
from public.estoque_itens i, generate_series(1, 10) g;
set session_replication_role = origin;
\timing off
vacuum analyze;
select relname as tabela, n_live_tup as linhas, pg_size_pretty(pg_total_relation_size(relid)) as tamanho from pg_stat_user_tables where schemaname = 'public' and n_live_tup > 0 order by pg_total_relation_size(relid) desc limit 12;
select pg_size_pretty(pg_database_size('carga')) as banco_total, pg_size_pretty(pg_database_size('carga') / 200) as por_clinica;

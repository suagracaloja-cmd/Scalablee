// O que cada tela da Scalable pede ao banco (mesmas consultas do site, como o PostgREST executa: com RLS e JSON).
const hoje = () => new Date().toISOString().slice(0, 10)
const dias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const inicioMes = () => hoje().slice(0, 8) + '01'
export const json = (sql) => `select coalesce(json_agg(t), '[]')::text as r from (${sql}) t`
export const contagem = (sql) => `select count(*)::text as r from (${sql}) t`

export const ACOES = {
  // Início: atendimentos 150 dias, TODOS os lançamentos, TODOS os pacientes, tarefas, notificações, aprovações, estoque
  // + "Hoje na agenda" (consultas de hoje, TODOS os pacientes só para nomes, profissionais)
  inicio: () => [
    json(`select * from public.sales where sold_at >= '${dias(-150)}' order by sold_at limit 5000`),
    json(`select * from public.transactions`),
    json(`select * from public.customers`),
    json(`select * from public.tasks where done = false order by due_date nulls last limit 50`),
    json(`select * from public.insights order by created_at desc limit 20`),
    json(`select * from public.approvals where status = 'pending' order by created_at desc limit 5`),
    json(`select * from public.estoque_itens where ativo = true limit 2000`),
    json(`select * from public.agendamentos where inicio >= '${hoje()}' and inicio < '${dias(1)}' and status <> 'cancelado' order by inicio`),
    json(`select id, name from public.customers`),
    json(`select id, nome, cor from public.profissionais`),
  ],
  // contadores do menu (a cada tela e a cada evento em tempo real)
  contadores: () => [
    contagem(`select 1 from public.insights where read = false`),
    contagem(`select 1 from public.approvals where status = 'pending'`),
    contagem(`select 1 from public.conversations where unread > 0`),
  ],
  pacientes: () => [
    json(`select * from public.customers order by created_at desc`),
    json(`select customer_id, inicio from public.agendamentos where inicio >= now() and status in ('agendado','confirmado') order by inicio`),
    ...[0, 1, 2, 3].map((p) => json(`select customer_id, amount, sold_at from public.sales where status = 'paid' and customer_id is not null order by id offset ${p * 1000} limit 1000`)),
  ],
  atendimentos: () => [
    json(`select * from public.sales where sold_at >= '${dias(-30)}' order by sold_at desc, created_at desc limit 2000`),
    json(`select id, name, phone, email, status, etapa, data_nascimento, cpf from public.customers order by name limit 5000`),
    json(`select id, nome, preco from public.servicos where ativo = true order by nome`),
  ],
  financeiro: () => [
    json(`select * from public.transactions order by due_date`),
    ...[0].map(() => json(`select amount from public.sales where status = 'paid' and sold_at >= '${inicioMes()}' order by id limit 1000`)),
    ...[0, 1].map((p) => json(`select amount from public.sales where status = 'pending' order by id offset ${p * 1000} limit 1000`)),
  ],
  agenda: () => [
    json(`select * from public.profissionais order by nome`),
    json(`select * from public.servicos order by nome`),
    json(`select id, name, phone, etapa from public.customers order by name limit 5000`),
    json(`select * from public.agendamentos where inicio >= '${dias(-1)}' and inicio < '${dias(6)}' order by inicio`),
  ],
  whatsapp: () => [
    json(`select * from public.conversations order by last_message_at desc`),
    json(`select * from public.messages where conversation_id = (select id from public.conversations order by last_message_at desc limit 1) order by created_at`),
  ],
  estoque: () => [json(`select * from public.estoque_itens order by nome offset 0 limit 1000`)],
}

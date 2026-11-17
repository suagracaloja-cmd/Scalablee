// Mesmas telas, com as consultas do site DEPOIS das melhorias.
import { ACOES as ANTES, json, contagem } from './acoes.mjs'
const hoje = () => new Date().toISOString().slice(0, 10)
const dias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const inicioMes = () => hoje().slice(0, 8) + '01'
const d = new Date(); const desde4 = new Date(d.getFullYear(), d.getMonth() - 3, 1).toISOString().slice(0, 10)
export const ACOES = {
  ...ANTES,
  inicio: () => [
    `select public.painel_atendimentos('${dias(-150)}', '${dias(-30)}')::text as r`,
    json(`select id, type, description, amount, due_date, paid_at from public.transactions where paid_at is null or due_date >= '${desde4}' or paid_at >= '${desde4}'`),
    contagem(`select 1 from public.customers`),
    contagem(`select 1 from public.customers where created_at >= '${inicioMes()}'`),
    json(`select * from public.tasks where done = false order by due_date nulls last limit 50`),
    json(`select * from public.insights order by created_at desc limit 20`),
    json(`select * from public.approvals where status = 'pending' order by created_at desc limit 5`),
    json(`select * from public.estoque_itens where ativo = true limit 2000`),
    json(`select * from public.agendamentos where inicio >= '${hoje()}' and inicio < '${dias(1)}' and status <> 'cancelado' order by inicio`),
    json(`select id, nome, cor from public.profissionais`),
    json(`select id, name from public.customers where id in (select customer_id from public.agendamentos where inicio >= '${hoje()}' and inicio < '${dias(1)}' and customer_id is not null)`),
  ],
  pacientes: () => [
    json(`select * from public.customers order by created_at desc`),
    json(`select customer_id, inicio from public.agendamentos where inicio >= now() and status in ('agendado','confirmado') order by inicio`),
    json(`select * from public.atendimentos_por_paciente()`),
  ],
  financeiro: () => [
    json(`select * from public.transactions order by due_date`),
    json(`select * from public.atendimentos_soma('paid', '${inicioMes()}')`),
    json(`select * from public.atendimentos_soma('pending', null)`),
  ],
}

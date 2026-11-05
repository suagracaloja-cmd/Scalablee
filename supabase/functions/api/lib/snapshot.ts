import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { addDays, brl, isoDate, type Company } from "./common.ts";

type Customer = { id: string; name: string; phone: string | null; status: string; last_contact_at: string | null; created_at: string };
type Sale = { id: string; customer_id: string | null; description: string; amount: number; status: string; sold_at: string };
type Tx = { id: string; type: string; description: string; category: string | null; amount: number; due_date: string; paid_at: string | null };
type Task = { id: string; title: string; due_date: string | null; done: boolean; agent_kind: string | null; customer_id: string | null };

export type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>;

/** Lê os dados da empresa e calcula os números que os agentes usam. */
export async function buildSnapshot(db: SupabaseClient, company: Company) {
  const today = new Date();
  const todayStr = isoDate(today);
  const since = isoDate(addDays(today, -90));

  const [customersR, salesR, txR, tasksR, convR, apprR] = await Promise.all([
    db.from("customers").select("id,name,phone,status,last_contact_at,created_at").eq("company_id", company.id),
    db.from("sales").select("id,customer_id,description,amount,status,sold_at").eq("company_id", company.id).gte("sold_at", since),
    db.from("transactions").select("id,type,description,category,amount,due_date,paid_at").eq("company_id", company.id),
    db.from("tasks").select("id,title,due_date,done,agent_kind,customer_id").eq("company_id", company.id).eq("done", false),
    db.from("conversations").select("id,contact_name,wa_id,unread,last_message_at").eq("company_id", company.id).gt("unread", 0),
    db.from("approvals").select("id,title").eq("company_id", company.id).eq("status", "pending"),
  ]);

  const customers = (customersR.data ?? []) as Customer[];
  const sales = ((salesR.data ?? []) as Sale[]).map((s) => ({ ...s, amount: Number(s.amount) }));
  const txs = ((txR.data ?? []) as Tx[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  const tasks = (tasksR.data ?? []) as Task[];

  const monthStart = todayStr.slice(0, 8) + "01";
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const prevStart = isoDate(prev);
  const prevSameDay = isoDate(addDays(prev, today.getUTCDate() - 1));

  const valid = sales.filter((s) => s.status !== "cancelled");
  const sum = (arr: { amount: number }[]) => arr.reduce((a, b) => a + b.amount, 0);
  const monthSales = valid.filter((s) => s.sold_at >= monthStart);
  const prevMonthSalesToDate = valid.filter((s) => s.sold_at >= prevStart && s.sold_at <= prevSameDay);
  const pendingSales = valid.filter((s) => s.status === "pending");

  const lastSaleByCustomer = new Map<string, string>();
  const totalByCustomer = new Map<string, number>();
  for (const s of valid) {
    if (!s.customer_id) continue;
    if ((lastSaleByCustomer.get(s.customer_id) ?? "") < s.sold_at) lastSaleByCustomer.set(s.customer_id, s.sold_at);
    totalByCustomer.set(s.customer_id, (totalByCustomer.get(s.customer_id) ?? 0) + s.amount);
  }
  const cutoff30 = isoDate(addDays(today, -30));
  const inactive = customers
    .filter((c) => c.status !== "lead")
    .filter((c) => {
      const last = lastSaleByCustomer.get(c.id) ?? c.last_contact_at?.slice(0, 10) ?? c.created_at.slice(0, 10);
      return last < cutoff30;
    })
    .map((c) => ({ ...c, total: totalByCustomer.get(c.id) ?? 0, last: lastSaleByCustomer.get(c.id) ?? null }))
    .sort((a, b) => b.total - a.total);

  const cutoff3 = addDays(today, -3).toISOString();
  const coldLeads = customers.filter((c) => c.status === "lead" && (c.last_contact_at ?? c.created_at) < cutoff3);

  const topCustomers = customers
    .map((c) => ({ id: c.id, name: c.name, total: totalByCustomer.get(c.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const in7 = isoDate(addDays(today, 7));
  const openTx = txs.filter((t) => !t.paid_at);
  const overduePayables = openTx.filter((t) => t.type === "expense" && t.due_date < todayStr);
  const upcomingPayables = openTx.filter((t) => t.type === "expense" && t.due_date >= todayStr && t.due_date <= in7);
  const overdueReceivables = openTx.filter((t) => t.type === "income" && t.due_date < todayStr);
  const upcomingReceivables = openTx.filter((t) => t.type === "income" && t.due_date >= todayStr && t.due_date <= in7);
  const paidThisMonth = txs.filter((t) => t.paid_at && t.paid_at >= monthStart);
  const cashIn = sum(paidThisMonth.filter((t) => t.type === "income")) + sum(monthSales.filter((s) => s.status === "paid"));
  const cashOut = sum(paidThisMonth.filter((t) => t.type === "expense"));

  const expenseByCat = new Map<string, number>();
  for (const t of txs.filter((t) => t.type === "expense" && t.due_date >= monthStart)) {
    const k = t.category || "Outros";
    expenseByCat.set(k, (expenseByCat.get(k) ?? 0) + t.amount);
  }

  const productCount = new Map<string, { qty: number; total: number }>();
  for (const s of valid.filter((s) => s.sold_at >= isoDate(addDays(today, -30)))) {
    const k = s.description.trim().toLowerCase();
    const p = productCount.get(k) ?? { qty: 0, total: 0 };
    p.qty++;
    p.total += s.amount;
    productCount.set(k, p);
  }
  const topProducts = [...productCount].sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([name, v]) => ({ name, ...v }));

  const tomorrow = isoDate(addDays(today, 1));
  const tasksDue = tasks.filter((t) => t.due_date && t.due_date <= tomorrow);

  return {
    today: todayStr,
    company: { name: company.name, segment: company.segment, description: company.description, website: company.website, instagram: company.instagram },
    customers,
    sales: valid,
    counts: { customers: customers.length, leads: customers.filter((c) => c.status === "lead").length },
    revenue: {
      month: sum(monthSales),
      monthCount: monthSales.length,
      prevMonthToDate: sum(prevMonthSalesToDate),
      avgTicket: monthSales.length ? sum(monthSales) / monthSales.length : 0,
      pending: sum(pendingSales),
      pendingCount: pendingSales.length,
    },
    pendingSales,
    inactive,
    coldLeads,
    topCustomers,
    topProducts,
    finance: {
      overduePayables,
      upcomingPayables,
      overdueReceivables,
      upcomingReceivables,
      cashIn,
      cashOut,
      balance: cashIn - cashOut,
      expenseByCat: [...expenseByCat].map(([category, total]) => ({ category, total })),
    },
    tasks,
    tasksDue,
    waitingConversations: convR.data ?? [],
    pendingApprovals: apprR.data ?? [],
    siteAnalysis: company.site_analysis,
  };
}

/** Texto compacto para mandar ao modelo. */
export function snapshotText(s: Snapshot) {
  const lines: string[] = [];
  const c = s.company;
  lines.push(`Empresa: ${c.name}${c.segment ? ` (segmento: ${c.segment})` : ""}. ${c.description ?? ""}`);
  if (c.website) lines.push(`Site: ${c.website}`);
  if (c.instagram) lines.push(`Instagram: ${c.instagram}`);
  lines.push(`Data de hoje: ${s.today}`);
  const diff = s.revenue.prevMonthToDate ? ((s.revenue.month - s.revenue.prevMonthToDate) / s.revenue.prevMonthToDate) * 100 : null;
  lines.push(
    `Vendas no mês: ${brl(s.revenue.month)} em ${s.revenue.monthCount} vendas (ticket médio ${brl(s.revenue.avgTicket)}).` +
      (diff !== null ? ` Mesmo período do mês anterior: ${brl(s.revenue.prevMonthToDate)} (${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%).` : ""),
  );
  lines.push(`Vendas pendentes de pagamento: ${s.revenue.pendingCount} (${brl(s.revenue.pending)}).`);
  if (s.topProducts.length) lines.push(`Mais vendidos (30 dias): ${s.topProducts.map((p) => `${p.name} (${p.qty}x, ${brl(p.total)})`).join("; ")}`);
  if (s.topCustomers.length) lines.push(`Melhores clientes: ${s.topCustomers.map((p) => `${p.name} (${brl(p.total)})`).join("; ")}`);
  lines.push(`Clientes cadastrados: ${s.counts.customers} (leads: ${s.counts.leads}).`);
  if (s.inactive.length) lines.push(`Clientes sem comprar há 30+ dias: ${s.inactive.slice(0, 8).map((x) => x.name).join(", ")}`);
  if (s.coldLeads.length) lines.push(`Leads sem contato há 3+ dias: ${s.coldLeads.slice(0, 8).map((x) => x.name).join(", ")}`);
  const f = s.finance;
  lines.push(`Caixa do mês: entradas ${brl(f.cashIn)}, saídas ${brl(f.cashOut)}, saldo ${brl(f.balance)}.`);
  const fmt = (arr: { description: string; amount: number; due_date: string }[]) =>
    arr.slice(0, 8).map((t) => `${t.description} ${brl(t.amount)} (vence ${t.due_date})`).join("; ");
  if (f.overduePayables.length) lines.push(`Contas a pagar VENCIDAS: ${fmt(f.overduePayables)}`);
  if (f.upcomingPayables.length) lines.push(`Contas a pagar nos próximos 7 dias: ${fmt(f.upcomingPayables)}`);
  if (f.overdueReceivables.length) lines.push(`Valores a receber atrasados: ${fmt(f.overdueReceivables)}`);
  if (f.upcomingReceivables.length) lines.push(`A receber nos próximos 7 dias: ${fmt(f.upcomingReceivables)}`);
  if (f.expenseByCat.length) lines.push(`Despesas do mês por categoria: ${f.expenseByCat.map((e) => `${e.category} ${brl(e.total)}`).join("; ")}`);
  lines.push(`Tarefas abertas: ${s.tasks.length} (vencendo até amanhã: ${s.tasksDue.map((t) => t.title).join("; ") || "nenhuma"}).`);
  lines.push(`Conversas de WhatsApp aguardando: ${s.waitingConversations.length}. Aprovações pendentes: ${s.pendingApprovals.length}.`);
  if (s.siteAnalysis) {
    const sa = s.siteAnalysis as { summary?: string; score?: number };
    lines.push(`Análise do site (nota ${sa.score ?? "?"}): ${sa.summary ?? ""}`);
  }
  return lines.join("\n");
}

// Análise geral da Coraline AI (todas as áreas, no máximo uma chamada de IA).
// Gera notificações (insights), tarefas e, se o WhatsApp estiver conectado, mensagens de reativação para aprovação.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { Company } from "./common.ts";
import { addDays, brl, isoDate } from "./util.ts";
import { agentAnalysis, friendlyAIError, type CreateFn } from "./agent.ts";
import { buildSnapshot, snapshotText, type Snapshot } from "./snapshot.ts";
import { getConfig } from "./whatsapp.ts";
import { todayBR } from "./tools.ts";

type Area = "sales" | "marketing" | "finance" | "support" | "management";
const AREAS: Area[] = ["sales", "marketing", "finance", "support", "management"];
const KIND: Record<Area, string> = { sales: "sales", marketing: "marketing", finance: "finance", support: "support", management: "crm" };
type Insight = { area: Area; title: string; body: string; priority?: string };
type NewTask = { area: Area; title: string; description?: string; due_in_days?: number; customer_id?: string | null };
type Outreach = { customer_id: string; message: string; reason: string };
type Output = { insights: Insight[]; tasks: NewTask[]; outreach: Outreach[] };

/** Analisa a empresa (todas as áreas). `db` = cliente do usuário (RLS); `admin` só lê a configuração do WhatsApp. */
export async function analisarEmpresa({ db: userDb, admin, company, create }: { db: SupabaseClient; admin: SupabaseClient; company: Company; create: CreateFn | null }) {
  const snap = await buildSnapshot(userDb, company);
  const wa = await getConfig(admin, company.id);
  const out = rules(snap, company);
  const ai = !!create;
  let aiError: string | null = null;

  if (create) {
    try {
      const candidates = wa?.connected ? snap.inactive.filter((c) => c.phone).slice(0, 5) : [];
      const r = await agentAnalysis({ company, dataText: snapshotText(snap), outreachCandidates: candidates.map((c) => ({ id: c.id, name: c.name })), create });
      const valid = new Set(candidates.map((c) => c.id));
      const area = (a: unknown): Area => (AREAS.includes(a as Area) ? (a as Area) : "management");
      for (const i of (r.insights ?? []).slice(0, 5)) out.insights.push({ area: area(i.area), title: String(i.title ?? ""), body: String(i.body ?? ""), priority: String(i.priority ?? "normal") });
      for (const t of (r.tasks ?? []).slice(0, 4)) out.tasks.push({ area: area(t.area), title: String(t.title ?? ""), description: t.description ? String(t.description) : undefined, due_in_days: Number(t.due_in_days ?? 1) });
      for (const o of (r.outreach ?? []).slice(0, 3)) if (valid.has(String(o.customer_id))) out.outreach.push({ customer_id: String(o.customer_id), message: String(o.message ?? ""), reason: String(o.reason ?? "") });
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
      console.error("[analise] erro da IA:", aiError);
    }
  }
  if (wa?.connected && !out.outreach.length) {
    for (const c of snap.inactive.filter((c) => c.phone).slice(0, 3)) {
      out.outreach.push({
        customer_id: c.id,
        reason: "Cliente sem comprar há mais de 30 dias",
        message: `Oi ${c.name.split(" ")[0]}, tudo bem? Aqui é da ${company.name}! Sentimos sua falta 😊 Temos novidades que acho que você vai gostar. Posso te mandar?`,
      });
    }
  }

  const saved = await persist(userDb, company.id, out);
  await userDb.from("companies").update({ agent_last_run_at: new Date().toISOString() }).eq("id", company.id);
  return { ok: true, ai: ai && !aiError, aiError: aiError ? friendlyAIError(aiError) : null, ...saved };
}

const fmt = (d: string) => d.split("-").reverse().join("/");

/** Regras com dados reais (funcionam mesmo sem IA). */
function rules(s: Snapshot, company: Company): Output {
  const out: Output = { insights: [], tasks: [], outreach: [] };
  const f = s.finance;
  if (f.overduePayables.length)
    out.insights.push({ area: "finance", priority: "high", title: `${f.overduePayables.length} conta(s) a pagar vencida(s)`, body: f.overduePayables.map((t) => `• ${t.description}: ${brl(t.amount)} (venceu ${fmt(t.due_date)})`).join("\n") });
  if (f.upcomingPayables.length)
    out.insights.push({ area: "finance", title: "Contas a pagar nos próximos 7 dias", body: f.upcomingPayables.map((t) => `• ${t.description}: ${brl(t.amount)} (vence ${fmt(t.due_date)})`).join("\n") });
  for (const t of f.overdueReceivables.slice(0, 5)) out.tasks.push({ area: "finance", title: `Cobrar: ${t.description}`, description: `${brl(t.amount)} venceu em ${fmt(t.due_date)}`, due_in_days: 0 });
  if (f.balance < 0) out.insights.push({ area: "finance", priority: "high", title: "Saldo do mês negativo", body: `Saídas superam entradas em ${brl(-f.balance)} neste mês.` });

  if (s.pendingSales.length)
    out.insights.push({ area: "sales", title: `${s.pendingSales.length} atendimento(s) a receber`, body: `Total de ${brl(s.revenue.pending)} a receber.\n` + s.pendingSales.slice(0, 6).map((x) => `• ${x.description}: ${brl(x.amount)}`).join("\n") });
  if (s.inactive.length) {
    out.insights.push({
      area: "sales",
      priority: s.inactive.length > 3 ? "high" : "normal",
      title: `${s.inactive.length} cliente(s) precisam de atenção`,
      body: "Sem comprar há mais de 30 dias:\n" + s.inactive.slice(0, 8).map((c) => `• ${c.name}${c.total ? ` (já comprou ${brl(c.total)})` : ""}`).join("\n"),
    });
    for (const c of s.inactive.slice(0, 5)) out.tasks.push({ area: "sales", title: `Reativar cliente ${c.name}`, customer_id: c.id, due_in_days: 1 });
  }
  for (const c of s.coldLeads.slice(0, 5)) out.tasks.push({ area: "sales", title: `Follow-up com lead ${c.name}`, customer_id: c.id, due_in_days: 1 });
  if (s.coldLeads.length) out.insights.push({ area: "sales", title: `${s.coldLeads.length} lead(s) esfriando`, body: `Leads sem contato há 3+ dias: ${s.coldLeads.map((c) => c.name).join(", ")}. Criei tarefas de follow-up para amanhã.` });
  for (const c of s.topCustomers.slice(0, 2)) out.tasks.push({ area: "support", title: `Agradecer cliente VIP ${c.name}`, customer_id: c.id, due_in_days: 2 });

  if (s.waitingConversations.length) out.insights.push({ area: "support", priority: "high", title: `${s.waitingConversations.length} conversa(s) aguardando resposta`, body: "Abra o WhatsApp da plataforma para ver as mensagens não lidas." });
  if (s.pendingApprovals.length)
    out.insights.push({ area: "management", priority: "high", title: `${s.pendingApprovals.length} aprovação(ões) esperando você`, body: s.pendingApprovals.map((a: { title: string }) => `• ${a.title}`).join("\n") });
  if (!company.instagram && !company.website)
    out.insights.push({ area: "marketing", title: "Cadastre seu Instagram e site", body: "Em Configurações, informe o @ do Instagram e o site para a Coraline AI analisar e trazer ideias personalizadas." });
  return out;
}

async function persist(db: SupabaseClient, companyId: string, out: Output) {
  const today = todayBR();
  const insights = out.insights.filter((i) => i.title && i.body);
  if (insights.length) {
    // Notificações antigas não lidas das mesmas áreas são substituídas (exceto pedidos de aprovação do WhatsApp)
    const kinds = [...new Set(insights.map((i) => KIND[i.area]))];
    await db.from("insights").delete().eq("company_id", companyId).eq("read", false).in("agent_kind", kinds).not("title", "like", "Aprovação necessária%");
    await db.from("insights").insert(
      insights.map((i) => ({ company_id: companyId, agent_kind: KIND[i.area], title: i.title.slice(0, 120), body: i.body, priority: ["low", "normal", "high"].includes(i.priority ?? "") ? i.priority : "normal" })),
    );
  }

  const { data: openTasks } = await db.from("tasks").select("title").eq("company_id", companyId).eq("done", false);
  const existing = new Set((openTasks ?? []).map((t) => String(t.title).toLowerCase()));
  const newTasks = out.tasks
    .filter((t) => t.title && !existing.has(t.title.toLowerCase()))
    .filter((t, i, arr) => arr.findIndex((x) => x.title.toLowerCase() === t.title.toLowerCase()) === i)
    .map((t) => ({
      company_id: companyId,
      agent_kind: KIND[t.area],
      title: t.title.slice(0, 160),
      description: t.description ?? null,
      customer_id: t.customer_id ?? null,
      due_date: isoDate(addDays(today, Math.max(0, Math.min(7, Number(t.due_in_days ?? 1))))),
    }));
  if (newTasks.length) await db.from("tasks").insert(newTasks);

  let approvals = 0;
  if (out.outreach.length) {
    const { data: pending } = await db.from("approvals").select("customer_id").eq("company_id", companyId).eq("status", "pending").eq("kind", "whatsapp_outreach");
    const has = new Set((pending ?? []).map((p) => p.customer_id));
    const { data: custs } = await db.from("customers").select("id,name,phone").eq("company_id", companyId).in("id", out.outreach.map((o) => o.customer_id));
    const byId = new Map((custs ?? []).map((c) => [c.id, c]));
    const rows = out.outreach
      .filter((o) => !has.has(o.customer_id) && byId.has(o.customer_id))
      .map((o) => ({
        company_id: companyId,
        agent_kind: "sales",
        kind: "whatsapp_outreach",
        customer_id: o.customer_id,
        title: `Enviar mensagem para ${byId.get(o.customer_id)!.name}`,
        reason: o.reason,
        draft: o.message,
        payload: { customer_id: o.customer_id, telefone: byId.get(o.customer_id)!.phone, mensagem: o.message },
      }));
    if (rows.length) await db.from("approvals").insert(rows);
    approvals = rows.length;
  }
  return { insights: insights.length, tasks: newTasks.length, approvals };
}

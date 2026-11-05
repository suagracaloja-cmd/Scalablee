// Executa os agentes de IA: analisa os dados da empresa e gera notificações,
// tarefas e pedidos de aprovação.
import { addDays, brl, handle, isoDate, json, requireCompany, type Company } from "./lib/common.ts";
import { ask, hasAI, parseJSON } from "./lib/ai.ts";
import { buildSnapshot, snapshotText, type Snapshot } from "./lib/snapshot.ts";
import { getConfig } from "./lib/whatsapp.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

type Kind = "marketing" | "sales" | "finance" | "crm" | "support";
type Agent = { id: string; kind: Kind; name: string; personality: string | null; enabled: boolean };
type Insight = { title: string; body: string; priority?: "low" | "normal" | "high"; sources?: unknown };
type NewTask = { title: string; description?: string; due_in_days?: number; customer_id?: string | null };
type Outreach = { customer_id: string; message: string; reason: string };
type Output = { insights: Insight[]; tasks: NewTask[]; outreach: Outreach[] };

const ROLES: Record<Kind, string> = {
  marketing:
    "agente de MARKETING. Pesquise na internet o que está em alta AGORA no segmento da empresa (tendências, formatos de conteúdo, datas comemorativas próximas, áudios/temas de Reels, ideias de campanha). Se houver Instagram, procure informações públicas sobre o perfil. Dê ideias práticas de posts/Reels/campanhas para bombar, com ganchos prontos.",
  sales:
    "agente de VENDAS. Analise vendas do mês x mês anterior, produtos mais vendidos, vendas pendentes de pagamento e clientes que pararam de comprar. Diga o que fazer para vender mais nesta semana e quais clientes precisam de atenção.",
  finance:
    "agente FINANCEIRO. Analise contas a pagar e a receber, vencidas e próximas, saldo do mês e despesas por categoria. Alerte riscos de caixa e sugira ações (cobranças, renegociação, cortes).",
  crm:
    "agente de CRM / relacionamento. Analise leads sem contato, clientes VIP, clientes inativos e tarefas. Sugira follow-ups, pós-venda e ações de fidelização, antecipando tarefas para amanhã e depois de amanhã.",
  support:
    "agente de ATENDIMENTO (WhatsApp). Analise conversas aguardando resposta e aprovações pendentes. Sugira melhorias no atendimento e respostas-padrão úteis para o negócio.",
};

export default (
  handle(async (req) => {
    const { db, company } = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const only: Kind | undefined = body.kind;

    let q = db.from("agents").select("*").eq("company_id", company.id).eq("enabled", true);
    if (only) q = q.eq("kind", only);
    const { data: agents } = await q;
    if (!agents?.length) return json({ ok: true, results: [] });

    const snap = await buildSnapshot(db, company);
    const wa = await getConfig(db, company.id);
    const ai = hasAI();

    const results = await Promise.all(
      (agents as Agent[]).map(async (agent) => {
        const out = rules(agent.kind, snap, company);
        let aiError: string | null = null;
        if (ai) {
          try {
            const extra = await runAI(agent, snap, !!wa?.connected);
            out.insights.push(...extra.insights);
            out.tasks.push(...extra.tasks);
            out.outreach.push(...extra.outreach);
          } catch (e) {
            aiError = e instanceof Error ? e.message : String(e);
            console.error(agent.kind, e);
          }
        }
        if (agent.kind === "sales" && wa?.connected && !out.outreach.length) {
          // Sem IA: mensagem padrão de reativação.
          for (const c of snap.inactive.filter((c) => c.phone).slice(0, 3)) {
            out.outreach.push({
              customer_id: c.id,
              reason: "Cliente sem comprar há mais de 30 dias",
              message: `Oi ${c.name.split(" ")[0]}, tudo bem? Aqui é da ${company.name}! Sentimos sua falta 😊 Temos novidades que acho que você vai gostar. Posso te mandar?`,
            });
          }
        }
        const saved = await persist(db, company.id, agent, out);
        return { kind: agent.kind, ...saved, aiError };
      }),
    );

    return json({ ok: true, ai, results });
  })
);

function rules(kind: Kind, s: Snapshot, company: Company): Output {
  const out: Output = { insights: [], tasks: [], outreach: [] };
  const f = s.finance;
  if (kind === "finance") {
    if (f.overduePayables.length)
      out.insights.push({
        priority: "high",
        title: `${f.overduePayables.length} conta(s) a pagar vencida(s)`,
        body: f.overduePayables.map((t) => `• ${t.description}: ${brl(t.amount)} (venceu ${fmtDate(t.due_date)})`).join("\n"),
      });
    if (f.upcomingPayables.length)
      out.insights.push({
        title: `Contas a pagar nos próximos 7 dias`,
        body: f.upcomingPayables.map((t) => `• ${t.description}: ${brl(t.amount)} (vence ${fmtDate(t.due_date)})`).join("\n"),
      });
    for (const t of f.overdueReceivables.slice(0, 5))
      out.tasks.push({ title: `Cobrar: ${t.description}`, description: `${brl(t.amount)} venceu em ${fmtDate(t.due_date)}`, due_in_days: 0 });
    if (f.balance < 0)
      out.insights.push({ priority: "high", title: "Saldo do mês negativo", body: `Saídas superam entradas em ${brl(-f.balance)} neste mês.` });
  }
  if (kind === "sales") {
    if (s.pendingSales.length)
      out.insights.push({
        title: `${s.pendingSales.length} venda(s) aguardando pagamento`,
        body: `Total de ${brl(s.revenue.pending)} a receber.\n` + s.pendingSales.slice(0, 6).map((x) => `• ${x.description}: ${brl(x.amount)}`).join("\n"),
      });
    if (s.inactive.length) {
      out.insights.push({
        priority: s.inactive.length > 3 ? "high" : "normal",
        title: `${s.inactive.length} cliente(s) precisam de atenção`,
        body: "Sem comprar há mais de 30 dias:\n" + s.inactive.slice(0, 8).map((c) => `• ${c.name}${c.total ? ` (já comprou ${brl(c.total)})` : ""}`).join("\n"),
      });
      for (const c of s.inactive.slice(0, 5)) out.tasks.push({ title: `Reativar cliente ${c.name}`, customer_id: c.id, due_in_days: 1 });
    }
  }
  if (kind === "crm") {
    for (const c of s.coldLeads.slice(0, 5)) out.tasks.push({ title: `Follow-up com lead ${c.name}`, customer_id: c.id, due_in_days: 1 });
    if (s.coldLeads.length)
      out.insights.push({ title: `${s.coldLeads.length} lead(s) esfriando`, body: `Leads sem contato há 3+ dias: ${s.coldLeads.map((c) => c.name).join(", ")}. Criei tarefas de follow-up para amanhã.` });
    for (const c of s.topCustomers.slice(0, 2)) out.tasks.push({ title: `Agradecer cliente VIP ${c.name}`, customer_id: c.id, due_in_days: 2 });
  }
  if (kind === "support") {
    if (s.waitingConversations.length)
      out.insights.push({ priority: "high", title: `${s.waitingConversations.length} conversa(s) aguardando resposta`, body: "Abra o WhatsApp da plataforma para ver as mensagens não lidas." });
    if (s.pendingApprovals.length)
      out.insights.push({ priority: "high", title: `${s.pendingApprovals.length} aprovação(ões) esperando você`, body: s.pendingApprovals.map((a: { title: string }) => `• ${a.title}`).join("\n") });
  }
  if (kind === "marketing") {
    if (!company.instagram && !company.website)
      out.insights.push({ title: "Cadastre seu Instagram e site", body: "Em Configurações, informe seu @ do Instagram e o site para eu analisar e trazer ideias personalizadas." });
  }
  return out;
}

async function runAI(agent: Agent, s: Snapshot, waConnected: boolean): Promise<Output> {
  const isSales = agent.kind === "sales";
  const inactiveWithPhone = s.inactive.filter((c) => c.phone).slice(0, 5);
  const system = `Você é ${agent.name}, ${ROLES[agent.kind]}
Personalidade: ${agent.personality ?? "profissional e direto"}.
Você trabalha para o dono de um pequeno/médio negócio brasileiro. Escreva em português do Brasil, linguagem simples, direta e prática. Não invente números: use só os dados fornecidos (e, no marketing, o que encontrar na pesquisa).
Responda SOMENTE com um JSON no formato:
{"insights":[{"title":"curto (até 60 caracteres)","body":"2 a 6 linhas, com ações concretas","priority":"low|normal|high"}],
 "tasks":[{"title":"tarefa objetiva","description":"opcional","due_in_days":0|1|2}]${
   isSales && waConnected ? `,\n "outreach":[{"customer_id":"id","reason":"por quê","message":"mensagem curta e calorosa de WhatsApp para o cliente"}]` : ""
 }}
Máximo de 3 insights e 3 tarefas.`;

  let user = `Dados atuais do negócio:\n${snapshotText(s)}`;
  if (isSales && waConnected && inactiveWithPhone.length)
    user += `\n\nClientes inativos com WhatsApp (use os ids no outreach, no máximo 3):\n${inactiveWithPhone.map((c) => `${c.id} — ${c.name}`).join("\n")}`;

  const res = await ask({
    system,
    messages: [{ role: "user", content: user }],
    effort: agent.kind === "marketing" ? "medium" : "low",
    webSearch: agent.kind === "marketing",
  });
  const parsed = parseJSON<Partial<Output>>(res.text) ?? {};
  const validIds = new Set(inactiveWithPhone.map((c) => c.id));
  return {
    insights: (parsed.insights ?? []).slice(0, 3).map((i) => ({ ...i, sources: res.sources.length ? res.sources : undefined })),
    tasks: (parsed.tasks ?? []).slice(0, 3),
    outreach: (parsed.outreach ?? []).filter((o) => validIds.has(o.customer_id)).slice(0, 3),
  };
}

async function persist(db: SupabaseClient, companyId: string, agent: Agent, out: Output) {
  const today = new Date();
  // Notificações antigas não lidas deste agente são substituídas pelas novas.
  if (out.insights.length) await db.from("insights").delete().eq("company_id", companyId).eq("agent_kind", agent.kind).eq("read", false);
  if (out.insights.length)
    await db.from("insights").insert(
      out.insights.map((i) => ({
        company_id: companyId,
        agent_kind: agent.kind,
        title: String(i.title).slice(0, 120),
        body: String(i.body),
        priority: ["low", "normal", "high"].includes(i.priority ?? "") ? i.priority : "normal",
        sources: i.sources ?? null,
      })),
    );

  const { data: openTasks } = await db.from("tasks").select("title").eq("company_id", companyId).eq("done", false);
  const existing = new Set((openTasks ?? []).map((t) => t.title.toLowerCase()));
  const newTasks = out.tasks
    .filter((t) => t.title && !existing.has(t.title.toLowerCase()))
    .map((t) => ({
      company_id: companyId,
      agent_kind: agent.kind,
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
    const { data: custs } = await db.from("customers").select("id,name").in("id", out.outreach.map((o) => o.customer_id));
    const names = new Map((custs ?? []).map((c) => [c.id, c.name]));
    const rows = out.outreach
      .filter((o) => !has.has(o.customer_id) && names.has(o.customer_id))
      .map((o) => ({
        company_id: companyId,
        agent_kind: agent.kind,
        kind: "whatsapp_outreach",
        customer_id: o.customer_id,
        title: `Enviar mensagem para ${names.get(o.customer_id)}`,
        reason: o.reason,
        draft: o.message,
      }));
    if (rows.length) await db.from("approvals").insert(rows);
    approvals = rows.length;
  }

  await db.from("agents").update({ last_run_at: new Date().toISOString() }).eq("id", agent.id);
  return { insights: out.insights.length, tasks: newTasks.length, approvals };
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

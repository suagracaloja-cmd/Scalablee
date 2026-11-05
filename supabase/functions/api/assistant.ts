// IA assistente: o dono pergunta "como estão minhas vendas?" e recebe a resposta
// com base nos dados reais da empresa.
import { brl, handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { ask, hasAI } from "./lib/ai.ts";
import { buildSnapshot, snapshotText, type Snapshot } from "./lib/snapshot.ts";

export default (
  handle(async (req) => {
    const { db, company } = await requireCompany(req);
    const { message } = await req.json().catch(() => ({}));
    if (!message || typeof message !== "string") throw new HttpError(400, "Mensagem vazia");

    await db.from("assistant_messages").insert({ company_id: company.id, role: "user", content: message.slice(0, 4000) });

    const snap = await buildSnapshot(db, company);
    let reply: string;
    if (hasAI()) {
      const { data: history } = await db
        .from("assistant_messages")
        .select("role,content")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(16);
      const msgs = (history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      while (msgs.length && msgs[0].role !== "user") msgs.shift();
      const res = await ask({
        system: `Você é o assistente pessoal de gestão da plataforma Scalablee, falando com o dono da empresa "${company.name}".
Responda em português do Brasil, curto e claro, com números formatados em R$. Use listas quando ajudar.
Baseie-se SOMENTE nos dados abaixo; se faltar informação, diga o que cadastrar. Termine, quando fizer sentido, com 1 recomendação prática.

DADOS ATUAIS DA EMPRESA:
${snapshotText(snap)}`,
        messages: msgs,
        effort: "low",
        maxTokens: 4000,
      });
      reply = res.text || "Não consegui responder agora.";
    } else {
      reply = fallback(message, snap);
    }

    const { data: saved } = await db
      .from("assistant_messages")
      .insert({ company_id: company.id, role: "assistant", content: reply })
      .select("*")
      .single();
    return json({ reply: saved });
  })
);

/** Respostas sem IA, a partir dos números. */
function fallback(q: string, s: Snapshot) {
  const t = q.toLowerCase();
  const diff = s.revenue.prevMonthToDate ? ((s.revenue.month - s.revenue.prevMonthToDate) / s.revenue.prevMonthToDate) * 100 : null;
  const parts: string[] = [];
  const wantsAll = !/(venda|fatur|financ|conta|pagar|receber|caixa|client|tarefa|lead)/.test(t);
  if (wantsAll || /(venda|fatur)/.test(t)) {
    parts.push(
      `📈 **Vendas do mês:** ${brl(s.revenue.month)} em ${s.revenue.monthCount} vendas (ticket médio ${brl(s.revenue.avgTicket)}).` +
        (diff !== null ? ` Comparado ao mesmo período do mês passado: ${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%.` : ""),
    );
    if (s.topProducts.length) parts.push(`Mais vendido: ${s.topProducts[0].name}.`);
    if (s.revenue.pendingCount) parts.push(`${s.revenue.pendingCount} venda(s) aguardando pagamento (${brl(s.revenue.pending)}).`);
  }
  if (wantsAll || /(financ|conta|pagar|receber|caixa)/.test(t)) {
    const f = s.finance;
    parts.push(`💰 **Caixa do mês:** entradas ${brl(f.cashIn)}, saídas ${brl(f.cashOut)}, saldo ${brl(f.balance)}.`);
    if (f.overduePayables.length) parts.push(`⚠️ ${f.overduePayables.length} conta(s) a pagar vencida(s).`);
    if (f.upcomingPayables.length) parts.push(`${f.upcomingPayables.length} conta(s) vencem nos próximos 7 dias.`);
  }
  if (wantsAll || /(client|lead)/.test(t)) {
    parts.push(`👥 **Clientes:** ${s.counts.customers} cadastrados, ${s.counts.leads} leads.`);
    if (s.inactive.length) parts.push(`${s.inactive.length} cliente(s) sem comprar há 30+ dias: ${s.inactive.slice(0, 5).map((c) => c.name).join(", ")}.`);
  }
  if (wantsAll || /tarefa/.test(t)) parts.push(`✅ **Tarefas abertas:** ${s.tasks.length} (${s.tasksDue.length} vencendo até amanhã).`);
  parts.push("\n_(Modo básico: configure a chave da IA para respostas completas.)_");
  return parts.join("\n");
}

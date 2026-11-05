// Conversa com a IA: assistente geral (sem agent) ou com um agente específico.
// Com ANTHROPIC_API_KEY usa o Claude; sem chave, responde por intenção com os dados reais.
import { addDays, brl, handle, HttpError, isoDate, json, requireCompany } from "../api/lib/common.ts";
import { ask, hasAI } from "../api/lib/ai.ts";
import { buildSnapshot, snapshotText, type Snapshot } from "../api/lib/snapshot.ts";

type Kind = "marketing" | "sales" | "finance" | "crm" | "support";
const KINDS: Kind[] = ["marketing", "sales", "finance", "crm", "support"];

const ROLE: Record<Kind, string> = {
  marketing:
    "agente de MARKETING. Ajuda com ideias de posts, Reels, campanhas, promoções, datas comemorativas e posicionamento no Instagram e no site. Quando fizer sentido, pesquise na internet o que está em alta no segmento.",
  sales: "agente de VENDAS. Ajuda a vender mais: análise de vendas, produtos, clientes que pararam de comprar, ofertas e roteiros de abordagem.",
  finance: "agente FINANCEIRO. Ajuda com contas a pagar e a receber, fluxo de caixa, despesas, cobranças e decisões de custo.",
  crm: "agente de CRM / relacionamento. Ajuda com follow-up de leads, pós-venda, fidelização, clientes VIP e organização de tarefas.",
  support: "agente de ATENDIMENTO no WhatsApp. Ajuda a montar respostas, mensagens prontas, políticas de atendimento e a lidar com clientes.",
};

Deno.serve(
  handle(async (req) => {
    const { db, company } = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim().slice(0, 4000);
    if (!message) throw new HttpError(400, "Mensagem vazia");
    const kind: Kind | null = KINDS.includes(body.agent) ? body.agent : null;

    let agent: { name: string; personality: string | null } | null = null;
    if (kind) {
      const { data } = await db.from("agents").select("name,personality").eq("company_id", company.id).eq("kind", kind).single();
      agent = data;
    }

    await db.from("assistant_messages").insert({ company_id: company.id, role: "user", content: message, agent_kind: kind });
    const snap = await buildSnapshot(db, company);
    const ai = hasAI();

    let reply: string;
    let aiError: string | null = null;
    if (ai) {
      try {
        reply = await aiReply(db, company, kind, agent, snap);
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e);
        console.error("[chat] erro da IA:", aiError);
        reply = answer(message, snap, agent?.name ?? null, kind) + `\n\n_(A IA não respondeu agora: ${friendly(aiError)})_`;
      }
    } else {
      reply = answer(message, snap, agent?.name ?? null, kind);
    }

    const { data: saved } = await db
      .from("assistant_messages")
      .insert({ company_id: company.id, role: "assistant", content: reply, agent_kind: kind })
      .select("*")
      .single();
    return json({ reply: saved, ai: ai && !aiError, aiError });
  }),
);

type Db = Awaited<ReturnType<typeof requireCompany>>["db"];
type Co = Awaited<ReturnType<typeof requireCompany>>["company"];

async function aiReply(db: Db, company: Co, kind: Kind | null, agent: { name: string; personality: string | null } | null, snap: Snapshot) {
  let hq = db.from("assistant_messages").select("role,content").eq("company_id", company.id).order("created_at", { ascending: false }).limit(20);
  hq = kind ? hq.eq("agent_kind", kind) : hq.is("agent_kind", null);
  const { data: history } = await hq;
  const msgs = (history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();

  const who = kind
    ? `Você é ${agent?.name ?? "um agente"}, ${ROLE[kind]}\nPersonalidade: ${agent?.personality ?? "profissional e direto"}.`
    : `Você é a IA da Scalable, assistente pessoal de gestão do dono da empresa "${company.name}". Responde sobre vendas, financeiro, clientes, tarefas, marketing e atendimento — e também sobre qualquer outro assunto que o dono perguntar.`;
  const res = await ask({
    system: `${who}
Fale em português do Brasil, de forma natural, curta e direta, como um sócio experiente. Responda exatamente ao que foi perguntado — se a pergunta não for sobre a empresa, responda normalmente.
Para números da empresa, use os dados abaixo (formate em R$). Não invente dados; se faltar algo, diga o que o dono precisa cadastrar.
Use listas curtas quando ajudar e termine com uma recomendação prática quando fizer sentido.

DADOS DA EMPRESA (atualizados agora):
${snapshotText(snap)}

DETALHES:
${detailText(snap)}`,
    messages: msgs,
    effort: "low",
    maxTokens: 4000,
    webSearch: kind === "marketing",
  });
  return res.text || "Não consegui responder agora, tente de novo.";
}

function friendly(err: string) {
  const e = err.toLowerCase();
  if (e.includes("api-key") || e.includes("api key") || e.includes("authentication") || e.includes("401")) return "a chave da IA foi recusada — confira se copiou a chave inteira";
  if (e.includes("credit") || e.includes("billing") || e.includes("balance")) return "a conta da Anthropic está sem créditos";
  if (e.includes("rate") || e.includes("429")) return "limite de uso atingido, tente em instantes";
  return err.slice(0, 160);
}

function detailText(s: Snapshot) {
  const names = new Map(s.customers.map((c) => [c.id, c.name]));
  const lines: string[] = [];
  const recent = [...s.sales].sort((a, b) => b.sold_at.localeCompare(a.sold_at)).slice(0, 20);
  if (recent.length)
    lines.push("Vendas recentes:\n" + recent.map((x) => `- ${x.sold_at} ${x.description} ${brl(x.amount)} (${x.status})${x.customer_id ? " — " + (names.get(x.customer_id) ?? "") : ""}`).join("\n"));
  const totals = new Map<string, { total: number; last: string }>();
  for (const x of s.sales) {
    if (!x.customer_id) continue;
    const t = totals.get(x.customer_id) ?? { total: 0, last: "" };
    totals.set(x.customer_id, { total: t.total + x.amount, last: x.sold_at > t.last ? x.sold_at : t.last });
  }
  if (s.customers.length)
    lines.push(
      "Clientes:\n" +
        s.customers
          .slice(0, 50)
          .map((c) => `- ${c.name} (${c.status}) total 90d ${brl(totals.get(c.id)?.total ?? 0)}, última compra ${totals.get(c.id)?.last || "—"}`)
          .join("\n"),
    );
  const open = [...s.finance.overduePayables, ...s.finance.upcomingPayables, ...s.finance.overdueReceivables, ...s.finance.upcomingReceivables];
  if (open.length) lines.push("Contas em aberto:\n" + open.map((t) => `- ${t.type === "expense" ? "Pagar" : "Receber"}: ${t.description} ${brl(t.amount)} vence ${t.due_date}`).join("\n"));
  if (s.tasks.length) lines.push("Tarefas abertas:\n" + s.tasks.slice(0, 20).map((t) => `- ${t.title} (${t.due_date ?? "sem data"})`).join("\n"));
  return lines.join("\n\n");
}

// ---------------- Respostas sem IA (por intenção) ----------------

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const d = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const sum = (a: { amount: number }[]) => a.reduce((x, y) => x + y.amount, 0);
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

function answer(raw: string, s: Snapshot, agentName: string | null, kind: Kind | null): string {
  const q = norm(raw);
  const today = s.today;
  const yesterday = isoDate(addDays(new Date(today + "T12:00:00Z"), -1));
  const week = isoDate(addDays(new Date(today + "T12:00:00Z"), -6));
  const monthStart = today.slice(0, 8) + "01";
  const sales = s.sales;
  const between = (from: string, to = today) => sales.filter((x) => x.sold_at >= from && x.sold_at <= to);
  const fin = s.finance;
  const me = agentName ? `${agentName} aqui. ` : "";

  // Saudação
  if (/^(oi+|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|tudo bem|hey|salve)\b/.test(q) && q.length < 30) {
    return `Oi! ${me}Tudo certo por aqui 😊\n\nHoje você vendeu **${brl(sum(between(today)))}** e no mês já são **${brl(s.revenue.month)}**.\n\nPode me perguntar, por exemplo:\n• Quanto vendi essa semana?\n• Quais contas vencem nos próximos dias?\n• Quem são meus melhores clientes?`;
  }
  if (has(q, "o que voce faz", "o que vc faz", "ajuda", "pode fazer", "como funciona")) return capabilities(kind, me);

  // Cliente específico
  const cust = s.customers.find((c) => {
    const n = norm(c.name);
    const first = n.split(" ")[0];
    return q.includes(n) || (first.length > 3 && new RegExp(`\\b${first}\\b`).test(q) && s.customers.filter((o) => norm(o.name).split(" ")[0] === first).length === 1);
  });
  if (cust) {
    const mine = sales.filter((x) => x.customer_id === cust.id).sort((a, b) => b.sold_at.localeCompare(a.sold_at));
    const status = { lead: "lead", active: "cliente ativo", inactive: "cliente inativo", vip: "cliente VIP" }[cust.status] ?? cust.status;
    let r = `**${cust.name}** — ${status}${cust.phone ? ` · WhatsApp +${cust.phone}` : ""}\n\n`;
    if (!mine.length) r += "Nenhuma compra nos últimos 90 dias.";
    else {
      r += `• Comprou **${brl(sum(mine))}** em ${mine.length} compra(s) nos últimos 90 dias\n• Última compra: ${d(mine[0].sold_at)} — ${mine[0].description} (${brl(mine[0].amount)})`;
      const pend = mine.filter((x) => x.status === "pending");
      if (pend.length) r += `\n• ⚠️ ${pend.length} compra(s) aguardando pagamento: ${brl(sum(pend))}`;
    }
    if (s.inactive.some((c) => c.id === cust.id)) r += `\n\n💡 Está há mais de 30 dias sem comprar. Vale mandar uma mensagem com uma novidade ou condição especial.`;
    return r;
  }

  // Produto específico
  const prodNames = [...new Set(sales.map((x) => x.description))];
  const prod = prodNames.find((p) => p.length > 3 && q.includes(norm(p)));
  if (prod) {
    const list = sales.filter((x) => x.description === prod);
    const m = list.filter((x) => x.sold_at >= monthStart);
    return `**${prod}**\n\n• Este mês: ${m.length} venda(s), ${brl(sum(m))}\n• Últimos 90 dias: ${list.length} venda(s), ${brl(sum(list))}\n• Preço médio: ${brl(sum(list) / list.length)}`;
  }

  // Previsão / meta
  if (has(q, "previs", "projec", "meta", "vou fechar", "fechar o mes", "estimativa")) {
    const day = Number(today.slice(8, 10));
    const dim = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
    const proj = (s.revenue.month / day) * dim;
    return `📈 No ritmo atual (${brl(s.revenue.month / day)} por dia), você deve fechar o mês com cerca de **${brl(proj)}**.\n\nAté agora: ${brl(s.revenue.month)} em ${day} dias.`;
  }

  // Vendas
  if (has(q, "venda", "vendi", "vendeu", "fatur", "receita", "vendemos")) {
    if (has(q, "ontem")) {
      const l = between(yesterday, yesterday);
      return `Ontem (${d(yesterday)}) foram **${l.length} venda(s)**, totalizando **${brl(sum(l))}**.${l.length ? "\n\n" + l.map((x) => `• ${x.description} — ${brl(x.amount)}`).join("\n") : ""}`;
    }
    if (has(q, "hoje", "agora")) {
      const l = between(today);
      return `Hoje foram **${l.length} venda(s)**, totalizando **${brl(sum(l))}**.${l.length ? "\n\n" + l.map((x) => `• ${x.description} — ${brl(x.amount)}`).join("\n") : "\n\nAinda nenhuma venda registrada hoje."}`;
    }
    if (has(q, "semana", "7 dias", "sete dias")) {
      const l = between(week);
      const prevW = between(isoDate(addDays(new Date(week + "T12:00:00Z"), -7)), isoDate(addDays(new Date(week + "T12:00:00Z"), -1)));
      const diff = sum(prevW) ? ((sum(l) - sum(prevW)) / sum(prevW)) * 100 : null;
      return `Nos últimos 7 dias: **${brl(sum(l))}** em ${l.length} vendas.${diff !== null ? `\n\nNa semana anterior foram ${brl(sum(prevW))} (${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%).` : ""}`;
    }
    const diff = s.revenue.prevMonthToDate ? ((s.revenue.month - s.revenue.prevMonthToDate) / s.revenue.prevMonthToDate) * 100 : null;
    let r = `📊 **Vendas do mês:** ${brl(s.revenue.month)} em ${s.revenue.monthCount} vendas (ticket médio ${brl(s.revenue.avgTicket)}).`;
    if (diff !== null) r += `\nNo mesmo período do mês passado: ${brl(s.revenue.prevMonthToDate)} → **${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%**.`;
    r += `\n\n• Hoje: ${brl(sum(between(today)))}\n• Últimos 7 dias: ${brl(sum(between(week)))}`;
    if (s.topProducts[0]) r += `\n• Mais vendido: ${s.topProducts[0].name}`;
    if (s.revenue.pendingCount) r += `\n• ${s.revenue.pendingCount} venda(s) aguardando pagamento (${brl(s.revenue.pending)})`;
    if (diff !== null && diff < 0 && s.inactive.length) r += `\n\n💡 Para recuperar: ${s.inactive.length} cliente(s) estão sem comprar há 30+ dias. Uma mensagem de reativação costuma trazer retorno rápido.`;
    return r;
  }

  if (has(q, "mais vendid", "produto", "campeao de venda", "top")) {
    if (!s.topProducts.length) return "Ainda não há vendas nos últimos 30 dias para montar o ranking.";
    return "🏆 **Mais vendidos (30 dias):**\n" + s.topProducts.map((p, i) => `${i + 1}. ${cap(p.name)} — ${p.qty}x, ${brl(p.total)}`).join("\n");
  }
  if (has(q, "melhor cliente", "melhores clientes", "quem mais compra", "maiores clientes", "clientes vip")) {
    if (!s.topCustomers.length) return "Ainda não há vendas vinculadas a clientes. Ao registrar uma venda, escolha o cliente.";
    return "⭐ **Clientes que mais compraram (90 dias):**\n" + s.topCustomers.map((c, i) => `${i + 1}. ${c.name} — ${brl(c.total)}`).join("\n");
  }
  if (has(q, "inativ", "sumiu", "sumiram", "parou de comprar", "pararam", "precisa de atencao", "precisam de atencao", "reativ", "atencao")) {
    if (!s.inactive.length) return "Nenhum cliente está há mais de 30 dias sem comprar. 👏";
    return `🔔 **${s.inactive.length} cliente(s) precisam de atenção** (sem comprar há 30+ dias):\n` + s.inactive.slice(0, 10).map((c) => `• ${c.name}${c.total ? ` — já comprou ${brl(c.total)}` : ""}${c.last ? `, última compra ${d(c.last)}` : ""}`).join("\n") + "\n\n💡 Mande uma mensagem com uma novidade ou condição especial para trazer de volta.";
  }
  if (has(q, "lead")) {
    const leads = s.customers.filter((c) => c.status === "lead");
    return `Você tem **${leads.length} lead(s)**.${s.coldLeads.length ? `\n\n⚠️ Esfriando (3+ dias sem contato): ${s.coldLeads.map((c) => c.name).join(", ")}.\n\n💡 Faça o follow-up ainda hoje — lead respondido rápido converte muito mais.` : ""}`;
  }
  if (has(q, "pagar", "boleto", "vencid", "vence", "conta", "despesa", "gasto", "fornecedor")) {
    const parts: string[] = [];
    if (fin.overduePayables.length) parts.push("⚠️ **Vencidas:**\n" + fin.overduePayables.map((t) => `• ${t.description} — ${brl(t.amount)} (venceu ${d(t.due_date)})`).join("\n"));
    if (fin.upcomingPayables.length) parts.push("📅 **Próximos 7 dias:**\n" + fin.upcomingPayables.map((t) => `• ${t.description} — ${brl(t.amount)} (vence ${d(t.due_date)})`).join("\n"));
    if (fin.expenseByCat.length && has(q, "despesa", "gasto")) parts.push("**Despesas do mês por categoria:**\n" + fin.expenseByCat.map((e) => `• ${e.category}: ${brl(e.total)}`).join("\n"));
    if (!parts.length) return "Nenhuma conta a pagar vencida ou vencendo nos próximos 7 dias. ✅";
    return parts.join("\n\n") + `\n\nTotal: **${brl(sum([...fin.overduePayables, ...fin.upcomingPayables]))}**`;
  }
  if (has(q, "receber", "recebiv", "pendente", "me deve", "devendo", "cobra")) {
    const parts: string[] = [];
    if (fin.overdueReceivables.length) parts.push("⚠️ **Atrasados:**\n" + fin.overdueReceivables.map((t) => `• ${t.description} — ${brl(t.amount)} (venceu ${d(t.due_date)})`).join("\n"));
    if (fin.upcomingReceivables.length) parts.push("📅 **Próximos 7 dias:**\n" + fin.upcomingReceivables.map((t) => `• ${t.description} — ${brl(t.amount)} (${d(t.due_date)})`).join("\n"));
    if (s.pendingSales.length) parts.push(`🛍️ **Vendas aguardando pagamento:** ${s.pendingSales.length} (${brl(s.revenue.pending)})`);
    return parts.length ? parts.join("\n\n") : "Nada a receber em aberto no momento. ✅";
  }
  if (has(q, "saldo", "caixa", "lucro", "sobrou", "dinheiro", "financeiro")) {
    return `💰 **Caixa do mês**\n• Entradas: ${brl(fin.cashIn)}\n• Saídas: ${brl(fin.cashOut)}\n• Saldo: **${brl(fin.balance)}**${fin.overduePayables.length ? `\n\n⚠️ Há ${fin.overduePayables.length} conta(s) vencida(s) somando ${brl(sum(fin.overduePayables))}.` : ""}`;
  }
  if (has(q, "ticket")) return `O ticket médio do mês é **${brl(s.revenue.avgTicket)}** (${s.revenue.monthCount} vendas).\n\n💡 Para subir: ofereça um item complementar no fechamento ou um kit com desconto.`;
  if (has(q, "tarefa", "amanha", "agenda", "fazer hoje", "pendencia", "o que fazer")) {
    if (!s.tasks.length) return "Nenhuma tarefa aberta. 🎉";
    const sorted = [...s.tasks].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    return `📋 **${s.tasks.length} tarefa(s) abertas.** As mais próximas:\n` + sorted.slice(0, 8).map((t) => `• ${t.title}${t.due_date ? ` — ${t.due_date < today ? "atrasada" : t.due_date === today ? "hoje" : d(t.due_date)}` : ""}`).join("\n");
  }
  if (has(q, "whatsapp", "mensage", "conversa", "atendimento", "responder")) {
    return s.waitingConversations.length
      ? `💬 ${s.waitingConversations.length} conversa(s) aguardando resposta no WhatsApp. Abra a aba WhatsApp para ver.`
      : "💬 Nenhuma conversa aguardando resposta no WhatsApp.";
  }
  if (has(q, "aprova")) return s.pendingApprovals.length ? `✅ ${s.pendingApprovals.length} aprovação(ões) esperando você:\n` + s.pendingApprovals.map((a: { title: string }) => `• ${a.title}`).join("\n") : "Nenhuma aprovação pendente.";
  if (has(q, "dica", "ideia", "como vender", "vender mais", "aumentar", "post", "instagram", "campanha", "promoc", "marketing", "reels")) return tips(s, kind, me);
  if (has(q, "resumo", "como esta", "como estao", "visao geral", "panorama", "status")) return summary(s);
  // Pergunta curta só com período ("e na semana?", "e ontem?") → vendas do período
  if (has(q, "hoje", "ontem", "semana", "7 dias", "mes")) return answer("vendas " + raw, s, agentName, kind);

  return `Hmm, não entendi bem "${raw.slice(0, 80)}" 🤔\n\nNo modo básico eu respondo sobre os seus dados. Tente, por exemplo:\n• "Quanto vendi hoje?" ou "e na semana?"\n• "Quais contas vencem essa semana?"\n• "Quem são meus melhores clientes?"\n• "Como está a ${s.customers[0]?.name.split(" ")[0] ?? "Maria"}?"\n• "Qual a previsão de vendas do mês?"`;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function capabilities(kind: Kind | null, me: string) {
  const byKind: Record<Kind, string> = {
    marketing: "ideias de posts e campanhas, produtos para destacar, clientes para reativar com promoção",
    sales: "vendas do dia/semana/mês, produtos mais vendidos, clientes que sumiram e previsão do mês",
    finance: "contas a pagar e a receber, vencidas, saldo do mês e despesas por categoria",
    crm: "leads esfriando, melhores clientes, tarefas de follow-up e informações de cada cliente",
    support: "conversas aguardando no WhatsApp, aprovações e mensagens prontas para clientes",
  };
  return `${me}Posso te ajudar com ${kind ? byKind[kind] : "vendas, financeiro, clientes, tarefas, WhatsApp e ideias de marketing"}.\n\nÉ só perguntar do seu jeito, por exemplo: "quanto vendi essa semana?"`;
}

function summary(s: Snapshot) {
  const diff = s.revenue.prevMonthToDate ? ((s.revenue.month - s.revenue.prevMonthToDate) / s.revenue.prevMonthToDate) * 100 : null;
  return [
    `📊 **Resumo de hoje**`,
    `• Vendas no mês: ${brl(s.revenue.month)}${diff !== null ? ` (${diff >= 0 ? "+" : ""}${diff.toFixed(0)}% vs mês passado)` : ""}`,
    `• Saldo do mês: ${brl(s.finance.balance)}`,
    s.finance.overduePayables.length ? `• ⚠️ ${s.finance.overduePayables.length} conta(s) vencida(s)` : `• Nenhuma conta vencida`,
    `• Clientes sem comprar há 30+ dias: ${s.inactive.length}`,
    `• Tarefas até amanhã: ${s.tasksDue.length}`,
    s.pendingApprovals.length ? `• ${s.pendingApprovals.length} aprovação(ões) esperando você` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function tips(s: Snapshot, kind: Kind | null, me: string) {
  const top = s.topProducts[0]?.name;
  const out: string[] = [`${me}Algumas ideias com base nos seus números:`];
  if (top) out.push(`• Faça um Reels mostrando **${cap(top)}** (seu mais vendido) em uso, com o preço na legenda e chamada para o WhatsApp.`);
  if (s.inactive.length) out.push(`• Campanha "sentimos sua falta" para os ${s.inactive.length} clientes sem comprar há 30+ dias, com um cupom válido por 48h.`);
  if (s.revenue.avgTicket) out.push(`• Kit/combinação para subir o ticket médio (hoje ${brl(s.revenue.avgTicket)}): ofereça um item complementar com desconto.`);
  if (s.coldLeads.length) out.push(`• Responda os ${s.coldLeads.length} lead(s) esfriando ainda hoje.`);
  out.push(`• Stories diários com bastidores + enquete ("qual cor você prefere?") aumentam o alcance e as conversas.`);
  if (kind !== "marketing") out.push(`\nPara ideias com o que está em alta na internet, fale com o agente de Marketing.`);
  return out.join("\n");
}

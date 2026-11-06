// Ferramentas do Agente SCALABLE, organizadas por domínio.
// Regras:
//  - Ferramentas de consulta leem dados reais da empresa (sempre filtradas por company_id; o cliente do banco
//    usado nas conversas é o do próprio usuário, então o RLS também garante o isolamento).
//  - Ferramentas que mudam algo relevante (mensagens, e-mails, campanhas, financeiro, exclusões, cadastro)
//    NÃO executam: apenas criam um pedido na Central de Aprovações.
//  - Tarefas internas (criar/concluir tarefa) são executadas direto, por serem organização interna.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { addDays, brl, fmtDate, isoDate, norm, pct, resolvePeriod, sum } from "./util.ts";

export type Area = "sales" | "marketing" | "finance" | "support" | "management";
export type ToolCtx = { db: SupabaseClient; companyId: string; threadId?: string | null; today?: Date };
type Json = Record<string, unknown>;
export type Tool = {
  name: string;
  area: Area;
  label: string; // texto curto exibido na interface ("Consultou vendas")
  description: string;
  input_schema: Json;
  run: (ctx: ToolCtx, input: Json) => Promise<unknown>;
};

export const AREA_LABEL: Record<Area, string> = {
  sales: "Vendas",
  marketing: "Marketing",
  finance: "Financeiro",
  support: "Atendimento",
  management: "Gestão",
};
// Valor gravado em insights/tarefas/aprovações (coluna agent_kind, mantida por compatibilidade)
const AREA_KIND: Record<Area, string> = { sales: "sales", marketing: "marketing", finance: "finance", support: "support", management: "crm" };

const PERIODO = {
  type: "string",
  enum: ["hoje", "ontem", "7d", "30d", "mes", "mes_anterior", "90d", "ano"],
  description: "Período nomeado. 'mes' = mês atual até hoje. Ignorado se 'de' e 'ate' forem informados.",
};
const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };

export function todayBR(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(s + "T12:00:00Z");
}
const today = (ctx: ToolCtx) => ctx.today ?? todayBR();

// ---------------- Acesso a dados ----------------

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown as T)) as T;
}

type SaleRow = { id: string; customer_id: string | null; description: string; amount: number; status: string; sold_at: string };
async function sales(ctx: ToolCtx, de: string, ate: string, includeCancelled = false): Promise<SaleRow[]> {
  let q = ctx.db.from("sales").select("id,customer_id,description,amount,status,sold_at").eq("company_id", ctx.companyId).gte("sold_at", de).lte("sold_at", ate).limit(10000);
  if (!includeCancelled) q = q.neq("status", "cancelled");
  return check<SaleRow[]>(await q).map((s) => ({ ...s, amount: Number(s.amount) }));
}

type CustomerRow = { id: string; name: string; phone: string | null; email: string | null; status: string; notes: string | null; last_contact_at: string | null; created_at: string };
async function customers(ctx: ToolCtx): Promise<CustomerRow[]> {
  return check<CustomerRow[]>(await ctx.db.from("customers").select("id,name,phone,email,status,notes,last_contact_at,created_at").eq("company_id", ctx.companyId).limit(5000));
}

type TxRow = { id: string; type: string; description: string; category: string | null; amount: number; due_date: string; paid_at: string | null };
async function transactions(ctx: ToolCtx): Promise<TxRow[]> {
  return check<TxRow[]>(await ctx.db.from("transactions").select("id,type,description,category,amount,due_date,paid_at").eq("company_id", ctx.companyId).limit(10000)).map((t) => ({
    ...t,
    amount: Number(t.amount),
  }));
}

function salesStats(list: SaleRow[]) {
  const total = sum(list);
  return { total: round(total), quantidade: list.length, ticket_medio: list.length ? round(total / list.length) : 0 };
}
const round = (n: number) => Math.round(n * 100) / 100;

function groupTop<T>(list: T[], key: (x: T) => string, val: (x: T) => number, n = 5) {
  const m = new Map<string, { total: number; qtd: number }>();
  for (const x of list) {
    const k = key(x);
    const cur = m.get(k) ?? { total: 0, qtd: 0 };
    cur.total += val(x);
    cur.qtd++;
    m.set(k, cur);
  }
  return [...m].sort((a, b) => b[1].total - a[1].total).slice(0, n).map(([nome, v]) => ({ nome, total: round(v.total), quantidade: v.qtd }));
}

/** Cria um pedido na Central de Aprovações (nada é executado aqui). */
/** Textos para clientes que prometem desconto, cupom ou brinde: a aprovação avisa o dono em destaque. */
const OFFER = /\b\d{1,2}\s?%|\bcupo(m|ns)\b|\bc[oó]digo\b|\bdesconto|\boff\b|frete gr[aá]tis|\bbrinde|\bpresente especial/i;
export const OFFER_WARNING = "⚠️ O texto oferece desconto, cupom ou brinde. Confirme se essa oferta existe antes de aprovar (você pode editar o texto).";

async function propose(
  ctx: ToolCtx,
  a: { kind: string; area: Area; title: string; reason: string; payload: Json; draft?: string | null; customer_id?: string | null },
) {
  const offer = !!a.draft && OFFER.test(a.draft);
  if (offer) a = { ...a, reason: `${OFFER_WARNING} ${a.reason}`.slice(0, 500) };
  const r = await ctx.db
    .from("approvals")
    .insert({
      company_id: ctx.companyId,
      agent_kind: AREA_KIND[a.area],
      kind: a.kind,
      title: a.title.slice(0, 160),
      reason: a.reason,
      draft: a.draft ?? null,
      customer_id: a.customer_id ?? null,
      payload: a.payload,
      thread_id: ctx.threadId ?? null,
    })
    .select("id,kind,title,status,created_at")
    .single();
  const ap = check<{ id: string; kind: string; title: string; status: string; created_at: string }>(r);
  return {
    aprovacao_criada: true,
    aprovacao_id: ap.id,
    status: "aguardando aprovação do dono",
    titulo: ap.title,
    observacao: "Nada foi executado. O dono precisa aprovar na Central de Aprovações.",
    ...(offer ? { atencao: "O texto cita desconto/cupom/brinde que não veio dos dados. Avise o dono para confirmar se a oferta existe." } : {}),
  };
}

async function ownRow(ctx: ToolCtx, table: string, id: string, cols = "id") {
  const r = await ctx.db.from(table).select(cols).eq("company_id", ctx.companyId).eq("id", id).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  if (!r.data) throw new Error(`Registro não encontrado nesta empresa (${table} ${id}).`);
  return r.data as unknown as Json;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN);
const validDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// ---------------- Datas comemorativas (calculadas, não inventadas) ----------------

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const d = new Date(Date.UTC(year, month, 1));
  const shift = (weekday - d.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + shift + (n - 1) * 7));
}
function upcomingDates(from: Date, days = 75) {
  const y = from.getUTCFullYear();
  const list: { nome: string; data: string }[] = [];
  for (const yy of [y, y + 1]) {
    const blackFriday = addDays(nthWeekday(yy, 10, 4, 4), 1);
    list.push(
      { nome: "Ano Novo", data: `${yy}-01-01` },
      { nome: "Dia do Consumidor", data: `${yy}-03-15` },
      { nome: "Dia das Mães", data: isoDate(nthWeekday(yy, 4, 0, 2)) },
      { nome: "Dia dos Namorados", data: `${yy}-06-12` },
      { nome: "Dia dos Pais", data: isoDate(nthWeekday(yy, 7, 0, 2)) },
      { nome: "Dia do Cliente", data: `${yy}-09-15` },
      { nome: "Dia das Crianças", data: `${yy}-10-12` },
      { nome: "Black Friday", data: isoDate(blackFriday) },
      { nome: "Cyber Monday", data: isoDate(addDays(blackFriday, 3)) },
      { nome: "Natal", data: `${yy}-12-25` },
    );
  }
  const a = isoDate(from);
  const b = isoDate(addDays(from, days));
  return list.filter((x) => x.data >= a && x.data <= b).sort((p, q) => p.data.localeCompare(q.data));
}

// ---------------- Ferramentas ----------------

export const TOOLS: Tool[] = [
  // ===== VENDAS =====
  {
    name: "vendas_resumo",
    area: "sales",
    label: "Consultou vendas",
    description: "Resumo real de vendas de um período: total, quantidade, ticket médio, por status, produtos e clientes que mais compraram, vendas por dia e comparação com o período anterior equivalente.",
    input_schema: { type: "object", properties: { periodo: PERIODO, de: DATA, ate: DATA } },
    async run(ctx, i) {
      const { atual, anterior } = resolvePeriod(str(i.periodo) || undefined, validDate(i.de) ?? undefined, validDate(i.ate) ?? undefined, today(ctx));
      const [all, prev, cust] = await Promise.all([sales(ctx, atual.de, atual.ate, true), sales(ctx, anterior.de, anterior.ate), customers(ctx)]);
      const list = all.filter((s) => s.status !== "cancelled");
      const names = new Map(cust.map((c) => [c.id, c.name]));
      const cur = salesStats(list);
      const ant = salesStats(prev);
      const porDia = new Map<string, number>();
      for (const s of list) porDia.set(s.sold_at, (porDia.get(s.sold_at) ?? 0) + s.amount);
      return {
        periodo: atual,
        ...cur,
        por_status: {
          pagas: salesStats(all.filter((s) => s.status === "paid")),
          pendentes: salesStats(all.filter((s) => s.status === "pending")),
          canceladas: salesStats(all.filter((s) => s.status === "cancelled")),
        },
        produtos_top: groupTop(list, (s) => s.description, (s) => s.amount),
        clientes_top: groupTop(list.filter((s) => s.customer_id), (s) => names.get(s.customer_id!) ?? "—", (s) => s.amount),
        vendas_por_dia: [...porDia].sort().map(([data, total]) => ({ data, total: round(total) })).slice(-62),
        comparacao: { periodo_anterior: anterior, ...ant, variacao_total_pct: pct(cur.total, ant.total), variacao_quantidade_pct: pct(cur.quantidade, ant.quantidade) },
      };
    },
  },
  {
    name: "vendas_listar",
    area: "sales",
    label: "Listou vendas",
    description: "Lista vendas reais com filtros (período, status, cliente, produto).",
    input_schema: {
      type: "object",
      properties: {
        periodo: PERIODO,
        de: DATA,
        ate: DATA,
        status: { type: "string", enum: ["paid", "pending", "cancelled"] },
        cliente: { type: "string", description: "Parte do nome do cliente" },
        produto: { type: "string", description: "Parte do nome do produto" },
        limite: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    async run(ctx, i) {
      const { atual } = resolvePeriod(str(i.periodo) || "30d", validDate(i.de) ?? undefined, validDate(i.ate) ?? undefined, today(ctx));
      const [list, cust] = await Promise.all([sales(ctx, atual.de, atual.ate, true), customers(ctx)]);
      const names = new Map(cust.map((c) => [c.id, c.name]));
      const fc = norm(str(i.cliente));
      const fp = norm(str(i.produto));
      const rows = list
        .filter((s) => !i.status || s.status === i.status)
        .filter((s) => !fp || norm(s.description).includes(fp))
        .filter((s) => !fc || norm(names.get(s.customer_id ?? "") ?? "").includes(fc))
        .sort((a, b) => b.sold_at.localeCompare(a.sold_at));
      const lim = Math.min(Number(i.limite) || 30, 100);
      return {
        periodo: atual,
        encontradas: rows.length,
        total: round(sum(rows)),
        vendas: rows.slice(0, lim).map((s) => ({ id: s.id, data: s.sold_at, produto: s.description, valor: s.amount, status: s.status, cliente: names.get(s.customer_id ?? "") ?? null })),
      };
    },
  },
  {
    name: "produtos_desempenho",
    area: "sales",
    label: "Analisou produtos",
    description: "Desempenho real por produto/serviço no período: faturamento, quantidade, preço médio e variação contra o período anterior.",
    input_schema: { type: "object", properties: { periodo: PERIODO, de: DATA, ate: DATA } },
    async run(ctx, i) {
      const { atual, anterior } = resolvePeriod(str(i.periodo) || "30d", validDate(i.de) ?? undefined, validDate(i.ate) ?? undefined, today(ctx));
      const [cur, prev] = await Promise.all([sales(ctx, atual.de, atual.ate), sales(ctx, anterior.de, anterior.ate)]);
      const prevMap = new Map(groupTop(prev, (s) => s.description, (s) => s.amount, 500).map((p) => [p.nome, p.total]));
      return {
        periodo: atual,
        produtos: groupTop(cur, (s) => s.description, (s) => s.amount, 30).map((p) => ({
          ...p,
          preco_medio: round(p.total / p.quantidade),
          total_periodo_anterior: prevMap.get(p.nome) ?? 0,
          variacao_pct: pct(p.total, prevMap.get(p.nome) ?? 0),
        })),
      };
    },
  },
  {
    name: "clientes_inativos",
    area: "sales",
    label: "Buscou clientes inativos",
    description: "Clientes (não leads) sem compra há N dias, com quanto já compraram e a última compra.",
    input_schema: { type: "object", properties: { dias: { type: "integer", minimum: 7, maximum: 365 }, limite: { type: "integer", minimum: 1, maximum: 100 } } },
    async run(ctx, i) {
      const dias = Number(i.dias) || 30;
      const t = today(ctx);
      const [cust, hist] = await Promise.all([customers(ctx), sales(ctx, isoDate(addDays(t, -730)), isoDate(t))]);
      const last = new Map<string, string>();
      const tot = new Map<string, number>();
      for (const s of hist) {
        if (!s.customer_id) continue;
        if ((last.get(s.customer_id) ?? "") < s.sold_at) last.set(s.customer_id, s.sold_at);
        tot.set(s.customer_id, (tot.get(s.customer_id) ?? 0) + s.amount);
      }
      const cutoff = isoDate(addDays(t, -dias));
      const rows = cust
        .filter((c) => c.status !== "lead")
        .map((c) => ({ c, ultima: last.get(c.id) ?? null }))
        .filter((x) => (x.ultima ?? x.c.created_at.slice(0, 10)) < cutoff)
        .map((x) => ({ id: x.c.id, nome: x.c.name, telefone: x.c.phone, status: x.c.status, ultima_compra: x.ultima, total_comprado: round(tot.get(x.c.id) ?? 0) }))
        .sort((a, b) => b.total_comprado - a.total_comprado);
      return { criterio: `sem compra há ${dias}+ dias`, quantidade: rows.length, clientes: rows.slice(0, Math.min(Number(i.limite) || 30, 100)) };
    },
  },
  {
    name: "leads_listar",
    area: "sales",
    label: "Consultou leads",
    description: "Lista os leads cadastrados, indicando os que estão sem contato há 3+ dias (esfriando).",
    input_schema: { type: "object", properties: { somente_frios: { type: "boolean" } } },
    async run(ctx, i) {
      const cust = await customers(ctx);
      const cutoff = addDays(today(ctx), -3).toISOString();
      const leads = cust
        .filter((c) => c.status === "lead")
        .map((c) => ({ id: c.id, nome: c.name, telefone: c.phone, email: c.email, observacoes: c.notes, ultimo_contato: c.last_contact_at, criado_em: c.created_at.slice(0, 10), esfriando: (c.last_contact_at ?? c.created_at) < cutoff }))
        .filter((l) => !i.somente_frios || l.esfriando);
      return { quantidade: leads.length, esfriando: leads.filter((l) => l.esfriando).length, leads: leads.slice(0, 100) };
    },
  },
  {
    name: "funil_vendas",
    area: "sales",
    label: "Analisou o funil",
    description: "Situação do funil comercial com dados reais: clientes por estágio (lead, ativo, VIP, inativo), leads esfriando, clientes que compraram nos últimos 30 dias e vendas aguardando pagamento.",
    input_schema: { type: "object", properties: {} },
    async run(ctx) {
      const t = today(ctx);
      const [cust, recent] = await Promise.all([customers(ctx), sales(ctx, isoDate(addDays(t, -30)), isoDate(t), true)]);
      const by = (s: string) => cust.filter((c) => c.status === s).length;
      const buyers = new Set(recent.filter((s) => s.status !== "cancelled" && s.customer_id).map((s) => s.customer_id));
      const cutoff = addDays(t, -3).toISOString();
      const pend = recent.filter((s) => s.status === "pending");
      return {
        estagios: { leads: by("lead"), ativos: by("active"), vip: by("vip"), inativos: by("inactive"), total: cust.length },
        leads_esfriando: cust.filter((c) => c.status === "lead" && (c.last_contact_at ?? c.created_at) < cutoff).length,
        clientes_que_compraram_30d: buyers.size,
        vendas_aguardando_pagamento_30d: { quantidade: pend.length, total: round(sum(pend)) },
        observacao: "A plataforma não registra histórico de mudança de estágio; taxas de conversão entre estágios não estão disponíveis.",
      };
    },
  },
  {
    name: "venda_registrar_preparar",
    area: "sales",
    label: "Preparou registro de venda",
    description: "Prepara o registro de uma venda. NÃO registra: cria um pedido de aprovação para o dono.",
    input_schema: {
      type: "object",
      required: ["descricao", "valor"],
      properties: {
        descricao: { type: "string" },
        valor: { type: "number", minimum: 0 },
        data: DATA,
        status: { type: "string", enum: ["paid", "pending"] },
        cliente_id: { type: "string", description: "id do cliente (opcional, use cliente_consultar para achar)" },
      },
    },
    async run(ctx, i) {
      const descricao = str(i.descricao);
      const valor = num(i.valor);
      if (!descricao || !(valor >= 0)) throw new Error("Informe descrição e valor válidos.");
      let cliente: string | null = null;
      if (str(i.cliente_id)) cliente = String((await ownRow(ctx, "customers", str(i.cliente_id), "id,name")).name);
      const payload = { description: descricao, amount: valor, sold_at: validDate(i.data) ?? isoDate(today(ctx)), status: i.status === "pending" ? "pending" : "paid", customer_id: str(i.cliente_id) || null };
      return propose(ctx, { kind: "sale_create", area: "sales", title: `Registrar venda: ${descricao} (${brl(valor)})`, reason: `Venda ${payload.status === "paid" ? "paga" : "pendente"} em ${fmtDate(payload.sold_at)}${cliente ? ` para ${cliente}` : ""}`, payload });
    },
  },

  // ===== MARKETING =====
  {
    name: "marketing_contexto",
    area: "marketing",
    label: "Consultou o perfil de marketing",
    description: "Dados reais para planejar marketing: perfil da empresa, Instagram, site e sua análise, produtos mais vendidos, tamanho de cada público (VIP, ativos, inativos, leads) e datas comemorativas próximas.",
    input_schema: { type: "object", properties: {} },
    async run(ctx) {
      const t = today(ctx);
      const [co, cust, recent] = await Promise.all([
        ctx.db.from("companies").select("name,segment,description,website,instagram,site_analysis,site_analyzed_at").eq("id", ctx.companyId).single(),
        customers(ctx),
        sales(ctx, isoDate(addDays(t, -30)), isoDate(t)),
      ]);
      const c = check<Json>(co);
      const sa = c.site_analysis as Json | null;
      return {
        empresa: { nome: c.name, segmento: c.segment, descricao: c.description, instagram: c.instagram, site: c.website },
        analise_do_site: sa ? { nota: sa.score, resumo: sa.summary, melhorias: sa.improvements, produtos_identificados: sa.products, analisado_em: c.site_analyzed_at } : null,
        produtos_mais_vendidos_30d: groupTop(recent, (s) => s.description, (s) => s.amount),
        publicos: {
          vip: cust.filter((x) => x.status === "vip").length,
          ativos: cust.filter((x) => x.status === "active").length,
          inativos: cust.filter((x) => x.status === "inactive").length,
          leads: cust.filter((x) => x.status === "lead").length,
          com_whatsapp: cust.filter((x) => x.phone).length,
          com_email: cust.filter((x) => x.email).length,
        },
        datas_comemorativas_proximas: upcomingDates(t),
        metricas_de_redes_sociais: "não integradas (sem dados de alcance/engajamento disponíveis)",
      };
    },
  },
  {
    name: "campanhas_listar",
    area: "marketing",
    label: "Consultou campanhas",
    description: "Campanhas preparadas na plataforma e seus resultados registrados (envios realizados). Métricas de anúncios/redes sociais não estão integradas.",
    input_schema: { type: "object", properties: {} },
    async run(ctx) {
      const r = await ctx.db
        .from("approvals")
        .select("id,kind,title,status,payload,result,created_at,decided_at")
        .eq("company_id", ctx.companyId)
        .in("kind", ["campaign_whatsapp", "campaign_external"])
        .order("created_at", { ascending: false })
        .limit(30);
      const list = check<Json[]>(r);
      return {
        campanhas: list.map((x) => ({ id: x.id, titulo: x.title, canal: (x.payload as Json | null)?.canal, publico: (x.payload as Json | null)?.publico, status: x.status, resultado: x.result, criada_em: x.created_at, decidida_em: x.decided_at })),
        observacao: list.length ? undefined : "Nenhuma campanha registrada ainda.",
      };
    },
  },
  {
    name: "campanha_preparar",
    area: "marketing",
    label: "Preparou campanha",
    description:
      "Prepara uma campanha para aprovação (NÃO publica nem envia). Canal 'whatsapp' envia a mensagem para o público escolhido após aprovação (use {nome} para personalizar). Outros canais ficam registrados, mas a publicação automática não está integrada.",
    input_schema: {
      type: "object",
      required: ["nome", "canal", "publico", "mensagem"],
      properties: {
        nome: { type: "string" },
        canal: { type: "string", enum: ["whatsapp", "instagram", "email", "outro"] },
        publico: { type: "string", enum: ["inativos", "leads", "vip", "ativos", "todos", "lista"] },
        cliente_ids: { type: "array", items: { type: "string" }, description: "Obrigatório quando publico = 'lista'" },
        mensagem: { type: "string" },
        dias_inatividade: { type: "integer", minimum: 7, maximum: 365 },
        observacoes: { type: "string" },
      },
    },
    async run(ctx, i) {
      const canal = str(i.canal);
      const publico = str(i.publico);
      const mensagem = str(i.mensagem);
      if (!mensagem) throw new Error("A campanha precisa de uma mensagem.");
      const t = today(ctx);
      const cust = await customers(ctx);
      let alvo: CustomerRow[] = [];
      if (publico === "lista") {
        const ids = new Set(Array.isArray(i.cliente_ids) ? i.cliente_ids.map(String) : []);
        alvo = cust.filter((c) => ids.has(c.id));
      } else if (publico === "inativos") {
        const dias = Number(i.dias_inatividade) || 30;
        const hist = await sales(ctx, isoDate(addDays(t, -730)), isoDate(t));
        const last = new Map<string, string>();
        for (const s of hist) if (s.customer_id && (last.get(s.customer_id) ?? "") < s.sold_at) last.set(s.customer_id, s.sold_at);
        const cutoff = isoDate(addDays(t, -dias));
        alvo = cust.filter((c) => c.status !== "lead" && (last.get(c.id) ?? c.created_at.slice(0, 10)) < cutoff);
      } else if (publico === "todos") alvo = cust;
      else alvo = cust.filter((c) => c.status === { leads: "lead", vip: "vip", ativos: "active" }[publico]);

      const comCanal = canal === "whatsapp" ? alvo.filter((c) => c.phone) : canal === "email" ? alvo.filter((c) => c.email) : alvo;
      const payload = {
        nome: str(i.nome),
        canal,
        publico,
        mensagem,
        observacoes: str(i.observacoes) || null,
        clientes: comCanal.slice(0, 300).map((c) => ({ id: c.id, nome: c.name, telefone: c.phone, email: c.email })),
      };
      const res = await propose(ctx, {
        kind: canal === "whatsapp" ? "campaign_whatsapp" : "campaign_external",
        area: "marketing",
        title: `Campanha: ${payload.nome || "sem nome"} (${canal}, ${comCanal.length} contato(s))`,
        reason: `Público: ${publico}. ${alvo.length - comCanal.length > 0 ? `${alvo.length - comCanal.length} cliente(s) do público sem ${canal === "email" ? "e-mail" : "telefone"} ficaram de fora.` : ""}`.trim(),
        payload,
        draft: mensagem,
      });
      return { ...res, publico_total: alvo.length, contatos_alcancaveis: comCanal.length, envio_automatico: canal === "whatsapp" ? "após aprovação, via WhatsApp Business conectado" : "não integrado — fica registrado para execução manual" };
    },
  },

  // ===== FINANCEIRO =====
  {
    name: "financeiro_resumo",
    area: "finance",
    label: "Consultou o financeiro",
    description:
      "Resumo financeiro real do período: receitas recebidas (vendas pagas + lançamentos de receita pagos), despesas pagas por categoria, saldo, contas em aberto (vencidas e próximos 7 dias) e comparação com o período anterior.",
    input_schema: { type: "object", properties: { periodo: PERIODO, de: DATA, ate: DATA } },
    async run(ctx, i) {
      const t = today(ctx);
      const { atual, anterior } = resolvePeriod(str(i.periodo) || undefined, validDate(i.de) ?? undefined, validDate(i.ate) ?? undefined, t);
      const [txs, sCur, sPrev] = await Promise.all([transactions(ctx), sales(ctx, atual.de, atual.ate), sales(ctx, anterior.de, anterior.ate)]);
      const paidIn = (r: { de: string; ate: string }, type: string) => txs.filter((x) => x.type === type && x.paid_at && x.paid_at >= r.de && x.paid_at <= r.ate);
      const calc = (r: { de: string; ate: string }, s: SaleRow[]) => {
        const vendas = sum(s.filter((x) => x.status === "paid"));
        const receitas = sum(paidIn(r, "income"));
        const despesas = sum(paidIn(r, "expense"));
        return { vendas_recebidas: round(vendas), outras_receitas: round(receitas), despesas_pagas: round(despesas), saldo: round(vendas + receitas - despesas) };
      };
      const cur = calc(atual, sCur);
      const prev = calc(anterior, sPrev);
      const cats = new Map<string, number>();
      for (const x of paidIn(atual, "expense")) cats.set(x.category || "Outros", (cats.get(x.category || "Outros") ?? 0) + x.amount);
      const tStr = isoDate(t);
      const in7 = isoDate(addDays(t, 7));
      const open = txs.filter((x) => !x.paid_at);
      const item = (x: TxRow) => ({ id: x.id, descricao: x.description, valor: x.amount, vencimento: x.due_date, categoria: x.category });
      return {
        periodo: atual,
        ...cur,
        despesas_por_categoria: [...cats].sort((a, b) => b[1] - a[1]).map(([categoria, total]) => ({ categoria, total: round(total) })),
        em_aberto: {
          a_pagar_vencidas: open.filter((x) => x.type === "expense" && x.due_date < tStr).map(item),
          a_pagar_proximos_7_dias: open.filter((x) => x.type === "expense" && x.due_date >= tStr && x.due_date <= in7).map(item),
          a_receber_atrasadas: open.filter((x) => x.type === "income" && x.due_date < tStr).map(item),
          a_receber_proximos_7_dias: open.filter((x) => x.type === "income" && x.due_date >= tStr && x.due_date <= in7).map(item),
          total_a_pagar: round(sum(open.filter((x) => x.type === "expense"))),
          total_a_receber: round(sum(open.filter((x) => x.type === "income"))),
        },
        comparacao: { periodo_anterior: anterior, ...prev, variacao_saldo_pct: pct(cur.saldo, prev.saldo), variacao_despesas_pct: pct(cur.despesas_pagas, prev.despesas_pagas) },
        observacao: "Despesas consideram lançamentos marcados como pagos no período. Lançamentos sem data de pagamento aparecem em 'em_aberto'.",
      };
    },
  },
  {
    name: "financeiro_listar",
    area: "finance",
    label: "Listou lançamentos",
    description: "Lista lançamentos financeiros reais (contas a pagar/receber) com filtros.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["receita", "despesa"] },
        situacao: { type: "string", enum: ["aberto", "pago", "vencido"] },
        de: DATA,
        ate: DATA,
        categoria: { type: "string" },
        limite: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    async run(ctx, i) {
      const tStr = isoDate(today(ctx));
      const tipo = i.tipo === "receita" ? "income" : i.tipo === "despesa" ? "expense" : null;
      const de = validDate(i.de);
      const ate = validDate(i.ate);
      const cat = norm(str(i.categoria));
      const rows = (await transactions(ctx))
        .filter((x) => !tipo || x.type === tipo)
        .filter((x) => (i.situacao === "pago" ? !!x.paid_at : i.situacao === "aberto" ? !x.paid_at : i.situacao === "vencido" ? !x.paid_at && x.due_date < tStr : true))
        .filter((x) => (!de || x.due_date >= de) && (!ate || x.due_date <= ate))
        .filter((x) => !cat || norm(x.category ?? "").includes(cat))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      return {
        encontrados: rows.length,
        total: round(sum(rows)),
        lancamentos: rows.slice(0, Math.min(Number(i.limite) || 50, 200)).map((x) => ({ id: x.id, tipo: x.type === "income" ? "receita" : "despesa", descricao: x.description, categoria: x.category, valor: x.amount, vencimento: x.due_date, pago_em: x.paid_at })),
      };
    },
  },
  {
    name: "comparar_periodos",
    area: "finance",
    label: "Comparou períodos",
    description: "Compara dois períodos com dados reais: vendas, receitas, despesas e saldo.",
    input_schema: {
      type: "object",
      required: ["a_de", "a_ate", "b_de", "b_ate"],
      properties: { a_de: DATA, a_ate: DATA, b_de: DATA, b_ate: DATA },
    },
    async run(ctx, i) {
      const ranges = [
        { de: validDate(i.a_de), ate: validDate(i.a_ate) },
        { de: validDate(i.b_de), ate: validDate(i.b_ate) },
      ];
      if (ranges.some((r) => !r.de || !r.ate)) throw new Error("Datas inválidas. Use AAAA-MM-DD.");
      const txs = await transactions(ctx);
      const out = [];
      for (const r of ranges as { de: string; ate: string }[]) {
        const s = await sales(ctx, r.de, r.ate);
        const inc = sum(txs.filter((x) => x.type === "income" && x.paid_at && x.paid_at >= r.de && x.paid_at <= r.ate));
        const exp = sum(txs.filter((x) => x.type === "expense" && x.paid_at && x.paid_at >= r.de && x.paid_at <= r.ate));
        const paidSales = sum(s.filter((x) => x.status === "paid"));
        out.push({ ...r, vendas: salesStats(s), receitas_recebidas: round(paidSales + inc), despesas_pagas: round(exp), saldo: round(paidSales + inc - exp) });
      }
      return {
        periodo_a: out[0],
        periodo_b: out[1],
        variacao_b_sobre_a_pct: {
          vendas: pct(out[1].vendas.total, out[0].vendas.total),
          receitas: pct(out[1].receitas_recebidas, out[0].receitas_recebidas),
          despesas: pct(out[1].despesas_pagas, out[0].despesas_pagas),
          saldo: pct(out[1].saldo, out[0].saldo),
        },
      };
    },
  },
  {
    name: "lancamento_preparar",
    area: "finance",
    label: "Preparou lançamento financeiro",
    description: "Prepara um novo lançamento (despesa ou receita). NÃO registra: cria um pedido de aprovação.",
    input_schema: {
      type: "object",
      required: ["tipo", "descricao", "valor", "vencimento"],
      properties: {
        tipo: { type: "string", enum: ["receita", "despesa"] },
        descricao: { type: "string" },
        valor: { type: "number", minimum: 0 },
        vencimento: DATA,
        categoria: { type: "string" },
        ja_pago: { type: "boolean" },
      },
    },
    async run(ctx, i) {
      const descricao = str(i.descricao);
      const valor = num(i.valor);
      const venc = validDate(i.vencimento);
      if (!descricao || !(valor >= 0) || !venc) throw new Error("Informe descrição, valor e vencimento (AAAA-MM-DD).");
      const payload = { type: i.tipo === "receita" ? "income" : "expense", description: descricao, amount: valor, due_date: venc, category: str(i.categoria) || null, paid: !!i.ja_pago };
      return propose(ctx, {
        kind: "finance_create",
        area: "finance",
        title: `${payload.type === "expense" ? "Registrar despesa" : "Registrar receita"}: ${descricao} (${brl(valor)})`,
        reason: `Vencimento ${fmtDate(venc)}${payload.paid ? " · já pago" : ""}${payload.category ? ` · ${payload.category}` : ""}`,
        payload,
      });
    },
  },
  {
    name: "lancamento_alterar_preparar",
    area: "finance",
    label: "Preparou alteração financeira",
    description: "Prepara uma alteração em lançamento existente (marcar como pago, mudar valor/vencimento/descrição/categoria). NÃO altera: cria um pedido de aprovação.",
    input_schema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, marcar_pago: { type: "boolean" }, valor: { type: "number" }, vencimento: DATA, descricao: { type: "string" }, categoria: { type: "string" } },
    },
    async run(ctx, i) {
      const row = await ownRow(ctx, "transactions", str(i.id), "id,description,amount,due_date,paid_at,type");
      const changes: Json = {};
      if (typeof i.marcar_pago === "boolean") changes.paid = i.marcar_pago;
      if (Number.isFinite(num(i.valor))) changes.amount = num(i.valor);
      if (validDate(i.vencimento)) changes.due_date = validDate(i.vencimento);
      if (str(i.descricao)) changes.description = str(i.descricao);
      if (str(i.categoria)) changes.category = str(i.categoria);
      if (!Object.keys(changes).length) throw new Error("Nenhuma alteração informada.");
      return propose(ctx, {
        kind: "finance_update",
        area: "finance",
        title: `Alterar lançamento: ${row.description}`,
        reason: Object.entries(changes)
          .map(([k, v]) => `${k}: ${typeof v === "number" ? brl(v) : String(v)}`)
          .join(" · "),
        payload: { id: row.id, antes: row, changes },
      });
    },
  },

  // ===== ATENDIMENTO =====
  {
    name: "cliente_consultar",
    area: "support",
    label: "Consultou cliente",
    description: "Busca clientes por nome, telefone ou e-mail e traz cadastro, compras, pendências, tarefas e o histórico recente de WhatsApp.",
    input_schema: { type: "object", required: ["busca"], properties: { busca: { type: "string" } } },
    async run(ctx, i) {
      const q = norm(str(i.busca));
      const digits = q.replace(/\D/g, "");
      if (!q) throw new Error("Informe nome, telefone ou e-mail.");
      const cust = await customers(ctx);
      const found = cust.filter((c) => norm(c.name).includes(q) || (digits.length >= 4 && (c.phone ?? "").includes(digits)) || norm(c.email ?? "").includes(q)).slice(0, 5);
      if (!found.length) return { encontrados: 0, observacao: "Nenhum cliente com esse nome/telefone/e-mail." };
      const t = today(ctx);
      const out = [];
      for (const c of found) {
        const [s, tk, conv] = await Promise.all([
          ctx.db.from("sales").select("description,amount,status,sold_at").eq("company_id", ctx.companyId).eq("customer_id", c.id).order("sold_at", { ascending: false }).limit(200),
          ctx.db.from("tasks").select("id,title,due_date").eq("company_id", ctx.companyId).eq("customer_id", c.id).eq("done", false),
          ctx.db.from("conversations").select("id,last_message_at,unread,ai_paused").eq("company_id", ctx.companyId).eq("customer_id", c.id).maybeSingle(),
        ]);
        const sl = check<{ description: string; amount: number; status: string; sold_at: string }[]>(s).map((x) => ({ ...x, amount: Number(x.amount) }));
        let msgs: Json[] = [];
        if (conv.data) {
          const m = await ctx.db.from("messages").select("direction,author,body,status,created_at").eq("conversation_id", (conv.data as Json).id as string).order("created_at", { ascending: false }).limit(6);
          msgs = check<Json[]>(m).reverse();
        }
        const valid = sl.filter((x) => x.status !== "cancelled");
        out.push({
          id: c.id,
          nome: c.name,
          status: c.status,
          telefone: c.phone,
          email: c.email,
          observacoes: c.notes,
          ultimo_contato: c.last_contact_at,
          cliente_desde: c.created_at.slice(0, 10),
          compras: { quantidade: valid.length, total: round(sum(valid)), ultimas: valid.slice(0, 5), pendentes_pagamento: round(sum(valid.filter((x) => x.status === "pending"))) },
          dias_sem_comprar: valid[0] ? Math.round((t.getTime() - Date.parse(valid[0].sold_at + "T12:00:00Z")) / 86400000) : null,
          tarefas_abertas: check<Json[]>(tk),
          whatsapp: conv.data ? { conversa_id: (conv.data as Json).id, nao_lidas: (conv.data as Json).unread, ia_pausada: (conv.data as Json).ai_paused, ultimas_mensagens: msgs } : null,
        });
      }
      return { encontrados: out.length, clientes: out };
    },
  },
  {
    name: "atendimento_conversas",
    area: "support",
    label: "Consultou o WhatsApp",
    description: "Conversas do WhatsApp com a última mensagem, não lidas e se a IA está pausada.",
    input_schema: { type: "object", properties: { somente_aguardando: { type: "boolean" }, limite: { type: "integer", minimum: 1, maximum: 50 } } },
    async run(ctx, i) {
      let q = ctx.db.from("conversations").select("id,contact_name,wa_id,unread,ai_paused,last_message_at,customer_id").eq("company_id", ctx.companyId).order("last_message_at", { ascending: false }).limit(Math.min(Number(i.limite) || 20, 50));
      if (i.somente_aguardando) q = q.gt("unread", 0);
      const convs = check<Json[]>(await q);
      const out = [];
      for (const c of convs) {
        const m = await ctx.db.from("messages").select("direction,author,body,status,created_at").eq("conversation_id", c.id as string).order("created_at", { ascending: false }).limit(1).maybeSingle();
        out.push({ ...c, ultima_mensagem: m.data });
      }
      const wa = await ctx.db.rpc("whatsapp_status");
      return { whatsapp_conectado: Array.isArray(wa.data) && wa.data.length > 0, conversas: out };
    },
  },
  {
    name: "atendimento_historico",
    area: "support",
    label: "Leu histórico de atendimento",
    description: "Mensagens de uma conversa de WhatsApp (por conversa_id ou cliente_id).",
    input_schema: { type: "object", properties: { conversa_id: { type: "string" }, cliente_id: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } } },
    async run(ctx, i) {
      let convId = str(i.conversa_id);
      if (!convId && str(i.cliente_id)) {
        const c = await ctx.db.from("conversations").select("id").eq("company_id", ctx.companyId).eq("customer_id", str(i.cliente_id)).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
        convId = (c.data as Json | null)?.id as string;
      }
      if (!convId) return { mensagens: [], observacao: "Esse cliente ainda não tem conversa no WhatsApp." };
      await ownRow(ctx, "conversations", convId);
      const m = await ctx.db.from("messages").select("direction,author,body,status,created_at").eq("company_id", ctx.companyId).eq("conversation_id", convId).order("created_at", { ascending: false }).limit(Math.min(Number(i.limite) || 30, 100));
      return { conversa_id: convId, mensagens: check<Json[]>(m).reverse() };
    },
  },
  {
    name: "whatsapp_mensagem_preparar",
    area: "support",
    label: "Preparou mensagem de WhatsApp",
    description: "Prepara uma mensagem de WhatsApp para um cliente. NÃO envia: cria um pedido de aprovação.",
    input_schema: { type: "object", required: ["cliente_id", "mensagem"], properties: { cliente_id: { type: "string" }, mensagem: { type: "string" }, motivo: { type: "string" } } },
    async run(ctx, i) {
      const c = await ownRow(ctx, "customers", str(i.cliente_id), "id,name,phone");
      if (!c.phone) throw new Error(`${c.name} não tem telefone cadastrado.`);
      const msg = str(i.mensagem);
      if (!msg) throw new Error("Mensagem vazia.");
      return propose(ctx, { kind: "whatsapp_outreach", area: "support", title: `Enviar mensagem para ${c.name}`, reason: str(i.motivo) || "Mensagem preparada pelo Agente SCALABLE", payload: { customer_id: c.id, telefone: c.phone, mensagem: msg }, draft: msg, customer_id: String(c.id) });
    },
  },
  {
    name: "email_preparar",
    area: "support",
    label: "Preparou e-mail",
    description: "Prepara um e-mail para aprovação. Observação: o envio de e-mail ainda não está integrado — fica registrado para envio manual.",
    input_schema: { type: "object", required: ["para", "assunto", "corpo"], properties: { para: { type: "string" }, assunto: { type: "string" }, corpo: { type: "string" } } },
    async run(ctx, i) {
      const payload = { para: str(i.para), assunto: str(i.assunto), corpo: str(i.corpo) };
      if (!payload.para || !payload.assunto || !payload.corpo) throw new Error("Informe destinatário, assunto e corpo.");
      const res = await propose(ctx, { kind: "email_send", area: "support", title: `E-mail para ${payload.para}: ${payload.assunto}`, reason: "Envio de e-mail não integrado: após aprovar, envie manualmente.", payload, draft: payload.corpo });
      return { ...res, envio_automatico: "não integrado" };
    },
  },
  {
    name: "cliente_salvar_preparar",
    area: "support",
    label: "Preparou cadastro de cliente",
    description: "Prepara o cadastro de um novo cliente/lead ou a atualização de um existente (informe id para atualizar). NÃO salva: cria um pedido de aprovação.",
    input_schema: {
      type: "object",
      required: ["nome"],
      properties: {
        id: { type: "string" },
        nome: { type: "string" },
        telefone: { type: "string", description: "Com DDD; o código do país 55 é adicionado se faltar" },
        email: { type: "string" },
        status: { type: "string", enum: ["lead", "active", "vip", "inactive"] },
        observacoes: { type: "string" },
      },
    },
    async run(ctx, i) {
      const id = str(i.id) || null;
      if (id) await ownRow(ctx, "customers", id);
      let phone = str(i.telefone).replace(/\D/g, "");
      if (phone && phone.length <= 11) phone = "55" + phone;
      const payload = { id, name: str(i.nome), phone: phone || null, email: str(i.email) || null, status: str(i.status) || (id ? null : "lead"), notes: str(i.observacoes) || null };
      if (!payload.name) throw new Error("Informe o nome.");
      return propose(ctx, { kind: "customer_upsert", area: "support", title: `${id ? "Atualizar" : "Cadastrar"} cliente: ${payload.name}`, reason: [payload.phone && `tel ${payload.phone}`, payload.email, payload.status].filter(Boolean).join(" · "), payload });
    },
  },

  // ===== GESTÃO =====
  {
    name: "indicadores",
    area: "management",
    label: "Consultou indicadores",
    description: "Painel geral de indicadores reais: vendas do mês x mês anterior, caixa, contas vencidas, clientes, leads, tarefas, conversas aguardando e aprovações pendentes.",
    input_schema: { type: "object", properties: {} },
    async run(ctx) {
      const t = today(ctx);
      const { atual, anterior } = resolvePeriod("mes", undefined, undefined, t);
      const tStr = isoDate(t);
      const [cur, prev, txs, cust, tasks, conv, appr] = await Promise.all([
        sales(ctx, atual.de, atual.ate),
        sales(ctx, anterior.de, anterior.ate),
        transactions(ctx),
        customers(ctx),
        ctx.db.from("tasks").select("id,due_date").eq("company_id", ctx.companyId).eq("done", false),
        ctx.db.from("conversations").select("id").eq("company_id", ctx.companyId).gt("unread", 0),
        ctx.db.from("approvals").select("id").eq("company_id", ctx.companyId).eq("status", "pending"),
      ]);
      const tk = check<{ id: string; due_date: string | null }[]>(tasks);
      const open = txs.filter((x) => !x.paid_at);
      const c = salesStats(cur);
      return {
        data: tStr,
        vendas_mes: { ...c, mesmo_periodo_mes_anterior: salesStats(prev).total, variacao_pct: pct(c.total, salesStats(prev).total), pendentes_pagamento: round(sum(cur.filter((s) => s.status === "pending"))) },
        financeiro: {
          a_pagar_em_aberto: round(sum(open.filter((x) => x.type === "expense"))),
          contas_vencidas: open.filter((x) => x.type === "expense" && x.due_date < tStr).length,
          valor_vencido: round(sum(open.filter((x) => x.type === "expense" && x.due_date < tStr))),
          a_receber_em_aberto: round(sum(open.filter((x) => x.type === "income"))),
        },
        clientes: { total: cust.length, leads: cust.filter((x) => x.status === "lead").length, novos_no_mes: cust.filter((x) => x.created_at.slice(0, 10) >= atual.de).length },
        tarefas: { abertas: tk.length, atrasadas: tk.filter((x) => x.due_date && x.due_date < tStr).length, para_hoje: tk.filter((x) => x.due_date === tStr).length },
        whatsapp_aguardando: check<unknown[]>(conv).length,
        aprovacoes_pendentes: check<unknown[]>(appr).length,
      };
    },
  },
  {
    name: "tarefas_listar",
    area: "management",
    label: "Consultou tarefas",
    description: "Lista tarefas reais (abertas, atrasadas ou concluídas).",
    input_schema: { type: "object", properties: { situacao: { type: "string", enum: ["abertas", "atrasadas", "concluidas", "hoje"] }, limite: { type: "integer", minimum: 1, maximum: 100 } } },
    async run(ctx, i) {
      const tStr = isoDate(today(ctx));
      let q = ctx.db.from("tasks").select("id,title,description,due_date,done,agent_kind,customer_id").eq("company_id", ctx.companyId).order("due_date", { ascending: true, nullsFirst: false }).limit(Math.min(Number(i.limite) || 40, 100));
      q = q.eq("done", i.situacao === "concluidas");
      if (i.situacao === "atrasadas") q = q.lt("due_date", tStr);
      if (i.situacao === "hoje") q = q.eq("due_date", tStr);
      const rows = check<Json[]>(await q);
      return { quantidade: rows.length, tarefas: rows };
    },
  },
  {
    name: "tarefa_criar",
    area: "management",
    label: "Criou tarefa",
    description: "Cria uma tarefa interna na lista de tarefas (organização interna, executa direto).",
    input_schema: {
      type: "object",
      required: ["titulo"],
      properties: { titulo: { type: "string" }, descricao: { type: "string" }, prazo: DATA, area: { type: "string", enum: ["sales", "marketing", "finance", "support", "management"] }, cliente_id: { type: "string" } },
    },
    async run(ctx, i) {
      const titulo = str(i.titulo);
      if (!titulo) throw new Error("Informe o título.");
      if (str(i.cliente_id)) await ownRow(ctx, "customers", str(i.cliente_id));
      const area = (["sales", "marketing", "finance", "support", "management"].includes(str(i.area)) ? str(i.area) : "management") as Area;
      const r = await ctx.db
        .from("tasks")
        .insert({ company_id: ctx.companyId, title: titulo.slice(0, 160), description: str(i.descricao) || null, due_date: validDate(i.prazo), agent_kind: AREA_KIND[area], customer_id: str(i.cliente_id) || null })
        .select("id,title,due_date")
        .single();
      return { tarefa_criada: check<Json>(r) };
    },
  },
  {
    name: "tarefa_concluir",
    area: "management",
    label: "Concluiu tarefa",
    description: "Marca uma tarefa interna como concluída.",
    input_schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async run(ctx, i) {
      await ownRow(ctx, "tasks", str(i.id));
      const r = await ctx.db.from("tasks").update({ done: true }).eq("company_id", ctx.companyId).eq("id", str(i.id)).select("id,title").single();
      return { tarefa_concluida: check<Json>(r) };
    },
  },
  {
    name: "aprovacoes_listar",
    area: "management",
    label: "Consultou aprovações",
    description: "Pedidos da Central de Aprovações (pendentes, aprovados ou recusados).",
    input_schema: { type: "object", properties: { status: { type: "string", enum: ["pending", "approved", "rejected"] } } },
    async run(ctx, i) {
      let q = ctx.db.from("approvals").select("id,kind,title,reason,status,result,created_at,decided_at,decided_by_email").eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(30);
      if (str(i.status)) q = q.eq("status", str(i.status));
      return { aprovacoes: check<Json[]>(await q) };
    },
  },
  {
    name: "excluir_preparar",
    area: "management",
    label: "Preparou exclusão",
    description: "Prepara a exclusão de um registro (venda, cliente, lançamento ou tarefa). NÃO exclui: cria um pedido de aprovação.",
    input_schema: {
      type: "object",
      required: ["tipo", "id", "motivo"],
      properties: { tipo: { type: "string", enum: ["venda", "cliente", "lancamento", "tarefa"] }, id: { type: "string" }, motivo: { type: "string" } },
    },
    async run(ctx, i) {
      const table = { venda: "sales", cliente: "customers", lancamento: "transactions", tarefa: "tasks" }[str(i.tipo)];
      if (!table) throw new Error("Tipo inválido.");
      const labelCol = { sales: "description", customers: "name", transactions: "description", tasks: "title" }[table]!;
      const row = await ownRow(ctx, table, str(i.id), `id,${labelCol}`);
      return propose(ctx, { kind: "record_delete", area: "management", title: `Excluir ${str(i.tipo)}: ${row[labelCol]}`, reason: str(i.motivo), payload: { table, id: row.id, label: row[labelCol] } });
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

/**
 * Roteamento por intenção: identifica as áreas citadas no pedido (palavras-chave, sem acento).
 * Assim o modelo recebe só as ferramentas relevantes — pedidos menores, mais rápidos e mais baratos
 * (essencial no plano gratuito da Groq). Sem área reconhecida → null (todas as ferramentas).
 */
const AREA_HINTS: Record<Area, RegExp> = {
  sales: /vend|fatur|ticket|produto|mais vendid|lead|funil|oportunidad|proposta|pedido|compr[aoe]|inativ|client/,
  marketing: /marketing|campanha|post|instagram|conteudo|calendario|promo|divulg|anuncio|legenda|reels|stories|tendencia|redes? socia|comemorativ|black friday|natal|publico/,
  finance: /financ|gast|despes|receit|\bcontas?\b|pagar|pago|paguei|receb|caixa|saldo|lucro|lanc|boleto|venc|custo|dinheiro|compar|mes passado|periodo|frete|aluguel|fluxo/,
  support: /whatsapp|mensag|atendiment|respond|resposta|conversa|e-?mail|client|cadastr|telefone|reclama|contato/,
  management: /tarefa|plano|indicador|relatorio|aprova|exclu|apag|remov|pendencia|resumo|geral|semana|prioridad|\bmetas?\b|organiz|\bacao|acoes/,
};
/** Ferramentas sempre disponíveis (visão geral e organização). */
const CORE = new Set(["indicadores", "tarefa_criar", "cliente_consultar"]);

export function routeAreas(text: string): Area[] | null {
  const t = norm(text);
  const areas = (Object.keys(AREA_HINTS) as Area[]).filter((a) => AREA_HINTS[a].test(t));
  return areas.length ? areas : null;
}

/** Definições no formato da API da Anthropic (todas, ou só as das áreas indicadas + as essenciais). */
export const toolDefinitions = (areas?: Area[] | null) =>
  TOOLS.filter((t) => !areas || areas.includes(t.area) || CORE.has(t.name)).map((t) => ({
    name: t.name,
    description: `[${AREA_LABEL[t.area]}] ${t.description}`,
    input_schema: t.input_schema,
  }));

/** Executa uma ferramenta com tratamento de erro (o erro volta para o modelo, não derruba a conversa). */
export async function runTool(ctx: ToolCtx, name: string, input: Json): Promise<{ ok: boolean; result: unknown; label: string; area: Area | null }> {
  const t = TOOL_MAP.get(name);
  if (!t) return { ok: false, result: { erro: `Ferramenta desconhecida: ${name}` }, label: name, area: null };
  try {
    return { ok: true, result: await t.run(ctx, input ?? {}), label: t.label, area: t.area };
  } catch (e) {
    return { ok: false, result: { erro: e instanceof Error ? e.message : String(e) }, label: t.label, area: t.area };
  }
}

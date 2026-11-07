// Assinaturas pelo Mercado Pago: assinatura mensal (/preapproval), cobranças recorrentes
// (/authorized_payments), cancelamento e avisos (webhook com x-signature).
// Tudo fica desligado até existirem MERCADOPAGO_ACCESS_TOKEN e PLANO_VALOR nos secrets do Supabase.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./util.ts";

type Json = Record<string, unknown>;
export type BillingStatus = "trial" | "active" | "overdue" | "canceled";
export type Billing = {
  company_id: string;
  status: BillingStatus;
  trial_ends_at: string | null;
  subscription_id: string | null;
  provider_status: string | null;
  payer_email: string | null;
  plan_name: string | null;
  value: number | null;
  next_due_date: string | null;
  last_payment_at: string | null;
  invoice_url: string | null;
  updated_at: string;
};

const env = (k: string) => (typeof Deno !== "undefined" ? Deno.env.get(k) : undefined)?.trim() || undefined;
const DAY = 86_400_000;

// ---------- configuração ----------

export function billingConfig() {
  const token = env("MERCADOPAGO_ACCESS_TOKEN") ?? null;
  const value = Number(String(env("PLANO_VALOR") ?? "").replace(",", "."));
  return {
    token,
    baseUrl: env("MERCADOPAGO_BASE_URL") ?? "https://api.mercadopago.com",
    /** Ambiente de testes: credenciais TEST-, ou MERCADOPAGO_AMBIENTE=teste (credenciais APP_USR de usuário de teste) */
    sandbox: (env("MERCADOPAGO_AMBIENTE") ?? "").toLowerCase().startsWith("test") || (!!token && token.startsWith("TEST-")),
    webhookSecret: env("MERCADOPAGO_WEBHOOK_SECRET") ?? null,
    appUrl: (env("APP_URL") ?? "https://scalablee.vercel.app").replace(/\/$/, ""),
    planName: env("PLANO_NOME") ?? "Scalable",
    value: Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null,
    trialDays: Math.max(0, Number(env("PLANO_TESTE_DIAS") ?? 7) || 0),
    graceDays: Math.max(0, Number(env("PLANO_TOLERANCIA_DIAS") ?? 5) || 0),
    /** Pausar o uso de quem não estiver em dia (desligado até COBRANCA_ATIVA=on). */
    enforced: (env("COBRANCA_ATIVA") ?? "").toLowerCase() === "on",
    get enabled() {
      return !!this.token && !!this.value;
    },
  };
}
export type BillingConfig = ReturnType<typeof billingConfig>;

// ---------- cliente HTTP do Mercado Pago ----------

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export class PaymentProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function mpClient(cfg: BillingConfig, fetchFn: FetchFn = (u, i) => fetch(u, i)) {
  async function call<T = Json>(method: string, path: string, body?: Json): Promise<T> {
    if (!cfg.token) throw new PaymentProviderError(503, "Cobrança não configurada (falta MERCADOPAGO_ACCESS_TOKEN).");
    const res = await fetchFn(cfg.baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      if (res.status === 401) throw new PaymentProviderError(401, "O Mercado Pago recusou o Access Token (confira MERCADOPAGO_ACCESS_TOKEN).");
      const causes = (data.cause as { description?: string }[] | undefined) ?? [];
      const msg = String(data.message ?? "") || causes.map((c) => c.description).filter(Boolean).join(" ") || `Erro ${res.status} no Mercado Pago`;
      throw new PaymentProviderError(res.status, msg);
    }
    return data as T;
  }
  return {
    createPreapproval: (p: Json) => call<Json>("POST", "/preapproval", p),
    getPreapproval: (id: string) => call<Json>("GET", `/preapproval/${encodeURIComponent(id)}`),
    updatePreapproval: (id: string, p: Json) => call<Json>("PUT", `/preapproval/${encodeURIComponent(id)}`, p),
    getAuthorizedPayment: (id: string) => call<Json>("GET", `/authorized_payments/${encodeURIComponent(id)}`),
    getPayment: (id: string) => call<Json>("GET", `/v1/payments/${encodeURIComponent(id)}`),
    searchAuthorizedPayments: (preapprovalId: string) => call<{ results?: Json[] }>("GET", `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`),
  };
}
export type MpClient = ReturnType<typeof mpClient>;

// ---------- regra de acesso ----------

/** A empresa pode usar a plataforma? (sempre sim enquanto a cobrança não estiver ativada) */
export function accessAllowed(b: Billing | null, cfg: BillingConfig, now = new Date()): boolean {
  if (!cfg.enabled || !cfg.enforced) return true;
  if (!b) return false;
  const t = now.getTime();
  const due = b.next_due_date ? new Date(b.next_due_date + "T23:59:59-03:00").getTime() : 0;
  switch (b.status) {
    case "active":
      return true;
    case "trial":
      return !!b.trial_ends_at && t < new Date(b.trial_ends_at).getTime();
    case "overdue":
      return due > 0 && t < due + cfg.graceDays * DAY; // tolerância após o vencimento
    case "canceled":
      return !!b.last_payment_at && due > 0 && t < due; // vale até o fim do período já pago
  }
}

// ---------- operações ----------

/** Garante a linha de assinatura da empresa (cria o período de teste na primeira vez). */
export async function ensureBilling(admin: SupabaseClient, company: { id: string; created_at?: string }, cfg: BillingConfig): Promise<Billing> {
  const { data } = await admin.from("billing").select("*").eq("company_id", company.id).maybeSingle();
  if (data) return data as Billing;
  const start = company.created_at ? new Date(company.created_at) : new Date();
  const trial_ends_at = new Date(Math.max(start.getTime(), Date.now()) + cfg.trialDays * DAY).toISOString();
  const { data: created, error } = await admin
    .from("billing")
    .insert({ company_id: company.id, status: "trial", trial_ends_at, plan_name: cfg.planName, value: cfg.value, provider: "mercadopago" })
    .select("*")
    .single();
  if (error || !created) {
    const again = await admin.from("billing").select("*").eq("company_id", company.id).single(); // corrida
    if (again.data) return again.data as Billing;
    throw new HttpError(500, error?.message ?? "Não foi possível iniciar a assinatura");
  }
  return created as Billing;
}

export function billingView(b: Billing, cfg: BillingConfig, now = new Date()) {
  const daysLeft = b.status === "trial" && b.trial_ends_at ? Math.max(0, Math.ceil((new Date(b.trial_ends_at).getTime() - now.getTime()) / DAY)) : null;
  const live = !!b.subscription_id && b.provider_status !== "cancelled" && b.status !== "canceled";
  return {
    enabled: cfg.enabled,
    enforced: cfg.enforced,
    sandbox: cfg.sandbox,
    plan: { name: cfg.planName, value: cfg.value, trialDays: cfg.trialDays },
    status: b.status,
    trialEndsAt: b.trial_ends_at,
    daysLeft,
    nextDueDate: b.next_due_date,
    lastPaymentAt: b.last_payment_at,
    /** Link do Mercado Pago para concluir a assinatura (enquanto ela não for autorizada) */
    invoiceUrl: live && b.provider_status === "pending" ? b.invoice_url : null,
    hasSubscription: live,
    /** A pessoa já concluiu a assinatura no Mercado Pago (cartão/conta autorizados) */
    authorized: live && b.provider_status === "authorized",
    allowed: accessAllowed(b, cfg, now),
  };
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000Z");

/**
 * Cria a assinatura mensal no Mercado Pago (status "pending") e devolve o link (init_point)
 * onde a pessoa conclui a assinatura na página segura do Mercado Pago.
 */
export async function subscribe(
  admin: SupabaseClient,
  company: { id: string; name: string; created_at?: string },
  input: { email?: unknown },
  cfg: BillingConfig,
  mp: MpClient,
  today = new Date(),
) {
  if (!cfg.enabled) throw new HttpError(503, "As assinaturas ainda não foram ativadas.");
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Informe o e-mail da sua conta do Mercado Pago.");

  const b = await ensureBilling(admin, company, cfg);
  // Já existe assinatura em andamento: reaproveita (não cria outra cobrança)
  if (b.subscription_id && b.status !== "canceled" && b.provider_status !== "cancelled") {
    const pre = await mp.getPreapproval(b.subscription_id);
    const status = String(pre.status ?? "");
    if (status !== "cancelled") {
      await admin.from("billing").update({ provider_status: status, invoice_url: (pre.init_point as string) ?? b.invoice_url, updated_at: new Date().toISOString() }).eq("company_id", company.id);
      return { invoiceUrl: status === "pending" ? ((pre.init_point as string) ?? b.invoice_url) : null, reused: true, authorized: status === "authorized" };
    }
  }

  // Primeira cobrança: no fim do teste grátis (se ainda estiver nele) ou agora
  const trialEnd = b.status === "trial" && b.trial_ends_at ? new Date(b.trial_ends_at) : null;
  const inTrial = !!trialEnd && trialEnd.getTime() > today.getTime() + 60_000;
  const pre = await mp.createPreapproval({
    reason: `Assinatura ${cfg.planName}`,
    external_reference: company.id,
    payer_email: email,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: cfg.value,
      currency_id: "BRL",
      ...(inTrial ? { start_date: iso(trialEnd!) } : {}),
    },
    back_url: `${cfg.appUrl}/assinatura`,
    status: "pending",
  });
  const id = String(pre.id ?? "");
  if (!id || !pre.init_point) throw new HttpError(502, "O Mercado Pago não devolveu o link da assinatura.");
  const next = String(pre.next_payment_date ?? "").slice(0, 10) || (inTrial ? trialEnd!.toISOString().slice(0, 10) : today.toISOString().slice(0, 10));
  const { error } = await admin
    .from("billing")
    .update({
      provider: "mercadopago",
      subscription_id: id,
      provider_status: String(pre.status ?? "pending"),
      payer_email: email,
      plan_name: cfg.planName,
      value: cfg.value,
      next_due_date: next,
      invoice_url: String(pre.init_point),
      // Ainda no teste: continua em teste. Teste vencido ou cancelado: "aguardando pagamento" (com tolerância).
      status: inTrial ? "trial" : "overdue",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", company.id);
  if (error) throw new HttpError(500, error.message);
  return { invoiceUrl: String(pre.init_point), reused: false, authorized: false };
}

const PAYMENT_LABEL = (p: Json) => {
  const pay = (p.payment ?? {}) as Json;
  const s = String(pay.status ?? p.status ?? "");
  if (s === "approved" || s === "processed") return "PAID";
  if (s === "rejected" || s === "recycling") return "FAILED";
  if (s === "cancelled") return "CANCELLED";
  return "SCHEDULED";
};

/** Cobranças da assinatura (para a tela "Assinatura"). Falha do Mercado Pago aqui não derruba a tela. */
export async function invoices(b: Billing, mp: MpClient) {
  if (!b.subscription_id) return [];
  try {
    const { results } = await mp.searchAuthorizedPayments(b.subscription_id);
    return (results ?? [])
      .map((p) => ({ id: String(p.id), dueDate: String(p.debit_date ?? p.date_created ?? "").slice(0, 10), value: Number(p.transaction_amount ?? 0), status: PAYMENT_LABEL(p), invoiceUrl: null }))
      .sort((a, c) => c.dueDate.localeCompare(a.dueDate))
      .slice(0, 24);
  } catch (e) {
    console.warn("[mp] faturas indisponíveis:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Cancela a assinatura no Mercado Pago (para de cobrar). O acesso segue até o fim do período pago. */
export async function cancelSubscription(admin: SupabaseClient, b: Billing, mp: MpClient) {
  if (!b.subscription_id || b.status === "canceled" || b.provider_status === "cancelled") return { ok: true, alreadyCanceled: true };
  await mp.updatePreapproval(b.subscription_id, { status: "cancelled" });
  await admin.from("billing").update({ status: "canceled", provider_status: "cancelled", updated_at: new Date().toISOString() }).eq("company_id", b.company_id);
  return { ok: true };
}

// ---------- avisos do Mercado Pago (webhook) ----------

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Valida o cabeçalho x-signature ("ts=...,v1=...") do Mercado Pago.
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (partes ausentes são omitidas;
 * data.id alfanumérico vai em minúsculas), assinado com HMAC-SHA256 e a chave secreta do webhook.
 */
export async function validMpSignature(secret: string, header: string | null, requestId: string | null, dataId: string | null) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=").map((x) => x.trim())).filter((kv) => kv.length === 2)) as Record<string, string>;
  if (!parts.ts || !parts.v1) return false;
  const id = dataId ? (/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId) : null;
  const manifest = `${id ? `id:${id};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${parts.ts};`;
  return sameText(await hmacHex(secret, manifest), parts.v1.toLowerCase());
}

export type MpNotification = { dataId: string | null; type: string | null; signature: string | null; requestId: string | null; body: Json };

const PREAPPROVAL_TYPES = new Set(["subscription_preapproval", "preapproval", "subscription"]);
const AUTHORIZED_PAYMENT_TYPES = new Set(["subscription_authorized_payment", "authorized_payment"]);
const PAYMENT_TYPES = new Set(["payment", "payments"]);

export async function handleMpNotification(admin: SupabaseClient, n: MpNotification, cfg: BillingConfig, mp: MpClient) {
  if (!cfg.webhookSecret) throw new HttpError(503, "Webhook do Mercado Pago não configurado (falta MERCADOPAGO_WEBHOOK_SECRET).");
  const dataId = n.dataId ?? (String(((n.body.data ?? {}) as Json).id ?? "") || null);
  if (!(await validMpSignature(cfg.webhookSecret, n.signature, n.requestId, dataId))) throw new HttpError(401, "Assinatura do aviso inválida.");
  const type = (n.type ?? (String(n.body.type ?? n.body.topic ?? "") || null))?.toLowerCase() ?? null;
  if (!dataId || !type) return { ok: true, ignored: "aviso sem id ou tipo" };

  // Idempotência: o aviso só é marcado como processado DEPOIS de dar certo, para que o reenvio do
  // Mercado Pago (após uma falha) seja processado. Repetir é seguro: o estado é sempre relido no Mercado Pago.
  const eventId = `mp:${type}:${dataId}:${String(n.body.action ?? "")}:${String(n.body.id ?? n.requestId ?? "")}`;
  const seen = await admin.from("billing_events").select("id").eq("id", eventId).maybeSingle();
  if (seen.data) return { ok: true, duplicate: true };

  try {
    const r = await processMp(admin, type, dataId, mp);
    await admin.from("billing_events").insert({ id: eventId, event: `${type}.${String(n.body.action ?? "")}`, company_id: r.companyId ?? null, payload: n.body });
    const { companyId: _c, ...rest } = r;
    return rest;
  } catch (e) {
    // Recurso inexistente (ex.: "Simular notificação" do painel usa ids de exemplo): responde 200 para não haver reenvio
    if (e instanceof PaymentProviderError && e.status === 404) return { ok: true, ignored: "recurso não encontrado no Mercado Pago" };
    throw e;
  }
}

async function processMp(admin: SupabaseClient, type: string, dataId: string, mp: MpClient): Promise<{ ok: true; status?: string; ignored?: string; companyId?: string }> {
  const findBilling = async (subId: string | null, ext: string | null) => {
    let b: Billing | null = null;
    if (subId) b = ((await admin.from("billing").select("*").eq("subscription_id", subId).maybeSingle()).data as Billing | null) ?? null;
    if (!b && ext && /^[0-9a-f-]{36}$/i.test(ext)) b = ((await admin.from("billing").select("*").eq("company_id", ext).maybeSingle()).data as Billing | null) ?? null;
    return b;
  };
  const now = new Date().toISOString();
  const upd: Json = { updated_at: now };
  let b: Billing | null = null;

  if (PREAPPROVAL_TYPES.has(type)) {
    // Assinatura criada/atualizada: relê no Mercado Pago (GET /preapproval/{id})
    const pre = await mp.getPreapproval(dataId);
    b = await findBilling(String(pre.id ?? dataId), String(pre.external_reference ?? "") || null);
    if (!b) return { ok: true, ignored: "assinatura não encontrada" };
    const st = String(pre.status ?? "");
    upd.provider_status = st;
    upd.subscription_id = String(pre.id ?? dataId);
    if (pre.next_payment_date) upd.next_due_date = String(pre.next_payment_date).slice(0, 10);
    if (st === "authorized") upd.status = "active";
    else if (st === "paused") upd.status = "overdue";
    else if (st === "cancelled") upd.status = "canceled";
  } else if (AUTHORIZED_PAYMENT_TYPES.has(type)) {
    // Cobrança recorrente da assinatura (GET /authorized_payments/{id})
    const ap = await mp.getAuthorizedPayment(dataId);
    b = await findBilling(String(ap.preapproval_id ?? "") || null, String(ap.external_reference ?? "") || null);
    if (!b) return { ok: true, ignored: "assinatura não encontrada" };
    const label = PAYMENT_LABEL(ap);
    if (label === "PAID") {
      upd.status = "active";
      upd.last_payment_at = now;
    } else if (label === "FAILED") {
      if (b.status !== "canceled") upd.status = "overdue";
      if (ap.debit_date) upd.next_due_date = String(ap.debit_date).slice(0, 10);
    } else {
      return { ok: true, ignored: `cobrança ${String(ap.status ?? "")}`, companyId: b.company_id };
    }
  } else if (PAYMENT_TYPES.has(type)) {
    // Pagamento (GET /v1/payments/{id}). Só conta se for de uma assinatura da Scalable;
    // pagamentos de outras vendas da mesma conta do Mercado Pago são ignorados.
    const p = await mp.getPayment(dataId);
    const meta = (p.metadata ?? {}) as Json;
    const poi = (((p.point_of_interaction ?? {}) as Json).transaction_data ?? {}) as Json;
    const subId = String(meta.preapproval_id ?? poi.subscription_id ?? "") || null;
    b = await findBilling(subId, String(p.external_reference ?? "") || null);
    if (!b || !b.subscription_id) return { ok: true, ignored: "pagamento não é de assinatura da Scalable" };
    const st = String(p.status ?? "");
    if (st === "approved") {
      upd.status = "active";
      upd.last_payment_at = now;
    } else if (["rejected", "refunded", "charged_back", "cancelled"].includes(st)) {
      if (b.status !== "canceled") upd.status = "overdue";
    } else {
      return { ok: true, ignored: `pagamento ${st}`, companyId: b.company_id };
    }
  } else {
    return { ok: true, ignored: type };
  }
  const { error } = await admin.from("billing").update(upd).eq("company_id", b.company_id);
  if (error) throw new HttpError(500, error.message);
  return { ok: true, status: (upd.status as string) ?? b.status, companyId: b.company_id };
}

/** Usado pelas rotas de IA: bloqueia se a cobrança estiver ativada e a assinatura não estiver em dia. */
export async function assertAccess(admin: SupabaseClient, company: { id: string; created_at?: string }, cfg = billingConfig()) {
  if (!cfg.enabled || !cfg.enforced) return;
  const b = await ensureBilling(admin, company, cfg);
  if (!accessAllowed(b, cfg)) throw new HttpError(402, "Sua assinatura não está em dia. Acesse Assinatura para regularizar.");
}

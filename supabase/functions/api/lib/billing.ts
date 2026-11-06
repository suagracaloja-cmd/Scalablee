// Assinaturas pelo Asaas (API v3): cliente, assinatura mensal, faturas, cancelamento e avisos (webhook).
// Tudo fica desligado até existirem ASAAS_API_KEY e PLANO_VALOR nos secrets do Supabase.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError, isoDate } from "./util.ts";

type Json = Record<string, unknown>;
export type BillingStatus = "trial" | "active" | "overdue" | "canceled";
export type Billing = {
  company_id: string;
  status: BillingStatus;
  trial_ends_at: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
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
  const key = env("ASAAS_API_KEY") ?? null;
  const value = Number(String(env("PLANO_VALOR") ?? "").replace(",", "."));
  const amb = (env("ASAAS_AMBIENTE") ?? "").toLowerCase();
  // Chaves novas do Asaas indicam o ambiente no prefixo ($aact_prod_ / $aact_hmlg_)
  const sandbox = amb ? amb.startsWith("sand") || amb.startsWith("homo") || amb === "teste" : !!key && key.includes("_hmlg_");
  const baseUrl = env("ASAAS_BASE_URL") ?? (sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3");
  return {
    key,
    baseUrl,
    sandbox,
    webhookToken: env("ASAAS_WEBHOOK_TOKEN") ?? null,
    planName: env("PLANO_NOME") ?? "Scalable",
    value: Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null,
    trialDays: Math.max(0, Number(env("PLANO_TESTE_DIAS") ?? 7) || 0),
    graceDays: Math.max(0, Number(env("PLANO_TOLERANCIA_DIAS") ?? 5) || 0),
    /** Bloquear o uso quando a assinatura não estiver em dia (desligado até COBRANCA_ATIVA=on). */
    enforced: (env("COBRANCA_ATIVA") ?? "").toLowerCase() === "on",
    get enabled() {
      return !!this.key && !!this.value;
    },
  };
}
export type BillingConfig = ReturnType<typeof billingConfig>;

// ---------- cliente HTTP do Asaas ----------

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export class AsaasError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function asaasClient(cfg: BillingConfig, fetchFn: FetchFn = (u, i) => fetch(u, i)) {
  async function call<T = Json>(method: string, path: string, body?: Json): Promise<T> {
    if (!cfg.key) throw new AsaasError(503, "Cobrança não configurada (falta ASAAS_API_KEY).");
    const res = await fetchFn(cfg.baseUrl + path, {
      method,
      headers: { access_token: cfg.key, "Content-Type": "application/json", "User-Agent": "Scalable" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const errs = (data.errors as { description?: string }[] | undefined) ?? [];
      const msg = errs.map((e) => e.description).filter(Boolean).join(" ") || `Erro ${res.status} no Asaas`;
      if (res.status === 401) throw new AsaasError(401, "O Asaas recusou a chave de API (confira ASAAS_API_KEY e o ambiente: sandbox ou produção).");
      throw new AsaasError(res.status, msg);
    }
    return data as T;
  }
  return {
    createCustomer: (c: Json) => call<{ id: string }>("POST", "/customers", c),
    updateCustomer: (id: string, c: Json) => call<{ id: string }>("POST", `/customers/${id}`, c),
    createSubscription: (s: Json) => call<{ id: string; nextDueDate?: string; status?: string }>("POST", "/subscriptions", s),
    subscriptionPayments: (id: string) => call<{ data: Json[] }>("GET", `/subscriptions/${id}/payments`),
    deleteSubscription: (id: string) => call<{ deleted?: boolean }>("DELETE", `/subscriptions/${id}`),
  };
}
export type AsaasClient = ReturnType<typeof asaasClient>;

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
    .insert({ company_id: company.id, status: "trial", trial_ends_at, plan_name: cfg.planName, value: cfg.value })
    .select("*")
    .single();
  if (error || !created) {
    // corrida: outra requisição criou primeiro
    const again = await admin.from("billing").select("*").eq("company_id", company.id).single();
    if (again.data) return again.data as Billing;
    throw new HttpError(500, error?.message ?? "Não foi possível iniciar a assinatura");
  }
  return created as Billing;
}

export function billingView(b: Billing, cfg: BillingConfig, now = new Date()) {
  const daysLeft = b.status === "trial" && b.trial_ends_at ? Math.max(0, Math.ceil((new Date(b.trial_ends_at).getTime() - now.getTime()) / DAY)) : null;
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
    invoiceUrl: b.invoice_url,
    hasSubscription: !!b.asaas_subscription_id && b.status !== "canceled",
    allowed: accessAllowed(b, cfg, now),
  };
}

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Valida CPF (11) ou CNPJ (14) pelos dígitos verificadores. */
export function validCpfCnpj(v: unknown): boolean {
  const d = digits(v);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (n: number) => {
      const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = w.reduce((acc, x, i) => acc + Number(d[i]) * x, 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

const FORMAS = new Set(["UNDEFINED", "PIX", "BOLETO", "CREDIT_CARD"]);

/**
 * Cria (ou reaproveita) o cliente e a assinatura mensal no Asaas e devolve o link da fatura,
 * onde a pessoa paga com Pix, boleto ou cartão na página segura do próprio Asaas.
 */
export async function subscribe(
  admin: SupabaseClient,
  company: { id: string; name: string; created_at?: string },
  input: { nome?: unknown; cpfCnpj?: unknown; email?: unknown; celular?: unknown; forma?: unknown },
  cfg: BillingConfig,
  asaas: AsaasClient,
  today = new Date(),
) {
  if (!cfg.enabled) throw new HttpError(503, "As assinaturas ainda não foram ativadas.");
  const nome = String(input.nome ?? "").trim();
  const cpfCnpj = digits(input.cpfCnpj);
  const email = String(input.email ?? "").trim();
  const celular = digits(input.celular);
  const forma = String(input.forma ?? "UNDEFINED").toUpperCase();
  if (nome.length < 3) throw new HttpError(400, "Informe o nome completo ou a razão social.");
  if (!validCpfCnpj(cpfCnpj)) throw new HttpError(400, "CPF ou CNPJ inválido.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Informe um e-mail válido.");
  if (!FORMAS.has(forma)) throw new HttpError(400, "Forma de pagamento inválida.");

  const b = await ensureBilling(admin, company, cfg);
  // Já tem assinatura em andamento: devolve a fatura pendente em vez de criar outra
  if (b.asaas_subscription_id && b.status !== "canceled") {
    const pend = await firstPending(asaas, b.asaas_subscription_id);
    if (pend?.invoiceUrl) await admin.from("billing").update({ invoice_url: pend.invoiceUrl, next_due_date: pend.dueDate, updated_at: new Date().toISOString() }).eq("company_id", company.id);
    return { invoiceUrl: pend?.invoiceUrl ?? b.invoice_url, reused: true };
  }

  const customer = { name: nome, cpfCnpj, email, mobilePhone: celular || undefined, externalReference: company.id, notificationDisabled: false };
  const customerId = b.asaas_customer_id ? (await asaas.updateCustomer(b.asaas_customer_id, customer)).id : (await asaas.createCustomer(customer)).id;
  await admin.from("billing").update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() }).eq("company_id", company.id);

  // Primeira cobrança: no fim do período de teste (se ainda estiver nele) ou hoje
  const trialEnd = b.status === "trial" && b.trial_ends_at ? new Date(b.trial_ends_at) : null;
  const firstDue = trialEnd && trialEnd > today ? trialEnd : today;
  const sub = await asaas.createSubscription({
    customer: customerId,
    billingType: forma,
    value: cfg.value,
    nextDueDate: isoDate(new Date(firstDue.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T12:00:00Z")),
    cycle: "MONTHLY",
    description: `Assinatura ${cfg.planName}`,
    externalReference: company.id,
  });
  const pend = await firstPending(asaas, sub.id);
  const { error } = await admin
    .from("billing")
    .update({
      asaas_subscription_id: sub.id,
      plan_name: cfg.planName,
      value: cfg.value,
      next_due_date: pend?.dueDate ?? sub.nextDueDate ?? null,
      invoice_url: pend?.invoiceUrl ?? null,
      // Ainda no teste: continua em teste até o pagamento. Teste vencido ou cancelado: "aguardando pagamento",
      // com a tolerância de dias após o vencimento enquanto Pix/boleto compensa.
      status: trialEnd && trialEnd > today ? "trial" : "overdue",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", company.id);
  if (error) throw new HttpError(500, error.message);
  return { invoiceUrl: pend?.invoiceUrl ?? null, reused: false };
}

async function firstPending(asaas: AsaasClient, subscriptionId: string) {
  const { data } = await asaas.subscriptionPayments(subscriptionId);
  const list = (data ?? []).map((p) => ({ id: String(p.id), status: String(p.status), dueDate: String(p.dueDate ?? ""), invoiceUrl: (p.invoiceUrl as string) ?? null }));
  return list.filter((p) => p.status === "PENDING" || p.status === "OVERDUE").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
}

/** Faturas da assinatura (para a tela "Assinatura"). */
export async function invoices(b: Billing, asaas: AsaasClient) {
  if (!b.asaas_subscription_id) return [];
  const { data } = await asaas.subscriptionPayments(b.asaas_subscription_id);
  return (data ?? [])
    .map((p) => ({ id: String(p.id), dueDate: String(p.dueDate ?? ""), value: Number(p.value ?? 0), status: String(p.status ?? ""), invoiceUrl: (p.invoiceUrl as string) ?? null }))
    .sort((a, c) => c.dueDate.localeCompare(a.dueDate))
    .slice(0, 24);
}

/** Cancela a assinatura no Asaas (para de cobrar). O acesso segue até o fim do período pago. */
export async function cancelSubscription(admin: SupabaseClient, b: Billing, asaas: AsaasClient) {
  if (!b.asaas_subscription_id || b.status === "canceled") return { ok: true, alreadyCanceled: true };
  await asaas.deleteSubscription(b.asaas_subscription_id);
  await admin.from("billing").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("company_id", b.company_id);
  return { ok: true };
}

// ---------- avisos do Asaas (webhook) ----------

const PAID = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const LATE = new Set(["PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"]);
const ENDED = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);
const NEW_CHARGE = new Set(["PAYMENT_CREATED", "PAYMENT_UPDATED"]);

/** Compara o token do aviso em tempo constante. */
function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function handleAsaasEvent(admin: SupabaseClient, token: string | null, body: Json, cfg: BillingConfig) {
  if (!cfg.webhookToken) throw new HttpError(503, "Webhook do Asaas não configurado (falta ASAAS_WEBHOOK_TOKEN).");
  if (!token || !sameToken(token, cfg.webhookToken)) throw new HttpError(401, "Token do webhook inválido.");
  const event = String(body.event ?? "");
  const payment = (body.payment ?? null) as Json | null;
  const subscription = (body.subscription ?? null) as Json | null;
  const subId = String(payment?.subscription ?? subscription?.id ?? "") || null;
  const extRef = String(payment?.externalReference ?? subscription?.externalReference ?? "") || null;

  // Empresa: pela assinatura; se não achar, pela referência externa (id da empresa)
  let b: Billing | null = null;
  if (subId) b = ((await admin.from("billing").select("*").eq("asaas_subscription_id", subId).maybeSingle()).data as Billing | null) ?? null;
  if (!b && extRef && /^[0-9a-f-]{36}$/i.test(extRef)) b = ((await admin.from("billing").select("*").eq("company_id", extRef).maybeSingle()).data as Billing | null) ?? null;

  // Idempotência: o mesmo aviso nunca é processado duas vezes
  const eventId = String(body.id ?? `${event}:${payment?.id ?? subscription?.id ?? ""}:${payment?.status ?? ""}`);
  const { error: dup } = await admin.from("billing_events").insert({ id: eventId, event, company_id: b?.company_id ?? null, payload: body });
  if (dup) return { ok: true, duplicate: true };
  if (!b) return { ok: true, ignored: "assinatura não encontrada" };

  const now = new Date().toISOString();
  const upd: Json = { updated_at: now };
  if (PAID.has(event)) {
    upd.status = "active";
    upd.last_payment_at = now;
  } else if (LATE.has(event)) {
    if (b.status !== "canceled") upd.status = "overdue";
    if (payment?.dueDate) upd.next_due_date = String(payment.dueDate);
  } else if (ENDED.has(event)) {
    upd.status = "canceled";
  } else if (NEW_CHARGE.has(event) && payment && ["PENDING", "OVERDUE"].includes(String(payment.status))) {
    upd.next_due_date = String(payment.dueDate ?? b.next_due_date ?? "") || null;
    upd.invoice_url = (payment.invoiceUrl as string) ?? b.invoice_url;
  } else {
    return { ok: true, ignored: event };
  }
  const { error } = await admin.from("billing").update(upd).eq("company_id", b.company_id);
  if (error) throw new HttpError(500, error.message);
  return { ok: true, status: (upd.status as string) ?? b.status };
}

/** Usado pelas rotas de IA: bloqueia se a cobrança estiver ativada e a assinatura não estiver em dia. */
export async function assertAccess(admin: SupabaseClient, company: { id: string; created_at?: string }, cfg = billingConfig()) {
  if (!cfg.enabled || !cfg.enforced) return;
  const b = await ensureBilling(admin, company, cfg);
  if (!accessAllowed(b, cfg)) throw new HttpError(402, "Sua assinatura não está em dia. Acesse Assinatura para regularizar.");
}

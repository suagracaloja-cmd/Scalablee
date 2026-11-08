import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0"}`;

export type WaConfig = { company_id: string; phone_number_id: string; access_token: string; verify_token: string; connected: boolean; app_secret?: string | null; display_phone?: string | null };

// As credenciais ficam CRIPTOGRAFADAS no banco (chave no Vault do Supabase). Só o servidor (service role)
// consegue salvar e ler, pelas funções abaixo; o navegador nunca recebe o token nem o App Secret.

/** Configuração do WhatsApp da empresa, com as credenciais já decifradas (uso só no servidor). */
export async function getConfig(db: SupabaseClient, companyId: string): Promise<WaConfig | null> {
  const { data, error } = await db.rpc("whatsapp_config_empresa", { p_company_id: companyId });
  if (error) throw new Error(`WhatsApp: ${error.message}`);
  return ((data as WaConfig[] | null) ?? [])[0] ?? null;
}

/** Configurações dos números citados num aviso da Meta (credenciais decifradas, uso só no servidor). */
export async function getConfigsByPhone(db: SupabaseClient, phoneIds: string[]): Promise<WaConfig[]> {
  if (!phoneIds.length) return [];
  const { data, error } = await db.rpc("whatsapp_config_numeros", { p_phone_ids: phoneIds });
  if (error) throw new Error(`WhatsApp: ${error.message}`);
  return (data as WaConfig[] | null) ?? [];
}

/** Salva as credenciais criptografadas. Token ou App Secret vazios mantêm os já salvos. */
export async function saveCredentials(
  db: SupabaseClient,
  c: { companyId: string; phoneNumberId: string; accessToken: string | null; appSecret: string | null; displayPhone: string | null },
) {
  const { error } = await db.rpc("whatsapp_salvar_credenciais", {
    p_company_id: c.companyId,
    p_phone_number_id: c.phoneNumberId,
    p_access_token: c.accessToken,
    p_app_secret: c.appSecret,
    p_display_phone: c.displayPhone,
  });
  return { error };
}

/** Envia uma mensagem de texto pela WhatsApp Cloud API. */
export async function sendText(cfg: WaConfig, to: string, body: string): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body, preview_url: false } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error?.message ?? `Erro ${res.status} ao enviar` };
  return { id: data?.messages?.[0]?.id };
}

/** Valida as credenciais e retorna o número formatado. */
export async function checkPhone(cfg: Pick<WaConfig, "phone_number_id" | "access_token">) {
  const res = await fetch(`${GRAPH}/${cfg.phone_number_id}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${cfg.access_token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, display_phone: data.display_phone_number as string, name: data.verified_name as string };
}

/**
 * Envia texto e registra a mensagem na conversa. Cria conversa se necessário.
 */
export async function sendAndLog(
  db: SupabaseClient,
  cfg: WaConfig,
  opts: { companyId: string; waId: string; body: string; author: "agent" | "owner"; conversationId?: string; customerId?: string | null; contactName?: string },
) {
  let conversationId = opts.conversationId;
  if (!conversationId) {
    const { data } = await db
      .from("conversations")
      .upsert(
        { company_id: opts.companyId, wa_id: opts.waId.replace(/\D/g, ""), customer_id: opts.customerId ?? null, contact_name: opts.contactName ?? null },
        { onConflict: "company_id,wa_id" },
      )
      .select("id")
      .single();
    conversationId = data!.id;
  }
  const r = await sendText(cfg, opts.waId, opts.body);
  const { data: msg } = await db
    .from("messages")
    .insert({
      company_id: opts.companyId,
      conversation_id: conversationId,
      direction: "out",
      author: opts.author,
      body: opts.body,
      status: r.error ? "failed" : "sent",
      wa_message_id: r.id ?? null,
      error: r.error ?? null,
    })
    .select("id")
    .single();
  await db.from("conversations").update({ last_message_at: new Date().toISOString(), unread: 0 }).eq("id", conversationId);
  return { ...r, conversationId, messageId: msg?.id };
}

// ---------- Webhook: assinatura da Meta ----------

export type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: Record<string, { title?: string }> }[];
        statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
      };
    }[];
  }[];
};

export async function validSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7).toLowerCase();
  if (given.length !== hex.length) return false;
  let diff = 0; // comparação em tempo constante
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/**
 * Confere a assinatura da Meta usando o App Secret de cada número citado no aviso (ou WHATSAPP_APP_SECRET).
 * Sem segredo cadastrado a mensagem é RECUSADA: ninguém consegue se passar pela Meta para injetar mensagens.
 */
export async function checkSignature(db: SupabaseClient, payload: WebhookPayload, raw: string, header: string | null) {
  const ids = [...new Set((payload.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id)).filter((x): x is string => !!x))];
  if (!ids.length) return { ok: true as const, phone: null };
  const configs = await getConfigsByPhone(db, ids);
  const globalSecret = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
  for (const id of ids) {
    const cfg = configs.find((c) => c.phone_number_id === id);
    if (!cfg) continue; // número que não é de nenhuma empresa: o aviso é ignorado no processamento
    const secret = cfg.app_secret || globalSecret;
    if (!secret || !(await validSignature(raw, header, secret))) return { ok: false as const, phone: id };
  }
  return { ok: true as const, phone: null };
}

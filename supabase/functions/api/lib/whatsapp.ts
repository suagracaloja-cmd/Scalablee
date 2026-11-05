import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0"}`;

export type WaConfig = { company_id: string; phone_number_id: string; access_token: string; verify_token: string; connected: boolean };

export async function getConfig(db: SupabaseClient, companyId: string): Promise<WaConfig | null> {
  const { data } = await db.from("whatsapp_configs").select("*").eq("company_id", companyId).maybeSingle();
  return data as WaConfig | null;
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

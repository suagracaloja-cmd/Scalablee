// Webhook da WhatsApp Cloud API (Meta). Recebe mensagens dos clientes;
// a Coraline AI responde sozinho e, quando precisa, pede aprovação ao dono.
import { admin, brl, json } from "./lib/common.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { agentWhatsAppReply, AGENT_NAME } from "./lib/agent.ts";
import { checkSignature, getConfigsByPhone, sendAndLog, type WaConfig, type WebhookPayload } from "./lib/whatsapp.ts";
import { accessAllowed, billingConfig, ensureBilling } from "./lib/billing.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

export default (async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const db = admin();
  const url = new URL(req.url);

  // Verificação do webhook (Meta envia GET com hub.challenge)
  if (req.method === "GET") {
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (url.searchParams.get("hub.mode") === "subscribe" && token) {
      const { data } = await db.from("whatsapp_configs").update({ connected: true }).eq("verify_token", token).select("company_id");
      if (data?.length) return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  const raw = await req.text();
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }

  // Assinatura da Meta: cada empresa usa o App Secret do próprio app (cadastrado ao conectar o WhatsApp);
  // WHATSAPP_APP_SECRET (global) vale para quem não cadastrou. Sem nenhum segredo, a mensagem é recusada.
  const check = await checkSignature(db, payload, raw, req.headers.get("x-hub-signature-256"));
  if (!check.ok) {
    console.warn(`[wa-webhook] assinatura inválida para ${check.phone}`);
    return new Response("invalid signature", { status: 401 });
  }

  // Responde 200 rápido para a Meta e processa em segundo plano.
  EdgeRuntime.waitUntil(processPayload(db, payload).catch((e) => console.error("webhook", e)));
  return json({ ok: true });
});

async function processPayload(db: SupabaseClient, payload: WebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.metadata?.phone_number_id) continue;
      const [cfg] = await getConfigsByPhone(db, [v.metadata.phone_number_id]);
      if (!cfg) continue;
      if (!cfg.connected) await db.from("whatsapp_configs").update({ connected: true }).eq("company_id", cfg.company_id);

      for (const st of v.statuses ?? []) {
        if (st.status === "failed")
          await db.from("messages").update({ status: "failed", error: st.errors?.[0]?.title ?? "Falha na entrega" }).eq("wa_message_id", st.id);
      }

      for (const m of v.messages ?? []) {
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? m.from;
        const text =
          m.text?.body ??
          m.button?.text ??
          Object.values(m.interactive ?? {}).find((x) => x?.title)?.title ??
          `[${m.type === "image" ? "imagem" : m.type === "audio" ? "áudio" : m.type} recebido]`;
        await handleIncoming(db, cfg as WaConfig, m.from, name, m.id, text);
      }
    }
  }
}

async function handleIncoming(db: SupabaseClient, cfg: WaConfig, waId: string, name: string, waMsgId: string, text: string) {
  const companyId = cfg.company_id;

  // Cliente (cria se não existir)
  let { data: customer } = await db.from("customers").select("id,name").eq("company_id", companyId).eq("phone", waId).maybeSingle();
  if (!customer) {
    const ins = await db.from("customers").insert({ company_id: companyId, name, phone: waId, status: "lead", notes: "Chegou pelo WhatsApp" }).select("id,name").single();
    customer = ins.data;
  }
  await db.from("customers").update({ last_contact_at: new Date().toISOString() }).eq("id", customer!.id);

  const { data: conv } = await db
    .from("conversations")
    .upsert({ company_id: companyId, wa_id: waId, contact_name: name, customer_id: customer!.id, last_message_at: new Date().toISOString() }, { onConflict: "company_id,wa_id" })
    .select("*")
    .single();

  const { error: dup } = await db.from("messages").insert({
    company_id: companyId,
    conversation_id: conv.id,
    direction: "in",
    author: "customer",
    body: text,
    status: "received",
    wa_message_id: waMsgId,
  });
  if (dup) return; // mensagem repetida (Meta reenviou)
  await db.from("conversations").update({ unread: (conv.unread ?? 0) + 1 }).eq("id", conv.id);

  // Configuração da Coraline AI para o WhatsApp (por empresa)
  const { data: co } = await db
    .from("companies")
    .select("name,segment,description,website,instagram,site_analysis,agent_whatsapp,agent_auto_reply,agent_instructions")
    .eq("id", companyId)
    .single();
  if (!co || co.agent_whatsapp === false || conv.ai_paused) return;
  // Cobrança ativada e assinatura fora do prazo: a mensagem fica registrada, mas a IA não responde
  const bcfg = billingConfig();
  if (bcfg.enabled && bcfg.enforced && !accessAllowed(await ensureBilling(db, { id: companyId }, bcfg), bcfg)) return;

  const decision = await decideReply(db, companyId, co, conv.id, text);
  if (!decision) return;

  if (decision.needs_approval || !co.agent_auto_reply) {
    const { data: draft } = await db
      .from("messages")
      .insert({ company_id: companyId, conversation_id: conv.id, direction: "out", author: "agent", body: decision.reply, status: "pending_approval" })
      .select("id")
      .single();
    await db.from("approvals").insert({
      company_id: companyId,
      agent_kind: "support",
      kind: "whatsapp_reply",
      conversation_id: conv.id,
      customer_id: customer!.id,
      message_id: draft!.id,
      title: `Resposta para ${name}`,
      reason: decision.reason || (co.agent_auto_reply ? "A Coraline AI pediu sua aprovação" : "Resposta automática desligada"),
      draft: decision.reply,
      payload: { cliente: name, mensagem_do_cliente: text.slice(0, 500), resposta_sugerida: decision.reply },
    });
    await db.from("insights").insert({
      company_id: companyId,
      agent_kind: "support",
      priority: "high",
      title: `Aprovação necessária: ${name}`,
      body: `Cliente: "${text.slice(0, 200)}"\nMotivo: ${decision.reason || "confirmação do dono"}`,
    });
    return;
  }

  await sendAndLog(db, cfg, { companyId, waId, body: decision.reply, author: "agent", conversationId: conv.id });
}

type Decision = { reply: string; needs_approval: boolean; reason?: string };
type Co = { name: string; segment: string | null; description: string | null; website: string | null; instagram: string | null; site_analysis: unknown; agent_instructions: string | null };

async function decideReply(db: SupabaseClient, companyId: string, co: Co, conversationId: string, text: string): Promise<Decision | null> {
  if (!hasAI()) {
    return { reply: `Olá! Aqui é o atendimento da ${co.name}. Recebemos sua mensagem e já vamos te responder 😊`, needs_approval: false };
  }
  const { data: history } = await db
    .from("messages")
    .select("direction,body,status")
    .eq("conversation_id", conversationId)
    .neq("status", "pending_approval")
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(20);
  const transcript = (history ?? [])
    .reverse()
    .map((m) => `${m.direction === "in" ? "Cliente" : "Empresa"}: ${m.body}`)
    .join("\n");
  const { data: sales } = await db.from("sales").select("description,amount").eq("company_id", companyId).order("sold_at", { ascending: false }).limit(40);
  const catalog = [...new Map((sales ?? []).map((s) => [s.description.toLowerCase(), `${s.description}: ${brl(Number(s.amount))}`])).values()].slice(0, 15);
  const site = co.site_analysis as { products?: string[] } | null;
  try {
    return await agentWhatsAppReply({ company: co, products: site?.products ?? [], catalog, transcript, lastMessage: text, create: modelCreate });
  } catch (e) {
    // IA indisponível: não responde sozinho, deixa para o dono
    console.error(`[wa-webhook] ${AGENT_NAME} indisponível:`, e instanceof Error ? e.message : e);
    return { reply: `Olá! Aqui é o atendimento da ${co.name}. Recebemos sua mensagem e já vamos te responder 😊`, needs_approval: true, reason: "A IA não respondeu (indisponível no momento)" };
  }
}

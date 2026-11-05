// Webhook da WhatsApp Cloud API (Meta). Recebe mensagens dos clientes,
// o agente de atendimento responde sozinho e, quando precisa, pede aprovação ao dono.
import { admin, brl, cors, json } from "./lib/common.ts";
import { ask, hasAI, parseJSON } from "./lib/ai.ts";
import { sendAndLog, type WaConfig } from "./lib/whatsapp.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

export default (async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
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
  const secret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (secret && !(await validSignature(raw, req.headers.get("x-hub-signature-256"), secret))) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }

  // Responde 200 rápido para a Meta e processa em segundo plano.
  EdgeRuntime.waitUntil(processPayload(db, payload).catch((e) => console.error("webhook", e)));
  return json({ ok: true });
});

type WebhookPayload = {
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

async function processPayload(db: SupabaseClient, payload: WebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.metadata?.phone_number_id) continue;
      const { data: cfg } = await db.from("whatsapp_configs").select("*").eq("phone_number_id", v.metadata.phone_number_id).maybeSingle();
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

  const { data: agent } = await db.from("agents").select("*").eq("company_id", companyId).eq("kind", "support").maybeSingle();
  if (!agent?.enabled || conv.ai_paused) return;

  const decision = await decideReply(db, companyId, agent, conv.id, text);
  if (!decision) return;

  if (decision.needs_approval || !agent.auto_reply) {
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
      reason: decision.reason || (agent.auto_reply ? "O agente pediu sua aprovação" : "Resposta automática desligada"),
      draft: decision.reply,
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

async function decideReply(
  db: SupabaseClient,
  companyId: string,
  agent: { name: string; personality: string | null },
  conversationId: string,
  text: string,
): Promise<Decision | null> {
  const { data: company } = await db.from("companies").select("name,segment,description,website,site_analysis").eq("id", companyId).single();

  if (!hasAI()) {
    return {
      reply: `Olá! Aqui é ${agent.name}, da ${company?.name}. Recebemos sua mensagem e já vamos te responder 😊`,
      needs_approval: false,
    };
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

  // Produtos mais vendidos ajudam o agente a responder sobre preços.
  const { data: sales } = await db.from("sales").select("description,amount").eq("company_id", companyId).order("sold_at", { ascending: false }).limit(40);
  const catalog = [...new Map((sales ?? []).map((s) => [s.description.toLowerCase(), `${s.description}: ${brl(Number(s.amount))}`])).values()].slice(0, 15);
  const site = company?.site_analysis as { business?: string; products?: string[] } | null;

  const res = await ask({
    system: `Você é ${agent.name}, atendente virtual no WhatsApp da empresa "${company?.name}"${company?.segment ? ` (${company.segment})` : ""}.
Personalidade: ${agent.personality ?? "simpática e objetiva"}.
Sobre a empresa: ${company?.description ?? site?.business ?? "—"}
${site?.products?.length ? `Produtos/serviços: ${site.products.join(", ")}` : ""}
${catalog.length ? `Preços praticados recentemente: ${catalog.join("; ")}` : ""}
${company?.website ? `Site: ${company.website}` : ""}

Regras:
- Responda como no WhatsApp: curto, humano, em português do Brasil, no máximo 3 frases.
- Nunca invente preços, prazos, estoque ou políticas que não estejam acima.
- Marque needs_approval=true quando: o cliente pedir desconto, reembolso, troca, negociação, orçamento sob medida, reclamar, ou quando você não tiver a informação para responder com segurança. Nesse caso escreva mesmo assim uma resposta sugerida para o dono aprovar.
- Para saudações e dúvidas simples já respondidas pelas informações acima, needs_approval=false.
Responda SOMENTE com JSON: {"reply":"...","needs_approval":true|false,"reason":"motivo curto se precisar aprovação"}`,
    messages: [{ role: "user", content: `Conversa até agora:\n${transcript}\n\nÚltima mensagem do cliente: ${text}` }],
    effort: "low",
    maxTokens: 2000,
  });
  const d = parseJSON<Decision>(res.text);
  if (!d?.reply) return { reply: res.text || "Recebemos sua mensagem, já te respondemos!", needs_approval: true, reason: "Resposta não estruturada" };
  return d;
}

async function validSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === header.slice(7);
}

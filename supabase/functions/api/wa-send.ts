// Ações do dono: conectar WhatsApp, enviar mensagens e aprovar/recusar o que os agentes sugeriram.
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { checkPhone, getConfig, sendAndLog, sendText } from "./lib/whatsapp.ts";

export default (
  handle(async (req) => {
    const { db, company } = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "connect") {
      const phone_number_id = String(body.phone_number_id ?? "").trim();
      let access_token = String(body.access_token ?? "").trim();
      const current = await getConfig(db, company.id);
      if (!access_token && current) access_token = current.access_token;
      if (!phone_number_id || !access_token) throw new HttpError(400, "Informe o Phone Number ID e o Token de acesso.");
      const check = await checkPhone({ phone_number_id, access_token });
      if (!check.ok) throw new HttpError(400, `A Meta recusou as credenciais: ${check.error}`);
      const { error } = await db.from("whatsapp_configs").upsert(
        { company_id: company.id, phone_number_id, access_token, display_phone: check.display_phone, connected: current?.connected ?? false, updated_at: new Date().toISOString() },
        { onConflict: "company_id" },
      );
      if (error) throw new HttpError(400, error.message.includes("unique") ? "Esse número já está conectado em outra conta." : error.message);
      return json({ ok: true, display_phone: check.display_phone, name: check.name });
    }

    const cfg = await getConfig(db, company.id);

    if (action === "send") {
      if (!cfg) throw new HttpError(400, "Conecte o WhatsApp primeiro.");
      const text = String(body.text ?? "").trim();
      if (!text) throw new HttpError(400, "Mensagem vazia");
      const { data: conv } = await db.from("conversations").select("*").eq("id", body.conversation_id).eq("company_id", company.id).single();
      if (!conv) throw new HttpError(404, "Conversa não encontrada");
      const r = await sendAndLog(db, cfg, { companyId: company.id, waId: conv.wa_id, body: text, author: "owner", conversationId: conv.id });
      if (r.error) throw new HttpError(400, r.error);
      return json({ ok: true });
    }

    if (action === "approve" || action === "reject") {
      const { data: ap } = await db.from("approvals").select("*").eq("id", body.approval_id).eq("company_id", company.id).single();
      if (!ap) throw new HttpError(404, "Aprovação não encontrada");
      if (ap.status !== "pending") throw new HttpError(409, "Essa aprovação já foi decidida.");
      const decided = { decided_at: new Date().toISOString() };

      if (action === "reject") {
        await db.from("approvals").update({ status: "rejected", ...decided }).eq("id", ap.id);
        if (ap.message_id) await db.from("messages").update({ status: "rejected" }).eq("id", ap.message_id);
        return json({ ok: true });
      }

      const text = String(body.text ?? ap.draft ?? "").trim();
      if (ap.kind === "whatsapp_reply" || ap.kind === "whatsapp_outreach") {
        if (!cfg) throw new HttpError(400, "Conecte o WhatsApp primeiro.");
        if (!text) throw new HttpError(400, "Mensagem vazia");
        if (ap.kind === "whatsapp_reply") {
          const { data: conv } = await db.from("conversations").select("*").eq("id", ap.conversation_id).single();
          const r = await sendText(cfg, conv.wa_id, text);
          await db
            .from("messages")
            .update({ body: text, status: r.error ? "failed" : "sent", wa_message_id: r.id ?? null, error: r.error ?? null, created_at: new Date().toISOString() })
            .eq("id", ap.message_id);
          await db.from("conversations").update({ last_message_at: new Date().toISOString(), unread: 0 }).eq("id", conv.id);
          if (r.error) throw new HttpError(400, r.error);
        } else {
          const { data: cust } = await db.from("customers").select("*").eq("id", ap.customer_id).single();
          if (!cust?.phone) throw new HttpError(400, "Cliente sem telefone cadastrado.");
          const r = await sendAndLog(db, cfg, { companyId: company.id, waId: cust.phone, body: text, author: "agent", customerId: cust.id, contactName: cust.name });
          if (r.error) throw new HttpError(400, r.error);
          await db.from("customers").update({ last_contact_at: new Date().toISOString() }).eq("id", cust.id);
        }
      }
      await db.from("approvals").update({ status: "approved", draft: text || ap.draft, ...decided }).eq("id", ap.id);
      return json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida");
  })
);

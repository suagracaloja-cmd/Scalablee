// Ações do dono no WhatsApp: conectar e enviar mensagens. (approve/reject mantidos por compatibilidade → Central de Aprovações)
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { checkPhone, getConfig, sendAndLog } from "./lib/whatsapp.ts";
import { ApprovalError, decideApproval } from "./lib/approvals.ts";

export default (
  handle(async (req) => {
    const { db, userDb, company, user } = await requireCompany(req);
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
      // App Secret (opcional, recomendado): valida que as mensagens recebidas vieram mesmo da Meta
      const app_secret = String(body.app_secret ?? "").trim() || current?.app_secret || null;
      if (app_secret && !/^[a-z0-9]{16,64}$/i.test(app_secret)) throw new HttpError(400, "App Secret inválido. Copie em developers.facebook.com → seu app → Configurações do app → Básico → Chave secreta do app.");
      const { error } = await db.from("whatsapp_configs").upsert(
        { company_id: company.id, phone_number_id, access_token, app_secret, display_phone: check.display_phone, connected: current?.connected ?? false, updated_at: new Date().toISOString() },
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
      const env = { db: userDb, admin: db, companyId: company.id, userId: user.id, userEmail: user.email };
      try {
        return json(await decideApproval(env, { action, id: body.approval_id, text: body.text }));
      } catch (e) {
        if (e instanceof ApprovalError) throw new HttpError(e.status, e.message);
        throw e;
      }
    }

    throw new HttpError(400, "Ação inválida");
  })
);

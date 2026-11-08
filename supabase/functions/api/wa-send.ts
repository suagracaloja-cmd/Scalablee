// Ações do dono no WhatsApp: conectar e enviar mensagens. (approve/reject mantidos por compatibilidade → Central de Aprovações)
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { checkPhone, getConfig, saveCredentials, sendAndLog } from "./lib/whatsapp.ts";
import { ApprovalError, decideApproval } from "./lib/approvals.ts";
import { isUuid, lerJson, textoOpcional } from "./lib/util.ts";

export default (
  handle(async (req) => {
    const { db, userDb, company, user } = await requireCompany(req, { limite: [30, 60] });
    const body = await lerJson(req);
    const action = body.action as string;

    if (action === "connect") {
      const phone_number_id = textoOpcional(body.phone_number_id, "Phone Number ID", 32) ?? "";
      if (phone_number_id && !/^\d{5,32}$/.test(phone_number_id)) throw new HttpError(400, "Phone Number ID inválido: use só os números mostrados pela Meta.");
      let access_token = textoOpcional(body.access_token, "Token de acesso", 2048) ?? "";
      const current = await getConfig(db, company.id);
      if (!access_token && current) access_token = current.access_token;
      if (!phone_number_id || !access_token) throw new HttpError(400, "Informe o Phone Number ID e o Token de acesso.");
      // App Secret (obrigatório): prova que as mensagens recebidas vieram mesmo da Meta
      const app_secret = textoOpcional(body.app_secret, "App Secret", 64) || current?.app_secret || "";
      if (!app_secret) throw new HttpError(400, "Informe a chave secreta do app (App Secret): sem ela as mensagens recebidas não podem ser verificadas.");
      if (!/^[a-z0-9]{16,64}$/i.test(app_secret)) throw new HttpError(400, "App Secret inválido. Copie em developers.facebook.com → seu app → Configurações do app → Básico → Chave secreta do app.");
      const check = await checkPhone({ phone_number_id, access_token });
      if (!check.ok) throw new HttpError(400, `A Meta recusou as credenciais: ${check.error}`);
      const { error } = await saveCredentials(db, { companyId: company.id, phoneNumberId: phone_number_id, accessToken: access_token, appSecret: app_secret, displayPhone: check.display_phone ?? null });
      if (error) {
        console.error("[wa-send] salvar credenciais:", error.message);
        throw new HttpError(400, /unique|duplicate/i.test(error.message) ? "Esse número já está conectado em outra conta." : "Não foi possível salvar a conexão. Tente de novo.");
      }
      return json({ ok: true, display_phone: check.display_phone, name: check.name });
    }

    const cfg = await getConfig(db, company.id);

    if (action === "send") {
      if (!cfg) throw new HttpError(400, "Conecte o WhatsApp primeiro.");
      const text = textoOpcional(body.text, "Mensagem", 4096) ?? "";
      if (!text) throw new HttpError(400, "Mensagem vazia");
      if (!isUuid(body.conversation_id)) throw new HttpError(400, "Conversa inválida.");
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

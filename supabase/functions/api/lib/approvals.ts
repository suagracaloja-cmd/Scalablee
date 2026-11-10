// Central de Aprovações: executa (ou recusa) operações preparadas pela Coraline AI,
// registrando quem decidiu, quando e o resultado.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { getConfig, sendAndLog, sendText } from "./whatsapp.ts";
import { isoDate, isUuid } from "./util.ts";
import { executarAgenda } from "./agenda.ts";

export type DecideEnv = {
  db: SupabaseClient; // cliente do usuário (RLS)
  admin: SupabaseClient; // necessário só para ler a configuração do WhatsApp (token nunca vai ao navegador)
  companyId: string;
  userId: string;
  userEmail: string | null;
  today?: Date;
};
type Json = Record<string, unknown>;

export class ApprovalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function load(env: DecideEnv, id: string) {
  const { data, error } = await env.db.from("approvals").select("*").eq("company_id", env.companyId).eq("id", id).maybeSingle();
  if (error) throw new ApprovalError(400, error.message);
  if (!data) throw new ApprovalError(404, "Aprovação não encontrada.");
  if (data.status !== "pending") throw new ApprovalError(409, "Essa aprovação já foi decidida.");
  if (data.decided_at && Date.now() - new Date(data.decided_at).getTime() < CLAIM_TTL_MS) throw new ApprovalError(409, "Essa aprovação já está sendo processada. Aguarde alguns instantes.");
  return data as Row;
}
/** Carrega a aprovação já reservada por esta execução. */
async function loadAny(env: DecideEnv, id: string) {
  const { data, error } = await env.db.from("approvals").select("*").eq("company_id", env.companyId).eq("id", id).eq("status", "pending").maybeSingle();
  if (error) throw new ApprovalError(400, error.message);
  if (!data) throw new ApprovalError(404, "Aprovação não encontrada.");
  return data as Row;
}
type Row = Json & { id: string; kind: string; payload: Json | null; draft: string | null; decided_at: string | null };

const decidedFields = (env: DecideEnv) => ({ decided_at: new Date().toISOString(), decided_by: env.userId, decided_by_email: env.userEmail });
const CLAIM_TTL_MS = 2 * 60 * 1000;

/** Reserva a aprovação para esta execução (evita envio duplicado com dois cliques/abas ao mesmo tempo).
 *  Uma reserva antiga (execução que caiu no meio) expira depois de 2 minutos. */
async function claim(env: DecideEnv, id: string) {
  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data, error } = await env.db
    .from("approvals")
    .update(decidedFields(env))
    .eq("company_id", env.companyId)
    .eq("id", id)
    .eq("status", "pending")
    .or(`decided_at.is.null,decided_at.lt.${stale}`)
    .select("id");
  if (error) throw new ApprovalError(400, error.message);
  if (!data?.length) throw new ApprovalError(409, "Essa aprovação já está sendo processada. Aguarde alguns instantes.");
}
async function release(env: DecideEnv, id: string, result: string) {
  await env.db
    .from("approvals")
    .update({ decided_at: null, decided_by: null, decided_by_email: null, result })
    .eq("company_id", env.companyId)
    .eq("id", id)
    .eq("status", "pending");
}
async function finish(env: DecideEnv, id: string, fields: Json) {
  const { error } = await env.db.from("approvals").update({ ...fields, ...decidedFields(env) }).eq("company_id", env.companyId).eq("id", id).eq("status", "pending");
  if (error) throw new ApprovalError(400, error.message);
}

/** Ponto de entrada da rota: aprova ou recusa, registrando a falha na própria aprovação. */
export async function decideApproval(env: DecideEnv, body: { action?: unknown; id?: unknown; approval_id?: unknown; text?: unknown; motivo?: unknown }) {
  const id = String(body.id ?? body.approval_id ?? "");
  if (!id) throw new ApprovalError(400, "Informe a aprovação.");
  if (!isUuid(id)) throw new ApprovalError(400, "Aprovação inválida.");
  if (typeof body.text === "string" && body.text.length > 4096) throw new ApprovalError(400, "A mensagem pode ter no máximo 4096 caracteres.");
  if (typeof body.motivo === "string" && body.motivo.length > 1000) throw new ApprovalError(400, "O motivo pode ter no máximo 1000 caracteres.");
  if (body.action === "reject") return rejectApproval(env, id, typeof body.motivo === "string" ? body.motivo : undefined);
  if (body.action !== "approve") throw new ApprovalError(400, "Ação inválida");
  await load(env, id);
  await claim(env, id);
  try {
    return await approveApproval(env, id, { text: typeof body.text === "string" ? body.text : undefined }, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await release(env, id, `Falhou: ${msg}`);
    throw e instanceof ApprovalError ? e : new ApprovalError(500, msg);
  }
}

export async function rejectApproval(env: DecideEnv, id: string, motivo?: string) {
  const ap = await load(env, id);
  await finish(env, ap.id, { status: "rejected", result: motivo ? `Recusado: ${motivo}` : "Recusado pelo dono" });
  if (ap.message_id) await env.db.from("messages").update({ status: "rejected" }).eq("company_id", env.companyId).eq("id", ap.message_id as string);
  return { ok: true, status: "rejected" };
}

/** Executa a operação aprovada. Use decideApproval (que reserva a aprovação antes); `claimed` indica que a reserva já foi feita. */
export async function approveApproval(env: DecideEnv, id: string, edits: { text?: string } = {}, claimed = false) {
  const ap = claimed ? await loadAny(env, id) : await load(env, id);
  const payload = (ap.payload ?? {}) as Json;
  const text = (edits.text ?? ap.draft ?? (payload.mensagem as string) ?? "").toString().trim();
  const todayStr = isoDate(env.today ?? new Date());
  let result = "Executado";

  const wa = async () => {
    const cfg = await getConfig(env.admin, env.companyId);
    if (!cfg) throw new ApprovalError(400, "Conecte o WhatsApp Business antes de aprovar envios.");
    return cfg;
  };
  const fail = (e: { message: string } | null, msg?: string) => {
    if (e) throw new ApprovalError(400, msg ?? e.message);
  };

  switch (ap.kind) {
    case "whatsapp_reply": {
      if (!text) throw new ApprovalError(400, "Mensagem vazia.");
      const cfg = await wa();
      const { data: conv } = await env.db.from("conversations").select("*").eq("company_id", env.companyId).eq("id", ap.conversation_id as string).single();
      if (!conv) throw new ApprovalError(404, "Conversa não encontrada.");
      const r = await sendText(cfg, conv.wa_id, text);
      await env.db
        .from("messages")
        .update({ body: text, status: r.error ? "failed" : "sent", wa_message_id: r.id ?? null, error: r.error ?? null, created_at: new Date().toISOString() })
        .eq("id", ap.message_id as string);
      await env.db.from("conversations").update({ last_message_at: new Date().toISOString(), unread: 0 }).eq("id", conv.id);
      if (r.error) throw new ApprovalError(400, `WhatsApp recusou o envio: ${r.error}`);
      result = "Resposta enviada no WhatsApp";
      break;
    }
    case "whatsapp_outreach": {
      if (!text) throw new ApprovalError(400, "Mensagem vazia.");
      const cfg = await wa();
      const custId = (ap.customer_id as string) ?? (payload.customer_id as string);
      const { data: cust } = await env.db.from("customers").select("id,name,phone").eq("company_id", env.companyId).eq("id", custId).single();
      if (!cust?.phone) throw new ApprovalError(400, "Cliente sem telefone cadastrado.");
      const r = await sendAndLog(env.db, cfg, { companyId: env.companyId, waId: cust.phone, body: text, author: "agent", customerId: cust.id, contactName: cust.name });
      if (r.error) throw new ApprovalError(400, `WhatsApp recusou o envio: ${r.error}`);
      await env.db.from("customers").update({ last_contact_at: new Date().toISOString() }).eq("id", cust.id);
      result = `Mensagem enviada para ${cust.name}`;
      break;
    }
    case "campaign_whatsapp": {
      if (!text) throw new ApprovalError(400, "Mensagem vazia.");
      const cfg = await wa();
      const clientes = (Array.isArray(payload.clientes) ? payload.clientes : []) as { id: string; nome: string; telefone: string | null }[];
      let ok = 0;
      const erros: string[] = [];
      for (const c of clientes.filter((c) => c.telefone)) {
        const body = text.replaceAll("{nome}", String(c.nome ?? "").split(" ")[0]);
        const r = await sendAndLog(env.db, cfg, { companyId: env.companyId, waId: c.telefone!, body, author: "agent", customerId: c.id, contactName: c.nome });
        if (r.error) erros.push(`${c.nome}: ${r.error}`);
        else ok++;
      }
      result = `Campanha enviada para ${ok} de ${clientes.length} contato(s)${erros.length ? `. Falhas: ${erros.slice(0, 3).join("; ")}` : ""}`;
      if (!ok && clientes.length) throw new ApprovalError(400, result);
      break;
    }
    case "campaign_external":
    case "email_send":
      // Integração ainda não configurada: aprovar só registra a decisão; nada é enviado/publicado.
      result = ap.kind === "email_send" ? "Aprovado. Envio de e-mail não integrado — envie manualmente." : "Aprovado. Publicação automática não integrada — publique manualmente.";
      break;
    case "finance_create": {
      const p = payload;
      const { error } = await env.db.from("transactions").insert({
        company_id: env.companyId,
        type: p.type === "income" ? "income" : "expense",
        description: String(p.description),
        amount: Number(p.amount),
        due_date: String(p.due_date),
        category: (p.category as string) ?? null,
        paid_at: p.paid ? todayStr : null,
      });
      fail(error);
      result = `${p.type === "income" ? "Receita" : "Despesa"} registrada no financeiro`;
      break;
    }
    case "finance_update": {
      const ch = (payload.changes ?? {}) as Json;
      const upd: Json = {};
      if ("paid" in ch) upd.paid_at = ch.paid ? todayStr : null;
      for (const k of ["amount", "due_date", "description", "category"]) if (k in ch) upd[k] = ch[k];
      const { data, error } = await env.db.from("transactions").update(upd).eq("company_id", env.companyId).eq("id", String(payload.id)).select("id");
      fail(error);
      if (!data?.length) throw new ApprovalError(404, "Lançamento não encontrado (pode ter sido excluído).");
      result = "Lançamento atualizado";
      break;
    }
    case "sale_create": {
      const p = payload;
      const { error } = await env.db.from("sales").insert({
        company_id: env.companyId,
        description: String(p.description),
        amount: Number(p.amount),
        sold_at: String(p.sold_at),
        status: p.status === "pending" ? "pending" : "paid",
        customer_id: (p.customer_id as string) || null,
      });
      fail(error);
      if (p.customer_id) await env.db.from("customers").update({ status: "active", last_contact_at: new Date().toISOString() }).eq("company_id", env.companyId).eq("id", String(p.customer_id)).eq("status", "lead");
      result = "Venda registrada";
      break;
    }
    case "customer_upsert": {
      const p = payload;
      const row: Json = { name: p.name, phone: p.phone ?? null, email: p.email ?? null, notes: p.notes ?? null };
      if (p.status) row.status = p.status;
      for (const k of ["etapa", "proximo_contato", "origem"]) if (p[k]) row[k] = p[k];
      const q = p.id
        ? env.db.from("customers").update(row).eq("company_id", env.companyId).eq("id", String(p.id)).select("id")
        : env.db.from("customers").insert({ ...row, company_id: env.companyId, status: p.status ?? "lead" }).select("id");
      const { data, error } = await q;
      fail(error, error && /customers_company_phone|duplicate key/.test(error.message) ? "Já existe um paciente com esse telefone." : undefined);
      if (!data?.length) throw new ApprovalError(404, "Paciente não encontrado (pode ter sido excluído).");
      result = p.id ? "Paciente atualizado" : "Paciente cadastrado";
      break;
    }
    case "record_delete": {
      const table = String(payload.table);
      if (!["sales", "customers", "transactions", "tasks"].includes(table)) throw new ApprovalError(400, "Tipo de registro inválido.");
      const { data, error } = await env.db.from(table).delete().eq("company_id", env.companyId).eq("id", String(payload.id)).select("id");
      fail(error);
      result = data?.length ? `Registro excluído: ${payload.label ?? payload.id}` : "O registro já não existia";
      break;
    }
    case "action":
      // Operações da agenda usam o tipo genérico "action" com payload.acao (agenda_marcar / agenda_alterar)
      try {
        result = String(payload.acao ?? "").startsWith("agenda_") ? await executarAgenda(env.db, env.companyId, payload) : "Aprovado";
      } catch (e) {
        throw new ApprovalError(400, e instanceof Error ? e.message : String(e));
      }
      break;
    default:
      throw new ApprovalError(400, `Tipo de operação desconhecido: ${ap.kind}`);
  }

  await finish(env, ap.id, { status: "approved", result, draft: text || ap.draft });
  return { ok: true, status: "approved", result };
}

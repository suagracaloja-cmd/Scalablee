// Núcleo da conversa com a Coraline (usado pela rota /api/agente).
// Fica separado da rota HTTP para poder ser testado com qualquer cliente de banco e modelo.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { Company } from "./common.ts";
import { agentChat, friendlyAIError, type CreateFn, type Step } from "./agent.ts";
import { buildSnapshot } from "./snapshot.ts";
import { fallbackAnswer } from "./fallback.ts";
import { todayBR } from "./tools.ts";
import { HttpError, isoDate } from "./util.ts";
import type { Papel } from "./tools.ts";

/** Perguntas com IA por empresa por dia (protege a cota gratuita compartilhada). 0 = sem limite. */
export const dailyLimit = () => {
  const v = typeof Deno !== "undefined" ? Deno.env.get("AGENT_DAILY_LIMIT") : undefined;
  const n = Number(v ?? 30);
  return Number.isFinite(n) && n >= 0 ? n : 30;
};

/** Respostas da IA (não as do modo básico) que a empresa recebeu hoje, no horário de Brasília. */
export async function usageToday(db: SupabaseClient, companyId: string, today = todayBR()) {
  const { count } = await db
    .from("assistant_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("role", "assistant")
    .eq("meta->>ai", "true")
    .gte("created_at", `${isoDate(today)}T00:00:00-03:00`);
  return count ?? 0;
}

export async function conversar({ db, company, message: raw, threadId, create: createFn, papel = "dono" }: {
  db: SupabaseClient; // cliente do usuário (RLS)
  company: Company;
  message: unknown;
  threadId?: unknown;
  create: CreateFn | null; // null = IA não configurada (modo básico)
  papel?: Papel; // papel de quem conversa (define as ferramentas disponíveis)
}) {
  let create = createFn;
  const message = String(raw ?? "").trim().slice(0, 8000);
  if (!message) throw new HttpError(400, "Mensagem vazia");

  // Conversa (thread): existente da própria empresa ou nova
  let thread: { id: string; title: string };
  if (threadId) {
    const { data } = await db.from("agent_threads").select("id,title").eq("company_id", company.id).eq("id", String(threadId)).maybeSingle();
    if (!data) throw new HttpError(404, "Conversa não encontrada");
    thread = data;
  } else {
    const title = message.replace(/\s+/g, " ").slice(0, 60) + (message.length > 60 ? "…" : "");
    const { data, error } = await db.from("agent_threads").insert({ company_id: company.id, title }).select("id,title").single();
    if (error || !data) throw new HttpError(500, error?.message ?? "Não foi possível criar a conversa");
    thread = data;
  }

  // Histórico anterior desta conversa (texto) + mensagem atual
  const { data: prev } = await db
    .from("assistant_messages")
    .select("role,content")
    .eq("company_id", company.id)
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(24);
  const history = (prev ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));
  while (history.length && history[0].role !== "user") history.shift();

  const { error: inErr } = await db.from("assistant_messages").insert({ company_id: company.id, thread_id: thread.id, role: "user", content: message });
  if (inErr) throw new HttpError(500, inErr.message);

  let text: string;
  let steps: Step[] = [];
  let approvals: string[] = [];
  let aiError: string | null = null;
  let limitNote: string | null = null;
  const limit = dailyLimit();
  if (create && limit > 0 && (await usageToday(db, company.id)) >= limit) {
    create = null;
    limitNote = `a empresa já usou as ${limit} perguntas com IA de hoje — o limite renova à meia-noite`;
  }
  if (create) {
    try {
      ({ text, steps, approvals } = await agentChat({ ctx: { db, companyId: company.id, threadId: thread.id, today: todayBR(), papel }, company, history, message, create }));
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
      console.error("[agente] erro da IA:", aiError);
      text = fallbackAnswer(message, await buildSnapshot(db, company)) + `\n\n_(Modo básico: ${friendlyAIError(aiError)}.)_`;
    }
  } else {
    text = fallbackAnswer(message, await buildSnapshot(db, company));
    if (limitNote) text += `\n\n_(Modo básico: ${limitNote}.)_`;
  }

  const meta = { steps, approvals, ai: !!create && !aiError, aiError: limitNote ?? (aiError ? friendlyAIError(aiError) : null) };
  const { data: saved, error } = await db
    .from("assistant_messages")
    .insert({ company_id: company.id, thread_id: thread.id, role: "assistant", content: text, meta })
    .select("id,role,content,meta,created_at")
    .single();
  if (error) throw new HttpError(500, error.message);
  await db.from("agent_threads").update({ updated_at: new Date().toISOString() }).eq("company_id", company.id).eq("id", thread.id);

  return { thread, message: saved, ...meta };
}

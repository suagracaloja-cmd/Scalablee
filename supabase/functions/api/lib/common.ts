import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./util.ts";

// CORS e cabeçalhos de segurança são aplicados a TODAS as respostas em index.ts (securityHeaders).
export const cors: Record<string, string> = {};

/** Sites que podem chamar a API pelo navegador (o próprio site da Scalable). Ajustável com ALLOWED_ORIGINS. */
export function allowedOrigins(): string[] {
  const env = Deno.env.get("ALLOWED_ORIGINS");
  const list = env ? env.split(",") : ["https://scalablee.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173"];
  const app = Deno.env.get("APP_URL");
  return [...list, ...(app ? [app] : [])].map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
}

/** Cabeçalhos de segurança + CORS só para as origens permitidas. */
export function securityHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin");
  if (origin && allowedOrigins().includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/** IP de quem chamou (para o limite de tentativas). */
export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconhecido";
}

/**
 * Limite de tentativas (rate limit): no máximo `max` pedidos por `janelaSeg` segundos para a mesma chave.
 * Se o banco não responder, deixa passar (não derruba o serviço) e registra no log.
 */
export async function rateLimit(db: SupabaseClient, chave: string, max: number, janelaSeg: number) {
  const { data, error } = await db.rpc("limite_registrar", { p_chave: chave, p_limite: max, p_janela_segundos: janelaSeg });
  if (error) {
    console.error("[rate-limit] indisponível:", error.message);
    return;
  }
  if (data === false) throw new HttpError(429, "Muitas solicitações seguidas. Aguarde um pouco e tente de novo.");
}

export type Papel = "dono" | "recepcao" | "profissional";
type Limite = { limite?: [max: number, janelaSeg: number]; papeis?: Papel[] };
const rotaDe = (req: Request) => new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "api";

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export type Company = {
  id: string;
  owner_id: string;
  name: string;
  segment: string | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  site_analysis: Record<string, unknown> | null;
  agent_whatsapp?: boolean;
  agent_auto_reply?: boolean;
  agent_instructions?: string | null;
};

export type AuthUser = { id: string; email: string | null };

/**
 * Resolve o usuário logado (pelo JWT) e a empresa dele.
 * - db: cliente administrativo (usar sempre filtrando por company.id)
 * - userDb: cliente com o token do próprio usuário — o RLS do banco garante o isolamento entre empresas
 */
export async function requireCompany(req: Request, opts: Limite = {}): Promise<{ db: SupabaseClient; userDb: SupabaseClient; company: Company; user: AuthUser; papel: Papel }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = admin();
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida. Faça login novamente.");
  if (opts.limite) await rateLimit(db, `${rotaDe(req)}:${userData.user.id}`, ...opts.limite);
  // Dono da clínica ou membro da equipe (recepção / profissional)
  let papel: Papel = "dono";
  let { data: company } = await db.from("companies").select("*").eq("owner_id", userData.user.id).maybeSingle();
  if (!company) {
    const { data: m } = await db.from("membros").select("company_id,papel").eq("user_id", userData.user.id).maybeSingle();
    if (m) {
      papel = m.papel as Papel;
      ({ data: company } = await db.from("companies").select("*").eq("id", m.company_id).maybeSingle());
    }
  }
  if (!company) throw new HttpError(404, "Cadastre sua clínica primeiro.");
  if (opts.papeis && !opts.papeis.includes(papel)) throw new HttpError(403, "Seu perfil na clínica não tem acesso a esta função. Fale com o dono da conta.");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const userDb = anon
    ? createClient(Deno.env.get("SUPABASE_URL")!, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    : db;
  return { db, userDb, company: company as Company, user: { id: userData.user.id, email: userData.user.email ?? null }, papel };
}

/** Usuário logado e o id da empresa dele (se já tiver cadastrado uma). */
export async function requireUser(req: Request, opts: Limite = {}): Promise<{ db: SupabaseClient; user: AuthUser; companyId: string | null }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = admin();
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida. Faça login novamente.");
  if (opts.limite) await rateLimit(db, `${rotaDe(req)}:${userData.user.id}`, ...opts.limite);
  const { data: company } = await db.from("companies").select("id").eq("owner_id", userData.user.id).maybeSingle();
  return { db, user: { id: userData.user.id, email: userData.user.email ?? null }, companyId: (company?.id as string | undefined) ?? null };
}

/**
 * Envolve uma rota: responde ao preflight e converte erros em JSON.
 * Erros esperados (HttpError) mostram a mensagem; erros internos mostram só uma mensagem genérica
 * (os detalhes ficam apenas no log do servidor, para não vazar informações internas).
 */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status >= 500) console.error(e);
        return json({ error: e.message }, e.status);
      }
      console.error(e);
      return json({ error: "Erro interno. Tente de novo em instantes." }, 500);
    }
  };
}

export { addDays, brl, HttpError, isoDate } from "./util.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./util.ts";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

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
export async function requireCompany(req: Request): Promise<{ db: SupabaseClient; userDb: SupabaseClient; company: Company; user: AuthUser }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = admin();
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida. Faça login novamente.");
  const { data: company } = await db.from("companies").select("*").eq("owner_id", userData.user.id).maybeSingle();
  if (!company) throw new HttpError(404, "Cadastre sua empresa primeiro.");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const userDb = anon
    ? createClient(Deno.env.get("SUPABASE_URL")!, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    : db;
  return { db, userDb, company: company as Company, user: { id: userData.user.id, email: userData.user.email ?? null } };
}

/** Usuário logado e o id da empresa dele (se já tiver cadastrado uma). */
export async function requireUser(req: Request): Promise<{ db: SupabaseClient; user: AuthUser; companyId: string | null }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = admin();
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida. Faça login novamente.");
  const { data: company } = await db.from("companies").select("id").eq("owner_id", userData.user.id).maybeSingle();
  return { db, user: { id: userData.user.id, email: userData.user.email ?? null }, companyId: (company?.id as string | undefined) ?? null };
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, status);
    }
  };
}

export { addDays, brl, HttpError, isoDate } from "./util.ts";

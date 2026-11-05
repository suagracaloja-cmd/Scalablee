import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

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
};

/** Resolve o usuário logado (pelo JWT) e a empresa dele. */
export async function requireCompany(req: Request): Promise<{ db: SupabaseClient; company: Company }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = admin();
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida. Faça login novamente.");
  const { data: company } = await db.from("companies").select("*").eq("owner_id", userData.user.id).maybeSingle();
  if (!company) throw new HttpError(404, "Cadastre sua empresa primeiro.");
  return { db, company: company as Company };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
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

export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { groqCreate, groqKey } from "./groq.ts";
import type { ModelRequest, ModelResponse } from "./agent.ts";

export const MODEL = "claude-opus-5-5";

const KEY_NAMES = ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY", "CLAUDE_KEY", "ANTHROPIC_TOKEN", "API_KEY"];
let cachedKey: string | null = null;

/** Encontra a chave da Anthropic: nomes comuns ou qualquer segredo no formato sk-ant-… */
function apiKey(): string | null {
  if (cachedKey) return cachedKey;
  let found: string | null = null;
  for (const n of KEY_NAMES) {
    const v = Deno.env.get(n)?.trim();
    if (v) {
      found = v;
      break;
    }
  }
  const env = Deno.env.toObject();
  if (!found) found = Object.values(env).map((v) => v.trim()).find((v) => v.startsWith("sk-ant-")) ?? null;
  // Diagnóstico (só nomes, nunca valores)
  const names = Object.keys(env).filter((k) => !k.startsWith("SUPABASE_") && /(KEY|TOKEN|SECRET|ANTHROPIC|CLAUDE|OPENAI|API)/i.test(k));
  console.log(`[ai] chave encontrada: ${found ? "sim (" + (found.startsWith("sk-ant-") ? "formato Anthropic" : "formato desconhecido") + ")" : "não"}; segredos vistos: ${names.join(", ") || "nenhum"}`);
  cachedKey = found;
  return found;
}

/** Há alguma IA configurada (Groq gratuita e/ou Anthropic)? */
export function hasAI() {
  return !!groqKey() || !!apiKey();
}

/** Provedores disponíveis, na ordem de uso: Groq (gratuita) primeiro, depois Anthropic (se houver chave e créditos). */
export function aiProviders() {
  return [...(groqKey() ? ["groq"] : []), ...(apiKey() ? ["anthropic"] : [])] as ("groq" | "anthropic")[];
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: apiKey() ?? undefined });
  return client;
}

/** Busca na internet (cobrada à parte pela Anthropic): desligada até autorização via AGENT_WEB_SEARCH=on. */
export const webSearchEnabled = () => (Deno.env.get("AGENT_WEB_SEARCH") ?? "").toLowerCase() === "on";

/**
 * Adaptador usado pela Coraline (lib/agent.ts) para chamar o modelo.
 * Tenta os provedores em ordem (Groq → Anthropic); se um falhar (limite diário, sem créditos, instabilidade),
 * o próximo assume. Só dá erro quando todos falham.
 */
export async function modelCreate(req: ModelRequest): Promise<ModelResponse> {
  const errors: string[] = [];
  for (const p of aiProviders()) {
    try {
      return p === "groq" ? await groqCreate(req) : await anthropicCreate(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ai] ${p} falhou: ${msg.slice(0, 300)}`);
      errors.push(msg);
    }
  }
  throw new Error(errors.join(" | ") || "nenhuma IA configurada");
}

/** Chamada à Anthropic (configuração original preservada). */
async function anthropicCreate(req: ModelRequest): Promise<ModelResponse> {
  const tools = [...(req.tools ?? [])] as unknown as Anthropic.Beta.BetaToolUnion[];
  if (req.tools && webSearchEnabled()) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 3 } as Anthropic.Beta.BetaToolUnion);
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: req.max_tokens ?? 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: req.effort ?? "low" },
    cache_control: { type: "ephemeral" },
    system: req.system,
    messages: req.messages as Anthropic.Beta.BetaMessageParam[],
    ...(tools.length ? { tools } : {}),
  });
  return res as unknown as ModelResponse;
}

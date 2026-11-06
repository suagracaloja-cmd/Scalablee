import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

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

export function hasAI() {
  return !!apiKey();
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: apiKey() ?? undefined });
  return client;
}

/** Busca na internet (cobrada à parte pela Anthropic): desligada até autorização via AGENT_WEB_SEARCH=on. */
export const webSearchEnabled = () => (Deno.env.get("AGENT_WEB_SEARCH") ?? "").toLowerCase() === "on";

/** Adaptador usado pelo Agente SCALABLE (lib/agent.ts) para chamar o modelo. */
export async function modelCreate(req: {
  system: string;
  messages: { role: "user" | "assistant"; content: unknown }[];
  tools?: Record<string, unknown>[];
  max_tokens?: number;
  effort?: "low" | "medium" | "high";
}) {
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
  return res as unknown as { content: { type: string; [k: string]: unknown }[]; stop_reason: string | null };
}

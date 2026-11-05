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

type AskOptions = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: "low" | "medium" | "high";
  webSearch?: boolean;
  webFetch?: boolean;
  maxTokens?: number;
};

export type AskResult = { text: string; sources: { title: string; url: string }[] };

/**
 * Chama o Claude. Com webSearch/webFetch usa as ferramentas de servidor
 * e continua automaticamente em caso de pause_turn.
 */
export async function ask(opts: AskOptions): Promise<AskResult> {
  const tools: Anthropic.Beta.BetaToolUnion[] = [];
  if (opts.webSearch) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 } as Anthropic.Beta.BetaToolUnion);
  if (opts.webFetch) tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 } as Anthropic.Beta.BetaToolUnion);

  const messages = [...opts.messages];
  const sources = new Map<string, string>();
  let text = "";

  for (let i = 0; i < 4; i++) {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "low" },
      system: opts.system,
      messages,
      ...(tools.length ? { tools } : {}),
    });

    if (res.stop_reason === "refusal") throw new Error("A IA recusou este pedido.");

    for (const block of res.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
      }
    }

    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    text = "";
  }

  return { text: text.trim(), sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })) };
}

/** Extrai o primeiro objeto JSON de um texto. */
export function parseJSON<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

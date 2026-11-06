// Adaptador da Groq (API compatível com OpenAI, plano gratuito com limites diários).
// Converte o formato interno do Agente SCALABLE (blocos text / tool_use / tool_result)
// para Chat Completions e de volta, mantendo o pedido dentro do orçamento de tokens do plano gratuito.
import type { Block, ModelRequest, ModelResponse } from "./agent.ts";

type Json = Record<string, unknown>;
type OAIMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: OAIToolCall[]; tool_call_id?: string };
type OAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const URL_CHAT = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_DEFAULT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

export class GroqError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter: number | null = null) {
    super(`groq ${status}${code ? ` ${code}` : ""}: ${message}`);
  }
}

const env = (k: string) => (typeof Deno !== "undefined" ? Deno.env.get(k) : undefined)?.trim() || undefined;

/** Chave da Groq: GROQ_API_KEY ou qualquer segredo no formato gsk_… */
export function groqKey(): string | null {
  const direct = env("GROQ_API_KEY") ?? env("GROQ_KEY");
  if (direct) return direct;
  if (typeof Deno === "undefined") return null;
  return Object.values(Deno.env.toObject()).map((v) => v.trim()).find((v) => v.startsWith("gsk_")) ?? null;
}

/** Modelos na ordem de uso: GROQ_MODEL (opcional) e depois os gratuitos padrão (cada um tem cota própria). */
export function groqModels(): string[] {
  const first = env("GROQ_MODEL");
  return [...new Set([...(first ? [first] : []), ...GROQ_DEFAULT_MODELS])];
}

// ---------- conversão de formato ----------

/**
 * A Groq valida os argumentos das chamadas de ferramenta contra o schema e recusa o pedido inteiro
 * se o modelo mandar `null` num campo opcional. Aqui os campos opcionais passam a aceitar `null`
 * (e os nulos são removidos antes de executar a ferramenta, em fromOpenAI).
 */
export function relaxSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const s = { ...(schema as Json) };
  if (s.properties && typeof s.properties === "object") {
    const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
    const props: Json = {};
    for (const [k, v] of Object.entries(s.properties as Json)) {
      let p = relaxSchema(v) as Json;
      if (!required.has(k) && p && typeof p === "object") {
        p = { ...p };
        if (typeof p.type === "string") p.type = [p.type, "null"];
        if (Array.isArray(p.enum) && !p.enum.includes(null)) p.enum = [...p.enum, null];
      }
      props[k] = p;
    }
    s.properties = props;
  }
  if (s.items) s.items = relaxSchema(s.items);
  return s;
}

export function toOpenAI(req: ModelRequest): { messages: OAIMessage[]; tools?: Json[] } {
  const messages: OAIMessage[] = [{ role: "system", content: req.system }];
  for (const m of req.messages) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = (Array.isArray(m.content) ? m.content : []) as Block[];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      const calls: OAIToolCall[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: "assistant", content: text || (calls.length ? null : ""), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of blocks.filter((b) => b.type === "tool_result")) {
        const c = b.content;
        messages.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: typeof c === "string" ? c : JSON.stringify(c ?? "") });
      }
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      if (text) messages.push({ role: "user", content: text });
    }
  }
  // Somente ferramentas próprias (as ferramentas de servidor da Anthropic, como a busca na web, não existem aqui)
  const tools = (req.tools ?? [])
    .filter((t) => typeof t.name === "string" && t.input_schema)
    .map((t) => ({ type: "function", function: { name: t.name, description: String(t.description ?? ""), parameters: relaxSchema(t.input_schema) } }));
  return { messages, ...(tools.length ? { tools } : {}) };
}

export function fromOpenAI(data: Json): ModelResponse {
  const choice = ((data.choices as Json[] | undefined) ?? [])[0] ?? {};
  const msg = (choice.message ?? {}) as { content?: string | null; tool_calls?: OAIToolCall[] };
  const content: Block[] = [];
  if (msg.content && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const c of msg.tool_calls ?? []) {
    let input: Json = {};
    try {
      const parsed = JSON.parse(c.function?.arguments || "{}");
      if (parsed && typeof parsed === "object") input = Object.fromEntries(Object.entries(parsed as Json).filter(([, v]) => v !== null));
    } catch {
      // argumentos inválidos: a ferramenta recebe {} e devolve um erro de validação que o modelo consegue corrigir
    }
    content.push({ type: "tool_use", id: c.id, name: c.function?.name, input });
  }
  const fr = String(choice.finish_reason ?? "");
  const stop_reason = (msg.tool_calls?.length ?? 0) > 0 ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn";
  return { content, stop_reason };
}

// ---------- orçamento de tokens ----------

/** Estimativa simples (≈ 3,6 caracteres por token em português com JSON). */
export const estimateTokens = (v: unknown) => Math.ceil((typeof v === "string" ? v : JSON.stringify(v)).length / 3.6);

const cut = (s: string | null, max: number) => (s && s.length > max ? s.slice(0, max) + "…(resumido)" : s);

/**
 * Reduz o pedido para caber em `budget` tokens de entrada:
 * 1) resultados de ferramentas e respostas antigas longas são resumidos;
 * 2) mensagens mais antigas da conversa saem primeiro (a pergunta atual e as ferramentas desta resposta ficam).
 */
export function fitBudget(messages: OAIMessage[], tools: Json[] | undefined, budget: number): OAIMessage[] {
  const total = (ms: OAIMessage[]) => estimateTokens(ms) + (tools ? estimateTokens(tools) : 0);
  let out = messages.map((m) => ({ ...m }));
  if (total(out) <= budget) return out;

  // índice da pergunta atual (última mensagem do usuário com texto)
  const lastUser = (ms: OAIMessage[]) => {
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === "user") return i;
    return ms.length - 1;
  };
  for (const max of [6000, 3000, 1500, 700]) {
    out = out.map((m, i) => (m.role === "tool" || (m.role === "assistant" && i < lastUser(out)) ? { ...m, content: cut(m.content, max) } : m));
    if (total(out) <= budget) return out;
  }
  // remove histórico antigo (entre o system e a pergunta atual), do mais antigo para o mais novo
  while (total(out) > budget && lastUser(out) > 1) out.splice(1, 1);
  return out;
}

// ---------- chamada ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function logLimits(model: string, h: Headers) {
  const g = (k: string) => h.get(k);
  if (g("x-ratelimit-limit-requests") || g("x-ratelimit-limit-tokens"))
    console.log(
      `[groq] ${model}: pedidos/dia ${g("x-ratelimit-remaining-requests")}/${g("x-ratelimit-limit-requests")}, tokens/min ${g("x-ratelimit-remaining-tokens")}/${g("x-ratelimit-limit-tokens")}`,
    );
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Uma chamada à Groq num modelo específico. */
async function callModel(model: string, key: string, req: ModelRequest, budget: number, fetchFn: FetchFn): Promise<ModelResponse> {
  const { messages, tools } = toOpenAI(req);
  const maxOut = Math.min(req.max_tokens ?? 4000, Number(env("GROQ_MAX_OUTPUT_TOKENS") ?? 4000));
  const body = {
    model,
    messages: fitBudget(messages, tools, budget),
    ...(tools ? { tools, tool_choice: "auto" } : {}),
    max_completion_tokens: maxOut,
    ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: req.effort ?? "low" } : {}),
  };
  const res = await fetchFn(URL_CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  logLimits(model, res.headers);
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const err = (data.error ?? {}) as Json;
    const ra = Number(res.headers.get("retry-after"));
    throw new GroqError(res.status, String(err.code ?? err.type ?? ""), String(err.message ?? `Erro ${res.status}`), Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  return fromOpenAI(data);
}

/**
 * Chama a Groq com as proteções do plano gratuito:
 *  - pedido grande demais para o limite por minuto → resume mais e tenta de novo;
 *  - limite por minuto atingido → espera o tempo indicado (até 20 s) e tenta de novo;
 *  - limite do modelo esgotado ou modelo indisponível → passa para o próximo modelo gratuito;
 *  - chamada de ferramenta malformada → tenta mais uma vez.
 */
export async function groqCreate(req: ModelRequest, opts: { fetchFn?: FetchFn; key?: string; models?: string[]; wait?: (ms: number) => Promise<void> } = {}): Promise<ModelResponse> {
  const key = opts.key ?? groqKey();
  if (!key) throw new GroqError(401, "no_key", "chave da Groq não configurada");
  const fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i));
  const wait = opts.wait ?? sleep;
  const baseBudget = Number(env("GROQ_MAX_INPUT_TOKENS") ?? 6000);
  let last: unknown = null;

  for (const model of opts.models ?? groqModels()) {
    let budget = baseBudget;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callModel(model, key, req, budget, fetchFn);
      } catch (e) {
        last = e;
        if (!(e instanceof GroqError)) throw e;
        const msg = e.message.toLowerCase();
        if (e.status === 401 || e.status === 403) throw e; // chave recusada: trocar de modelo não ajuda
        if (e.status === 413 || msg.includes("request too large") || msg.includes("reduce your message size")) {
          budget = Math.floor(budget / 2); // resume mais e tenta de novo
          if (budget < 1500) break;
          continue;
        }
        if (e.status === 429) {
          if (e.retryAfter !== null && e.retryAfter <= 20 && attempt === 0) {
            await wait(e.retryAfter * 1000);
            continue;
          }
          break; // cota do modelo esgotada: próximo modelo
        }
        if (e.code === "tool_use_failed") {
          if (attempt === 0) continue;
          break; // o outro modelo gratuito costuma acertar a chamada
        }
        if (e.status === 404 || (msg.includes("model") && (msg.includes("not found") || msg.includes("decommissioned") || msg.includes("does not exist")))) break;
        if (e.status >= 500 && attempt === 0) continue;
        throw e;
      }
    }
  }
  throw last instanceof Error ? last : new GroqError(429, "rate_limit_exceeded", "limite da Groq atingido");
}

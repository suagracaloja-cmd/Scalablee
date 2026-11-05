// Scalablee API — uma única Edge Function com rotas:
//   POST /api/agents      → executa os agentes de IA
//   POST /api/assistant   → IA assistente (perguntas do dono)
//   POST /api/site        → análise do site
//   POST /api/wa-send     → conectar WhatsApp, enviar, aprovar/recusar
//   GET|POST /api/wa-webhook → webhook da WhatsApp Cloud API (Meta)
import agents from "./agents.ts";
import assistant from "./assistant.ts";
import site from "./site.ts";
import waSend from "./wa-send.ts";
import waWebhook from "./wa-webhook.ts";
import { cors, json } from "./lib/common.ts";

const routes: Record<string, (req: Request) => Promise<Response> | Response> = {
  agents,
  assistant,
  site,
  "wa-send": waSend,
  "wa-webhook": waWebhook,
};

Deno.serve((req) => {
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[route];
  if (!fn) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    return json({ error: "Rota não encontrada" }, 404);
  }
  return fn(req);
});

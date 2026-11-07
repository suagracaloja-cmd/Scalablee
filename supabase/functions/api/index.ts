// Scalable API — Edge Function única com rotas:
//   POST /api/agente        → conversa com o Agente SCALABLE (ponto único de IA, com ferramentas)
//   POST /api/aprovacoes    → aprovar/recusar operações preparadas pelo agente (Central de Aprovações)
//   POST /api/assinatura    → assinatura pelo Mercado Pago (status, assinar, faturas, cancelar)
//   POST /api/mp-webhook    → avisos do Mercado Pago
//   POST /api/conta         → excluir a conta e todos os dados (LGPD)
//   POST /api/uso           → consumo de IA da empresa hoje
//   POST /api/analise       → análise geral do agente (todas as áreas)  [alias antigo: /api/agents]
//   POST /api/site          → análise do site
//   POST /api/wa-send       → conectar WhatsApp e enviar mensagens
//   GET|POST /api/wa-webhook → webhook da WhatsApp Cloud API (Meta)
import agente from "./agente.ts";
import aprovacoes from "./aprovacoes.ts";
import assinatura from "./assinatura.ts";
import mpWebhook from "./mp-webhook.ts";
import conta from "./conta.ts";
import uso from "./uso.ts";
import analise from "./analise.ts";
import site from "./site.ts";
import waSend from "./wa-send.ts";
import waWebhook from "./wa-webhook.ts";
import { cors, json } from "./lib/common.ts";

const routes: Record<string, (req: Request) => Promise<Response> | Response> = {
  agente,
  aprovacoes,
  assinatura,
  "mp-webhook": mpWebhook,
  conta,
  uso,
  analise,
  agents: analise,
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

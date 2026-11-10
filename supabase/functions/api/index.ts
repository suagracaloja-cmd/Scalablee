// Coraline AI API — Edge Function única com rotas:
//   POST /api/agente        → conversa com a Coraline (ponto único de IA, com ferramentas)
//   POST /api/aprovacoes    → aprovar/recusar operações preparadas pelo agente (Central de Aprovações)
//   POST /api/assinatura    → assinatura pelo Mercado Pago (status, assinar, faturas, cancelar)
//   POST /api/mp-webhook    → avisos do Mercado Pago
//   POST /api/conta         → excluir a conta e todos os dados (LGPD)
//   POST /api/uso           → consumo de IA da empresa hoje
//   POST /api/analise       → análise geral do agente (todas as áreas)  [alias antigo: /api/agents]
//   POST /api/site          → análise do site
//   POST /api/wa-send       → conectar WhatsApp e enviar mensagens
//   GET|POST /api/wa-webhook → webhook da WhatsApp Cloud API (Meta)
//   POST /api/equipe        → remover alguém da equipe (convites e lista: direto no banco, com RLS)
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
import equipe from "./equipe.ts";
import { admin, clientIp, HttpError, json, rateLimit, securityHeaders } from "./lib/common.ts";

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
  equipe,
};

// Limites gerais por IP (pedidos por minuto), antes de qualquer outra coisa
const LIMITE_IP: Record<string, number> = { "wa-webhook": 600, "mp-webhook": 120 };
const LIMITE_IP_PADRAO = 240;
const TAMANHO_MAXIMO = 1_000_000; // 1 MB por pedido

async function rotear(req: Request): Promise<Response> {
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[route];
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!fn) return json({ error: "Rota não encontrada" }, 404);
  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO) return json({ error: "Pedido grande demais." }, 413);
  try {
    await rateLimit(admin(), `ip:${route}:${clientIp(req)}`, LIMITE_IP[route] ?? LIMITE_IP_PADRAO, 60);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
  return fn(req);
}

Deno.serve(async (req) => {
  const res = await rotear(req).catch((e) => {
    console.error(e);
    return json({ error: "Erro interno. Tente de novo em instantes." }, 500);
  });
  // Cabeçalhos de segurança e CORS (só para o site da Coraline AI) em todas as respostas
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(securityHeaders(req))) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

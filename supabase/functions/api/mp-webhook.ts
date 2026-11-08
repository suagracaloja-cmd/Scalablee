// POST /api/mp-webhook — avisos do Mercado Pago (assinatura autorizada/pausada/cancelada, cobranças).
// O Mercado Pago acrescenta ?data.id=...&type=... ao endereço e assina o aviso no cabeçalho x-signature.
import { admin, handle, json } from "./lib/common.ts";
import { billingConfig, handleMpNotification, mpClient } from "./lib/billing.ts";

export default handle(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const cfg = billingConfig();
  const r = await handleMpNotification(
    admin(),
    {
      dataId: url.searchParams.get("data.id") ?? url.searchParams.get("id"),
      type: url.searchParams.get("type") ?? url.searchParams.get("topic"),
      signature: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
      body,
    },
    cfg,
    mpClient(cfg),
  );
  if (!("ignored" in r) && !("duplicate" in r)) console.log(`[mercadopago] ${JSON.stringify(r)}`);
  // Resposta enxuta para quem chamou: os detalhes (empresa, situação) ficam só no log do servidor
  return json({ ok: true });
});

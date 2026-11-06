// POST /api/asaas-webhook — avisos do Asaas (pagamento confirmado, vencido, assinatura cancelada…).
// O Asaas envia o token configurado no painel dele no cabeçalho "asaas-access-token".
import { admin, handle, json } from "./lib/common.ts";
import { billingConfig, handleAsaasEvent } from "./lib/billing.ts";

export default handle(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const body = await req.json().catch(() => ({}));
  const r = await handleAsaasEvent(admin(), req.headers.get("asaas-access-token"), body, billingConfig());
  if (!("ignored" in r) && !("duplicate" in r)) console.log(`[asaas] ${String(body.event)} → ${JSON.stringify(r)}`);
  return json(r);
});

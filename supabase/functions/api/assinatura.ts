// POST /api/assinatura — { action: "status" | "assinar" | "faturas" | "cancelar", ... }
// Assinatura mensal da Scalable pelo Asaas (Pix, boleto ou cartão na página segura do Asaas).
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { AsaasError, asaasClient, billingConfig, billingView, cancelSubscription, ensureBilling, invoices, subscribe } from "./lib/billing.ts";

export default handle(async (req) => {
  const { db, company } = await requireCompany(req);
  const body = await req.json().catch(() => ({}));
  const cfg = billingConfig();
  if (!cfg.enabled) return json({ enabled: false });
  const asaas = asaasClient(cfg);
  try {
    switch (body.action ?? "status") {
      case "status":
        return json(billingView(await ensureBilling(db, company, cfg), cfg));
      case "assinar":
        return json(await subscribe(db, company, body, cfg, asaas));
      case "faturas":
        return json({ faturas: await invoices(await ensureBilling(db, company, cfg), asaas) });
      case "cancelar":
        return json(await cancelSubscription(db, await ensureBilling(db, company, cfg), asaas));
    }
  } catch (e) {
    if (e instanceof AsaasError) throw new HttpError(e.status >= 500 ? 502 : 400, `Asaas: ${e.message}`);
    throw e;
  }
  throw new HttpError(400, "Ação inválida");
});

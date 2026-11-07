// POST /api/assinatura — { action: "status" | "assinar" | "faturas" | "cancelar", ... }
// Assinatura mensal da Scalable pelo Mercado Pago (concluída na página segura do Mercado Pago).
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { billingConfig, billingView, cancelSubscription, ensureBilling, invoices, mpClient, PaymentProviderError, subscribe } from "./lib/billing.ts";

export default handle(async (req) => {
  const { db, company } = await requireCompany(req);
  const body = await req.json().catch(() => ({}));
  const cfg = billingConfig();
  if (!cfg.enabled) return json({ enabled: false });
  const mp = mpClient(cfg);
  try {
    switch (body.action ?? "status") {
      case "status":
        return json(billingView(await ensureBilling(db, company, cfg), cfg));
      case "assinar":
        return json(await subscribe(db, company, body, cfg, mp));
      case "faturas":
        return json({ faturas: await invoices(await ensureBilling(db, company, cfg), mp) });
      case "cancelar":
        return json(await cancelSubscription(db, await ensureBilling(db, company, cfg), mp));
    }
  } catch (e) {
    if (e instanceof PaymentProviderError) throw new HttpError(e.status >= 500 ? 502 : 400, `Mercado Pago: ${e.message}`);
    throw e;
  }
  throw new HttpError(400, "Ação inválida");
});

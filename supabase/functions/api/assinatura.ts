// POST /api/assinatura — { action: "status" | "assinar" | "faturas" | "cancelar", ... }
// Assinatura mensal da Coraline AI pelo Mercado Pago (concluída na página segura do Mercado Pago).
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { lerJson, textoOpcional, umDe } from "./lib/util.ts";
import { billingConfig, billingDiagnostics, billingView, cancelSubscription, ensureBilling, invoices, mpClient, PaymentProviderError, subscribe } from "./lib/billing.ts";

export default handle(async (req) => {
  const { db, company, papel } = await requireCompany(req, { limite: [30, 60] });
  // Assinatura e cobrança são assunto do dono da conta: a equipe não vê
  if (papel !== "dono") return json({ enabled: false });
  const body = await lerJson(req);
  const action = umDe(body.action ?? "status", ["status", "assinar", "faturas", "cancelar"] as const, "Ação");
  textoOpcional(body.email, "E-mail", 254);
  const cfg = billingConfig();
  if (!cfg.enabled) {
    // Diagnóstico (só nomes, nunca valores): o que falta para ligar a cobrança
    console.log(`[billing] cobrança desligada: ${billingDiagnostics().join("; ")}`);
    return json({ enabled: false });
  }
  const mp = mpClient(cfg);
  try {
    switch (action) {
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

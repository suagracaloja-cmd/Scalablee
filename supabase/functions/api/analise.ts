// POST /api/analise — análise geral da Coraline AI (todas as áreas, no máximo uma chamada de IA).
import { assertAccess } from "./lib/billing.ts";
import { handle, json, requireCompany } from "./lib/common.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { analisarEmpresa } from "./lib/analise.ts";
import { avisarAprovacoesNovas, emSegundoPlano } from "./lib/push.ts";

export default handle(async (req) => {
  const { db, userDb, company, user } = await requireCompany(req, { limite: [5, 600], papeis: ["dono"] });
  await assertAccess(db, company);
  const inicio = new Date(Date.now() - 2000).toISOString();
  const r = await analisarEmpresa({ db: userDb, admin: db, company, create: hasAI() ? modelCreate : null });
  if (r.approvals) emSegundoPlano(avisarAprovacoesNovas(db, company.id, { desde: inicio, semConversa: true }, { exceto: user.id }));
  return json(r);
});

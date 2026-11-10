// POST /api/analise — análise geral da Coraline (todas as áreas, no máximo uma chamada de IA).
import { assertAccess } from "./lib/billing.ts";
import { handle, json, requireCompany } from "./lib/common.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { analisarEmpresa } from "./lib/analise.ts";

export default handle(async (req) => {
  const { db, userDb, company } = await requireCompany(req, { limite: [5, 600], papeis: ["dono"] });
  await assertAccess(db, company);
  return json(await analisarEmpresa({ db: userDb, admin: db, company, create: hasAI() ? modelCreate : null }));
});

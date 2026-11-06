// POST /api/analise — análise geral do Agente SCALABLE (todas as áreas, no máximo uma chamada de IA).
import { handle, json, requireCompany } from "./lib/common.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { analisarEmpresa } from "./lib/analise.ts";

export default handle(async (req) => {
  const { db, userDb, company } = await requireCompany(req);
  return json(await analisarEmpresa({ db: userDb, admin: db, company, create: hasAI() ? modelCreate : null }));
});

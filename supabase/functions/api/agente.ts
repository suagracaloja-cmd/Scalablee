// POST /api/agente — ponto único de conversa com a Coraline AI.
// Corpo: { message: string, thread_id?: string }
// Cria a conversa (thread) se necessário, guarda o histórico e responde usando as ferramentas.
import { assertAccess } from "./lib/billing.ts";
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { isUuid, lerJson } from "./lib/util.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { conversar } from "./lib/conversa.ts";

export default handle(async (req) => {
  const { userDb, company, db, papel } = await requireCompany(req, { limite: [20, 60] });
  await assertAccess(db, company);
  const body = await lerJson(req);
  if (typeof body.message !== "string") throw new HttpError(400, "Escreva uma mensagem.");
  if (body.thread_id != null && !isUuid(body.thread_id)) throw new HttpError(400, "Conversa inválida.");
  return json(await conversar({ db: userDb, company, message: body.message, threadId: body.thread_id, create: hasAI() ? modelCreate : null, papel }));
});

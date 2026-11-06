// POST /api/agente — ponto único de conversa com o Agente SCALABLE.
// Corpo: { message: string, thread_id?: string }
// Cria a conversa (thread) se necessário, guarda o histórico e responde usando as ferramentas.
import { assertAccess } from "./lib/billing.ts";
import { handle, json, requireCompany } from "./lib/common.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { conversar } from "./lib/conversa.ts";

export default handle(async (req) => {
  const { userDb, company, db } = await requireCompany(req);
  await assertAccess(db, company);
  const body = await req.json().catch(() => ({}));
  return json(await conversar({ db: userDb, company, message: body.message, threadId: body.thread_id, create: hasAI() ? modelCreate : null }));
});

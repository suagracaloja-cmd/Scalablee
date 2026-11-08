// POST /api/uso — consumo de IA da empresa hoje e a IA em uso.
import { handle, json, requireCompany } from "./lib/common.ts";
import { aiProviders } from "./lib/ai.ts";
import { dailyLimit, usageToday } from "./lib/conversa.ts";

export default handle(async (req) => {
  const { userDb, company } = await requireCompany(req, { limite: [60, 60] });
  return json({ used: await usageToday(userDb, company.id), limit: dailyLimit(), providers: aiProviders() });
});

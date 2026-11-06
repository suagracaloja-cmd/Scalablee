// POST /api/aprovacoes — aprovar ou recusar operações preparadas pelo Agente SCALABLE.
// Corpo: { action: "approve" | "reject", id: string, text?: string, motivo?: string }
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { ApprovalError, decideApproval } from "./lib/approvals.ts";

export default handle(async (req) => {
  const { db, userDb, company, user } = await requireCompany(req);
  const body = await req.json().catch(() => ({}));
  try {
    return json(await decideApproval({ db: userDb, admin: db, companyId: company.id, userId: user.id, userEmail: user.email }, body));
  } catch (e) {
    if (e instanceof ApprovalError) throw new HttpError(e.status, e.message);
    throw e;
  }
});

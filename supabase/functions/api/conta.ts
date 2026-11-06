// POST /api/conta — { action: "excluir", confirmacao: "EXCLUIR" } apaga a conta e todos os dados da empresa.
import { handle, HttpError, json, requireUser } from "./lib/common.ts";
import { excluirConta } from "./lib/conta.ts";

export default handle(async (req) => {
  const { db, user, companyId } = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  if (body.action === "excluir") return json(await excluirConta(db, user.id, companyId, body.confirmacao));
  throw new HttpError(400, "Ação inválida");
});

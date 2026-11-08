// POST /api/conta — { action: "excluir", confirmacao: "EXCLUIR" } apaga a conta e todos os dados da empresa.
import { handle, HttpError, json, requireUser } from "./lib/common.ts";
import { excluirConta } from "./lib/conta.ts";
import { lerJson } from "./lib/util.ts";

export default handle(async (req) => {
  const { db, user, companyId } = await requireUser(req, { limite: [5, 3600] });
  const body = await lerJson(req);
  if (body.action === "excluir") return json(await excluirConta(db, user.id, companyId, body.confirmacao));
  throw new HttpError(400, "Ação inválida");
});

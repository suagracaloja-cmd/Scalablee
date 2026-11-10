// POST /api/equipe — { action: "remover", user_id } tira alguém da equipe da clínica (só o dono).
// Convites e a lista da equipe são feitos direto pelo site, protegidos pelas regras do banco (RLS).
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { isUuid, lerJson, umDe } from "./lib/util.ts";

export default handle(async (req) => {
  const { db, company, user } = await requireCompany(req, { limite: [30, 60], papeis: ["dono"] });
  const body = await lerJson(req);
  umDe(body.action, ["remover"] as const, "Ação");
  if (!isUuid(body.user_id)) throw new HttpError(400, "Pessoa inválida.");
  if (body.user_id === user.id) throw new HttpError(400, "Você é o dono da conta e não pode se remover da equipe.");
  const { data, error } = await db.from("membros").delete().eq("company_id", company.id).eq("user_id", body.user_id).select("user_id");
  if (error) throw new HttpError(500, "Não foi possível remover agora. Tente de novo.");
  if (!data?.length) throw new HttpError(404, "Essa pessoa não faz parte da equipe.");
  // O login do profissional deixa de estar ligado à agenda (o cadastro do profissional continua)
  await db.from("profissionais").update({ user_id: null }).eq("company_id", company.id).eq("user_id", body.user_id);
  return json({ ok: true });
});

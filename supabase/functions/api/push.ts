// POST /api/push — notificações no celular.
//   { action: "chave" }  → chave pública para o aparelho se inscrever (gerada no primeiro uso)
//   { action: "testar" } → manda um aviso de teste para os aparelhos de quem pediu
import { handle, json, requireCompany } from "./lib/common.ts";
import { lerJson, umDe } from "./lib/util.ts";
import { chavesVapid, enviarParaAparelho } from "./lib/push.ts";

export default handle(async (req) => {
  const { db, user } = await requireCompany(req, { limite: [20, 60] });
  const body = await lerJson(req);
  const action = umDe(body.action ?? "chave", ["chave", "testar"] as const, "Ação");
  const chaves = await chavesVapid(db);
  if (action === "chave") return json({ publicKey: chaves.publica });

  const { data } = await db.from("push_inscricoes").select("id,endpoint,p256dh,auth").eq("user_id", user.id);
  let enviados = 0;
  let falhas = 0;
  for (const i of data ?? []) {
    let status = 0;
    try {
      status = await enviarParaAparelho(i, { titulo: "Notificações da Scalable ativadas", texto: "É assim que os avisos de WhatsApp e de aprovações vão chegar neste aparelho.", url: "/configuracoes", tag: "teste" }, chaves);
    } catch {
      status = 0;
    }
    if (status >= 200 && status < 300) enviados++;
    else {
      falhas++;
      if (status === 404 || status === 410) await db.from("push_inscricoes").delete().eq("id", i.id);
      console.log(`[push] teste: serviço de push respondeu ${status || "sem resposta"}`);
    }
  }
  return json({ aparelhos: data?.length ?? 0, enviados, falhas });
});

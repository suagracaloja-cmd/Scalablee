// GET /api/saude — verificação de saúde para monitoramento (ex.: um monitor de disponibilidade gratuito).
// Sem login. Não mostra dados nem configuração: só se a API e o banco respondem, e em quanto tempo.
import { admin, json } from "./lib/common.ts";

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const db = admin(); // limite por IP: o roteador (index.ts) já aplica 30 verificações por minuto
  const t0 = performance.now();
  const { error } = await db.from("companies").select("id").limit(1);
  const bancoMs = Math.round(performance.now() - t0);
  if (error) {
    console.error("[saude] banco indisponível:", error.message);
    return json({ ok: false, banco: "indisponível", banco_ms: bancoMs }, 503);
  }
  return json({ ok: true, banco: "ok", banco_ms: bancoMs, horario: new Date().toISOString() });
};

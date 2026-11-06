// Descontinuada: o Agente SCALABLE agora tem um ponto único de entrada em /functions/v1/api/agente.
// Mantida apenas para responder de forma clara a versões antigas do site.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ error: "Esta versão do site está desatualizada. Recarregue a página para usar o Agente SCALABLE." }), {
    status: 410,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

// A IA entra no site da empresa, avalia e explica o que melhorar.
import { handle, HttpError, json, requireCompany } from "./lib/common.ts";
import { hasAI, modelCreate } from "./lib/ai.ts";
import { agentSiteReview } from "./lib/agent.ts";

type Analysis = {
  score: number;
  summary: string;
  business: string;
  strengths: string[];
  improvements: string[];
  products: string[];
  checks: Record<string, boolean>;
  stats: Record<string, number | string>;
  analyzed_url: string;
};

export default (
  handle(async (req) => {
    const { db, company } = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    let url: string = (body.url ?? company.website ?? "").trim();
    if (!url) throw new HttpError(400, "Informe o endereço do site.");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      throw new HttpError(400, "Endereço inválido.");
    }
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":"))
      throw new HttpError(400, "Informe o domínio público do site (ex: minhaloja.com.br).");

    const t0 = Date.now();
    let html = "";
    let finalUrl = url;
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScalableeBot/1.0)", Accept: "text/html" },
      });
      finalUrl = res.url;
      html = (await res.text()).slice(0, 600_000);
      if (!res.ok) throw new Error(`O site respondeu com erro ${res.status}`);
    } catch (e) {
      throw new HttpError(422, `Não consegui acessar o site: ${e instanceof Error ? e.message : e}`);
    }
    const loadMs = Date.now() - t0;

    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? "";
    const title = decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    const metaDesc = decode(pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i));
    const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => strip(m[1])).filter(Boolean).slice(0, 25);
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    const imgsNoAlt = imgs.filter((i) => !/\balt=["'][^"']+/i.test(i)).length;
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)/gi)].map((m) => m[1]);
    const text = strip(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")).slice(0, 12000);

    const checks = {
      https: finalUrl.startsWith("https://"),
      titulo: title.length > 0,
      meta_descricao: metaDesc.length > 0,
      responsivo_mobile: /<meta[^>]+name=["']viewport["']/i.test(html),
      h1: /<h1\b/i.test(html),
      link_whatsapp: links.some((l) => /wa\.me|api\.whatsapp\.com|whatsapp:/i.test(l)),
      link_instagram: links.some((l) => /instagram\.com/i.test(l)),
      pixel_ou_analytics: /gtag\(|googletagmanager|fbq\(|facebook\.net\/.*fbevents/i.test(html),
      imagens_com_alt: imgs.length === 0 || imgsNoAlt / imgs.length < 0.3,
      carregamento_rapido: loadMs < 3000,
    };
    const stats = { tempo_ms: loadMs, imagens: imgs.length, imagens_sem_alt: imgsNoAlt, links: links.length, palavras: text.split(/\s+/).length };
    const base = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);

    let analysis: Analysis = {
      score: base,
      summary: `Seu site passou em ${Object.values(checks).filter(Boolean).length} de ${Object.keys(checks).length} verificações técnicas.`,
      business: title || company.name,
      strengths: Object.entries(checks).filter(([, v]) => v).map(([k]) => label(k)),
      improvements: Object.entries(checks).filter(([, v]) => !v).map(([k]) => `Corrigir: ${label(k)}`),
      products: [],
      checks,
      stats,
      analyzed_url: finalUrl,
    };

    if (hasAI()) {
      try {
        const p = (await agentSiteReview({
          company,
          pageInfo: `URL: ${finalUrl}\nTítulo: ${title}\nMeta descrição: ${metaDesc}\nTítulos (h1-h3): ${headings.join(" | ")}\nVerificações técnicas: ${JSON.stringify(checks)}\nEstatísticas: ${JSON.stringify(stats)}\n\nTexto da página:\n${text}`,
          create: modelCreate,
        })) as Partial<Analysis> | null;
        if (p) analysis = { ...analysis, ...p, score: Math.round(((Number(p.score) || base) + base) / 2), checks, stats, analyzed_url: finalUrl };
      } catch (e) {
        console.error("[site] IA indisponível, usando só a verificação técnica:", e instanceof Error ? e.message : e);
      }
    }

    await db.from("companies").update({ website: url, site_analysis: analysis, site_analyzed_at: new Date().toISOString() }).eq("id", company.id);
    await db.from("insights").insert({
      company_id: company.id,
      agent_kind: "marketing",
      title: `Análise do site: nota ${analysis.score}/100`,
      body: `${analysis.summary}\n\nO que melhorar:\n${analysis.improvements.map((i) => `• ${i}`).join("\n")}`,
      priority: analysis.score < 60 ? "high" : "normal",
    });

    return json({ analysis });
  })
);

function strip(s: string) {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
function label(k: string) {
  return (
    {
      https: "Site seguro (HTTPS)",
      titulo: "Título da página",
      meta_descricao: "Descrição para o Google",
      responsivo_mobile: "Adaptado para celular",
      h1: "Título principal (H1)",
      link_whatsapp: "Botão de WhatsApp",
      link_instagram: "Link para o Instagram",
      pixel_ou_analytics: "Google Analytics / Pixel instalado",
      imagens_com_alt: "Imagens com descrição (alt)",
      carregamento_rapido: "Carregamento rápido",
    } as Record<string, string>
  )[k] ?? k;
}

// Busca de páginas na internet a pedido do cliente (análise do site), protegida contra SSRF:
// só endereços públicos, só portas web padrão, redirecionamentos conferidos um a um e tamanho limitado.
import { HttpError } from "./util.ts";

const NOME_INTERNO = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|.*\.corp|metadata(\..*)?)$/i;

/** IPv4/IPv6 de rede privada, local, reservada ou de metadados de nuvem. */
export function ipPrivado(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const m4 = v.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v.includes(":")) return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("::ffff:");
  return false;
}

/** Garante que a URL aponta para um site público na internet. */
export async function assertPublicUrl(u: URL) {
  const recusa = () => new HttpError(400, "Informe o domínio público do site (ex: minhaloja.com.br).");
  if (u.protocol !== "https:" && u.protocol !== "http:") throw recusa();
  if (u.username || u.password) throw recusa();
  if (u.port && u.port !== "80" && u.port !== "443") throw recusa();
  const host = u.hostname.replace(/\.$/, "");
  if (!host.includes(".") || NOME_INTERNO.test(host) || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) throw recusa();
  // Confere para onde o nome aponta (quando o ambiente permite consultar o DNS)
  const resolve = (Deno as unknown as { resolveDns?: (h: string, t: string) => Promise<string[]> }).resolveDns;
  if (typeof resolve === "function") {
    const ips = [...(await resolve(host, "A").catch(() => [])), ...(await resolve(host, "AAAA").catch(() => []))];
    if (ips.some(ipPrivado)) throw recusa();
  }
}

/** Baixa a página seguindo no máximo 5 redirecionamentos (cada um conferido) e lendo no máximo `limite` bytes. */
export async function fetchPublico(url: string, limite = 600_000): Promise<{ url: string; html: string }> {
  let atual = new URL(url);
  for (let salto = 0; salto <= 5; salto++) {
    await assertPublicUrl(atual);
    const res = await fetch(atual, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CoralineBot/1.0)", Accept: "text/html" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      atual = new URL(res.headers.get("location")!, atual);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`O site respondeu com erro ${res.status}`);
    }
    return { url: atual.toString(), html: await lerAte(res, limite) };
  }
  throw new Error("redirecionamentos demais");
}

async function lerAte(res: Response, limite: number) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < limite) {
    const { done, value } = await reader.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const tudo = new Uint8Array(Math.min(total, limite));
  let pos = 0;
  for (const p of partes) {
    const pedaco = p.subarray(0, Math.min(p.length, tudo.length - pos));
    tudo.set(pedaco, pos);
    pos += pedaco.length;
    if (pos >= tudo.length) break;
  }
  return new TextDecoder().decode(tudo);
}

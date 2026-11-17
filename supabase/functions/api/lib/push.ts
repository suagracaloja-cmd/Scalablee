// Notificações no celular pelo padrão gratuito dos navegadores (Web Push).
// O conteúdo vai criptografado para o aparelho (RFC 8291, aes128gcm) e a Scalable se identifica com
// chaves VAPID (RFC 8292). Tudo com a criptografia nativa (WebCrypto): sem biblioteca nem serviço pago.
// Quem entrega são os serviços de push do Google (Android/Chrome), da Apple (iPhone) e da Mozilla.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const te = new TextEncoder();

export const b64u = {
  enc(b: Uint8Array) {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(s: string) {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const juntar = (...partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function hmac(chave: Uint8Array, dados: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dados));
}
/** HKDF-SHA256 de um bloco (até 32 bytes), como pede a RFC 8291. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, tamanho: number) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tamanho);
}

// ---------- chaves VAPID (geradas pelo próprio servidor no primeiro uso) ----------

export type ChavesVapid = { publica: string; privada: JsonWebKey };

export async function gerarChavesVapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publica = b64u.enc(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)));
  const privada = JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey));
  return { publica, privada };
}

export async function chavesVapid(admin: SupabaseClient): Promise<ChavesVapid> {
  const ler = async () => {
    const { data, error } = await admin.rpc("push_chaves_obter");
    if (error) throw new Error(`chaves de notificação: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { publica?: string; privada?: string } | null;
    return row?.publica && row.privada ? { publica: row.publica, privada: JSON.parse(row.privada) as JsonWebKey } : null;
  };
  const existentes = await ler();
  if (existentes) return existentes;
  const novas = await gerarChavesVapid();
  const { error } = await admin.rpc("push_chaves_criar", { p_publica: novas.publica, p_privada: novas.privada });
  if (error) throw new Error(`chaves de notificação: ${error.message}`);
  const salvas = await ler(); // se dois pedidos geraram ao mesmo tempo, vale a que foi gravada primeiro
  if (!salvas) throw new Error("Não foi possível criar as chaves de notificação.");
  return salvas;
}

/** Identificação da Scalable para o serviço de push (JWT ES256, vale 12 horas). */
export async function jwtVapid(endpoint: string, chaves: ChavesVapid, contato: string, agora = Date.now()) {
  const cab = b64u.enc(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64u.enc(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 3600, sub: contato })));
  const k = await crypto.subtle.importKey("jwk", chaves.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ass = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, te.encode(`${cab}.${corpo}`)));
  return `${cab}.${corpo}.${b64u.enc(ass)}`;
}

/** Criptografa a mensagem para um aparelho (só ele consegue abrir). */
export async function cifrarParaAparelho(texto: string, p256dh: string, auth: string, fixo?: { salt: Uint8Array; par: CryptoKeyPair }) {
  const uaPub = b64u.dec(p256dh);
  const segredo = b64u.dec(auth);
  // `fixo` só existe para conferir com o exemplo oficial da RFC 8291 nos testes
  const par = fixo?.par ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, par.privateKey, 256));
  const ikm = await hkdf(segredo, compartilhado, juntar(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = fixo?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, juntar(te.encode(texto), new Uint8Array([2]))));
  const tamanhoRegistro = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return juntar(salt, tamanhoRegistro, new Uint8Array([asPub.length]), asPub, cifrado);
}

// ---------- envio ----------

export type Aviso = { titulo: string; texto: string; url: string; tag?: string };
type Inscricao = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; whatsapp: boolean; aprovacoes: boolean; falhas: number };
type Opcoes = { exceto?: string | null; fetchFn?: typeof fetch; contato?: string };

const contatoPadrao = () => {
  const env = typeof Deno !== "undefined" ? Deno.env.get("APP_URL") : undefined;
  return (env?.trim() || "https://scalablee.vercel.app").replace(/\/$/, "");
};

export async function enviarParaAparelho(insc: Pick<Inscricao, "endpoint" | "p256dh" | "auth">, aviso: Aviso, chaves: ChavesVapid, opts: Opcoes = {}) {
  const corpo = await cifrarParaAparelho(JSON.stringify(aviso), insc.p256dh, insc.auth);
  const jwt = await jwtVapid(insc.endpoint, chaves, opts.contato ?? contatoPadrao());
  const r = await (opts.fetchFn ?? fetch)(insc.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${chaves.publica}`,
    },
    body: corpo,
    signal: AbortSignal.timeout(10_000),
  });
  return r.status;
}

/**
 * Manda o aviso para o celular do dono e da recepção (quem atende o WhatsApp e aprova).
 * `escolher` decide, aparelho por aparelho, o que enviar (conforme o que a pessoa ativou), ou nada.
 */
export async function notificarEquipe(admin: SupabaseClient, companyId: string, escolher: (i: Inscricao) => Aviso | null, opts: Opcoes = {}) {
  const res = { enviados: 0, falhas: 0, removidos: 0 };
  const [{ data: co }, { data: rec }] = await Promise.all([
    admin.from("companies").select("owner_id").eq("id", companyId).maybeSingle(),
    admin.from("membros").select("user_id").eq("company_id", companyId).eq("papel", "recepcao"),
  ]);
  const pessoas = new Set<string>([co?.owner_id, ...((rec ?? []) as { user_id: string }[]).map((m) => m.user_id)].filter(Boolean) as string[]);
  if (opts.exceto) pessoas.delete(opts.exceto);
  if (!pessoas.size) return res;
  const { data } = await admin
    .from("push_inscricoes")
    .select("id,user_id,endpoint,p256dh,auth,whatsapp,aprovacoes,falhas")
    .eq("company_id", companyId)
    .in("user_id", [...pessoas]);
  const envios = ((data ?? []) as Inscricao[]).map((i) => ({ i, aviso: escolher(i) })).filter((x) => x.aviso);
  if (!envios.length) return res;
  const chaves = await chavesVapid(admin);
  await Promise.all(
    envios.map(async ({ i, aviso }) => {
      let status = 0;
      try {
        status = await enviarParaAparelho(i, aviso!, chaves, opts);
      } catch {
        status = 0;
      }
      if (status >= 200 && status < 300) {
        res.enviados++;
        await admin.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString(), falhas: 0 }).eq("id", i.id);
      } else if (status === 404 || status === 410) {
        // O aparelho cancelou (desinstalou, limpou os dados ou tirou a permissão)
        res.removidos++;
        await admin.from("push_inscricoes").delete().eq("id", i.id);
      } else {
        res.falhas++;
        if (i.falhas + 1 >= 20) await admin.from("push_inscricoes").delete().eq("id", i.id);
        else await admin.from("push_inscricoes").update({ falhas: i.falhas + 1 }).eq("id", i.id);
        console.log(`[push] serviço de push respondeu ${status || "sem resposta"}`);
      }
    }),
  );
  console.log(`[push] ${res.enviados} enviado(s), ${res.falhas} falha(s), ${res.removidos} aparelho(s) removido(s)`);
  return res;
}

/** Mensagem nova no WhatsApp. Um aviso por aparelho: se a Coraline preparou a resposta e a pessoa recebe
 * avisos de aprovação, o aviso é de aprovação; senão, de mensagem nova. Sem o conteúdo da conversa. */
export function avisarWhatsApp(admin: SupabaseClient, companyId: string, a: { nome: string; conversaId: string; aprovacao: string | null }, opts: Opcoes = {}) {
  const tag = `wa-${a.conversaId}`;
  const mensagem: Aviso = { titulo: "Nova mensagem no WhatsApp", texto: `${a.nome} enviou uma mensagem.`, url: "/whatsapp", tag };
  const aprovacao: Aviso | null = a.aprovacao ? { titulo: "Aprovação pendente", texto: `${a.aprovacao}: a Coraline AI preparou a resposta.`, url: "/aprovacoes", tag } : null;
  return notificarEquipe(admin, companyId, (i) => (aprovacao && i.aprovacoes ? aprovacao : i.whatsapp ? mensagem : null), opts);
}

/** Aprovações criadas a partir de `desde` (conversa com a Coraline ou análise). Quem pediu não recebe. */
export async function avisarAprovacoesNovas(admin: SupabaseClient, companyId: string, filtro: { desde: string; threadId?: string | null; semConversa?: boolean }, opts: Opcoes = {}) {
  let q = admin.from("approvals").select("title").eq("company_id", companyId).eq("status", "pending").gte("created_at", filtro.desde).order("created_at");
  if (filtro.threadId) q = q.eq("thread_id", filtro.threadId);
  if (filtro.semConversa) q = q.is("thread_id", null).neq("kind", "whatsapp_reply");
  const { data } = await q;
  const lista = (data ?? []) as { title: string }[];
  if (!lista.length) return { enviados: 0, falhas: 0, removidos: 0 };
  const aviso: Aviso =
    lista.length === 1
      ? { titulo: "Aprovação pendente", texto: lista[0].title, url: "/aprovacoes", tag: "aprovacoes" }
      : { titulo: `${lista.length} aprovações pendentes`, texto: `${lista[0].title} e mais ${lista.length - 1}.`, url: "/aprovacoes", tag: "aprovacoes" };
  return notificarEquipe(admin, companyId, (i) => (i.aprovacoes ? aviso : null), opts);
}

/** Roda depois de responder (sem atrasar quem pediu). Erros só vão para o log. */
export function emSegundoPlano(p: Promise<unknown>) {
  const tarefa = p.catch((e) => console.error("[push]", e instanceof Error ? e.message : e));
  const er = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(tarefa);
}

/** Erro com status HTTP (as rotas convertem em resposta JSON). */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Utilitários puros (sem dependências externas) — usados pelas ferramentas e pelos testes.
export const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const sum = (a: { amount: number | string }[]) => a.reduce((x, y) => x + Number(y.amount), 0);
export const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
export const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

export type Range = { de: string; ate: string; rotulo: string };

/** Converte um período nomeado (ou datas) em intervalo [de, ate] e o intervalo anterior equivalente. */
export function resolvePeriod(periodo?: string, de?: string, ate?: string, today = new Date()): { atual: Range; anterior: Range } {
  const t = isoDate(today);
  const day = (n: number) => isoDate(addDays(new Date(t + "T12:00:00Z"), n));
  const ym = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7)) - 1;
  let atual: Range;
  if (de && ate) atual = { de, ate, rotulo: `${fmtDate(de)} a ${fmtDate(ate)}` };
  else {
    switch (periodo) {
      case "hoje":
        atual = { de: t, ate: t, rotulo: "hoje" };
        break;
      case "ontem":
        atual = { de: day(-1), ate: day(-1), rotulo: "ontem" };
        break;
      case "7d":
        atual = { de: day(-6), ate: t, rotulo: "últimos 7 dias" };
        break;
      case "30d":
        atual = { de: day(-29), ate: t, rotulo: "últimos 30 dias" };
        break;
      case "90d":
        atual = { de: day(-89), ate: t, rotulo: "últimos 90 dias" };
        break;
      case "mes_anterior": {
        const a = ym(y, m - 1);
        const b = new Date(Date.UTC(y, m, 0));
        atual = { de: isoDate(a), ate: isoDate(b), rotulo: "mês anterior" };
        break;
      }
      case "ano":
        atual = { de: `${y}-01-01`, ate: t, rotulo: "este ano" };
        break;
      default:
        atual = { de: isoDate(ym(y, m)), ate: t, rotulo: "este mês" };
    }
  }
  // Período anterior com o mesmo tamanho (para "este mês": mesmo intervalo de dias do mês anterior)
  const len = Math.round((Date.parse(atual.ate) - Date.parse(atual.de)) / 86400000) + 1;
  let anterior: Range;
  if (!de && (periodo === undefined || periodo === "mes")) {
    const a = ym(y, m - 1);
    const b = addDays(a, len - 1);
    anterior = { de: isoDate(a), ate: isoDate(b), rotulo: "mesmo período do mês anterior" };
  } else {
    const b = addDays(new Date(atual.de + "T12:00:00Z"), -1);
    anterior = { de: isoDate(addDays(b, -(len - 1))), ate: isoDate(b), rotulo: "período anterior" };
  }
  return { atual, anterior };
}

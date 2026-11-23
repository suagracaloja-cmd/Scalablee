/** Data no formato do Brasil, em fuso local. */
export function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Identificador curto e estável de um diagnóstico, para a anotação de margem da chapa. Não é secreto. */
export function shortId(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 4)
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

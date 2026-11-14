// Telefone do paciente: guardado só com números e com o 55 do Brasil (formato do WhatsApp).
// Aceita "11 91234-5678", "(11) 3456-7890", "+55 11 91234-5678", "011 91234-5678" e números de fora com "+".

export type Telefone = { valor: string | null } | { erro: string }
export const ERRO_TELEFONE = 'Telefone inválido: use DDD + número (ex.: 11 91234-5678).'

export function lerTelefone(texto: string): Telefone {
  const t = (texto ?? '').trim()
  let d = t.replace(/\D/g, '')
  if (!d) return { valor: null }
  // Número de outro país, com "+" na frente
  if (t.startsWith('+') && !d.startsWith('55')) return d.length >= 8 && d.length <= 15 ? { valor: d } : { erro: ERRO_TELEFONE }
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1) // 0 + DDD
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return { erro: ERRO_TELEFONE }
  if (!/^[1-9]{2}$/.test(d.slice(0, 2))) return { erro: ERRO_TELEFONE } // DDD de 11 a 99
  if (d.length === 11 && d[2] !== '9') return { erro: ERRO_TELEFONE } // celular começa com 9
  if (d.length === 10 && !/[2-5]/.test(d[2])) return { erro: ERRO_TELEFONE } // fixo começa com 2 a 5
  return { valor: '55' + d }
}

/** Mensagem de erro do campo (vazio = ok), para mostrar enquanto a pessoa digita. */
export const erroTelefone = (texto: string) => {
  const r = lerTelefone(texto)
  return 'erro' in r ? r.erro : ''
}

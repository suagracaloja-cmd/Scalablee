/** Regra de senha para contas novas e troca de senha (o login aceita senhas antigas). */
export const SENHA_MIN = 8

/** Devolve o motivo se a senha for fraca; null se estiver boa. */
export function senhaFraca(s: string): string | null {
  if (s.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.'
  return null
}

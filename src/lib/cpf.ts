// CPF do paciente: só números no banco; formatado na tela; validado pelos dígitos verificadores.

export const soDigitos = (s: string) => s.replace(/\D/g, '')

/** true se vazio (CPF é opcional) ou se os 11 dígitos e os verificadores estão certos. */
export function cpfValido(valor: string): boolean {
  const c = soDigitos(valor)
  if (!c) return true
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const d = (s * 10) % 11
    return d === 10 ? 0 : d
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/** 52998224725 → 529.982.247-25 (vai formatando enquanto a pessoa digita). */
export function formatarCpf(valor: string): string {
  const c = soDigitos(valor).slice(0, 11)
  if (c.length <= 3) return c
  if (c.length <= 6) return `${c.slice(0, 3)}.${c.slice(3)}`
  if (c.length <= 9) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
}

/** Mostra só o meio nas listas: ***.982.247-** */
export function mascararCpf(valor: string | null | undefined): string {
  const c = soDigitos(valor ?? '')
  return c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : ''
}

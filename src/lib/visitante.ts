// Lembra, só neste navegador, que alguém já entrou (ou criou conta) na Scalable.
// Serve apenas para a tela de entrada dizer "Bem-vindo de volta" a quem já tem conta e "Bem-vindo" a quem chega pela primeira vez.
// Guarda só o valor "1": nenhum nome, e-mail ou outro dado. Está descrito na Política de Cookies.
const CHAVE = 'scalable:ja-entrou'

export function jaEntrouAntes(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
}

export function marcarQueEntrou() {
  try {
    localStorage.setItem(CHAVE, '1')
  } catch {
    /* navegador sem armazenamento: a tela só mostra "Bem-vindo" */
  }
}

/** Ao excluir a conta: a pessoa deixa de ter conta, então volta a ver "Bem-vindo". */
export function esquecerQueEntrou() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada a apagar */
  }
}

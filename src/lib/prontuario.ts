// Prontuário digital: tipos e textos. Os dados vêm de funções do banco (nunca direto das tabelas).

export type GestanteLactante = 'nao' | 'gestante' | 'lactante' | 'nao_se_aplica'
export const GESTANTE_LABEL: Record<GestanteLactante, string> = {
  nao: 'Não',
  gestante: 'Gestante',
  lactante: 'Lactante',
  nao_se_aplica: 'Não se aplica',
}

export type Anamnese = {
  id: string
  queixa_principal: string | null
  historico_medico: string | null
  medicamentos: string | null
  alergias: string | null
  cirurgias_previas: string | null
  habitos: string | null
  gestante_lactante: GestanteLactante | null
  outras_informacoes: string | null
  criado_por_nome: string
  criado_em: string
}

export type TipoEvolucao = 'consulta' | 'retorno' | 'procedimento' | 'exame' | 'cirurgia' | 'outro'
export const TIPOS_EVOLUCAO: { id: TipoEvolucao; label: string }[] = [
  { id: 'consulta', label: 'Consulta' },
  { id: 'retorno', label: 'Retorno' },
  { id: 'procedimento', label: 'Procedimento' },
  { id: 'exame', label: 'Exame' },
  { id: 'cirurgia', label: 'Cirurgia' },
  { id: 'outro', label: 'Outro' },
]
export const TIPO_EVOLUCAO_LABEL = Object.fromEntries(TIPOS_EVOLUCAO.map((t) => [t.id, t.label])) as Record<TipoEvolucao, string>

export type Evolucao = {
  id: string
  data_atendimento: string
  tipo: TipoEvolucao
  titulo: string | null
  descricao: string
  conduta: string | null
  profissional_id: string | null
  agendamento_id: string | null
  retifica_id: string | null
  criado_por_nome: string
  criado_em: string
}

export type ConsultaHistorico = {
  id: string
  inicio: string
  status: 'agendado' | 'confirmado' | 'realizado' | 'faltou' | 'cancelado'
  tipo: 'consulta' | 'retorno' | 'procedimento' | 'avaliacao'
  servico: string | null
  profissional: string | null
}

export type ProntuarioDados = {
  anamnese_versoes: Anamnese[]
  evolucoes: Evolucao[]
  consultas: ConsultaHistorico[]
}

export type AcessoProntuario = {
  id: number
  criado_em: string
  user_nome: string
  papel: string
  acao: 'abriu' | 'salvou_anamnese' | 'registrou_evolucao' | 'exportou'
  customer_id: string | null
  paciente: string | null
}
export const ACAO_ACESSO: Record<AcessoProntuario['acao'], string> = {
  abriu: 'Abriu o prontuário',
  salvou_anamnese: 'Salvou a anamnese',
  registrou_evolucao: 'Registrou uma evolução',
  exportou: 'Exportou todos os prontuários',
}

/** Idade em anos a partir da data de nascimento (AAAA-MM-DD). */
export function idadeEm(nascimento: string | null | undefined, hoje = new Date()): number | null {
  if (!nascimento) return null
  const [a, m, d] = nascimento.split('-').map(Number)
  if (!a || !m || !d) return null
  let n = hoje.getFullYear() - a
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) n--
  return n >= 0 && n < 150 ? n : null
}

/** Texto dos erros das funções do prontuário, sem termos técnicos. */
export function erroProntuario(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('permissão') || m.includes('permission')) return 'Você não tem permissão para acessar o prontuário. Só o dono da conta e os profissionais têm acesso.'
  if (m.includes('anamneses_tamanhos') || m.includes('evolucoes_tamanhos')) return 'Algum campo ficou grande demais. Resuma o texto e tente de novo.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão no momento. Verifique a internet e tente de novo.'
  return msg
}

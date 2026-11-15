// Estoque da clínica: tipos, situação de cada item (acabando, vencendo, vencido) e leitura de números.
import { addDays } from './format'

export type ItemEstoque = {
  id: string
  company_id: string
  nome: string
  categoria: string | null
  unidade: string
  quantidade: number
  minimo: number
  validade: string | null
  custo_unitario: number | null
  fornecedor: string | null
  observacoes: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export type TipoMov = 'entrada' | 'saida' | 'ajuste'
export type MovEstoque = {
  id: string
  item_id: string
  tipo: TipoMov
  quantidade: number
  saldo: number
  motivo: string | null
  validade: string | null
  criado_por: string | null
  criado_em: string
}

export const CATEGORIAS = ['Descartáveis', 'Medicamentos', 'Materiais clínicos', 'Higiene e limpeza', 'Escritório', 'Outros']
export const UNIDADES = ['un', 'caixa', 'pacote', 'par', 'frasco', 'ampola', 'tubo', 'rolo', 'ml', 'litro', 'g', 'kg']
export const TIPO_MOV: Record<TipoMov, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Conferência' }
/** Quantos dias antes da validade o item aparece como "vencendo". */
export const DIAS_AVISO_VALIDADE = 30

export const normalizarItem = (x: ItemEstoque): ItemEstoque => ({
  ...x,
  quantidade: Number(x.quantidade),
  minimo: Number(x.minimo),
  custo_unitario: x.custo_unitario === null ? null : Number(x.custo_unitario),
})

export type Nivel = 'acabou' | 'baixo' | 'ok'
export type Validade = 'vencido' | 'vencendo' | null

/** Situação do item hoje. Validade só importa se ainda tem o item guardado. */
export function situacao(i: Pick<ItemEstoque, 'quantidade' | 'minimo' | 'validade'>, hoje: string): { nivel: Nivel; validade: Validade } {
  const nivel: Nivel = i.quantidade <= 0 ? 'acabou' : i.minimo > 0 && i.quantidade <= i.minimo ? 'baixo' : 'ok'
  let validade: Validade = null
  if (i.validade && i.quantidade > 0) validade = i.validade < hoje ? 'vencido' : i.validade <= addDays(hoje, DIAS_AVISO_VALIDADE) ? 'vencendo' : null
  return { nivel, validade }
}

/** 10 → "10"; 2.5 → "2,5"; 1000 → "1.000" */
export const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** Lê "10", "2,5", "1.000" ou "1.000,5". Devolve NaN se não for número. */
export function lerNumero(v: string) {
  const t = v.trim().replace(/\s/g, '')
  if (!t) return NaN
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  return Number(t)
}

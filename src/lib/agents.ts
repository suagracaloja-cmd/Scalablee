import type { AgentKind } from './types'

export const AGENT_META: Record<AgentKind | 'assistant', { label: string; color: string; ring: string; emoji: string; desc: string }> = {
  marketing: { label: 'Marketing', color: 'text-pink-300 bg-pink-500/15', ring: 'from-pink-500 to-orange-400', emoji: '📣', desc: 'Busca o que está bombando na internet, analisa seu Instagram e site e traz ideias de posts e campanhas.' },
  sales: { label: 'Vendas', color: 'text-emerald-300 bg-emerald-500/15', ring: 'from-emerald-500 to-lime-400', emoji: '💼', desc: 'Acompanha suas vendas, aponta clientes que precisam de atenção e sugere mensagens de reativação.' },
  finance: { label: 'Financeiro', color: 'text-amber-300 bg-amber-500/15', ring: 'from-amber-500 to-yellow-300', emoji: '💰', desc: 'Cuida das contas a pagar e a receber, alerta vencimentos e riscos de caixa.' },
  crm: { label: 'CRM', color: 'text-sky-300 bg-sky-500/15', ring: 'from-sky-500 to-cyan-300', emoji: '🤝', desc: 'Cuida do relacionamento: follow-ups, leads esfriando, clientes VIP e tarefas para amanhã.' },
  support: { label: 'Atendimento', color: 'text-violet-300 bg-violet-500/15', ring: 'from-violet-500 to-fuchsia-400', emoji: '💬', desc: 'Responde seus clientes no WhatsApp sozinho e pede sua aprovação quando necessário.' },
  assistant: { label: 'Assistente', color: 'text-cyan-300 bg-cyan-500/15', ring: 'from-cyan-500 to-blue-500', emoji: '✨', desc: 'Sua IA pessoal.' },
}

export const AVATAR_STYLES = ['adventurer', 'avataaars', 'bottts', 'lorelei', 'notionists', 'personas', 'fun-emoji', 'micah']
export const presetAvatar = (style: string, seed: string) =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`

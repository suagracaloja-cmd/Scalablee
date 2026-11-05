import { HeartHandshake, Megaphone, MessageCircle, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import type { AgentKind } from './types'

type Meta = { label: string; role: string; icon: LucideIcon; soft: string; fg: string; solid: string; desc: string; suggestions: string[] }

export const AGENT_META: Record<AgentKind, Meta> = {
  marketing: {
    label: 'Marketing',
    role: 'Agente de Marketing',
    icon: Megaphone,
    soft: 'bg-pink-50',
    fg: 'text-pink-600',
    solid: '#ec4899',
    desc: 'Pesquisa o que está bombando na internet, analisa seu Instagram e site e traz ideias de posts e campanhas.',
    suggestions: ['Me dá ideias de post para essa semana', 'Qual produto devo divulgar?', 'Ideia de campanha para clientes que sumiram', 'Como aumentar minhas vendas pelo Instagram?'],
  },
  sales: {
    label: 'Vendas',
    role: 'Agente de Vendas',
    icon: TrendingUp,
    soft: 'bg-emerald-50',
    fg: 'text-emerald-600',
    solid: '#10b981',
    desc: 'Acompanha suas vendas, aponta clientes que precisam de atenção e sugere mensagens de reativação.',
    suggestions: ['Quanto vendi essa semana?', 'Quais clientes sumiram?', 'Qual meu produto mais vendido?', 'Qual a previsão de vendas do mês?'],
  },
  finance: {
    label: 'Financeiro',
    role: 'Agente Financeiro',
    icon: Wallet,
    soft: 'bg-amber-50',
    fg: 'text-amber-600',
    solid: '#f59e0b',
    desc: 'Cuida das contas a pagar e a receber, alerta vencimentos e riscos de caixa.',
    suggestions: ['Quais contas vencem essa semana?', 'Quanto tenho a receber?', 'Como está meu caixa?', 'Quais foram minhas despesas do mês?'],
  },
  crm: {
    label: 'CRM',
    role: 'Agente de CRM',
    icon: HeartHandshake,
    soft: 'bg-sky-50',
    fg: 'text-sky-600',
    solid: '#0ea5e9',
    desc: 'Cuida do relacionamento: follow-ups, leads esfriando, clientes VIP e tarefas para amanhã.',
    suggestions: ['Quais leads estão esfriando?', 'Quem são meus melhores clientes?', 'Quais tarefas tenho amanhã?', 'Quais clientes precisam de atenção?'],
  },
  support: {
    label: 'Atendimento',
    role: 'Agente de Atendimento',
    icon: MessageCircle,
    soft: 'bg-violet-50',
    fg: 'text-violet-600',
    solid: '#8b5cf6',
    desc: 'Responde seus clientes no WhatsApp sozinho e pede sua aprovação quando necessário.',
    suggestions: ['Tem conversa esperando no WhatsApp?', 'Tem aprovação pendente?', 'Me ajuda a responder um cliente pedindo desconto', 'Como está o atendimento hoje?'],
  },
}

export const GENERAL_SUGGESTIONS = ['Como estão minhas vendas?', 'O que tenho para pagar essa semana?', 'Quem são meus melhores clientes?', 'Qual a previsão do mês?', 'Me dá um resumo de hoje']

export const AVATAR_STYLES = ['notionists', 'lorelei', 'adventurer', 'avataaars', 'personas', 'micah', 'bottts', 'fun-emoji']
export const presetAvatar = (style: string, seed: string) =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e8f2ff,fce7f3,d1fae5,fef3c7,e0f2fe`

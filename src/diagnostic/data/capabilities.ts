import type { QuestionId } from '../engine/types'

/**
 * Registro do que a plataforma realmente faz hoje.
 *
 * Regra do projeto: o relatório só cita recursos que estão aqui, e cada recurso aponta
 * para os arquivos que o provam (`evidence`). O teste `capabilities.test.ts` falha se um
 * arquivo de evidência deixar de existir, para que o diagnóstico nunca prometa algo
 * que saiu do produto. Para adicionar um recurso novo, implemente-o primeiro.
 */

export interface Capability {
  id: string
  label: string
  /** Descrição exata, no tom do relatório. */
  description: string
  /** Arquivos do repositório que implementam o recurso. */
  evidence: string[]
  /** Pré-requisito real de configuração, quando existir. */
  setup?: string
  /** Parte do recurso que só funciona com a IA da plataforma ativada. */
  ai?: string
}

export const CAPABILITIES: Record<string, Capability> = {
  contas: {
    id: 'contas',
    label: 'Contas a pagar e a receber',
    description:
      'Lançamentos com vencimento e categoria (fornecedores, aluguel, salários, impostos, marketing e outras), baixa de pagamento e totais em aberto, vencido e saldo pago no mês.',
    evidence: ['src/pages/Finance.tsx'],
  },
  'alertas-financeiros': {
    id: 'alertas-financeiros',
    label: 'Alertas do agente financeiro',
    description:
      'Avisa de contas vencidas, de contas que vencem nos próximos 7 dias e de saldo negativo no mês, e cria tarefas de cobrança para valores a receber em atraso.',
    evidence: ['supabase/functions/api/agents.ts'],
  },
  vendas: {
    id: 'vendas',
    label: 'Registro de vendas',
    description:
      'Cada venda com descrição, valor, cliente e situação (paga, pendente ou cancelada), com busca por período. Atendimentos e procedimentos cobrados podem ser lançados aqui.',
    evidence: ['src/pages/Sales.tsx'],
  },
  clientes: {
    id: 'clientes',
    label: 'Cadastro de clientes e leads',
    description:
      'Pessoas cadastradas com situação (lead, ativo, inativo ou VIP) e data do último contato. A plataforma usa o termo "cliente" para o paciente.',
    evidence: ['src/pages/Customers.tsx'],
  },
  reativacao: {
    id: 'reativacao',
    label: 'Clientes sem retorno',
    description:
      'O agente de vendas lista quem está há mais de 30 dias sem comprar e cria tarefas de reativação. Com o WhatsApp conectado, sugere uma mensagem, que só é enviada com a sua aprovação.',
    evidence: ['supabase/functions/api/agents.ts', 'supabase/functions/api/lib/snapshot.ts'],
  },
  'followup-leads': {
    id: 'followup-leads',
    label: 'Follow-up de leads',
    description:
      'O agente de CRM cria tarefa de acompanhamento para leads sem contato há 3 dias ou mais e tarefa de agradecimento para os clientes que mais compraram.',
    evidence: ['supabase/functions/api/agents.ts'],
  },
  tarefas: {
    id: 'tarefas',
    label: 'Tarefas com prazo',
    description:
      'Lista de tarefas agrupadas em atrasadas, hoje, amanhã e próximos dias, que você cria à mão e que os agentes também sugerem, com vínculo opcional a um cliente.',
    evidence: ['src/pages/Tasks.tsx'],
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'Atendimento no WhatsApp Business',
    description:
      'O agente de atendimento responde no WhatsApp pela API oficial da Meta. Quem escreve pela primeira vez é cadastrado como lead e as conversas ficam em uma caixa de entrada com contagem de não lidas.',
    evidence: ['src/pages/WhatsApp.tsx', 'supabase/functions/api/wa-webhook.ts'],
    setup: 'Exige conectar uma conta do WhatsApp Business (API oficial da Meta) na própria plataforma.',
    ai: 'As respostas elaboradas, com base na descrição da clínica, dependem de a IA da plataforma estar ativada; sem ela, o agente envia uma mensagem padrão de recebimento.',
  },
  aprovacoes: {
    id: 'aprovacoes',
    label: 'Fila de aprovações',
    description:
      'Você pode fazer o agente de atendimento pedir a sua aprovação antes de enviar qualquer resposta (opção por agente). Com a IA da plataforma ativada, ele também pede aprovação por conta própria quando a conversa envolve desconto, reembolso, reclamação ou uma informação que a clínica não cadastrou.',
    evidence: ['src/pages/Approvals.tsx', 'supabase/functions/api/wa-webhook.ts'],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Painel de indicadores',
    description:
      'Vendas do mês frente ao mesmo período do mês anterior, ticket médio, número de clientes, contas a pagar, contas vencidas, vendas por dia e itens mais vendidos.',
    evidence: ['src/pages/Dashboard.tsx'],
  },
  'analise-agentes': {
    id: 'analise-agentes',
    label: 'Análise dos agentes',
    description:
      'O botão "Rodar análise" faz os cinco agentes lerem os dados cadastrados e gerarem notificações e tarefas, como cobranças, follow-ups e reativações.',
    evidence: ['src/pages/Dashboard.tsx', 'supabase/functions/api/agents.ts'],
  },
  assistente: {
    id: 'assistente',
    label: 'Assistente para perguntas sobre os dados',
    description:
      'Você pergunta, por exemplo, "como estão minhas vendas?" e a resposta usa os dados cadastrados. Sem a IA ativada na plataforma, a resposta é um resumo numérico.',
    evidence: ['src/pages/Assistant.tsx', 'supabase/functions/api/assistant.ts'],
  },
  notificacoes: {
    id: 'notificacoes',
    label: 'Notificações dos agentes',
    description: 'Alertas e análises dos agentes reunidos em um só lugar, com prioridade e marcação de lido.',
    evidence: ['src/pages/Notifications.tsx'],
  },
}

/** O que a plataforma ainda não cobre. Mostrado de forma direta no relatório quando relevante. */
export const LIMITS: Record<string, string> = {
  'sem-agenda':
    'A SCALABLE ainda não tem agenda de consultas, confirmação automática nem controle de faltas. Para esses pontos, o plano é de processo; se você já usa uma ferramenta de agenda, ela continua fazendo esse papel.',
  'sem-metas':
    'Ainda não há cadastro de metas na plataforma. Defina-as à parte e use o painel para acompanhar os números.',
  'sem-equipe':
    'A conta é do proprietário: por enquanto não há usuários separados para a equipe nem atribuição de tarefas por pessoa.',
  'sem-projecao':
    'Não há projeção de caixa nem orçamento para meses futuros: a plataforma mostra o que foi lançado, inclusive com vencimentos futuros.',
  'sem-reclamacoes': 'Não há registro estruturado de reclamações nem pesquisa de satisfação dos pacientes.',
  'sem-procedimentos': 'A plataforma não guarda roteiros, manuais ou procedimentos da equipe.',
  'sem-reunioes': 'As reuniões de gestão acontecem fora da plataforma.',
}

export interface Fit {
  /** Como a plataforma se conecta ao achado; `null` quando só há limite a declarar. */
  text: string | null
  capabilities: string[]
  limits: string[]
}

/**
 * Conexão pergunta a pergunta entre o problema encontrado e o que existe de fato.
 * Onde não há recurso, só o limite é declarado.
 */
export const FITS: Record<QuestionId, Fit> = {
  fin1: {
    text: 'As receitas podem ser lançadas como vendas (cada atendimento ou procedimento cobrado, com valor e situação) ou como contas a receber com vencimento.',
    capabilities: ['vendas', 'contas'],
    limits: [],
  },
  fin2: {
    text: 'As despesas entram como contas a pagar, com categoria e vencimento, e o Financeiro mostra o que está em aberto e o que já venceu.',
    capabilities: ['contas'],
    limits: [],
  },
  fin3: {
    text: 'O Financeiro reúne tudo o que está a pagar e a receber, com o que venceu e o saldo pago no mês, e o agente financeiro destaca as contas que vencem nos próximos 7 dias.',
    capabilities: ['contas', 'alertas-financeiros'],
    limits: ['sem-projecao'],
  },
  fin4: {
    text: 'O Financeiro mostra o saldo pago no mês (entradas menos saídas já pagas), e o agente financeiro avisa quando o saldo do mês fica negativo.',
    capabilities: ['contas', 'alertas-financeiros'],
    limits: [],
  },
  fin5: { text: null, capabilities: [], limits: ['sem-projecao'] },

  ate1: {
    text: 'Quem escreve pelo WhatsApp é cadastrado como lead e recebe uma resposta imediata do agente de atendimento; com a IA da plataforma ativada, a resposta usa a descrição da clínica que você cadastrou (serviços, preços, horários).',
    capabilities: ['whatsapp', 'clientes'],
    limits: [],
  },
  ate2: {
    text: 'As conversas do WhatsApp ficam em uma caixa de entrada com contagem de não lidas, e o agente de atendimento avisa quando há conversas esperando resposta. Pendências podem virar tarefas com prazo.',
    capabilities: ['whatsapp', 'tarefas'],
    limits: [],
  },
  ate3: {
    text: 'A descrição da clínica (serviços, preços, horários) é cadastrada na plataforma e, com a IA ativada, o agente de atendimento a usa nas respostas do WhatsApp.',
    capabilities: ['whatsapp'],
    limits: ['sem-procedimentos'],
  },
  ate4: {
    text: 'Você pode exigir a sua aprovação antes de qualquer resposta no WhatsApp e, com a IA ativada, conversas que envolvem reclamação esperam a sua decisão.',
    capabilities: ['aprovacoes'],
    limits: ['sem-reclamacoes'],
  },
  ate5: {
    text: 'O agente de CRM cria tarefas de acompanhamento e de agradecimento aos clientes que mais compraram, e o agente de vendas lista quem está há mais de 30 dias sem retorno.',
    capabilities: ['followup-leads', 'reativacao'],
    limits: [],
  },

  com1: {
    text: 'Cada contato vira um cadastro em Clientes, com situação (lead, ativo, inativo ou VIP) e data do último contato; quem escreve pelo WhatsApp entra automaticamente.',
    capabilities: ['clientes', 'whatsapp'],
    limits: [],
  },
  com2: {
    text: 'O agente de CRM cria tarefa de follow-up para leads sem contato há 3 dias ou mais, e o agente de vendas sugere mensagens de reativação, que só saem com a sua aprovação.',
    capabilities: ['followup-leads', 'reativacao'],
    limits: [],
  },
  com3: {
    text: 'A plataforma registra leads e vendas, mas a taxa de contatos que viram agendamento precisa ser contada à parte, porque não há agenda.',
    capabilities: ['clientes', 'vendas'],
    limits: ['sem-agenda'],
  },
  com4: { text: null, capabilities: [], limits: ['sem-agenda'] },
  com5: {
    text: 'O agente de vendas lista quem está há mais de 30 dias sem comprar e cria tarefas de reativação.',
    capabilities: ['reativacao', 'followup-leads'],
    limits: [],
  },

  ope1: { text: null, capabilities: [], limits: ['sem-agenda'] },
  ope2: { text: null, capabilities: [], limits: ['sem-agenda'] },
  ope3: {
    text: 'Tarefas com prazo ficam visíveis em um só lugar, com vínculo opcional ao cliente.',
    capabilities: ['tarefas'],
    limits: ['sem-equipe'],
  },
  ope4: {
    text: 'As tarefas com prazo tornam cada pendência visível e atribuída a um dia.',
    capabilities: ['tarefas'],
    limits: ['sem-procedimentos'],
  },
  ope5: {
    text: 'O agente de atendimento recebe e responde as mensagens do WhatsApp quando você não está, e a fila de aprovações concentra o que exige a sua decisão.',
    capabilities: ['whatsapp', 'aprovacoes', 'tarefas'],
    limits: [],
  },

  ges1: { text: null, capabilities: [], limits: ['sem-metas'] },
  ges2: {
    text: 'O painel mostra as vendas do mês frente ao mesmo período do mês anterior, o ticket médio, os clientes e as contas a pagar, e as notificações reúnem os alertas dos agentes.',
    capabilities: ['dashboard', 'notificacoes'],
    limits: [],
  },
  ges3: {
    text: 'O painel e o botão "Rodar análise" entregam uma pauta pronta de números e pendências para uma reunião semanal.',
    capabilities: ['dashboard', 'analise-agentes'],
    limits: ['sem-reunioes'],
  },
  ges4: {
    text: 'Você pode perguntar ao assistente, por exemplo, como estão as vendas, e a resposta usa os dados que a clínica cadastrou.',
    capabilities: ['assistente', 'dashboard'],
    limits: [],
  },
  ges5: {
    text: 'Cada ponto de atenção pode virar uma tarefa com prazo, e os agentes criam tarefas a partir dos dados cadastrados (cobranças, follow-ups e reativações).',
    capabilities: ['tarefas', 'analise-agentes'],
    limits: [],
  },
}

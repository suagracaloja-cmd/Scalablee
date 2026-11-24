import type { QuestionId } from '../engine/types'

/**
 * Registro do que a plataforma realmente faz hoje, conferido no código que roda em produção.
 *
 * Regra do projeto: o relatório só cita recursos que estão aqui, e cada recurso aponta
 * para os arquivos que o provam (`evidence`). O teste `capabilities.test.ts` falha se um
 * arquivo de evidência deixar de existir, se a página não estiver roteada ou se uma
 * capacidade passar a descrever preço ou cobrança. Para adicionar um recurso novo, implemente-o primeiro.
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

const AI_CORALINE =
  'Depende de a IA da plataforma estar ativada; sem ela, a Coraline AI responde em modo básico, com resumos numéricos.'

export const CAPABILITIES: Record<string, Capability> = {
  agenda: {
    id: 'agenda',
    label: 'Agenda de consultas',
    description:
      'Consultas por dia e por profissional, com tipo (consulta, retorno, procedimento ou avaliação), situação (agendado, confirmado, realizado, faltou ou cancelado), horário e dias de atendimento da clínica. O mesmo profissional não fica com dois horários sobrepostos.',
    evidence: ['src/pages/Agenda.tsx', 'supabase/migrations/0011_clinica_equipe_agenda.sql'],
  },
  confirmacao: {
    id: 'confirmacao',
    label: 'Confirmação e faltas na consulta',
    description:
      'Em cada consulta, um botão abre o WhatsApp com a mensagem de confirmação pronta (o envio é feito por você), e a consulta pode ser marcada como confirmada, realizada, faltou ou cancelada.',
    evidence: ['src/pages/Agenda.tsx'],
  },
  'horarios-livres': {
    id: 'horarios-livres',
    label: 'Horários livres sob demanda',
    description:
      'A Coraline AI lista os horários livres a partir de uma data, considerando os dias e o horário de atendimento, a duração do serviço e as consultas já marcadas.',
    evidence: ['supabase/functions/api/lib/agenda.ts'],
    ai: AI_CORALINE,
  },
  pacientes: {
    id: 'pacientes',
    label: 'Pacientes e funil de atendimento',
    description:
      'Cadastro com situação (lead, ativo, inativo ou VIP) e etapa do funil (novo, contato, agendado, compareceu, orçamento, fechado ou perdido). Quem escreve pelo WhatsApp entra automaticamente.',
    evidence: ['src/pages/Customers.tsx', 'src/lib/types.ts'],
  },
  'funil-conversao': {
    id: 'funil-conversao',
    label: 'Taxa de conversão do funil',
    description:
      'A Coraline AI informa quantos pacientes estão em cada etapa do funil e a taxa de conversão entre elas, como de contato para agendado e de agendado para compareceu.',
    evidence: ['supabase/functions/api/lib/tools.ts'],
    ai: AI_CORALINE,
  },
  atendimentos: {
    id: 'atendimentos',
    label: 'Registro de atendimentos',
    description: 'Cada paciente atendido, com o que foi feito, o valor, a forma e a situação do pagamento.',
    evidence: ['src/pages/Atendimentos.tsx'],
  },
  financeiro: {
    id: 'financeiro',
    label: 'Financeiro',
    description:
      'Despesas e contas a pagar ou a receber, com vencimento e categoria (fornecedores, aluguel, salários, impostos, marketing e outras), baixa de pagamento e totais em aberto. Só o dono da conta acessa.',
    evidence: ['src/pages/Finance.tsx'],
  },
  analise: {
    id: 'analise',
    label: 'Análise da Coraline AI',
    description:
      'A plataforma lê os dados cadastrados e gera notificações e tarefas por regras, mesmo sem IA: contas vencidas e a vencer em 7 dias, saldo negativo no mês, cobranças em atraso, pacientes sem comprar há mais de 30 dias, leads sem contato há 3 dias ou mais e conversas esperando resposta.',
    evidence: ['src/pages/Dashboard.tsx', 'supabase/functions/api/lib/analise.ts'],
  },
  tarefas: {
    id: 'tarefas',
    label: 'Tarefas com prazo',
    description:
      'Tarefas para hoje, amanhã e os próximos dias, que você cria à mão e que a Coraline AI também antecipa, com vínculo opcional a um paciente.',
    evidence: ['src/pages/Tasks.tsx'],
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'Atendimento no WhatsApp Business',
    description:
      'A Coraline AI lê as mensagens recebidas e prepara as respostas. As conversas ficam em uma caixa de entrada com contagem de não lidas, e quem escreve pela primeira vez entra como paciente. Com a opção ligada, ela responde sozinha dúvidas simples; pedidos de desconto, reclamações e assuntos sensíveis sempre esperam a sua aprovação.',
    evidence: ['src/pages/WhatsApp.tsx', 'src/pages/Settings.tsx', 'supabase/functions/api/wa-webhook.ts'],
    setup: 'Exige conectar uma conta do WhatsApp Business (API oficial da Meta) na própria plataforma.',
    ai: 'As respostas elaboradas dependem de a IA da plataforma estar ativada; sem ela, o envio é uma mensagem padrão de recebimento.',
  },
  aprovacoes: {
    id: 'aprovacoes',
    label: 'Central de Aprovações',
    description:
      'A Coraline AI prepara envios, campanhas, lançamentos e exclusões, e nada acontece sem a sua decisão. Cada decisão fica registrada.',
    evidence: ['src/pages/Approvals.tsx'],
  },
  equipe: {
    id: 'equipe',
    label: 'Clínica e equipe',
    description:
      'Convites para a equipe com papel de recepção ou de profissional, cadastro de profissionais e serviços e horário de atendimento. Cada papel vê só o que lhe cabe: o financeiro, por exemplo, é só do dono.',
    evidence: ['src/pages/Clinica.tsx', 'supabase/migrations/0011_clinica_equipe_agenda.sql'],
  },
  prontuario: {
    id: 'prontuario',
    label: 'Prontuário',
    description:
      'Anamnese, evolução dos atendimentos e histórico de cada paciente, com acesso só para o dono e os profissionais e registro de quem abriu ou gravou.',
    evidence: ['src/pages/Prontuario.tsx', 'supabase/migrations/0013_prontuario.sql'],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Painel de início',
    description:
      'Faturamento do mês frente ao mês passado, entradas e saídas, atendimentos por procedimento, atendimentos recentes, consultas de hoje e dos próximos dias e os alertas que precisam de atenção.',
    evidence: ['src/pages/Dashboard.tsx'],
  },
  coraline: {
    id: 'coraline',
    label: 'Coraline AI',
    description:
      'Uma conversa que consulta os dados reais da clínica (indicadores, atendimentos, financeiro, funil, agenda e pacientes sem retorno) e prepara ações para a sua aprovação.',
    evidence: ['src/pages/Agent.tsx', 'supabase/functions/api/lib/tools.ts'],
    ai: AI_CORALINE,
  },
  notificacoes: {
    id: 'notificacoes',
    label: 'Notificações',
    description: 'Alertas e análises da Coraline AI reunidos em um só lugar, com prioridade.',
    evidence: ['src/pages/Notifications.tsx'],
  },
}

/** O que a plataforma ainda não cobre. Mostrado de forma direta no relatório quando relevante. */
export const LIMITS: Record<string, string> = {
  'sem-metas':
    'Ainda não há cadastro de metas na plataforma. Defina-as à parte e use o painel de início, que compara o mês com o mês passado, para acompanhar os números.',
  'sem-projecao':
    'Não há projeção de caixa nem orçamento para meses futuros: o Financeiro mostra o que foi lançado, inclusive com vencimentos futuros.',
  'sem-reclamacoes':
    'Não há registro estruturado de reclamações nem pesquisa de satisfação dos pacientes. No WhatsApp, reclamações sempre esperam a sua aprovação antes de qualquer resposta.',
  'sem-procedimentos': 'A plataforma não guarda roteiros, manuais ou procedimentos operacionais da equipe.',
  'sem-reunioes': 'As reuniões de gestão acontecem fora da plataforma.',
  'sem-taxa-faltas':
    'Cada falta e cada cancelamento ficam registrados na consulta, mas a plataforma não calcula a taxa de faltas nem analisa os motivos.',
  'sem-ociosidade':
    'Não há relatório de agenda ociosa nem medição de ocupação; os horários livres podem ser pedidos à Coraline AI.',
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
    text: 'Cada atendimento é registrado com o valor, a forma e a situação do pagamento, e o que ainda será recebido entra como conta a receber no Financeiro.',
    capabilities: ['atendimentos', 'financeiro'],
    limits: [],
  },
  fin2: {
    text: 'As despesas entram no Financeiro como contas a pagar, com categoria e vencimento, e a análise avisa das que venceram e das que vencem em até 7 dias.',
    capabilities: ['financeiro', 'analise'],
    limits: [],
  },
  fin3: {
    text: 'O Financeiro reúne o que está a pagar e a receber, o painel mostra as entradas e saídas do período e a análise destaca contas vencidas e as dos próximos 7 dias.',
    capabilities: ['financeiro', 'dashboard', 'analise'],
    limits: ['sem-projecao'],
  },
  fin4: {
    text: 'O painel mostra as entradas e as saídas, e a análise avisa quando o saldo do mês fica negativo.',
    capabilities: ['dashboard', 'analise'],
    limits: [],
  },
  fin5: { text: null, capabilities: [], limits: ['sem-projecao'] },

  ate1: {
    text: 'Quem escreve pelo WhatsApp entra como paciente e a Coraline AI prepara a resposta com base nas informações da clínica que você cadastrou; o que for sensível espera a sua aprovação.',
    capabilities: ['whatsapp', 'pacientes'],
    limits: [],
  },
  ate2: {
    text: 'As conversas do WhatsApp ficam em uma caixa de entrada com contagem de não lidas, a análise avisa das conversas esperando resposta e as pendências podem virar tarefas com prazo.',
    capabilities: ['whatsapp', 'analise', 'tarefas'],
    limits: [],
  },
  ate3: {
    text: 'A descrição da clínica (especialidades, convênios, endereço, horários) é cadastrada na plataforma e a Coraline AI a usa nas respostas do WhatsApp.',
    capabilities: ['whatsapp'],
    limits: ['sem-procedimentos'],
  },
  ate4: {
    text: 'Você pode exigir a sua aprovação antes de qualquer resposta no WhatsApp, e reclamações sempre esperam a sua decisão na Central de Aprovações.',
    capabilities: ['aprovacoes', 'whatsapp'],
    limits: ['sem-reclamacoes'],
  },
  ate5: {
    text: 'A análise cria tarefas de follow-up e de agradecimento aos pacientes que mais compraram, e a Coraline AI prepara mensagens de WhatsApp para a sua aprovação.',
    capabilities: ['analise', 'coraline'],
    limits: [],
  },

  com1: {
    text: 'Cada contato vira um cadastro em Pacientes, com situação, etapa do funil e data do último contato; quem escreve pelo WhatsApp entra automaticamente.',
    capabilities: ['pacientes', 'whatsapp'],
    limits: [],
  },
  com2: {
    text: 'A análise cria tarefa de follow-up para leads sem contato há 3 dias ou mais, e a Coraline AI lista os leads e prepara mensagens para a sua aprovação.',
    capabilities: ['analise', 'coraline'],
    limits: [],
  },
  com3: {
    text: 'O funil mostra em que etapa cada paciente está, e a Coraline AI informa a taxa de conversão entre as etapas, como de contato para agendado e de agendado para compareceu.',
    capabilities: ['pacientes', 'funil-conversao'],
    limits: [],
  },
  com4: {
    text: 'A Coraline AI lista os horários livres a partir de uma data, considerando o horário de atendimento, a duração do serviço e as consultas marcadas.',
    capabilities: ['horarios-livres'],
    limits: ['sem-ociosidade'],
  },
  com5: {
    text: 'A análise lista os pacientes sem comprar há mais de 30 dias, cria tarefas de reativação e a Coraline AI prepara mensagens e campanhas para a sua aprovação.',
    capabilities: ['analise', 'coraline'],
    limits: [],
  },

  ope1: {
    text: 'A agenda organiza as consultas por dia e por profissional, evita horários sobrepostos e abre o WhatsApp com a mensagem de confirmação pronta, que você envia.',
    capabilities: ['agenda', 'confirmacao'],
    limits: [],
  },
  ope2: {
    text: 'Cada consulta pode ser marcada como confirmada, realizada, faltou ou cancelada, e o histórico fica na agenda e no prontuário do paciente.',
    capabilities: ['confirmacao', 'agenda'],
    limits: ['sem-taxa-faltas'],
  },
  ope3: {
    text: 'A equipe entra por convite com papel de recepção ou de profissional, os profissionais e serviços ficam cadastrados e cada papel vê só o que lhe cabe.',
    capabilities: ['equipe'],
    limits: [],
  },
  ope4: {
    text: 'As tarefas com prazo tornam cada pendência visível, e os serviços e os horários de atendimento ficam cadastrados em Clínica e equipe.',
    capabilities: ['tarefas', 'equipe'],
    limits: ['sem-procedimentos'],
  },
  ope5: {
    text: 'A recepção e os profissionais têm acesso próprio, a agenda e o prontuário ficam na plataforma, e a Coraline AI atende o WhatsApp deixando para a sua aprovação só o que é sensível.',
    capabilities: ['equipe', 'agenda', 'whatsapp', 'aprovacoes'],
    limits: [],
  },

  ges1: { text: null, capabilities: [], limits: ['sem-metas'] },
  ges2: {
    text: 'O painel mostra o faturamento do mês frente ao mês passado, as entradas e saídas, as consultas dos próximos dias e os alertas, e a Coraline AI responde sobre os indicadores.',
    capabilities: ['dashboard', 'coraline'],
    limits: [],
  },
  ges3: {
    text: 'O painel e as notificações da plataforma entregam uma pauta pronta de números e pendências para uma reunião semanal.',
    capabilities: ['dashboard', 'analise'],
    limits: ['sem-reunioes'],
  },
  ges4: {
    text: 'Você pode perguntar à Coraline AI sobre atendimentos, financeiro, funil e agenda, e a resposta usa os dados que a clínica cadastrou.',
    capabilities: ['coraline', 'dashboard'],
    limits: [],
  },
  ges5: {
    text: 'Cada ponto de atenção pode virar uma tarefa com prazo, e a análise e a Coraline AI criam tarefas a partir dos dados cadastrados.',
    capabilities: ['tarefas', 'analise'],
    limits: [],
  },
}

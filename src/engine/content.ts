import type { Band, DimensionId, TeamSize } from './types'

export const BAND_LABEL: Record<Band, string> = {
  critical: 'Situação crítica',
  attention: 'Precisa de atenção',
  developing: 'Em desenvolvimento',
  established: 'Bem estabelecida',
}

export const BAND_RANGE: Record<Band, string> = {
  critical: '0 a 4',
  attention: '5 a 8',
  developing: '9 a 12',
  established: '13 a 15',
}

export const NO_INFO_LABEL = 'Sem informação suficiente'
export const NO_INFO_RISK =
  'Sem informação sobre como esta área funciona, decisões podem ser tomadas sem conhecer o que realmente acontece nela.'

export const TEAM_LABEL: Record<TeamSize, string> = {
  solo: 'Só o proprietário',
  '2-3': '2 a 3 pessoas',
  '4-7': '4 a 7 pessoas',
  '8-15': '8 a 15 pessoas',
  '16+': 'Mais de 15 pessoas',
}

interface DimText {
  headline: Record<Band, string>
  /** Possibilidades (nunca prejuízos comprovados) por faixa. */
  risk: Record<Band, string>
}

export const DIM_TEXT: Record<DimensionId, DimText> = {
  financeiro: {
    headline: {
      critical: 'O dinheiro da clínica ainda não está sendo enxergado.',
      attention: 'Existe algum controle financeiro, mas ele é incompleto.',
      developing: 'A base financeira existe; faltam regularidade e visão adiante.',
      established: 'A gestão financeira é organizada e acompanhada.',
    },
    risk: {
      critical: 'Sem registro e acompanhamento, decisões de preço, contratação e investimento podem ser tomadas sem conhecer o resultado real da clínica.',
      attention: 'Com controles parciais, o caixa pode surpreender e o resultado real pode ser diferente do imaginado.',
      developing: 'Com a base pronta, o risco passa a ser olhar só para o passado e ser pego por meses de maior despesa.',
      established: 'O risco aqui é a rotina enfraquecer com o tempo; a revisão periódica ajuda a mantê-la.',
    },
  },
  atendimento: {
    headline: {
      critical: 'O atendimento depende de quem atende, e não de um processo.',
      attention: 'Há cuidado com o paciente, mas sem padrão nem acompanhamento.',
      developing: 'O atendimento tem estrutura; falta acompanhar o que o paciente sente.',
      established: 'Atendimento e relacionamento são organizados e acompanhados.',
    },
    risk: {
      critical: 'A experiência do paciente pode variar muito de um contato para outro, e problemas podem não chegar a quem decide.',
      attention: 'Pacientes podem ficar sem resposta ou sem retorno justamente quando esperavam atenção.',
      developing: 'Sem acompanhar feedbacks e o pós-atendimento, a clínica pode não perceber o que desagrada nem quem deixou de voltar.',
      established: 'Treinamentos e revisões evitam que o padrão se perca com a rotina.',
    },
  },
  comercial: {
    headline: {
      critical: 'Os contatos de novos pacientes não têm um caminho organizado.',
      attention: 'Parte dos contatos é acompanhada; outra parte se perde.',
      developing: 'O acompanhamento comercial existe; falta medir e retomar com constância.',
      established: 'A gestão comercial está bem estabelecida.',
    },
    risk: {
      critical: 'Contatos que não são registrados nem retomados podem representar pessoas que procuraram a clínica e não foram atendidas.',
      attention: 'Sem acompanhar quem não agenda, parte da demanda que chega pode se perder sem que a clínica perceba.',
      developing: 'Sem medir a conversão, é difícil saber se o limite está na quantidade de contatos ou na forma de atendê-los.',
      established: 'A rotina comercial só se sustenta se for revisada; continue medindo a conversão.',
    },
  },
  operacao: {
    headline: {
      critical: 'A operação depende da memória e da presença do proprietário.',
      attention: 'A operação funciona, mas por hábito e esforço mais do que por processo.',
      developing: 'Os processos existem; falta torná-los consistentes e independentes de pessoas.',
      established: 'A operação é organizada e não depende de pessoas específicas.',
    },
    risk: {
      critical: 'Faltas, erros de agenda e retrabalho podem ser frequentes, e a clínica pode ter dificuldade de funcionar quando o proprietário se ausenta.',
      attention: 'Falhas de agenda e de comunicação interna podem se repetir porque o combinado não está registrado.',
      developing: 'Exceções frequentes podem corroer o processo existente e sobrecarregar quem cobre as falhas.',
      established: 'Documentar mudanças e treinar pessoas novas mantém o padrão quando a equipe muda.',
    },
  },
  gestao: {
    headline: {
      critical: 'A clínica é conduzida sem metas nem números à mão.',
      attention: 'Há alguns números e intenções, mas sem rotina de acompanhamento.',
      developing: 'Existe acompanhamento; falta ligar os números a decisões e a planos de ação.',
      established: 'A gestão por metas e indicadores está bem estabelecida.',
    },
    risk: {
      critical: 'Sem metas e indicadores, problemas e oportunidades podem demorar a ser percebidos, e a equipe pode não saber o que priorizar.',
      attention: 'Indicadores consultados sem rotina tendem a ser lembrados só em momentos de aperto.',
      developing: 'Acompanhar sem agir pode gerar números que ninguém usa; o elo que falta é o plano de ação.',
      established: 'O risco é o acompanhamento virar formalidade; vale revisar o que cada indicador ajuda a decidir.',
    },
  },
}

/** Frase de prioridade por modo. */
export const PRIORITY_PREFIX = {
  alta: 'Prioridade alta.',
  media: 'Prioridade média.',
  manter: 'Prioridade de manutenção.',
  investigar: 'Antes de melhorar, descubra.',
} as const

/** Textos de fechamento do plano quando há poucos pontos fracos. */
export const PLAN_TOPUP = {
  now: 'Documente em uma página como funciona o processo que está mais forte, para que ele não dependa de uma só pessoa.',
  d30: 'Escolha a dimensão de menor nota e defina uma melhoria mensurável para o próximo trimestre.',
}

export const PLAN_REDO = 'Refaça o Raio-X e compare o resultado com este, dimensão por dimensão.'

export const TEAM_NOTE: Record<TeamSize, string> = {
  solo:
    'Como você conduz a clínica praticamente sozinho, o mais realista é escolher poucas ações e concluí-las antes de abrir outra frente.',
  '2-3':
    'Com uma equipe enxuta, o mais realista é escolher poucas ações e concluí-las antes de abrir outra frente.',
  '4-7':
    'Com uma equipe desse tamanho, vale combinar quem acompanha cada ação e olhar o andamento em uma conversa curta por semana.',
  '8-15':
    'Com uma equipe desse tamanho, cada ação precisa de um responsável e de um prazo, para não se diluir entre as pessoas.',
  '16+':
    'Com uma equipe desse tamanho, cada ação precisa de um responsável e de um prazo, e os resultados devem ser compartilhados com os líderes de cada área.',
}

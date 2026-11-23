import { DIMENSION_BY_ID } from '../data/questions'
import { DIMENSION_IDS, type Answers, type DimensionId, type Pattern, type Profile, type QuestionId, type Scores } from './types'

interface Ctx {
  answers: Answers
  scores: Scores
  profile: Profile
}

const weak = (a: Answers, id: QuestionId) => a[id] === 0 || a[id] === 1
const solid = (a: Answers, id: QuestionId) => a[id] === 2 || a[id] === 3
const s15 = (c: Ctx, d: DimensionId) => c.scores.dims[d].score15

interface Rule {
  id: string
  when: (c: Ctx) => boolean
  title: string
  body: (c: Ctx) => string
}

/**
 * Padrões que cruzam respostas de áreas diferentes. Cada um só aparece quando as respostas do próprio
 * usuário o sustentam, e é isso que faz relatórios diferentes para clínicas diferentes.
 * A ordem da lista é a ordem de relevância.
 */
const RULES: Rule[] = [
  {
    id: 'sem-informacao-total',
    when: (c) => c.scores.valid === 0,
    title: 'A falta de informação é o principal achado',
    body: (c) =>
      `Todas as respostas de ${c.profile.clinic} foram "não sei". Isso não significa que os processos não existam: significa que, hoje, a gestão não entrega essas informações com facilidade. Por isso não calculamos nota, e o plano abaixo é sobretudo de descoberta.`,
  },
  {
    id: 'contatos-sem-numeros',
    when: (c) => weak(c.answers, 'com3') && weak(c.answers, 'ges2'),
    title: 'Sem números, não dá para saber onde está o gargalo',
    body: () =>
      'Você não mede quantos contatos viram agendamento e não acompanha indicadores. Com isso, fica difícil distinguir se o desafio é falta de demanda ou perda de oportunidades no caminho até a consulta.',
  },
  {
    id: 'depende-do-dono',
    when: (c) => weak(c.answers, 'ope5') && (weak(c.answers, 'ope3') || weak(c.answers, 'ope4')),
    title: 'A rotina depende de você',
    body: () =>
      'Sem responsabilidades ou procedimentos claros, a clínica tende a esperar pelo proprietário para decidir e resolver. Isso reduz o tempo que sobra para pensar a clínica, e não apenas operá-la.',
  },
  {
    id: 'agenda-escapando',
    when: (c) => weak(c.answers, 'ope2') && weak(c.answers, 'com4'),
    title: 'A agenda é onde a capacidade pode estar escapando',
    body: () =>
      'Faltas sem registro e horários vagos sem acompanhamento andam juntos: a agenda pode estar perdendo capacidade de atendimento sem que ninguém veja o tamanho disso.',
  },
  {
    id: 'caixa-sem-resultado',
    when: (c) => solid(c.answers, 'fin1') && weak(c.answers, 'fin4'),
    title: 'A clínica registra o que entra, mas não calcula o que sobra',
    body: () =>
      'Faturamento não é resultado. Sem conhecer o que sobra depois de todas as despesas, é difícil saber se a receita que cresce está virando ganho para a clínica.',
  },
  {
    id: 'registra-sem-retomar',
    when: (c) => solid(c.answers, 'com1') && weak(c.answers, 'com2'),
    title: 'Os contatos são registrados, mas quem não agenda não é retomado',
    body: () =>
      'O registro já existe, que é a parte mais difícil de começar. O passo seguinte é usá-lo: voltar a falar, com prazo e mensagem definidos, com quem pediu informações e não marcou.',
  },
  {
    id: 'acompanha-sem-agir',
    when: (c) => solid(c.answers, 'ges2') && weak(c.answers, 'ges5'),
    title: 'Você acompanha números, mas os problemas não viram plano de ação',
    body: () =>
      'Quando um indicador sai do esperado, não há um plano com responsável e prazo. O acompanhamento só gera melhoria quando termina em uma ação.',
  },
  {
    id: 'pedidos-sem-registro',
    when: (c) => weak(c.answers, 'ate2') && weak(c.answers, 'ate4'),
    title: 'O que o paciente pede e reclama depende da memória de quem atendeu',
    body: () =>
      'Nem as solicitações nem as reclamações têm registro. Isso torna difícil saber o que ficou pendente e quais problemas se repetem.',
  },
  {
    id: 'sem-continuidade',
    when: (c) => weak(c.answers, 'ate5') && weak(c.answers, 'com5'),
    title: 'A continuidade do relacionamento depende do paciente',
    body: () =>
      'Nem o contato depois do atendimento nem o retorno de pacientes antigos têm processo. Quem precisaria voltar fica sujeito a lembrar sozinho.',
  },
  {
    id: 'vende-sem-enxergar',
    when: (c) => (s15(c, 'comercial') ?? 0) >= 9 && s15(c, 'financeiro') !== null && (s15(c, 'financeiro') as number) <= 8,
    title: 'Atrair pacientes já tem estrutura; enxergar o resultado ainda não',
    body: () =>
      'Na sua clínica, o caminho de quem procura o atendimento está mais organizado do que o controle do dinheiro. Isso pode dar a sensação de que tudo vai bem sem que os números confirmem.',
  },
  {
    id: 'atende-bem-capta-pouco',
    when: (c) => (s15(c, 'atendimento') ?? 0) >= 9 && s15(c, 'comercial') !== null && (s15(c, 'comercial') as number) <= 8,
    title: 'Quem chega parece ser bem atendido; o desafio está em quem ainda não chegou',
    body: () =>
      'O atendimento tem mais estrutura do que a captação e a retomada de contatos. Fortalecer o caminho até o agendamento aproveita um atendimento que já funciona.',
  },
  {
    id: 'numeros-sem-metas',
    when: (c) => (s15(c, 'financeiro') ?? 0) >= 9 && s15(c, 'gestao') !== null && (s15(c, 'gestao') as number) <= 8,
    title: 'Os números existem, mas ainda não viram metas e decisões',
    body: () =>
      'A base financeira está montada, mas falta o que a transforma em direção: metas, reuniões de acompanhamento e decisões apoiadas nesses números.',
  },
  {
    id: 'gestao-puxa',
    when: (c) =>
      (s15(c, 'gestao') ?? 0) >= 9 &&
      DIMENSION_IDS.some((d) => d !== 'gestao' && s15(c, d) !== null && (s15(c, d) as number) <= 8),
    title: 'Há cultura de acompanhamento; as áreas mais frágeis podem entrar no mesmo ritmo',
    body: () =>
      'A clínica já tem o hábito de olhar números e metas. Levar esse mesmo hábito às áreas de menor nota tende a ser mais simples do que começá-lo do zero.',
  },
  {
    id: 'equilibrio-baixo',
    when: (c) => {
      const v = DIMENSION_IDS.map((d) => s15(c, d)).filter((n): n is number => n !== null)
      return v.length >= 4 && Math.max(...v) - Math.min(...v) <= 3 && (c.scores.band === 'critical' || c.scores.band === 'attention')
    },
    title: 'As cinco áreas estão em nível parecido',
    body: () =>
      'Não há uma área muito mais frágil do que as outras. O caminho mais eficaz é escolher uma frente e levá-la até o fim antes de abrir a próxima.',
  },
  {
    id: 'base-solida',
    when: (c) => {
      const v = DIMENSION_IDS.map((d) => s15(c, d)).filter((n): n is number => n !== null)
      return v.length >= 4 && Math.min(...v) >= 9
    },
    title: 'Nenhuma área está frágil',
    body: () =>
      'Todas as áreas avaliadas têm pelo menos uma base em desenvolvimento. O ganho agora está em regularidade e em usar os dados para decidir, e não em montar processos do zero.',
  },
]

function infoPattern(c: Ctx): Pattern | null {
  let worst: DimensionId | null = null
  for (const d of DIMENSION_IDS) {
    const u = c.scores.dims[d].unknown
    if (u >= 3 && (worst === null || u > c.scores.dims[worst].unknown)) worst = d
  }
  if (!worst || c.scores.valid === 0) return null
  const u = c.scores.dims[worst].unknown
  const name = DIMENSION_BY_ID[worst].name.toLowerCase()
  return {
    id: `informacao-${worst}`,
    title: `Em ${name}, o primeiro passo é descobrir`,
    body: `${u} de 5 respostas dessa área foram "não sei". Elas não foram tratadas como processo ausente, mas mostram que a informação não está à mão. Antes de melhorar, vale levantar como a área funciona hoje.`,
  }
}

/** Até três padrões relevantes para as respostas. Lacunas de informação vêm primeiro. */
export function detectPatterns(answers: Answers, scores: Scores, profile: Profile, limit = 3): Pattern[] {
  const ctx: Ctx = { answers, scores, profile }
  const out: Pattern[] = []
  const info = infoPattern(ctx)
  if (info) out.push(info)
  for (const r of RULES) {
    if (out.length >= limit) break
    if (r.when(ctx)) out.push({ id: r.id, title: r.title, body: r.body(ctx) })
  }
  return out.slice(0, limit)
}

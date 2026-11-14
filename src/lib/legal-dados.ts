// Dados do responsável e versão dos documentos legais (módulo pequeno, usado no login e no rodapé).
// Os textos completos ficam em legal.ts, que só é baixado quando alguém abre uma página legal.
//
// DADOS DO RESPONSÁVEL — preencha só com dados reais informados pelo dono (nada aqui deve ser inventado).
// Enquanto um campo estiver vazio, as páginas omitem esse dado.
export const LEGAL_VERSION = '2026-11-11'
export const EMPRESA = 'Scalable'
/** Nome completo (pessoa física) ou razão social (empresa) de quem responde pela Scalable. */
export const RESPONSAVEL = ''
/** Documento do responsável, já formatado. Ex.: 'CPF 000.000.000-00' ou 'CNPJ 00.000.000/0001-00'. */
export const DOCUMENTO = ''
/** Endereço para contato (exigido para quem vende pela internet). */
export const ENDERECO = ''
/** E-mail de atendimento (contato, cancelamento e reembolso). */
export const EMAIL_CONTATO = ''
/** Telefone/WhatsApp de atendimento (opcional). */
export const TELEFONE = ''
/** E-mail para assuntos de dados pessoais (canal do encarregado). Se vazio, usa o e-mail de atendimento. */
export const CONTATO_PRIVACIDADE = ''

/** Texto que a pessoa aceita ao assinar as novidades por e-mail (guardado junto com a inscrição, como prova do consentimento). */
export const NOVIDADES_ACEITE =
  'Quero receber por e-mail novidades e atualizações da Scalable. A inscrição é gratuita, não tem relação com o plano pago e posso cancelar quando quiser.'

/** Linha de identificação para o rodapé e as páginas legais (só com o que estiver preenchido). */
export const IDENTIFICACAO = [RESPONSAVEL ? `${EMPRESA} — ${RESPONSAVEL}` : EMPRESA, DOCUMENTO, ENDERECO].filter(Boolean).join(' · ')
export const CONTATOS = [EMAIL_CONTATO, TELEFONE].filter(Boolean).join(' · ')


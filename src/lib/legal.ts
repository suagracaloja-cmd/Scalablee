// Textos legais da Scalable (modelos baseados na LGPD e no CDC — revisar com um advogado antes do lançamento).
//
// DADOS DO RESPONSÁVEL — preencha só com dados reais informados pelo dono (nada aqui deve ser inventado).
// Enquanto um campo estiver vazio, as páginas omitem esse dado.
export const LEGAL_VERSION = '2026-11-08'
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

/** Linha de identificação para o rodapé e as páginas legais (só com o que estiver preenchido). */
export const IDENTIFICACAO = [RESPONSAVEL ? `${EMPRESA} — ${RESPONSAVEL}` : EMPRESA, DOCUMENTO, ENDERECO].filter(Boolean).join(' · ')
export const CONTATOS = [EMAIL_CONTATO, TELEFONE].filter(Boolean).join(' · ')

const dataVersao = LEGAL_VERSION.split('-').reverse().join('/')
const quem = [RESPONSAVEL ? `operada por ${RESPONSAVEL}` : '', DOCUMENTO, ENDERECO].filter(Boolean).join(', ')
const identificacao = quem ? `${EMPRESA}, ${quem}` : EMPRESA
const emailPrivacidade = CONTATO_PRIVACIDADE || EMAIL_CONTATO
const contatoPrivacidade = emailPrivacidade
  ? `pelo e-mail **${emailPrivacidade}**`
  : 'pelo menu **Configurações → Privacidade e dados** (o e-mail de contato será publicado nesta página)'
const contatoAtendimento = EMAIL_CONTATO
  ? `pelo e-mail **${EMAIL_CONTATO}**${TELEFONE ? ` ou pelo telefone **${TELEFONE}**` : ''}`
  : 'pelo canal de atendimento que será publicado nesta página'

export const TERMOS = `# Termos de Uso

_Última atualização: ${dataVersao}_

Estes Termos regulam o uso da plataforma **${identificacao}**. Ao criar uma conta, você declara que leu e concorda com eles, com a [Política de Privacidade](/privacidade), com a [Política de Cookies](/cookies) e com a [Política de Cancelamento e Reembolso](/reembolso).

### 1. O que é a ${EMPRESA}
Uma plataforma online de gestão para pequenas e médias empresas: vendas, clientes, financeiro, tarefas, atendimento pelo WhatsApp e o **Agente SCALABLE**, um assistente de inteligência artificial que analisa os dados da sua empresa e prepara ações para você aprovar.

### 2. Cadastro e conta
- É preciso ter 18 anos ou mais e informar dados verdadeiros.
- Você é responsável por manter sua senha em sigilo e por tudo que for feito na sua conta.
- Cada conta corresponde a uma empresa.

### 3. Como o Agente SCALABLE funciona
- As respostas são **sugestões** geradas por inteligência artificial e **podem conter erros**. Confira números, datas, preços e ofertas antes de agir.
- Operações relevantes — enviar mensagens ou e-mails, publicar campanhas, lançar ou alterar valores no financeiro, registrar vendas, cadastrar ou excluir dados — **só acontecem depois que você aprova** na Central de Aprovações.
- Você é responsável pelo que aprovar, inclusive pelo conteúdo das mensagens enviadas aos seus clientes.
- O uso da IA tem limite diário por empresa, para garantir o funcionamento para todos.

### 4. WhatsApp e serviços de terceiros
- A conexão com o WhatsApp usa a API oficial da Meta, com app e credenciais da sua própria empresa. Você deve seguir as políticas do WhatsApp Business (por exemplo, só enviar mensagens a quem aceitou recebê-las e não enviar spam).
- A ${EMPRESA} não responde por bloqueios, limites ou mudanças feitas pela Meta ou por outros serviços de terceiros.

### 5. Dados dos seus clientes
Os dados que você cadastra sobre os seus clientes pertencem à sua empresa. Você é o **controlador** desses dados e deve ter uma base legal para tratá-los (LGPD). A ${EMPRESA} atua como **operadora**, tratando-os só para prestar o serviço, conforme a Política de Privacidade.

### 6. Uso permitido
É proibido usar a plataforma para atividades ilegais, envio de spam, conteúdo ofensivo ou enganoso, tentar acessar dados de outras empresas, copiar ou fazer engenharia reversa do sistema, ou sobrecarregá-lo de propósito.

### 7. Disponibilidade
A plataforma está em fase de lançamento e é oferecida "no estado em que se encontra". Podem ocorrer manutenções, instabilidades e mudanças de funcionalidades. Faremos o possível para avisar com antecedência sobre mudanças importantes.

### 8. Assinatura e pagamento
- O valor do plano e o período de teste grátis aparecem na tela **Assinatura** antes de você assinar. Nada é cobrado sem que você assine.
- A assinatura é **mensal e renova automaticamente**. A cobrança é feita pelo **Mercado Pago**, na página segura dele, com as formas de pagamento que ele oferecer; a ${EMPRESA} não vê nem guarda dados do seu cartão.
- Você pode **cancelar a qualquer momento**, sem multa e sem fidelidade, na tela Assinatura. Não há novas cobranças depois do cancelamento, e o acesso continua até o fim do período já pago.
- **Direito de arrependimento:** você pode desistir em até 7 dias e receber de volta o valor pago, como explica a [Política de Cancelamento e Reembolso](/reembolso).
- Se um pagamento atrasar, há alguns dias de tolerância; depois disso o acesso pode ser pausado até a regularização. Seus dados continuam guardados e podem ser exportados ou excluídos a qualquer momento.

### 9. Responsabilidade
A ${EMPRESA} não garante resultados de vendas ou financeiros e não responde por decisões tomadas com base nas sugestões da IA. Nada nestes Termos afasta direitos garantidos por lei, inclusive pelo Código de Defesa do Consumidor, quando aplicável.

### 10. Encerramento
Você pode excluir sua conta a qualquer momento em **Configurações → Privacidade e dados**, o que apaga os dados da sua empresa. Podemos suspender contas que violem estes Termos.

### 11. Alterações
Podemos atualizar estes Termos. Mudanças relevantes serão avisadas na plataforma; se continuar usando, você concorda com a nova versão.

### 12. Lei aplicável e contato
Estes Termos seguem as leis do Brasil. Atendimento: ${contatoAtendimento}. Assuntos de dados pessoais: ${contatoPrivacidade}.
`

export const PRIVACIDADE = `# Política de Privacidade

_Última atualização: ${dataVersao}_

Esta Política explica como a **${identificacao}** trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).

### 1. Quem é o responsável
- Para os dados da **sua conta** (seu e-mail e o uso da plataforma), a ${EMPRESA} é a **controladora**.
- Para os dados que você cadastra sobre **os seus clientes** (nomes, telefones, compras, conversas), sua empresa é a controladora e a ${EMPRESA} é a **operadora**: trata esses dados só para prestar o serviço a você.
- Contato para assuntos de dados pessoais (canal do encarregado): ${contatoPrivacidade}.

### 2. Dados que tratamos
- **Conta:** e-mail, senha (guardada de forma criptografada pelo provedor de autenticação) e a data e a versão dos termos que você aceitou.
- **Empresa:** nome, segmento, descrição, site, Instagram e instruções dadas ao agente.
- **Dados que você insere:** clientes (nome, telefone, e-mail, observações), vendas, lançamentos financeiros e tarefas.
- **Conversas e aprovações:** perguntas feitas ao Agente SCALABLE, respostas e o registro de cada aprovação (o quê, quando e por quem).
- **WhatsApp (se conectado):** mensagens trocadas com seus clientes e as credenciais da Meta, guardadas só no servidor.
- **Assinatura:** o e-mail da conta do Mercado Pago informado para a cobrança e a situação dos pagamentos. Dados de pagamento são informados direto ao Mercado Pago e não passam pela ${EMPRESA}.
- **Dados técnicos:** endereço IP, dados do navegador e registros de acesso e de erros, recebidos pelos servidores quando você usa o site, para segurança e funcionamento.

### 3. Para que usamos e com qual base legal
- Prestar o serviço contratado e cobrar a assinatura: execução de contrato (art. 7º, V).
- Cumprir obrigações legais e atender pedidos de autoridades: cumprimento de obrigação legal (art. 7º, II).
- Segurança, prevenção de fraudes e melhoria do serviço: legítimo interesse (art. 7º, IX).
- Guardar registros de acesso pelo prazo legal: cumprimento de obrigação legal (art. 7º, II, e Marco Civil da Internet, art. 15).
Não vendemos dados pessoais e não os usamos para publicidade.

### 4. Inteligência artificial
Para responder às suas perguntas, o Agente SCALABLE envia trechos dos dados da sua empresa (por exemplo, resumos de vendas ou o nome de um cliente) a provedores de inteligência artificial, que geram a resposta: **Groq** e, se configurado, **Anthropic**. Esses provedores processam os dados para gerar a resposta, conforme os próprios termos. As respostas da IA são sugestões: ações relevantes só acontecem depois que você aprova.

### 5. Com quem compartilhamos
Somente com fornecedores necessários para o serviço:
- **Supabase** — banco de dados, autenticação e armazenamento de arquivos;
- **Vercel** — hospedagem do site;
- **Google (Google Fonts)** — fornece as fontes de letras do site; ao abrir as páginas, o seu navegador se conecta aos servidores do Google, que recebem o seu endereço IP;
- **Groq** e **Anthropic** — inteligência artificial;
- **Meta (WhatsApp)** — envio e recebimento de mensagens, quando você conecta o WhatsApp;
- **Mercado Pago** — cobrança e processamento dos pagamentos da assinatura;
- autoridades públicas, quando exigido por lei.

### 6. Transferência internacional
Esses fornecedores podem processar dados fora do Brasil (por exemplo, nos Estados Unidos). As transferências ocorrem para a execução do serviço, nos termos do art. 33 da LGPD.

### 7. Por quanto tempo guardamos
Enquanto sua conta existir. Ao excluir a conta, os dados da empresa são apagados do banco de dados na hora; cópias de segurança mantidas pelo provedor de banco de dados, se existirem, são substituídas com o tempo. Registros de acesso podem ser mantidos por até 6 meses, como exige a lei. O Mercado Pago e os demais fornecedores guardam os próprios registros conforme as políticas deles.

### 8. Seus direitos (art. 18)
Você pode pedir: confirmação e acesso aos dados, correção, anonimização, bloqueio ou eliminação, portabilidade, informação sobre compartilhamentos, revogação do consentimento (quando o tratamento depender dele) e revisão de decisões automatizadas. Na própria plataforma, em **Configurações → Privacidade e dados**, você pode **exportar todos os dados** da sua empresa e **excluir a conta**. Para os demais pedidos: ${contatoPrivacidade}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
Se um cliente da sua empresa pedir algo sobre os dados dele, você (controlador) pode corrigir ou excluir o cadastro dele diretamente na plataforma.

### 9. Segurança
Conexões criptografadas (HTTPS), isolamento dos dados de cada empresa no banco de dados, credenciais guardadas só no servidor, verificação de autenticidade das mensagens do WhatsApp e aprovação obrigatória para ações relevantes, com registro de quem aprovou. Nenhum sistema é 100% seguro; em caso de incidente relevante, os afetados e a ANPD serão comunicados (art. 48).

### 10. Cookies e armazenamento local
Usamos apenas o armazenamento do navegador necessário para manter você conectado. Não usamos cookies de publicidade, estatísticas de visitas ou rastreadores. Detalhes na [Política de Cookies](/cookies).

### 11. Menores de idade
A plataforma não se destina a menores de 18 anos.

### 12. Alterações e contato
Esta Política pode ser atualizada; mudanças relevantes serão avisadas na plataforma. Dúvidas e pedidos sobre dados pessoais: ${contatoPrivacidade}.
`

export const COOKIES = `# Política de Cookies

_Última atualização: ${dataVersao}_

Esta Política explica o que a **${EMPRESA}** grava no seu navegador e quais serviços externos o site acessa. Ela complementa a [Política de Privacidade](/privacidade).

### 1. O que são cookies e armazenamento local
Cookies são pequenos arquivos que um site grava no navegador. O **armazenamento local** (localStorage) é um recurso parecido, que guarda informações no próprio navegador.

### 2. O que a ${EMPRESA} grava no seu navegador
**Sessão de login** — o único item gravado:
- **Nome:** \`sb-…-auth-token\`
- **Tipo:** armazenamento local, **estritamente necessário**
- **Para que serve:** manter você conectado depois de entrar na conta
- **Quando é apagado:** quando você sai da conta ou limpa os dados do navegador

Além disso:
- Antes de você entrar na conta, **nada** é gravado.
- A ${EMPRESA} **não grava cookies próprios** e **não usa** cookies ou ferramentas de publicidade, de estatísticas de visitas (analytics), pixels de rastreamento, mapas ou vídeos incorporados.

### 3. Serviços externos acessados pelo site
- **Google Fonts** — fontes de letras. Ao abrir uma página, o navegador baixa as fontes dos servidores do Google, que recebem o seu endereço IP e dados técnicos do navegador.
- **Supabase** — login e banco de dados. O navegador se comunica com os servidores do Supabase para entrar na conta e carregar os seus dados.
- **Vercel** — hospedagem: entrega as páginas do site.
- **Mercado Pago** — só quando você vai para a página de assinatura do Mercado Pago, que é um site dele, com cookies e regras próprias.
- Links para outros sites (por exemplo, Meta, para configurar o WhatsApp) abrem páginas com políticas próprias.

### 4. Consentimento
O único armazenamento usado é **estritamente necessário** para o serviço que você pediu (entrar e continuar na sua conta). Por isso, não exibimos um aviso pedindo consentimento. Se um dia a ${EMPRESA} passar a usar cookies ou ferramentas que não sejam necessárias (estatísticas, publicidade, mapas ou vídeos incorporados), elas só serão ativadas **depois do seu consentimento**, e esta Política será atualizada.

### 5. Como controlar
- **Sair da conta** apaga a sessão guardada no navegador.
- Você pode apagar ou bloquear o armazenamento nas configurações do navegador. Se bloquear, não será possível continuar conectado.

### 6. Contato
Dúvidas sobre esta Política: ${contatoPrivacidade}.
`

export const REEMBOLSO = `# Política de Cancelamento e Reembolso

_Última atualização: ${dataVersao}_

Esta Política vale para a assinatura da **${identificacao}**, um serviço digital (software usado pela internet). Como não há produto físico, **não há troca**: o que existe é o cancelamento e o reembolso descritos abaixo, conforme o Código de Defesa do Consumidor (Lei 8.078/1990).

### 1. Teste grátis
Ao criar a conta, você tem um período de teste grátis — o número de dias aparece na tela **Assinatura**. Durante o teste nada é cobrado e não é preciso cadastrar cartão. Se não assinar, nada será cobrado depois.

### 2. Direito de arrependimento (7 dias)
Como a contratação é feita pela internet, você pode desistir em até **7 dias**, sem precisar dar motivo (art. 49 do Código de Defesa do Consumidor).
- Para que esse prazo valha também para quem assina durante o teste grátis, os 7 dias contam a partir da **primeira cobrança**.
- Se desistir dentro desse prazo, você recebe de volta **o valor integral pago**, de imediato e com atualização monetária.
- O reembolso é feito pelo Mercado Pago, no mesmo meio de pagamento usado. O tempo para o valor aparecer na fatura do cartão ou na conta depende do banco ou do emissor do cartão.

### 3. Cancelamento a qualquer momento
- Cancele quando quiser na tela **Assinatura → Cancelar assinatura**. Não há multa nem fidelidade.
- Depois do cancelamento não há novas cobranças, e o acesso continua até o fim do período já pago.
- Fora do prazo de arrependimento, o mês já pago não é devolvido de forma proporcional.

### 4. Cobrança indevida
Se houver cobrança por engano (por exemplo, em duplicidade ou depois do cancelamento), o valor é devolvido, sem prejuízo dos direitos garantidos pelo Código de Defesa do Consumidor.

### 5. Pagamento recusado
Se a cobrança mensal for recusada, há alguns dias de tolerância para regularizar. Depois disso o acesso pode ser pausado até o pagamento. Seus dados continuam guardados e podem ser exportados ou excluídos a qualquer momento em **Configurações → Privacidade e dados**.

### 6. Como pedir
- **Cancelar:** na própria plataforma, tela **Assinatura**.
- **Desistir em 7 dias ou pedir reembolso:** cancele a assinatura e faça o pedido ${contatoAtendimento}, informando o e-mail da conta.
- Excluir a conta também cancela a assinatura no Mercado Pago.
`

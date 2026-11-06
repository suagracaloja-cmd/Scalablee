// Textos legais da Scalable (modelo baseado na LGPD — revisar com um advogado antes do lançamento).
// Preencha CONTATO_PRIVACIDADE com o e-mail do encarregado (DPO) e, se houver, a razão social e o CNPJ.
export const LEGAL_VERSION = '2026-11-06'
export const EMPRESA = 'Scalable'
export const RAZAO_SOCIAL = ''
export const CNPJ = ''
export const CONTATO_PRIVACIDADE = ''

const dataVersao = LEGAL_VERSION.split('-').reverse().join('/')
const identificacao = [RAZAO_SOCIAL || EMPRESA, CNPJ ? `CNPJ ${CNPJ}` : ''].filter(Boolean).join(', ')
const contato = CONTATO_PRIVACIDADE
  ? `pelo e-mail **${CONTATO_PRIVACIDADE}**`
  : 'pelo menu **Configurações → Privacidade e dados** (o e-mail do encarregado será publicado nesta página)'

export const TERMOS = `# Termos de Uso

_Última atualização: ${dataVersao}_

Estes Termos regulam o uso da plataforma **${EMPRESA}** (${identificacao}). Ao criar uma conta, você declara que leu e concorda com eles e com a [Política de Privacidade](/privacidade).

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
- O valor do plano, o período de teste grátis e as formas de pagamento (Pix, boleto ou cartão) aparecem na tela **Assinatura** antes de você assinar. Nada é cobrado sem que você assine.
- A assinatura é **mensal e renova automaticamente**. A cobrança é feita pelo **Asaas**, em página segura dele; a ${EMPRESA} não vê nem guarda dados do seu cartão.
- Você pode **cancelar a qualquer momento**, sem multa, na tela Assinatura. Não há novas cobranças depois do cancelamento, e o acesso continua até o fim do período já pago.
- Se um pagamento atrasar, há alguns dias de tolerância; depois disso o acesso pode ser pausado até a regularização. Seus dados continuam guardados e podem ser exportados ou excluídos a qualquer momento.

### 9. Responsabilidade
A ${EMPRESA} não garante resultados de vendas ou financeiros e não responde por decisões tomadas com base nas sugestões da IA. Nada nestes Termos afasta direitos garantidos por lei, inclusive pelo Código de Defesa do Consumidor, quando aplicável.

### 10. Encerramento
Você pode excluir sua conta a qualquer momento em **Configurações → Privacidade e dados**, o que apaga os dados da sua empresa. Podemos suspender contas que violem estes Termos.

### 11. Alterações
Podemos atualizar estes Termos. Mudanças relevantes serão avisadas na plataforma; se continuar usando, você concorda com a nova versão.

### 12. Lei aplicável
Estes Termos seguem as leis do Brasil. Dúvidas: ${contato}.
`

export const PRIVACIDADE = `# Política de Privacidade

_Última atualização: ${dataVersao}_

Esta Política explica como a **${EMPRESA}** (${identificacao}) trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).

### 1. Papéis
- Para os dados da **sua conta** (seu e-mail e o uso da plataforma), a ${EMPRESA} é a **controladora**.
- Para os dados que você cadastra sobre **os seus clientes** (nomes, telefones, compras, conversas), sua empresa é a controladora e a ${EMPRESA} é a **operadora**: trata esses dados só para prestar o serviço a você.

### 2. Dados que tratamos
- **Conta:** e-mail, senha (guardada de forma criptografada pelo provedor de autenticação) e a data em que você aceitou estes termos.
- **Empresa:** nome, segmento, descrição, site, Instagram e instruções dadas ao agente.
- **Dados que você insere:** clientes (nome, telefone, e-mail, observações), vendas, lançamentos financeiros e tarefas.
- **Conversas e aprovações:** perguntas feitas ao Agente SCALABLE, respostas e o registro de cada aprovação (o quê, quando e por quem).
- **WhatsApp (se conectado):** mensagens trocadas com seus clientes e as credenciais da Meta, guardadas só no servidor.
- **Assinatura:** nome ou razão social, CPF ou CNPJ, e-mail e celular informados para a cobrança, e a situação dos pagamentos. Dados de cartão são digitados direto no Asaas e não passam pela ${EMPRESA}.
- **Dados técnicos:** registros de acesso e de erros, para segurança e funcionamento.

### 3. Para que usamos e com qual base legal
- Prestar o serviço contratado e cobrar a assinatura: execução de contrato (art. 7º, V).
- Guardar dados de cobrança e notas pelo prazo legal: cumprimento de obrigação legal (art. 7º, II).
- Segurança, prevenção de fraudes e melhoria do serviço: legítimo interesse (art. 7º, IX).
- Guardar registros de acesso pelo prazo legal: cumprimento de obrigação legal (art. 7º, II, e Marco Civil da Internet, art. 15).
Não vendemos dados pessoais e não os usamos para publicidade.

### 4. Inteligência artificial
Para responder às suas perguntas, o Agente SCALABLE envia trechos dos dados da sua empresa (por exemplo, resumos de vendas ou o nome de um cliente) a provedores de inteligência artificial, que geram a resposta: **Groq** e, se configurado, **Anthropic**. Esses provedores processam os dados para gerar a resposta, conforme os próprios termos.

### 5. Com quem compartilhamos
Somente com fornecedores necessários para o serviço:
- **Supabase** — banco de dados, autenticação e armazenamento de arquivos;
- **Vercel** — hospedagem do site;
- **Groq** e **Anthropic** — inteligência artificial;
- **Meta (WhatsApp)** — envio e recebimento de mensagens, quando você conecta o WhatsApp;
- **Asaas** — emissão de cobranças e processamento dos pagamentos da assinatura;
- autoridades públicas, quando exigido por lei.

### 6. Transferência internacional
Esses fornecedores podem processar dados fora do Brasil (por exemplo, nos Estados Unidos). As transferências ocorrem para a execução do serviço, nos termos do art. 33 da LGPD.

### 7. Por quanto tempo guardamos
Enquanto sua conta existir. Ao excluir a conta, os dados da empresa são apagados do banco de dados na hora. Registros de acesso podem ser mantidos por até 6 meses, como exige a lei.

### 8. Seus direitos (art. 18)
Você pode pedir: confirmação e acesso aos dados, correção, anonimização ou eliminação, portabilidade, informação sobre compartilhamentos e revisão de decisões automatizadas. Na própria plataforma, em **Configurações → Privacidade e dados**, você pode **exportar todos os dados** da sua empresa e **excluir a conta**. Para os demais pedidos: ${contato}.
Se um cliente da sua empresa pedir algo sobre os dados dele, você (controlador) pode corrigir ou excluir o cadastro dele diretamente na plataforma.

### 9. Segurança
Conexões criptografadas (HTTPS), isolamento dos dados de cada empresa no banco de dados, credenciais guardadas só no servidor, verificação de autenticidade das mensagens do WhatsApp e aprovação obrigatória para ações relevantes, com registro de quem aprovou. Nenhum sistema é 100% seguro; em caso de incidente relevante, os afetados e a ANPD serão comunicados (art. 48).

### 10. Cookies e armazenamento local
Usamos apenas o armazenamento do navegador necessário para manter você conectado. Não usamos cookies de publicidade.

### 11. Menores de idade
A plataforma não se destina a menores de 18 anos.

### 12. Alterações e contato
Esta Política pode ser atualizada; mudanças relevantes serão avisadas na plataforma. Encarregado de dados (DPO) e dúvidas: ${contato}.
`

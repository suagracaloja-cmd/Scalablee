# Guia de lançamento da Scalable

O que já está pronto no sistema e o que **só o dono da conta pode fazer** (criar contas em outros serviços, pagar planos, revisar textos legais). Itens marcados com **[obrigatório]** impedem o lançamento comercial.

---

## 1. E-mails de cadastro e de recuperação de senha **[obrigatório]**

Hoje o cadastro exige confirmação por e-mail, e o serviço de e-mail padrão do Supabase **só envia para membros da sua equipe** no Supabase. Clientes novos não recebem o link, então não conseguem confirmar a conta nem recuperar a senha.

**Solução recomendada — e-mail próprio (SMTP):**
1. Crie uma conta gratuita num provedor de e-mail transacional (por exemplo, Brevo ou Resend) e verifique o remetente (ex.: `nao-responda@seudominio.com.br`).
2. No Supabase → projeto **Scalablee** → **Authentication → Emails → SMTP Settings** → ligue **Enable custom SMTP** e preencha host, porta, usuário, senha e remetente que o provedor informar.
3. Ainda em **Authentication → Emails → Templates**, cole os modelos em português abaixo.

**Alternativa temporária (beta fechado):** em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. O cadastro passa a funcionar sem e-mail, mas a **recuperação de senha continua sem funcionar** até o SMTP ser configurado.

### Modelos de e-mail em português

**Confirm signup** — Assunto: `Confirme seu cadastro na Scalable`
```html
<h2>Bem-vindo à Scalable!</h2>
<p>Clique no botão abaixo para confirmar seu e-mail e ativar sua conta.</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#0B0D12;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Confirmar e-mail</a></p>
<p>Se você não criou uma conta, ignore este e-mail.</p>
```

**Reset password** — Assunto: `Redefinir sua senha da Scalable`
```html
<h2>Redefinir senha</h2>
<p>Recebemos um pedido para redefinir a senha da sua conta. Clique no botão para escolher uma nova senha.</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#0B0D12;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Escolher nova senha</a></p>
<p>Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>
```

## 2. Endereço do site nos links de e-mail **[obrigatório]**

Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://scalablee.vercel.app` (ou o seu domínio próprio, quando tiver)
- **Redirect URLs:** adicione `https://scalablee.vercel.app/**`

Sem isso, os links de confirmação e de nova senha podem abrir um endereço errado.

## 3. Planos da hospedagem **[obrigatório antes de cobrar]**

| Serviço | Plano atual | Problema | O que contratar |
|---|---|---|---|
| Vercel (site) | Hobby (grátis) | Proíbe uso comercial | **Pro** (cerca de US$ 20/mês) |
| Supabase (banco) | Free | Sem backup automático; pausa após ~1 semana sem uso | **Pro** (US$ 25/mês, backup diário) |

## 4. Inteligência artificial

- Hoje a IA é a **Groq gratuita**, e a cota é **uma só para todos os clientes** (cerca de 1.000 pedidos/dia e 8.000 tokens/minuto no modelo principal).
- O sistema já limita o uso por empresa: **30 perguntas com IA por dia** (padrão). Para mudar, crie no Supabase → Edge Functions → Secrets o segredo `AGENT_DAILY_LIMIT` com o número desejado (`0` = sem limite). Acima do limite, o agente responde em modo básico (com os dados reais) e avisa.
- O consumo de cada empresa aparece em **Configurações → Agente SCALABLE**.
- Para ter muitos clientes: ative o plano pago da Groq (cobra por uso) ou coloque créditos na Anthropic. O sistema troca de IA automaticamente quando uma falha.

## 5. Textos legais **[obrigatório]**

Já estão no site, com links no rodapé de todas as telas: **Termos de Uso** (`/termos`), **Política de Privacidade** (`/privacidade`), **Política de Cookies** (`/cookies`) e **Política de Cancelamento e Reembolso** (`/reembolso`). O aceite dos Termos e da Privacidade é obrigatório no cadastro, e a tela de assinatura mostra o resumo do contrato antes de ir ao Mercado Pago. Antes do lançamento:
1. Preencha em `src/lib/legal.ts`: `RESPONSAVEL` (nome completo ou razão social), `DOCUMENTO` (CPF ou CNPJ), `ENDERECO`, `EMAIL_CONTATO`, `TELEFONE` (opcional) e `CONTATO_PRIVACIDADE` (opcional; se vazio, usa o e-mail de contato) — ou envie esses dados e o ajuste é feito para você. Enquanto estiverem vazios, as páginas omitem esses dados.
2. Peça para um advogado revisar os quatro textos.

Também já funcionam: **exportar meus dados** e **excluir minha conta** (Configurações → Privacidade e dados).

## 6. WhatsApp

- Cada cliente conecta o WhatsApp com o app dele na Meta. A tela de conexão agora pede também a **chave secreta do app (App Secret)**, que liga a verificação de autenticidade das mensagens recebidas. Sem ela, a tela mostra um aviso.
- Para mensagens enviadas fora da janela de 24h após a última mensagem do cliente, a Meta exige **modelos de mensagem aprovados**; para volume maior, a **verificação da empresa** na Meta.

## 7. Cobrança pelo Mercado Pago

A integração já está pronta e **desligada**. Ela liga sozinha quando os secrets abaixo existirem. Comece com as **credenciais de teste** e só depois troque para as de produção.

**No Mercado Pago Developers** (mercadopago.com.br/developers → Suas integrações → sua aplicação):
1. **Credenciais**: copie o **Access Token** (o de teste começa com `TEST-`; o de produção, com `APP_USR-`). A Public Key não é necessária.
2. **Webhooks → Configurar notificações** (aba **Modo de teste** e, depois, aba **Modo produtivo**):
   - **URL:** `https://tmaywgdxfveczoxxrpur.supabase.co/functions/v1/api/mp-webhook` (a mesma nas duas abas);
   - **Eventos** — marque os três:
     - *Planos e assinaturas* → **vinculação de assinatura** (`subscription_preapproval`);
     - *Planos e assinaturas* → **pagamento recorrente** (`subscription_authorized_payment`);
     - **Pagamentos** (`payment`) — a documentação pede este também;
   - **Salvar** → o painel mostra a **assinatura secreta** (chave secreta) → copie;
   - use **Simular notificação** para testar: a Scalable responde 200 (com id de exemplo, o aviso é ignorado sem erro).
   - Não use **IPN** (sistema antigo, sem assinatura): só **Webhooks**.
   - A criação da assinatura **não** envia `notification_url` (o campo não existe na API de assinaturas); os avisos vêm da configuração do painel.

**No Supabase** → Edge Functions → **Secrets**:

| Nome | Valor |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | o Access Token |
| `MERCADOPAGO_WEBHOOK_SECRET` | a assinatura secreta do webhook |
| `MERCADOPAGO_AMBIENTE` | (opcional) `teste` para mostrar "Ambiente de testes" quando usar credenciais `APP_USR` de um **usuário de teste vendedor** |
| `PLANO_VALOR` | preço mensal, ex.: `97.00` |
| `PLANO_NOME` | (opcional) nome do plano, ex.: `Scalable Pro` |
| `PLANO_TESTE_DIAS` | (opcional) dias de teste grátis; padrão `7` |
| `COBRANCA_ATIVA` | `on` para **pausar o acesso** de quem não estiver em dia; sem isso, ninguém é bloqueado |
| `PLANO_TOLERANCIA_DIAS` | (opcional) dias de tolerância após uma cobrança recusada; padrão `5` |
| `APP_URL` | (opcional) endereço do site para a volta do Mercado Pago; padrão `https://scalablee.vercel.app` |

Com `MERCADOPAGO_ACCESS_TOKEN` e `PLANO_VALOR` definidos, aparece o menu **Assinatura** para os clientes:
- **Assinar:** a pessoa informa o e-mail da conta do Mercado Pago e conclui a assinatura na página do Mercado Pago. A primeira cobrança acontece no fim do teste grátis.
- **Acompanhar:** ver as cobranças e cancelar.

Os avisos do Mercado Pago atualizam a situação sozinhos: autorizada, cobrança aprovada, recusada, pausada ou cancelada. Excluir a conta cancela a assinatura no Mercado Pago antes.

**Teste com credenciais de teste:** no Mercado Pago, a assinatura de teste precisa ser feita com um **usuário de teste** (Suas integrações → Contas de teste) — use o e-mail desse usuário comprador no formulário e um cartão de teste do Mercado Pago.

## 8. Novidades por e-mail (grátis)

Na tela **Assinatura**, o cliente pode clicar em **Assinar grátis** para receber novidades da Scalable por e-mail. Não tem relação com o plano pago nem com o Mercado Pago.
- **Onde ver a lista:** Supabase → projeto **Scalablee** → **Table Editor** → tabela `inscricoes_novidades`. Envie só para quem está com `status = inscrito`.
- Cada inscrição guarda a data, o texto e a versão do aceite (prova do consentimento) e, se a pessoa cancelar, a data do cancelamento.
- **Envio dos e-mails:** a Scalable ainda não envia e-mails sozinha. Você pode copiar a lista e enviar pelo seu e-mail ou por um serviço de e-mail marketing. Todo e-mail deve ter um jeito de cancelar (a pessoa também pode cancelar na própria tela Assinatura).

## 9. Recomendados (não bloqueiam)

- **Domínio próprio** (ex.: registro.br) apontado para a Vercel.
- Supabase → Authentication → **proteção contra senhas vazadas** (disponível em planos pagos).
- O repositório do código está **público** no GitHub. Deixá-lo privado exige mudar a forma de publicação atual (que baixa o código público direto do GitHub).

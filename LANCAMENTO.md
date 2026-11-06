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

Os **Termos de Uso** e a **Política de Privacidade** já estão no site (`/termos` e `/privacidade`), com aceite obrigatório no cadastro. Antes do lançamento:
1. Preencha em `src/lib/legal.ts`: `CONTATO_PRIVACIDADE` (e-mail do encarregado de dados), `RAZAO_SOCIAL` e `CNPJ` — ou envie esses dados e o ajuste é feito para você.
2. Peça para um advogado revisar os dois textos.

Também já funcionam: **exportar meus dados** e **excluir minha conta** (Configurações → Privacidade e dados).

## 6. WhatsApp

- Cada cliente conecta o WhatsApp com o app dele na Meta. A tela de conexão agora pede também a **chave secreta do app (App Secret)**, que liga a verificação de autenticidade das mensagens recebidas. Sem ela, a tela mostra um aviso.
- Para mensagens enviadas fora da janela de 24h após a última mensagem do cliente, a Meta exige **modelos de mensagem aprovados**; para volume maior, a **verificação da empresa** na Meta.

## 7. Cobrança

Ainda não existe assinatura nem pagamento. Escolha o provedor (por exemplo, Asaas, Mercado Pago ou Stripe) e os planos/preços para a integração ser feita.

## 8. Recomendados (não bloqueiam)

- **Domínio próprio** (ex.: registro.br) apontado para a Vercel.
- Supabase → Authentication → **proteção contra senhas vazadas** (disponível em planos pagos).
- O repositório do código está **público** no GitHub. Deixá-lo privado exige mudar a forma de publicação atual (que baixa o código público direto do GitHub).

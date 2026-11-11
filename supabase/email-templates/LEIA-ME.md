# E-mails da Scalable (modelos do Supabase)

Os e-mails de **confirmação de cadastro** e de **redefinição de senha** são enviados pelo Supabase Auth.
Por padrão eles saem em inglês e com a marca do Supabase. Estes dois modelos trocam isso pela marca da Scalable, em português.

O app só dispara estes dois e-mails. Quem é convidado para a equipe cria a conta normalmente, então recebe o e-mail de confirmação.

## Como aplicar (cerca de 2 minutos, no computador)

Abra: https://supabase.com/dashboard/project/tmaywgdxfveczoxxrpur/auth/templates
(o projeto certo é o `tmaywgdxfveczoxxrpur`).

| Modelo no painel | Assunto (campo **Subject**) | Conteúdo (campo **Message body**) |
| --- | --- | --- |
| **Confirm sign up** | `Confirme seu e-mail na Scalable` | cole o arquivo `confirmacao-cadastro.html` |
| **Reset password** | `Redefina a sua senha da Scalable` | cole o arquivo `redefinir-senha.html` |

Em cada um: apague o conteúdo que está lá, cole o arquivo inteiro e clique em **Save**.

Não apague as variáveis entre chaves duplas: `{{ .ConfirmationURL }}` (o link) e `{{ .Email }}` (o e-mail da pessoa). O Supabase troca por valores reais ao enviar.

Para testar: crie uma conta nova com um e-mail novo (no Gmail, `seunome+teste2@gmail.com` serve) e veja o e-mail chegar.

## Remetente e entrega (precisa de decisão sua)

Estes modelos mudam o **conteúdo**. O **remetente** ("Supabase Auth") só muda com SMTP próprio:
Authentication → Emails → SMTP Settings.

Segundo a documentação do Supabase, o envio padrão:

- envia **só para os e-mails de membros da organização** no Supabase (os outros falham com `email_address_not_authorized`);
- tem limite baixo de envios por hora e funciona em regime de "melhor esforço".

Ou seja, serve para testar, mas **clientes de verdade podem não receber** o e-mail de confirmação. Antes de lançar, confira em Authentication → Emails → SMTP Settings se há SMTP próprio configurado.

Para configurar SMTP próprio é preciso:

1. um serviço de envio de e-mail (vários têm plano gratuito para volume baixo; confirme as condições antes de contratar);
2. de preferência um domínio próprio (ex.: `contato@suaclinica.com.br`), com os registros de autenticação (SPF/DKIM) que o serviço pedir.

## Observação sobre links "gastos"

Alguns provedores de e-mail (ex.: Microsoft Safe Links) abrem os links sozinhos para checar vírus, e isso "gasta" o link de confirmação.
A pessoa então vê "Esse link expirou ou já foi usado". O app já avisa isso e orienta a entrar com o e-mail e a senha.

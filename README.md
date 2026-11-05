# Scalablee — Gestão empresarial com 5 agentes de IA

Plataforma web (desktop e celular) onde o dono da empresa faz login e tem:

- **5 agentes de IA** personalizáveis (nome, foto, personalidade):
  - 📣 **Marketing** – pesquisa na internet o que está bombando no segmento, analisa site/Instagram e manda ideias de posts e campanhas.
  - 💼 **Vendas** – compara o mês com o anterior, aponta clientes sem comprar há 30+ dias, cria tarefas e sugere mensagens de reativação (com aprovação).
  - 💰 **Financeiro** – contas vencidas, a vencer em 7 dias, cobranças, saldo do mês.
  - 🤝 **CRM** – leads esfriando, follow-ups e pós-venda, antecipando tarefas para amanhã e depois.
  - 💬 **Atendimento** – responde clientes no **WhatsApp Business** sozinho e pede aprovação do dono quando necessário (desconto, reclamação, informação que não tem).
- **Assistente IA separado**: “como estão minhas vendas?” → resposta com os dados reais.
- **Análise de site**: a IA entra no site, faz verificações técnicas (HTTPS, celular, SEO, WhatsApp, pixel…) e explica o que melhorar.
- **Dashboard** com animação de entrada (da esquerda para a direita), linha de vendas sendo “desenhada”, números subindo e atualização em tempo real.
- Vendas, Clientes (CRM), Financeiro (a pagar / a receber), Tarefas, Aprovações e Notificações — tudo salvo no Supabase.

## Stack

- React + Vite + TypeScript + Tailwind CSS v4
- Supabase: Auth, Postgres (com RLS por empresa), Realtime, Storage (fotos dos agentes), Edge Function `api`
- Claude (Anthropic API) nos agentes, com busca na web para o agente de marketing

## Rodar localmente

```bash
npm install
npm run dev
```

O `.env` já aponta para o projeto Supabase **Scalablee** (`tmaywgdxfveczoxxrpur`). A chave usada é a *publishable* (pública).

## Ativar a IA completa

Sem chave, a plataforma funciona em **modo básico** (agentes por regras, assistente com resumo numérico, resposta padrão no WhatsApp).
Para ligar a IA, adicione o secret na Edge Function:

Supabase → Project Settings → Edge Functions → Secrets → `ANTHROPIC_API_KEY`

Opcional: `WHATSAPP_APP_SECRET` (valida a assinatura dos webhooks da Meta) e `WHATSAPP_GRAPH_VERSION` (padrão `v23.0`).

## WhatsApp Business (API oficial da Meta)

1. Em developers.facebook.com crie um app Business e adicione o produto WhatsApp.
2. Na plataforma: **WhatsApp → Conectar** → cole o *Phone Number ID* e um *token permanente*.
3. Copie a **URL de callback** e o **token de verificação** mostrados e configure o webhook na Meta, assinando o campo `messages`.

Observação: pela regra da Meta, mensagens iniciadas pela empresa (ex.: reativação de cliente) só são entregues dentro da janela de 24h desde a última mensagem do cliente; fora dela é preciso template aprovado.

## Estrutura

```
src/                     front-end (páginas em src/pages)
supabase/migrations/     esquema do banco (tabelas, RLS, gatilhos, storage)
supabase/functions/api/  Edge Function com as rotas:
  agents.ts      POST /api/agents       roda os agentes
  assistant.ts   POST /api/assistant    IA assistente
  site.ts        POST /api/site         análise do site
  wa-send.ts     POST /api/wa-send      conectar, enviar, aprovar/recusar
  wa-webhook.ts  GET|POST /api/wa-webhook  webhook da Meta
```

Deploy da função: `supabase functions deploy api --no-verify-jwt` (a função valida o login por conta própria; o webhook precisa ser público).

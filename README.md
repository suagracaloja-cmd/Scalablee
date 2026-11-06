# Scalable — Gestão empresarial com o Agente SCALABLE

Plataforma web (desktop e celular) onde o dono da empresa faz login e tem:

- **Agente SCALABLE** — um único agente de IA, numa conversa estilo ChatGPT/Claude (histórico de conversas, respostas formatadas, sugestões iniciais), que cobre todas as áreas da empresa:
  - **Vendas** – resumo e lista de vendas, desempenho por produto, leads, funil, clientes inativos, registro de vendas.
  - **Marketing** – textos, campanhas, estratégias, calendário de conteúdo (com datas comemorativas), análise de resultados com os dados reais.
  - **Financeiro** – receitas e despesas, movimentações, comparação de períodos, preparação de lançamentos e alterações.
  - **Atendimento** – consulta de clientes, histórico do WhatsApp, preparação de respostas e mensagens, cadastro de clientes.
  - **Gestão** – indicadores, tarefas e pendências, planos de ação, aprovações pendentes, exclusões.
- **Central de Aprovações** — tudo que é relevante (enviar mensagens, e-mails, publicar campanhas, lançamentos e alterações financeiras, registro de vendas, cadastro e exclusão de dados) é **preparado** pelo agente e só é executado depois que o dono aprova. Cada decisão registra operação, dados, data/hora, status, resultado e quem decidiu.
- **WhatsApp Business** — o agente responde clientes (sozinho em dúvidas simples, se ligado em Configurações) e pede aprovação para descontos, reclamações e assuntos sensíveis.
- **Análise geral** (botão "Rodar análise" no Dashboard) — alertas, tarefas e mensagens de reativação para aprovação.
- **Análise de site**, Dashboard animado, Vendas, Clientes (CRM), Financeiro, Tarefas e Notificações — tudo salvo no Supabase.

## Stack

- React + Vite + TypeScript + Tailwind CSS v4
- Supabase: Auth, Postgres (com RLS por empresa), Realtime, Storage, Edge Function `api`
- Claude (Anthropic API) no Agente SCALABLE

## Rodar localmente

```bash
npm install
npm run dev
```

O `.env` já aponta para o projeto Supabase **Scalablee** (`tmaywgdxfveczoxxrpur`). A chave usada é a *publishable* (pública).

## Arquitetura do agente

```
Conversa (/api/agente) ─┐
WhatsApp (webhook) ─────┼─▶ lib/agent.ts  (único ponto de IA: prompt, loop de ferramentas, erros)
Análise (/api/analise) ─┤        │
Site (/api/site) ───────┘        ▼
                          lib/tools.ts  (27 ferramentas por área; as "_preparar" só criam aprovações)
                                 │
                                 ▼
          Central de Aprovações (/api/aprovacoes → lib/approvals.ts executa após aprovação)
```

- As consultas do agente usam o **cliente do próprio usuário** (RLS), então uma empresa nunca vê dados de outra.
- Histórico persistente em `agent_threads` + `assistant_messages` (com as ferramentas usadas em `meta`).
- Sem IA disponível (sem chave ou sem créditos), a conversa responde em **modo básico** com os dados reais e avisa o motivo.

## IA (Anthropic)

Secret da Edge Function: Supabase → Project Settings → Edge Functions → Secrets → `ANTHROPIC_API_KEY`.

## Integrações preparadas e desligadas (só ative com autorização)

| Recurso | Situação | Como ativar |
|---|---|---|
| Busca na web pelo agente (pesquisa de tendências) | **Desligada** — cobra por busca na API da Anthropic | Secret `AGENT_WEB_SEARCH=on` |
| Envio de e-mail | **Não integrado** — aprovar só registra a decisão; o envio é manual | Exige um provedor de e-mail (não contratado) |
| Publicação em Instagram/outras redes | **Não integrada** — aprovar só registra a decisão; a publicação é manual | Exige integração com a Meta (não configurada) |
| Métricas de redes sociais | **Não integradas** — o agente avisa que não tem esses dados | — |

Opcional para WhatsApp: `WHATSAPP_APP_SECRET` (valida a assinatura dos webhooks da Meta) e `WHATSAPP_GRAPH_VERSION` (padrão `v23.0`).

## WhatsApp Business (API oficial da Meta)

1. Em developers.facebook.com crie um app Business e adicione o produto WhatsApp.
2. Na plataforma: **WhatsApp → Conectar** → cole o *Phone Number ID* e um *token permanente*.
3. Copie a **URL de callback** e o **token de verificação** mostrados e configure o webhook na Meta, assinando o campo `messages`.

Observação: pela regra da Meta, mensagens iniciadas pela empresa (ex.: reativação de cliente) só são entregues dentro da janela de 24h desde a última mensagem do cliente; fora dela é preciso template aprovado.

## Estrutura

```
src/                     front-end (páginas em src/pages; conversa em src/pages/Agent.tsx)
supabase/migrations/     esquema do banco (0005 = agente central, threads e aprovações auditáveis)
supabase/functions/api/  Edge Function com as rotas:
  agente.ts      POST /api/agente       conversa com o Agente SCALABLE
  aprovacoes.ts  POST /api/aprovacoes   aprovar/recusar operações
  analise.ts     POST /api/analise      análise geral (alias antigo: /api/agents)
  site.ts        POST /api/site         análise do site
  wa-send.ts     POST /api/wa-send      conectar e enviar no WhatsApp
  wa-webhook.ts  GET|POST /api/wa-webhook  webhook da Meta
```

Deploy da função: `supabase functions deploy api --no-verify-jwt` (a função valida o login por conta própria; o webhook precisa ser público).

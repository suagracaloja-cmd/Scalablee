# Escalabilidade da Scalable — auditoria, medições e mudanças

_Data da auditoria: 17/11/2026. Tudo aqui foi verificado no código, na configuração real (Supabase e Vercel)
e em testes de carga. Números de planos e preços vêm da documentação oficial do Supabase consultada nesta data._

## 1. Arquitetura atual (verificada)

| Camada | O que é | Observações |
|---|---|---|
| Front-end | React 19 + Vite 8 + TypeScript + Tailwind 4 (SPA), PWA | Telas carregadas sob demanda; service worker só guarda a base do app |
| Hospedagem do site | Vercel (CDN), deploy estático | Brotli e cache imutável de `/assets` confirmados nos cabeçalhos |
| Banco | Supabase Postgres 17, região `sa-east-1` (São Paulo), plano **Free** (servidor **Nano**: CPU compartilhada, 0,5 GB) | Todas as tabelas com RLS; isolamento por clínica via `my_company_id()` |
| Acesso do site ao banco | Direto pela API de dados do Supabase (PostgREST) com o login do usuário | RLS garante o isolamento |
| Back-end | 1 Edge Function `api` (Deno) com rotas; `chat` antiga só responde 410 | Fala com o banco **pela API HTTP** (sem conexão direta ao Postgres) |
| Autenticação | Supabase Auth (JWT); papéis dono/recepção/profissional | Rotas da API validam o JWT e o papel |
| Tempo real | Supabase Realtime (`postgres_changes`), filtrado por clínica | Sem polling no site |
| Serviços externos | Groq/Anthropic (IA), Meta (WhatsApp), Mercado Pago, Brevo (e-mail), Web Push | |
| Cache | Nenhum servidor de cache; CDN da Vercel para arquivos estáticos | |

**Conexões ao banco:** nenhuma função abre conexão direta ao Postgres (verificado: nenhum driver `pg`/`postgres` nas
funções). Tudo passa pela API de dados do Supabase, que mantém o próprio pool. Por isso **não há risco de as funções
esgotarem o limite de conexões** (60 no Nano). Supavisor/PgBouncer só seriam necessários se no futuro algum serviço
abrir conexão direta — nesse caso, usar o pooler em modo _transaction_ (porta 6543).

## 2. Problemas encontrados (por criticidade)

### Crítico
1. **Limites rígidos do plano Free** (documentação oficial do Supabase):
   - Tempo real: **200 conexões simultâneas** e 100 mensagens/s. Cada aba logada usava uma conexão para sempre.
   - Banco: **500 MB**. Medido: ~**5,2 MB por clínica** após 1–2 anos de uso intenso → cabem ~90 clínicas assim.
   - Tráfego de saída: **5 GB/mês**. Medido: o Início baixava **1,5 MB** a cada abertura.
   - **Pausa automática** do projeto após 7 dias de pouca atividade e **sem backups automáticos** no Free.
     Solução gratuita preparada: backup diário criptografado + monitor de hora em hora no GitHub Actions
     (`docs/BACKUP-E-MONITORAMENTO.md`).
2. **Telas baixando tabelas inteiras**: o Início baixava todos os pacientes (2×) e todos os lançamentos; Pacientes
   baixava todos os atendimentos pagos em páginas de 1000; Financeiro idem. Isso gera CPU no banco e tráfego pago.
3. **Saturação medida**: com 1 núcleo de banco, **1.000 usuários ativos** já davam P50 de 6,8 s e 3% de erros.

### Alto
4. **21 chaves estrangeiras sem índice** (alerta do Supabase): apagar um paciente varria os atendimentos de
   **todas** as clínicas (98 ms com 200 clínicas; cresce com a plataforma).
5. **Chamadas externas sem limite de tempo** (IA Groq, WhatsApp, Mercado Pago; IA Anthropic com padrão de 10 min):
   um serviço travado prendia a função.
6. **Recarga a cada evento**: o Início refazia 7 consultas inteiras a cada atendimento/notificação/aprovação, sem
   agrupar eventos em sequência, e abas em segundo plano continuavam recarregando.
7. **CDN guardando a página no lugar de arquivo de código**: um arquivo antigo inexistente em `/assets/` voltava
   como HTML com status 200 e cache "imutável por 1 ano" (verificado: `x-vercel-cache: HIT`).

### Médio
8. Regras de acesso das "novidades" calculando `auth.uid()` a cada linha (alerta `auth_rls_initplan`).
9. Tabela do limite de tentativas crescia para sempre.
10. Sem endereço de saúde para monitoramento externo.
11. A API de dados (PostgREST) não tem limite por usuário: um usuário logado mal-intencionado pode gerar carga
    (o isolamento entre clínicas continua garantido pelo RLS). Mitigação futura: mover listas pesadas para RPCs
    com paginação e/ou um gateway com limite.
12. Hospedagem: o time da Vercel tem nome de conta pessoal; **não confirmei o plano**. Pelo que sei, o plano Hobby da
    Vercel é para uso pessoal/não comercial — **confirme no painel da Vercel**.

### Baixo / já correto
- RLS em todas as tabelas; funções `SECURITY DEFINER` checam o papel internamente (alertas do linter são esperados).
- Isolamento entre clínicas coberto por testes automatizados (centenas de verificações).
- Sem polling; canais de tempo real filtrados por clínica e fechados ao sair da tela.
- Logs não gravam conteúdo de mensagens nem segredos (só nomes e contagens).
- Proteção contra senhas vazadas desligada no Auth (alerta do Supabase) — ligar no painel quando o plano permitir.

## 3. O que foi feito

| # | Mudança | Arquivos |
|---|---|---|
| 1 | 21 índices de chave estrangeira (parciais quando a coluna costuma ser vazia) + 3 índices de listas + 2 índices de cobertura para somas | `supabase/migrations/0018_desempenho.sql` |
| 2 | Somas no banco com RLS (`atendimentos_por_paciente`, `atendimentos_soma`, `painel_atendimentos`) — `SECURITY INVOKER`, sem acesso anônimo | idem |
| 3 | Início: contagens em vez da lista de pacientes; lançamentos só em aberto + últimos 4 meses; atendimentos já somados por dia; nomes só dos recentes | `src/pages/Dashboard.tsx`, `src/components/HojeNaAgenda.tsx` |
| 4 | Pacientes e Financeiro usam as somas do banco | `src/pages/Customers.tsx`, `src/pages/Finance.tsx` |
| 5 | Tempo real único: agrupa eventos (uma recarga), não recarrega com a aba escondida, **solta a conexão após 1 min escondida** (fecha em até ~70 s), reconecta e atualiza ao voltar, recupera o estado após queda de rede | `src/hooks/useTempoReal.ts`, 6 telas, `src/lib/supabase.ts` |
| 6 | Limites de tempo: IA Groq 45 s (passa ao próximo modelo), Anthropic 60 s, WhatsApp 15 s, Mercado Pago 20 s; **consultas** ao Mercado Pago repetem até 3× com espera crescente (0,5 s, 1 s); criar/alterar assinatura **nunca** repete sozinho | `supabase/functions/api/lib/*.ts` |
| 7 | `GET /api/saude` para monitor de disponibilidade (sem login, sem dados) | `supabase/functions/api/saude.ts` |
| 8 | CDN: arquivo de código inexistente devolve 404 em vez da página | `vercel.json` |
| 9 | Regras das "novidades" calculadas uma vez por consulta; limpeza automática do limite de tentativas | migração 0018 |
| 10 | Ferramentas de teste de carga reprodutíveis | `testes-carga/` |

Nenhuma funcionalidade foi removida; nenhum dado é alterado pela migração (só cria índices/funções e ajusta regras
mantendo o mesmo efeito).

## 4. Medições

### Como foi medido (e limites)
- Banco local Postgres 16 com **o mesmo esquema e as mesmas regras de acesso** da produção e **200 clínicas
  sintéticas** (~1 GB: 300 mil pacientes, 1,2 milhão de atendimentos, 1,2 milhão de consultas, 1,2 milhão de mensagens).
- Postgres **preso a 1 núcleo de CPU** e `shared_buffers` de 128 MB, para se aproximar de um servidor pequeno.
- Gerador de carga que faz o que o PostgREST faz (pool de 10 conexões; cada pedido com o papel e a identidade do
  usuário). Usuários virtuais trocam de tela em média a cada **20 s** (uso intenso), com mistura realista de telas e
  10% de gravações. Pedido que espera mais de 10 s conta como erro.
- **Não cobre**: latência de rede até o Supabase, o servidor de Auth, o servidor de Realtime e as Edge Functions;
  o servidor real Nano/Micro é ARM com CPU compartilhada (pode render menos que 1 núcleo dedicado); os dados couberam
  na memória da máquina de teste. O PostgREST real não pôde ser baixado nesta sessão (bloqueado), por isso foi
  emulado. **Os números servem para comparar antes/depois e achar o ponto de saturação, não como garantia de produção.**

### Custo por tela (1 usuário)
| Tela | Antes | Depois |
|---|---|---|
| Início | 44 ms · 1.549 KB | **18 ms · 186 KB** |
| Pacientes | 73 ms · 1.003 KB | **20 ms** · 746 KB |
| Financeiro | 36 ms · 301 KB | **8 ms** · 274 KB |
| Atendimentos | 12 ms · 369 KB | 10 ms · 370 KB |
| Agenda | 8–12 ms · 226 KB | 7–10 ms · 226 KB |
| Apagar um paciente | 98 ms | **5 ms** |

Números do Início **idênticos** antes e depois (teste de equivalência em 6 clínicas × 3 faixas de tempo).

### Carga (1 núcleo de banco, pool 10, uma tela a cada ~20 s por usuário)
| Usuários ativos | Antes | Depois |
|---|---|---|
| 100 | P50 16 · P95 72 · P99 102 ms · 0% erros · CPU 8% | P50 15 · P95 **28** · P99 41 ms · 0% · CPU 3% |
| 500 | P50 58 · P95 **637–1.381** · P99 916–1.827 ms · 0% · CPU 42% · 17 MB/s | P50 15 · P95 **41** · P99 57 ms · 0% · CPU 23% · 7 MB/s |
| 1.000 | P50 **6.788** · P95 10.000 ms · **3,3% erros** · CPU 99% | P50 19 · P95 **72** · P99 118 ms · **0%** · CPU 30% · 13 MB/s |
| 2.000 | P50 10.000 ms · **30% erros** · CPU 99% | P50 350 · P95 3.247 ms · **0%** · CPU 91% |
| 5.000 | — | saturado: 25% erros · CPU 98% |

**Leitura:** com 1 núcleo, o banco passou de ~500 para **~1.500–2.000 usuários ativos ao mesmo tempo** nesse padrão de
uso intenso. Com um padrão mais comum (uma tela por minuto), a mesma CPU atende ~3× mais. Para 5.000 usuários
intensos simultâneos é preciso mais CPU de banco (ver custos) — e um teste em ambiente igual ao de produção.

## 5. Arquitetura recomendada (sem reconstruir nada)

1. **Manter** Vercel (CDN) + Supabase (Postgres, Auth, Realtime, Edge Functions). Não há ganho em pôr Cloudflare na
   frente da Vercel (a Vercel já entrega CDN, Brotli e HTTP/2; HTTP/3 depende do navegador — não verifiquei daqui).
2. **Banco**: consultas por clínica sempre usando índice (feito), somas no banco (feito), listas grandes paginadas no
   servidor (próximo passo: Pacientes ainda baixa a lista inteira — 746 KB com 1.500 pacientes).
3. **Tempo real**: só onde há colaboração ao vivo (contadores, agenda, aprovações, WhatsApp, estoque), com o
   mecanismo econômico (feito). Se passar de milhares de abas abertas, trocar `postgres_changes` por _Broadcast_
   disparado pelo banco (recomendação da própria Supabase para escala).
4. **Cache**: **Redis não se justifica hoje** — os dados são privados de cada clínica (pouco reaproveitamento entre
   usuários), o banco ficou com folga após as correções, e um cache compartilhado exigiria uma camada nova entre o
   site e o banco (mais custo e risco de mostrar dado velho/errado). O próximo cache útil é **no navegador**
   (manter os dados da tela ao navegar e atualizar por evento), sem custo.
5. **Réplica de leitura**: só em plano pago e quando a CPU do banco ficar alta mesmo após otimizar consultas.
6. **Observabilidade**: relatórios nativos do Supabase (CPU, conexões, Realtime) + monitor externo no `/api/saude`
   + rastreamento de erros no navegador (ex.: Sentry, que tem plano gratuito — confirme limites antes).

## 6. Ordem segura para publicar (produção)
1. Banco: aplicar as migrações pendentes **0016 (estoque), 0017 (notificações), 0018 (desempenho)** — só acrescentam.
2. API: publicar a Edge Function `api` (rotas `push` e `saude`, limites de tempo).
3. Testes de regressão no site (versão nova apontando para o banco já atualizado).
4. Site: publicar na Vercel. Conferir `/api/saude` e o painel de Realtime do Supabase.

> O site novo depende das funções criadas na migração 0018: **não publicar o site antes do banco**.

## 7. Custos (só com autorização)
Valores da documentação oficial do Supabase em 17/11/2026 (USD):

| Item | Free (atual) | Pro |
|---|---|---|
| Plano | US$ 0 | **US$ 25/mês** (inclui US$ 10 de crédito de computação = servidor Micro sem custo extra) |
| Conexões de tempo real simultâneas | 200 | 500 incluídas; depois US$ 10 por 1.000 (com limite de gastos desligado) |
| Mensagens de tempo real | 2 milhões/mês | 5 milhões; depois US$ 2,50/milhão |
| Banco | 500 MB | 8 GB; depois US$ 0,125/GB |
| Tráfego de saída | 5 GB | 250 GB; depois US$ 0,09/GB |
| Chamadas de função | 500 mil | 2 milhões; depois US$ 2/milhão |
| Backups | não | diários, 7 dias |
| Pausa por inatividade | sim | não |

Computação adicional (por mês, aproximado): Micro ~US$ 10 · Small ~US$ 15 · Medium ~US$ 60 · Large ~US$ 110 (2 núcleos
dedicados). Vercel e Sentry: confirmar preços na página de cada um antes de contratar.

**Recomendação:** antes de abrir para muitas clínicas, migrar o Supabase para **Pro** (backups, sem pausa, mais
conexões e tráfego). Começar no Micro e subir conforme o relatório de CPU. Nada disso foi contratado.

## 8. Próximos passos sugeridos
1. Teste de carga num **projeto de staging** igual à produção (exige criar um projeto — gratuito no Free, até 2 projetos).
2. Paginar Pacientes no servidor (maior resposta restante).
3. Cache de tela no navegador (sem custo).
4. Monitor de disponibilidade no `/api/saude`: preparado no GitHub Actions (`docs/BACKUP-E-MONITORAMENTO.md`); Sentry fica opcional.
5. Se passar de ~1.000 abas abertas ao mesmo tempo: Realtime por _Broadcast_ e plano com mais conexões.

# Raio-X da Gestão da Clínica

Diagnóstico gratuito de 25 perguntas para donos de clínicas particulares. **É um site à parte**, com endereço, código e
publicação próprios: não faz parte do aplicativo da SCALABLE. Não exige conta, devolve um relatório personalizado (nota,
mapa das cinco dimensões, três prioridades, plano para agora, 30 e 90 dias) e termina com um botão para o site da
plataforma. Toda a análise é determinística: **não usa IA nem serviço pago**.

- Código: `src/`. Banco: `supabase/migrations/0001_diagnostico_raio_x.sql`. Testes: `tests/`.
- Variáveis de build: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a chave pública do projeto) e, opcionalmente,
  `VITE_SCALABLE_URL` (padrão `https://scalablee.vercel.app`), para onde levam "Já tenho conta" e o botão final.
- O site só conversa com o banco pelas funções `diag_*`. Não usa login, sessão nem a biblioteca de autenticação do Supabase.

## A jornada

| Tela | Rota | O que acontece |
| --- | --- | --- |
| Apresentação | `/` | Headline, texto e CTA do briefing. Sem planos nem preços. |
| Identificação | `/identificacao` | Nome, clínica, especialidade, equipe, e-mail e consentimento (obrigatório). Sem telefone. |
| Questionário | `/pergunta/1…25` | Uma pergunta por tela, régua de progresso, voltar e alterar, salvamento automático, atalhos 1–5. |
| Análise | `/analise` | Transição "Estamos organizando os resultados da sua clínica." (o relatório só aparece depois de gravado). |
| Resultado | `/resultado` | Visão geral, mapa, análise por dimensão, três prioridades, plano, comparação (se houver diagnóstico anterior), próximo passo. PDF, refazer e apagar dados. |

O botão "Quero organizar a gestão da minha clínica" leva ao site da SCALABLE (`VITE_SCALABLE_URL`), onde a pessoa cria a
conta pelo cadastro que já existe. Os dois sites não trocam dados: o e-mail e o nome informados aqui não são levados para
lá. A tela de planos da plataforma só abre depois do login, e o diagnóstico não cita preço, plano nem condição comercial.
O site da plataforma precisa estar acessível ao público para o botão funcionar para quem ainda não tem conta.

## Pontuação

- Cada pergunta vale 0 a 3. "Não sei / Não tenho essa informação" é **lacuna de informação**, nunca zero.
- Dimensão (0–15) = `soma das respostas válidas × 15 ÷ (3 × respostas válidas)`. Faixas pela parte inteira:
  0–4 crítica, 5–8 atenção, 9–12 em desenvolvimento, 13–15 bem estabelecida.
- Nota geral (0–100) = mesma fórmula sobre todas as respostas válidas. Faixas: 0–33, 34–59, 60–86, 87–100.
  Sem respostas válidas não há nota (e não vira zero). O relatório mostra o % de informações conhecidas.
- As três prioridades **não são as três menores notas**: `importância da dimensão × distância até 15` + 6 por prática
  inexistente + 2 por prática informal + 5 por "não sei" (+4 para Indicadores quando duas ou mais áreas precisam de atenção).
  Dimensão crítica nunca fica de fora. Cada prioridade mostra os sinais que a colocaram ali e, quando a ordem difere da
  das notas, por quê.

## Conexão com a SCALABLE (só o que existe)

`src/data/capabilities.ts` é o registro do que a plataforma faz hoje, com os arquivos do produto que provam cada recurso.
Como o produto mora em outro repositório, `tests/unit/capabilities.test.ts` lê o checkout dele em `SCALABLEE_DIR` (ou em
`../scalablee`); sem ele, só essas verificações são puladas. Com ele, o teste falha se um arquivo de evidência sumir, se a página não estiver roteada, se o código que
sustenta uma promessa mudar (situações da agenda, funil, horários livres, papéis, prontuário, regras da análise), se um limite
passar a negar um recurso que existe ou se uma capacidade passar a descrever preço ou cobrança.

Hoje **existem**: agenda (com confirmação e falta), pacientes com funil e taxa de conversão, atendimentos, financeiro,
prontuário, equipe com papéis, WhatsApp, central de aprovações e a Coraline AI. **Não existem**: cadastro de metas,
projeção financeira, registro de reclamações ou satisfação, procedimentos da equipe, reuniões, taxa de faltas e relatório
de agenda ociosa. O relatório diz isso, em vez de prometer. Partes que dependem da IA estar ativada (respostas elaboradas do
WhatsApp, Coraline AI completa) estão marcadas como tal. A confirmação de consulta abre o WhatsApp com a mensagem pronta: o envio é manual.

> Revisar `capabilities.ts` sempre que o produto mudar. Se a IA já estiver ativa em produção, as ressalvas `ai` podem ser suavizadas.

## Dados, segurança e LGPD

- As quatro tabelas (`diagnostic_sessions`, `_answers`, `_results`, `_events`) têm **RLS ligada e nenhuma política**;
  anon e authenticated não leem nem escrevem nada direto (privilégios revogados).
- Todo acesso passa por funções `SECURITY DEFINER` (`diag_start`, `diag_save_answer`, `diag_get`, `diag_complete`,
  `diag_track`, `diag_delete`). A sessão é identificada por um **token secreto** de 64 caracteres, gerado no banco,
  devolvido uma única vez e guardado só como hash SHA-256. Sem o token não se lê, altera ou apaga nada. Token errado e
  token de outra pessoa respondem igual.
- A pontuação é **recalculada no banco**; o relatório (texto) vem do navegador. Um teste compara banco e front-end em 500 respostas.
- Nenhuma chave privada vai ao navegador. Só a chave pública (`VITE_SUPABASE_ANON_KEY`), que protege nada por si: quem protege os dados é o RLS.
- Consentimento obrigatório e versionado (`consent_version`); contato de marketing é opt-in separado e desmarcado.
- Direito de exclusão: "Apagar meus dados" no relatório apaga no servidor todos os diagnósticos deste navegador e limpa o
  armazenamento local. Retenção: `select public.diagnostic_purge('365 days')` (service role; mínimo de 30 dias).
- Limites contra abuso: 10 sessões por e-mail por hora, 3000 por hora no total, 200 eventos por sessão.
  Não há CAPTCHA. Se houver abuso, avaliar Cloudflare Turnstile (gratuito).
- O histórico para comparar diagnósticos fica **neste navegador**. Não há login do diagnóstico nem recuperação por e-mail
  e não há lembretes automáticos.

## Aplicar a migração

O site usa o mesmo projeto Supabase da SCALABLE, mas só os objetos `diagnostic_*` e `diag_*` (a migração é aditiva e não toca
em nenhuma tabela do produto; foi testada em Postgres local, inclusive depois das migrações reais do produto). Sem ela, o
botão "Começar as 25 perguntas" mostra erro de servidor.

```bash
supabase db push        # ou cole supabase/migrations/0001_diagnostico_raio_x.sql no SQL Editor do projeto
```

Conferência depois de aplicar (todas devem passar):

```sql
select relname, relrowsecurity from pg_class where relname like 'diagnostic_%' and relkind = 'r';  -- 4 linhas, true
select count(*) from pg_policies where tablename like 'diagnostic_%';                             -- 0
select has_table_privilege('anon', 'public.diagnostic_sessions', 'select');                        -- false
select has_function_privilege('anon', 'public.diagnostic_metrics()', 'execute');                   -- false
```

Desfazer (apaga os dados coletados): `drop table public.diagnostic_events, public.diagnostic_results, public.diagnostic_answers, public.diagnostic_sessions cascade;`
e `drop function` das funções `diag_*` e `diagnostic_*`.

## Eventos e métricas

`select public.diagnostic_metrics();` (service role / SQL Editor) devolve:

- `started` (sessões criadas, já com consentimento), `completed`, `completion_rate`;
- `abandonment_by_last_question`: onde quem não terminou parou (0 = nenhuma resposta);
- `score_distribution`, `overall_bands`, `dimension_bands`;
- `frequent_problems`: por pergunta, % de respostas fracas (0 ou 1) e % de "não sei";
- `report_viewed`, `pdf_downloaded`, `retake_started`, `cta_clicked` (sessões distintas). `signup_started` existe no banco, mas este site
não o registra: o cadastro acontece em outro site, sem integração.

Não são medidos: visitantes que não iniciaram (sem consentimento) e **assinaturas**. Não existe integração que ligue o
diagnóstico a uma assinatura, então `subscriptions_from_diagnostic` é `null`. Clique no botão final não é contado como cadastro nem como assinatura.

## Testes

```bash
npm test            # motor, conteúdo, PDF e banco (Postgres real via PGlite)
npm run test:e2e    # jornada completa em Chromium, desktop e celular, contra a migração real
```

O teste de ponta a ponta builda o site, serve o build com os cabeçalhos reais do `vercel.json` (inclusive a CSP de produção),
sobe um servidor local que executa a migração e percorre a jornada. Não toca o Supabase de produção.

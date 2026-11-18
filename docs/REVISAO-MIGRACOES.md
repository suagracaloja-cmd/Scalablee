# Revisão das migrações 0016, 0017 e 0018 (antes de aplicar no banco de produção)

**Situação:** nenhuma das três foi aplicada na produção. Este documento serve para você revisar e aprovar.
Os arquivos estão em `supabase/migrations/`. Os scripts de reversão, que **não foram executados**, estão em `supabase/rollback/`.

## Resumo

| Migração | O que faz | Mexe em dados que já existem? | Tempo no ensaio | Dá para desfazer? |
|---|---|---|---|---|
| **0016 Estoque** | Cria 2 tabelas novas (itens e histórico) e 1 função (entrada, saída e conferência) | **Não.** Só cria coisas novas | 52 ms | Sim |
| **0017 Notificações** | Cria 2 tabelas novas (aparelhos com notificação ativa e chave de envio) e 3 funções | **Não.** Só cria coisas novas | 46 ms | Sim |
| **0018 Desempenho** | Cria 26 índices e 3 funções de soma. Reescreve 3 regras de acesso das "novidades" com o mesmo efeito | **Não muda nenhum dado** | 65 ms | Sim, sem perda de dados |

Nenhuma das três contém `DELETE`, `UPDATE`, `DROP` ou `TRUNCATE` sobre tabelas que já existem.
O único `DELETE` (na 0017) age só sobre a tabela nova de aparelhos. Ele é explicado no item **A** abaixo.

## Como foi verificado

Ensaio no banco local (PostgreSQL), sem tocar na produção:

1. Montei o banco com todas as migrações até a 0015 e dados de exemplo. Depois apliquei a 0016, a 0017 e a 0018,
   cada uma **numa transação só**, como o Supabase faz: ou entra tudo, ou nada entra.
2. Comparei o conteúdo das **25 tabelas existentes** antes e depois, linha a linha, por soma de verificação (md5).
   O resultado foi **idêntico**.
3. Simulei a aplicação repetida por engano:
   - a 0016 e a 0017 **recusam** ("já existe") e não mudam nada;
   - a 0018 pode rodar de novo sem efeito.
4. Testei os 3 scripts de reversão. Depois de cada um, a estrutura do banco ficou **idêntica** à de antes da migração.
5. Rodei 13 suítes de testes automáticos no banco já com as 3 migrações. Foram **348 verificações, 0 falhas**.
   Isso inclui isolamento entre clínicas: uma clínica nunca vê nem soma dados de outra.
6. No banco de teste com 200 clínicas sintéticas (≈ 1 GB), os números do Início calculados pelas funções novas
   saíram **idênticos** aos do cálculo antigo, em todas as clínicas e nas faixas de 7, 30 e 90 dias.

## O que retirei depois da revisão (para não apagar nada sem a sua autorização)

1. **0018: limpeza automática da tabela `limites_uso`** (os contadores do limite de tentativas). Ela apagaria
   contadores antigos de vez em quando. Saiu, e a função atual da produção continua igual.
   Sem a limpeza, a tabela cresce devagar: uma linha por endereço/rota, algo como **0,2 MB por mês** com o monitor
   ligado. O alerta de tamanho do banco avisa se isso virar problema. A decisão fica com você.
2. **0017: limite de 10 aparelhos por pessoa** (os mais antigos seriam apagados). Saiu. Agora não há limite.
   Cada aparelho ocupa uma linha pequena.

## Pontos que removem registros e precisam do seu OK

Nenhum deles toca em pacientes, atendimentos, prontuário ou financeiro. Todos agem **só** sobre a lista de aparelhos
com notificação ativa. A recomendação é aprovar os quatro.

- **A. Aparelho compartilhado (0017, função `push_inscrever`).** Se alguém ativa as notificações num navegador que
  estava registrado para outra pessoa (ex.: o computador da recepção), o registro antigo **desse navegador** é
  trocado pelo novo. Motivo: senão quem saiu continuaria recebendo, naquele aparelho, avisos de mensagens
  e aprovações da clínica. É uma questão de privacidade.
- **B. Aparelho que não existe mais (API, `push.ts`).** Às vezes o Google, a Apple ou a Mozilla respondem
  "este aparelho não existe mais" (navegador desinstalado ou notificação bloqueada). Às vezes há 20 falhas seguidas.
  Nesses casos o registro daquele aparelho é removido. Sem isso, a lista acumula aparelhos mortos e cada aviso
  gasta tentativas inúteis.
- **C. Botões "Desativar notificações" e "Sair" (site).** Removem o registro **do próprio aparelho** em que a pessoa
  está. É o que a pessoa pediu.
- **D. Exclusão de conta (automático, igual ao que já acontece hoje).** Quando o dono exclui a conta da clínica,
  função que já existe por causa da LGPD, os itens e o histórico de estoque da clínica são apagados junto.
  Se um login é excluído, os aparelhos dele também saem.

## Migração 0016 — Estoque

| Comando | Em linguagem simples |
|---|---|
| `create table estoque_itens` | Lista de materiais e medicamentos da clínica: nome, categoria, unidade, quantidade, mínimo, validade, custo, fornecedor e observações. Quantidade e mínimo nunca ficam negativos. |
| `create unique index estoque_itens_nome_unico` | Impede dois itens **ativos** com o mesmo nome na mesma clínica (ex.: duas "Luva M"), o que confundiria a contagem. |
| `create table estoque_movimentos` | Histórico de cada entrada, saída e conferência, com saldo, motivo, quem fez e quando. |
| `enable row level security` + `revoke all` | Fecha as tabelas por padrão: sem uma regra explícita, ninguém lê nem grava. |
| `grant select` / `grant insert (…)` / `grant update (…)` | A equipe pode ler. Cadastrar e editar libera só colunas específicas. **A quantidade fica de fora**: ela só muda pela função abaixo, que registra tudo no histórico. |
| 4 `create policy` | Cada clínica vê só o próprio estoque. Só **dono e recepção** cadastram e editam itens. |
| `create function estoque_movimentar` | Faz entrada, saída ou conferência numa operação só: confere a clínica e o papel da pessoa, bloqueia saída maior que o estoque ("Saída maior que o estoque: há só 2 caixa") e grava o histórico. A conferência (ajuste) é só para dono e recepção. |
| `revoke/grant execute` | Visitante sem login não executa a função. |

## Migração 0017 — Notificações no celular (Web Push, gratuito)

| Comando | Em linguagem simples |
|---|---|
| `create table push_inscricoes` | Aparelhos em que alguém ativou as notificações: o endereço do serviço de push do navegador e as chaves públicas do aparelho. Guarda também se a pessoa quer avisos de WhatsApp e/ou de aprovações. **Não guarda conteúdo de mensagens.** |
| `enable row level security` + `revoke all` + 3 `create policy` | Cada pessoa vê, ajusta e apaga **só os próprios** aparelhos. Gravar um aparelho novo só pela função abaixo. |
| `create function push_inscrever` | Ativa as notificações no aparelho. Confere o login e o formato das chaves. Inclui o `delete` do item **A** acima, que só age sobre o mesmo navegador. |
| `create table push_chaves` | Guarda o par de chaves de envio da Scalable (VAPID), que identifica o remetente para Google, Apple e Mozilla. A chave privada fica **criptografada** com a chave do Vault que já existe. Ninguém do site lê: só o servidor. |
| `push_chaves_criar` / `push_chaves_obter` | Usadas só pelo servidor (papel `service_role`). Criam o par de chaves no primeiro uso e o leem para enviar. |

## Migração 0018 — Desempenho

| Parte | Em linguagem simples |
|---|---|
| 1) 21 índices em ligações entre tabelas | Sem eles, apagar um paciente faz o banco ler a tabela **inteira** de atendimentos, tarefas e conversas de **todas** as clínicas. No teste com 200 clínicas, apagar um paciente caiu de 98 ms para 5 ms. A maioria é "parcial" (ignora linhas vazias) e por isso ocupa pouco espaço. |
| 2) 3 índices de listas | Pacientes, aprovações e conversas abrem já na ordem certa, sem ordenar tudo a cada vez. |
| 3) Regras das "novidades" | Mesma regra, calculada uma vez por consulta em vez de uma vez por linha. Foi um alerta do próprio Supabase. Texto antes e depois abaixo. |
| 4) 3 funções de soma | O Início, Pacientes e Financeiro passam a receber os totais já somados, em vez de baixar milhares de atendimentos para somar no navegador. Exemplo: o Início caiu de 296 KB para 11 KB por clínica. As funções usam as **mesmas regras de acesso de quem chama**, então cada clínica só soma o que é dela. Visitante sem login não executa. |
| 5) 2 índices de cobertura | As somas leem só o índice, sem abrir cada linha. |

**Regras das "novidades": texto lido da produção em 18/11/2026, antes da 0018 → depois da 0018**

| Regra | Antes | Depois |
|---|---|---|
| ver a própria | `user_id = auth.uid()` | `user_id = (select auth.uid())` |
| assinar / alterar a própria | `user_id = auth.uid() and email = (auth.jwt() ->> 'email') and (company_id is null or company_id = my_company_id())` | o mesmo, com `(select auth.uid())`, `(select auth.jwt())` e `(select my_company_id())` |

O efeito é idêntico. Só muda a quantidade de vezes que o banco faz o cálculo.

## Riscos e cuidados ao aplicar

- **Trava breve ao criar índices.** Enquanto um índice é criado, a tabela não aceita gravações. As tabelas da
  produção são pequenas (banco com cerca de 15 MB) e, no ensaio, as 3 migrações levaram ao todo **cerca de 0,16 s**.
  Mesmo assim, recomendo aplicar fora do horário de atendimento das clínicas.
- **Ordem obrigatória:** 0016 → 0017 → 0018 → API (servidor) → site.
  - Site novo antes da 0018: o Início, Pacientes e Financeiro ficam sem números.
  - API nova antes da 0017: só as notificações falham. O resto funciona.
- **O que não pude confirmar na produção.** A consulta de leitura que faria a conferência foi negada nesta sessão.
  Ela confere duas coisas:
  1. se a chave do Vault `scalable_chave_dados` existe. A 0010 a criou, então deve existir. Sem ela, a 0017
     aplica, mas a chave de envio não seria criada;
  2. se não há índices criados à mão com os mesmos nomes. Se houver, a 0018 simplesmente os mantém.

  A consulta está no fim deste documento. Ela **só lê** o catálogo do banco e posso rodá-la antes de aplicar,
  se você autorizar.

## Como desfazer (scripts prontos, NÃO executados)

| Arquivo | Efeito | Apaga dados? |
|---|---|---|
| `supabase/rollback/0018_desfazer.sql` | Remove índices e funções de soma e devolve o texto antigo das regras das novidades | **Não** |
| `supabase/rollback/0017_remover.sql` | Remove as tabelas de notificações | **Sim:** a lista de aparelhos (cada pessoa só reativa) |
| `supabase/rollback/0016_remover.sql` | Remove o estoque | **Sim:** todos os itens e o histórico de estoque |

**Caminho preferido, sem apagar nada:** voltar o site e a API para a versão anterior (Vercel → Deployments →
versão anterior → *Promote*). As tabelas novas ficam paradas, sem uso, e nada se perde.
Os scripts que apagam só devem ser usados com a sua autorização expressa e **depois** de um backup.

## O que preciso de você

1. Aprovar as três migrações, ou pedir ajustes.
2. Aprovar os pontos **A, B, C e D**, ou dizer qual não quer.
3. Decidir sobre a limpeza da `limites_uso` e o limite de aparelhos por pessoa (hoje os dois estão fora).
4. Se quiser, autorizar a consulta de conferência abaixo. Ela só lê.

### Consulta de conferência (somente leitura)

```sql
select 'chave do Vault' as item, case when exists (select 1 from vault.secrets where name = 'scalable_chave_dados') then 'existe' else 'FALTANDO' end as situacao
union all
select 'tabela já existe: ' || n, 'ATENÇÃO' from (values ('estoque_itens'), ('estoque_movimentos'), ('push_inscricoes'), ('push_chaves')) t(n) where to_regclass('public.' || n) is not null
union all
select 'índice com mesmo nome: ' || indexname, 'será mantido' from pg_indexes where schemaname = 'public' and indexname in (
  'sales_customer_id','tasks_customer_id','conversations_customer_id','approvals_customer_id','approvals_conversation_id','approvals_message_id',
  'approvals_thread_id','approvals_decided_by','messages_company_created','anamneses_customer_id','evolucoes_customer_id','evolucoes_agendamento_id',
  'evolucoes_profissional_id','evolucoes_retifica_id','agendamentos_servico_id','agendamentos_criado_por','agent_threads_user_id','profissionais_user_id',
  'convites_criado_por','billing_events_company_id','inscricoes_novidades_company_id','customers_company_criado','approvals_company_status_criado',
  'conversations_company_ultima','sales_company_status_data','sales_pagos_por_paciente')
union all
select 'tamanho do banco', pg_size_pretty(pg_database_size(current_database()));
```

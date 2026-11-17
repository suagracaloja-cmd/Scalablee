# Testes de carga da Scalable

Medem o banco do jeito que o Supabase o usa: pool fixo de conexões (como o PostgREST), cada pedido numa
transação com o papel `authenticated` e a identidade do usuário (as regras de acesso/RLS de verdade).
**Nunca rode contra produção.** Use um Postgres local (ou um projeto de teste) com as migrações aplicadas.

## Preparar
1. Postgres 15+ local com um banco `carga` e todas as migrações de `supabase/migrations` aplicadas
   (com os esquemas `auth`, `extensions` e `vault` simulados, como no Supabase).
2. `psql -d carga -f dados.sql` — cria 200 clínicas sintéticas (≈1 GB: pacientes, atendimentos, agenda,
   WhatsApp, financeiro, estoque) com o volume de 1–2 anos de uso intenso.
3. `npm install` nesta pasta (só instala o `pg`).
4. Para simular um servidor pequeno, prenda o Postgres a 1 núcleo: `taskset -a -cp 0 <pid de cada processo postgres>`.

## Rodar
- Custo de cada tela para um usuário: `PGPASSWORD=... node medir.mjs` (antes) e `ACOES=./acoes-depois.mjs ...`
- Carga: `PGPASSWORD=... USUARIOS=1000 SEGUNDOS=60 ACOES=./acoes-depois.mjs node carga.mjs`
  (`POOL` = conexões do pool, padrão 10; `PAUSA` = segundos médios entre telas por usuário, padrão 20)
- Números do Início iguais antes/depois: `node equivalencia.mjs`

Resultados e limites desta medição: veja `docs/ESCALABILIDADE.md`.

# Raio-X da Gestão da Clínica

Site à parte, gratuito e sem cadastro, onde o dono de uma clínica responde 25 perguntas e recebe um relatório com nota,
mapa das cinco áreas da gestão, três prioridades e um plano para agora, 30 e 90 dias. Feito pela SCALABLE.

Toda a análise é determinística, sem IA e sem serviço pago. Detalhes, pontuação, segurança, LGPD e métricas em
[`docs/raio-x.md`](docs/raio-x.md).

## Rodar e testar

```bash
npm install
cp .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
npm test                     # motor, conteúdo, PDF e banco (Postgres real em memória)
npm run test:e2e             # jornada completa em Chromium, desktop e celular
```

## Publicar (Vercel)

Projeto Vite comum: `npm run build`, saída em `dist`. Variáveis de ambiente do projeto:

| Variável | Para quê |
| --- | --- |
| `VITE_SUPABASE_URL` | Endereço do projeto Supabase com a migração aplicada |
| `VITE_SUPABASE_ANON_KEY` | Chave pública do mesmo projeto |
| `VITE_SCALABLE_URL` | Opcional. Site da SCALABLE (padrão `https://scalablee.vercel.app`) |

A CSP em `vercel.json` só libera conexão com o projeto Supabase `tmaywgdxfveczoxxrpur`. Se o site passar a usar outro
projeto, troque o endereço lá.

## Banco

`supabase/migrations/0001_diagnostico_raio_x.sql` cria quatro tabelas com RLS e sem políticas e as funções `diag_*`. Veja
"Aplicar a migração" em `docs/raio-x.md`.

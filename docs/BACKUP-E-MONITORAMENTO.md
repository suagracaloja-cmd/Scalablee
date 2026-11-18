# Backup externo e monitoramento (grátis)

Tudo roda no **GitHub Actions** do próprio repositório da Scalable, sem contratar nada. Não usa nenhum serviço
de terceiros cujas condições de uso comercial no plano grátis eu não tenha conseguido confirmar.

| Rotina | Arquivo | Quando roda | O que faz |
|---|---|---|---|
| Backup do banco | `.github/workflows/backup-banco.yml` | todo dia, ~03:23 (Brasília) | Copia o banco inteiro, criptografa com AES-256 e guarda por 30 dias. Mede o tamanho do banco. |
| Monitor | `.github/workflows/monitor.yml` | de hora em hora | Confere se o site e a API (com o banco) respondem. Se caírem, abre um aviso. Quando voltam, fecha o aviso. |

**Avisos:** chegam como *Issues* no repositório, e o GitHub manda **e-mail** para quem acompanha o repositório.
Para garantir o e-mail, entre no repositório, clique em **Watch** e escolha **All Activity**.
O aviso abre **uma vez** quando o problema começa e fecha sozinho quando resolve, sem e-mail repetido a cada hora.

## Custos e limites (plano grátis do GitHub)

Pela documentação do GitHub que conheço, um repositório privado no plano grátis inclui **2.000 minutos de rotinas
por mês** e **500 MB** para guardar arquivos das rotinas. Não consegui abrir a página de cobrança do GitHub nesta
sessão para reconfirmar. Confira em **Settings → Billing and plans** da sua conta.

| Item | Estimativa |
|---|---|
| Monitor: 24 × 30 execuções de ~1 min | ~720 min/mês |
| Backup: 30 execuções de ~3 min | ~90 min/mês |
| **Total** | **~810 de 2.000 min/mês (~40%)** |
| Espaço dos backups (30 cópias criptografadas) | O banco hoje tem ~15 MB, então algumas dezenas de MB de 500 MB. A rotina mede isso todo dia e avisa a partir de 400 MB. |

**Para nunca haver cobrança:** em **Settings → Billing and plans → Budgets and alerts**, confira que o orçamento de
*Actions* está em **US$ 0** e que a opção de parar o uso ao atingir o limite está ligada. Assim, se a cota grátis
acabar, as rotinas param até o mês seguinte em vez de cobrar.

## Como ativar (passos seus, uns 10 minutos)

> Não cole senhas no chat. Elas vão direto no GitHub, em um campo protegido.

1. **Crie a frase secreta do backup.** Use pelo menos 20 caracteres; o ideal são 5 ou 6 palavras aleatórias.
   Guarde-a num gerenciador de senhas ou anotada num lugar seguro.
   **Sem ela, os backups não abrem.** Nem eu nem o GitHub conseguimos recuperá-la.
2. **Pegue o endereço de conexão do banco.**
   - No Supabase, abra o projeto, clique em **Connect** e escolha **Session pooler**. Copie o endereço
     (começa com `postgresql://postgres.tmaywgdxfveczoxxrpur:`) e troque `[YOUR-PASSWORD]` pela senha do banco.
   - Use o *Session pooler*, não a conexão direta: no plano grátis a conexão direta só funciona por IPv6, e os
     servidores do GitHub não têm IPv6.
   - Se não lembrar a senha do banco: **Project Settings → Database → Reset database password**. Trocar essa senha
     **não afeta** o site nem a API da Scalable, que usam chaves de API e não essa senha. Prefira uma senha só com
     letras e números, para não precisar "codificar" símbolos no endereço.
3. **Cadastre os dois segredos no GitHub:** repositório → **Settings → Secrets and variables → Actions →
   New repository secret**.
   - `SUPABASE_DB_URL`: o endereço do passo 2, já com a senha;
   - `BACKUP_PASSPHRASE`: a frase do passo 1.
4. **Ponha as rotinas na branch principal (`main`).** O GitHub só roda rotinas agendadas que estão na `main`.
   Isso é feito por um *pull request*, que só abro e junto com a sua autorização. O projeto da Vercel **não está
   ligado ao GitHub** (conferi), então juntar na `main` **não publica** o site.
5. **Teste o backup:** aba **Actions → Backup diário do banco → Run workflow**. Em ~3 minutos deve aparecer verde,
   com um arquivo `scalable-banco-AAAA-MM-DD.tar.gz.gpg` em *Artifacts*.
6. **Monitor:** ligue **depois** de publicar a API nova, que é a que tem a rota `/api/saude`. Antes disso o monitor
   abriria um aviso falso ("API 404"). Se as rotinas entrarem na `main` antes, desligue o monitor em
   **Actions → Monitor do site e da API → ⋯ → Disable workflow** e religue depois.

## O que o backup inclui e o que fica de fora

**Inclui** (ferramenta oficial `supabase db dump`, mesmo método da documentação do Supabase):
- `roles.sql`: papéis do banco;
- `schema.sql`: estrutura (tabelas, regras de acesso, funções, índices, gatilhos);
- `data.sql`: **todos os dados**, inclusive os logins (`auth.users`). É por isso que vai criptografado.

**Fica de fora** (guarde à parte, num gerenciador de senhas):
- **A chave do Vault `scalable_chave_dados`** (Supabase → Integrations → Vault). Ela cifra os tokens do WhatsApp
  das clínicas e a chave de envio das notificações. Sem ela, numa restauração em projeto novo, as clínicas só
  precisariam reconectar o WhatsApp e reativar as notificações. **Pacientes, atendimentos, prontuário e financeiro
  não dependem dela.**
- **Os segredos das funções** (Mercado Pago, Groq, Anthropic etc.), que ficam nas configurações do Supabase.
- **Arquivos enviados** (logos/fotos no Storage): o backup leva só o registro deles, não as imagens.

## Como abrir um backup

1. **Actions → Backup diário do banco →** escolha o dia **→ Artifacts →** baixe. O GitHub entrega um `.zip`.
2. Descompacte o `.zip` e, no terminal, rode `gpg -d scalable-banco-AAAA-MM-DD.tar.gz.gpg | tar -xzf -`.
   Ele pede a frase secreta e gera `roles.sql`, `schema.sql` e `data.sql`.
   - No Windows: instale o Gpg4win (grátis) para abrir o `.gpg` e use o 7-Zip para o `.tar.gz`.

## Como restaurar (num projeto **novo** do Supabase, nunca por cima da produção sem planejar)

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "postgresql://…endereço do projeto NOVO…"
```

Depois, cadastre no projeto novo a chave do Vault e os segredos das funções, e aponte o site e a API para ele.

## O que foi testado aqui (sem tocar na produção)

| Teste | Resultado |
|---|---|
| Backup → criptografia → abertura → **restauração num banco vazio** (banco local) | Conteúdo **idêntico** nas 30 tabelas (`public` + `auth`); mesmas 37 regras de acesso, 32 funções, 92 índices e 6 gatilhos |
| Arquivo criptografado | Sem nenhum texto legível; **senha errada é recusada** |
| Monitor: tudo no ar · API/banco fora · continua fora · site com página errada · tudo voltou · servidor sem resposta | Abre **um** aviso, não repete, e fecha quando volta. Os 6 cenários se comportaram como esperado. |
| Validação das rotinas (actionlint + shellcheck) | Sem problemas |

O teste real no GitHub (passo 5) só pode ser feito depois que os segredos e as rotinas estiverem lá.

## O que o GitHub não mede (confira 1×/semana em Supabase → Organization → Usage)

| Limite do plano grátis | Hora de planejar o Pro (US$ 25/mês) |
|---|---|
| Banco: 500 MB | **> 400 MB** (o backup avisa sozinho) |
| Tráfego de saída: 5 GB/mês | > 4 GB/mês por 2 meses seguidos |
| Chamadas de funções: 500 mil/mês | > 400 mil/mês |
| Conexões em tempo real: 200 simultâneas | pico > 170 |

O monitor também ajuda a evitar a **pausa por inatividade** do plano grátis, porque a verificação de hora em hora
consulta o banco. Mais detalhes em `docs/ESCALABILIDADE.md`.

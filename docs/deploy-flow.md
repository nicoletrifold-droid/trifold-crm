# Deploy Flow — Trifold CRM

> **Reescrito pela Story 900-3c (2026-08-29).** A versão anterior estava errada em toda linha:
> rotulava **produção** (`dsopqkqjkmhytudaaolv`) como "Staging", dizia que produção era "(a
> criar)", citava uma branch `staging` que nunca existiu, e mandava rodar
> `./scripts/sync-schema.sh staging` — sintaxe que o próprio script não aceitava (ele exigia
> `--env <valor>`), num script que nunca rodou neste repositório e que esta story **deletou**.

---

## Ambientes — são dois, e os dois são reais

| Ambiente | Projeto Supabase | Onde é usado | Canal de mensagem |
|---|---|---|---|
| **Teste** (default do repositório) | `xnxvygyfyyyzwhiuoehz` (`trifold-crm-dev`) | `pnpm dev`, `pnpm reset:testdb`, testes cross-tenant do Epic 900 | Telegram |
| **Produção** | `dsopqkqjkmhytudaaolv` | Vercel, `pnpm dev:prod` | WhatsApp Cloud API |

**Não existe branch `staging`.** Só `main` deploya. O "staging" deste projeto é o ambiente de
**teste** acima, e ele não recebe deploy automático de nada — é banco, não site.

A definição de "que ref é qual" mora num lugar só:
`packages/shared/src/constants/supabase-refs.ts`. Ela é **allowlist dos dois lados** (produção
e teste) e falha fechada: um ref que não está em nenhuma das duas listas é recusado, não
presumido inofensivo. Não duplique essa definição em script, teste ou workflow novo — importe.

⚠️ **A CLI do `supabase` é a exceção: o repositório não governa o alvo dela.** Quem governa é
o projeto linkado em `supabase/.temp/project-ref` (por máquina, não versionado). Rode uma vez:
`supabase link --project-ref xnxvygyfyyyzwhiuoehz`, e confira com `pnpm supabase:check` (sai
`1` se o link estiver apontando para produção).

---

## Variáveis de ambiente

**Nomes vivem no repositório; valores, nunca.**

| Arquivo | Quem lê | Ambiente |
|---|---|---|
| `.env.teste` (raiz) | scripts de `scripts/`, via `scripts/lib/db-env.ts` | teste |
| `.env.producao` (raiz) | idem, só sob `TRIFOLD_ENV=producao` | produção |
| `packages/web/.env.development` | `pnpm dev` | teste |
| `packages/web/.env.producao.local` | `pnpm dev:prod` | produção |

Duas chaves independentes protegem escrita em produção pelos scripts: `TRIFOLD_ENV=producao`
escolhe o ambiente, e `TRIFOLD_ALLOW_PROD=1` é exigida a mais quando o script **escreve**.
A mensagem de recusa sempre nomeia qual das guardas barrou.

### Vercel

⚠️ **Nunca use `vercel env add` por stdin/pipe** (`echo x | vercel env add …`): ele grava valor
**vazio** em silêncio. Já causou dois incidentes. Use a REST API — helper pronto em
`scripts/vercel-env-set.sh`. Mudança de variável só vale depois de `vercel redeploy`.

---

## Migrations — como uma migration chega em produção

Este repositório **não usa `supabase db push`**, e não é preferência:

1. `supabase_migrations.schema_migrations` está **congelada na 168** em produção — o `push`
   consideraria ~80 migrations pendentes e tentaria reaplicar tudo.
2. A chave do `push` é o **prefixo numérico**, e há **22 prefixos duplicados** aqui (mais
   variantes com sufixo de letra, como `024b_`, `028a_`, `028b_`).
3. Os arquivos `_remote_only.sql` com `CREATE INDEX CONCURRENTLY` abortam com `25001` dentro
   da transação por arquivo do `push`.

O registro de "o que foi aplicado onde" é a tabela `trifold_migrations_aplicadas`
(migration `245`), chaveada por **arquivo** e com `sha256` do conteúdo. Ela precisa ser
aplicada à mão **uma vez por ambiente** — runbook em
`docs/runbooks/aplicar-245-registro-migrations.md`. Depois disso, nenhuma migration volta a
precisar de aplicação manual.

### O fluxo, ponta a ponta

```bash
# 1. Escreva a migration. Confirme que o número está livre em TODAS as refs, não só na main:
git fetch --prune origin
for r in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin); do
  git ls-tree --name-only "$r" -- supabase/migrations/ 2>/dev/null | sed 's|.*/||'
done | grep -oE "^[0-9]{3}[a-z]?_" | sort -u | tail

# 2. Veja o estado do banco de TESTE.
pnpm db:status

# 3. Aplique no TESTE e teste de verdade contra ele.
pnpm db:apply

# 4. Abra o PR. O job `migrations-do-pr` do CI comenta o estado — sempre, mesmo quando
#    não consegue verificar. Ausência de comentário significa "o job não rodou".

# 5. Depois do merge, aplique em PRODUÇÃO. O operador digita o REF do projeto para
#    confirmar; `--yes` é recusado aqui.
TRIFOLD_ENV=producao TRIFOLD_ALLOW_PROD=1 pnpm db:apply
```

**Migration que já foi aplicada não se edita.** O `sha256` do ledger detecta a edição, o
`db:status` a nomeia como `ALTERADA-APÓS-APLICAR`, e o `db:apply` **recusa o comando inteiro**
(exit 1, sem aplicar nada). A correção é uma migration **nova**.

### Contrato de exit code

| Comando | `0` | `1` |
|---|---|---|
| `pnpm db:status` | sempre que a tabela do ledger existir, **qualquer** que seja o veredito por arquivo (é relatório, não gate) | só quando a tabela **não existir** — nomeando-a e apontando o runbook |
| `pnpm db:apply` | aplicou (ou não havia nada pendente) | tabela ausente · alguma `ALTERADA-APÓS-APLICAR` · falha ao aplicar · confirmação recusada |

### Reconstruir o banco de teste do zero

```bash
pnpm reset:testdb              # DRY-RUN por padrão: mostra o plano, não apaga nada
pnpm reset:testdb --confirmar  # destrói e reconstrói (~465s, medido)
```

Ele reaplica as 268 migrations em ordem lexicográfica — o que também **prova**, a cada
execução, que a sequência é reproduzível — e ao final popula o ledger (`via='reset'`, e
`via='reset-falha-conhecida'` para as entradas de `FALHAS_CONHECIDAS` que falharam como
previsto). É o **mesmo banco** onde as pessoas rodam `pnpm dev`: por isso o default é
dry-run e a confirmação imprime contagem de orgs, de leads e o `max(created_at)` antes de
perguntar.

---

## Deploy da aplicação

| Item | Valor |
|---|---|
| Branch que deploya | `main` |
| Root do projeto na Vercel | `packages/web` |
| Install | `cd ../.. && pnpm install --no-frozen-lockfile` |
| Build | `cd ../.. && pnpm turbo build --filter=@trifold/web` |
| Região | `gru1` |
| Crons | 37, definidos em `packages/web/vercel.json` |

⚠️ **Caveat conhecido e deferido:** `scripts/check-deploy-drift.sh` enxerga **um** projeto
Vercel, e há mais de um projeto buildando `main` — o efeito é cron disparando em duplicidade.
Está registrado como item deferido da Onda 1 no Epic 900 (story dedicada, fora desta fatia).

### Ordem quando o PR traz migration

**Migration primeiro, deploy depois.** Código novo que lê tabela inexistente costuma falhar
no caminho silencioso (fail-open) e a feature "parece funcionar" sem nunca ter funcionado —
foi assim no PR #513/Story 90-1, e é a razão de os runbooks de `docs/runbooks/` existirem.

---

## Seeds

```bash
pnpm seed                               # org, users, stages, prompts
pnpm tsx scripts/seed-properties.ts     # Vind + Yarden
pnpm tsx scripts/seed-knowledge-base.ts # FAQ
```

---

## CI

`.github/workflows/ci.yml` — **nunca reescreva este arquivo, acrescente job.**

| Job | O que faz | Bloqueia? |
|---|---|---|
| `static` | `type-check` · `lint` · `test` | **sim** |
| `tenancy-gate` | catraca de isolamento multi-tenant; comenta no PR | não (`900-18` trava) |
| `migrations-do-pr` | `pnpm db:status` (leitura pura) e avisa se a migration do PR não está aplicada no teste | não |

O `migrations-do-pr` **não escreve no banco de teste** — nada de `db:apply`, `reset:testdb` ou
`--confirmar` na CI. Ele lê e comenta. E comenta **sempre**, com três estados nomeados
(pendente / limpo / não-foi-possível-verificar), porque um aviso que nunca aparece é
indistinguível de um aviso que não era necessário.

# `scripts/`

Scripts operacionais do Trifold CRM, rodados com `tsx` (ex.: `npx tsx scripts/<nome>.ts`).

---

## ⚠️ Ambientes — leia antes de rodar qualquer coisa

Existem **três** projetos Supabase na organização `trifold`, e confundi-los é a forma mais
barata de causar um incidente:

| Projeto | Papel | Pode receber dado real? |
|---|---|---|
| `Trifold` | **PRODUÇÃO** — clientes reais | é a origem dele |
| `trifold-crm-dev` | **teste de isolamento** (Epic 900) | **NUNCA** |
| `remanager` | pausado, alheio a este projeto | — |

**O estado padrão do repositório aponta para TESTE** (`trifold-crm-dev`), desde a Story
900-3b. Isto é o inverso do que valia antes dela, quando `.env.local` apontava para
PRODUÇÃO e um script destrutivo rodado sem conferir o alvo atingia dados reais.

### Onde mora cada ambiente, depois da Story 900-3b

| Arquivo (todos **gitignored**) | Ambiente | Quem lê |
|---|---|---|
| `packages/web/.env.development` | **TESTE** | `pnpm dev` (default do Next em modo development) |
| `packages/web/.env.producao.local` | PRODUÇÃO | só `pnpm dev:prod`, via `node --env-file` |
| `packages/web/.env.production.local.bak` | PRODUÇÃO | ninguém — é o original preservado para reversão |
| `.env.teste` (raiz) | **TESTE** | `scripts/lib/db-env.ts`, como *fallback* |
| `.env.producao` (raiz) | PRODUÇÃO | `scripts/lib/db-env.ts`, só sob `TRIFOLD_ENV=producao` |
| `packages/web/.env.development.example` | — | **rastreado**, só nomes, nunca valores |

`packages/web/.env.vercel.check` tem propósito distinto e não foi tocado. O `.env` /
`.env.example` da raiz são config do instalador AIOS, sem relação com Supabase.

**Precedência:** para os scripts, `process.env` **sempre vence** o arquivo dotenv; o
arquivo é fallback. Todo script que escreve deve declarar o alvo por
`resolverAmbiente({ escreve: true })` e falhar quando ele não for o esperado — nunca
herdar o alvo de um `.env` carregado por acidente.

**Escrever em produção exige duas chaves, não uma:** `TRIFOLD_ENV=producao` **e**
`TRIFOLD_ALLOW_PROD=1`. E o ref precisa estar na **allowlist** de
`scripts/lib/db-env.ts` (`REFS_PERMITIDOS_PRODUCAO`) — que falha *fechada*: um ref de
produção novo, ainda não cadastrado, é recusado. A denylist anterior
(`REFS_PROIBIDOS`, de tamanho 1) falhava *aberta*.

### Como reverter o split de ambiente

Os arquivos envolvidos são gitignored — o passo é invisível ao git e desfeito por `mv`:

```bash
mv packages/web/.env.producao.local packages/web/.env.local
mv packages/web/.env.production.local.bak packages/web/.env.production.local
mv .env.producao .env.local   # raiz, se também precisar reverter
```

Ressalva medida: a reversão devolve `packages/web/.env.production.local` **byte a byte**
(é rename puro), mas o `.env.local` restaurado carrega, ao final, o bloco mesclado a
partir do `.env.production.local` (24 chaves de `VERCEL_*`/`TURBO_*`/`CRON_SECRET`, sob
um marcador comentado). Nenhum valor original foi perdido ou sobrescrito — as chaves
coincidentes mantiveram o valor do antigo `.env.local`. Para reversão byte-exata, apague
também o bloco após o marcador `--- Story 900-3b: mesclado de …`.

### ⚠️ Enquanto a Story `900-3c` não mergear, **não existe `pnpm db:apply`**

Não há, nesta fatia, ledger de migrations nem `pnpm db:status`/`pnpm db:apply` — eles são
a Fatia B. Para trazer o banco de teste ao `HEAD` atual, use o reset que **já existe**:

```bash
pnpm reset:testdb --confirmar
```

Se você bater em erro de "coluna/tabela não existe" contra o banco de teste, é quase
certo que seja isto — não um bug de código.

---

## `reset-tenancy-testdb.ts` — o banco de teste de isolamento

### Este projeto NUNCA recebe dado de produção

O `trifold-crm-dev` existe para **uma** finalidade: rodar os testes cross-tenant do
Epic 900, que criam e apagam organizações inteiras para provar que um tenant não enxerga
o outro. Testes assim não podem rodar em produção — um `DELETE` mal formado no teardown
apagaria dado real, que é exatamente o acidente que o Epic 900 existe para eliminar.

Por consequência, sem exceção:

- **Não** copie, restaure ou importe dump de produção para lá — nem "só para depurar".
- **Não** use esse projeto para investigar dado real de cliente.
- **Não** reaponte `packages/web/.env.producao.local` para lá, nem `.env.development` para
  produção. (Antes da Story 900-3b esta linha dizia `.env.local`, arquivo que não existe
  mais.)

Qualquer PII que apareça nesse banco é **vazamento**, não conveniência.

### Como rodar

```bash
npx tsx scripts/reset-tenancy-testdb.ts --dry-run   # mostra o plano, não executa
npx tsx scripts/reset-tenancy-testdb.ts             # reset completo
```

Env necessárias (os **nomes** vivem no repositório; os **valores**, nunca):

| Env | Para quê |
|---|---|
| `TENANCY_TEST_SUPABASE_URL` | define o alvo; o ref é derivado dela |
| `SUPABASE_MANAGEMENT_PAT` | executa o SQL via Management API |
| `TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY` | esvazia os buckets de storage |

O script **recusa** rodar contra o ref de produção e **recusa** env vazia — os dois casos
saem com exit 1. A recusa por env vazia não é preciosismo: `vercel env add` via stdin já
gravou valor vazio em silêncio duas vezes neste projeto (Stories 75-40 e 75-66), e
`gh secret set` por pipe tem o mesmo risco. Use sempre `--body`.

### O que ele faz, e por que é lento de propósito

Reconstrói o schema do zero a partir de `supabase/migrations/*.sql`, na ordem lexicográfica
— a mesma que `supabase db push` usa. Reaplicar tudo é mais lento que `truncate` + reseed
e foi escolhido assim porque **também prova, a cada execução, que a sequência de migrations
é reproduzível**. Essa prova é metade do valor do script.

### Falhas esperadas (não são regressão)

O script separa `CONHECIDA` de `REGRESSÃO` e só falha (exit 1) na segunda. Hoje são 4 conhecidas:

| Migration | Por quê |
|---|---|
| `025_phone_normalization_part2` (+ `_remote_only`) | recriam um índice que `021_phone_normalization_part2` já criou, sem `IF NOT EXISTS` — mesma migration renumerada sem remover a antiga |
| `223_properties_nicole_enabled` · `224_properties_restaura_is_active` | backfills com guard de "exatamente 2 linhas" sobre empreendimentos **reais** de produção, que não existem num banco novo |

**O segundo caso é um padrão, não uma exceção:** toda migration que faz backfill de dado
real com guard de contagem é, por construção, não-reproduzível do zero.

### Duas armadilhas de método já pagas — não as redescubra

1. A Management API roda **o arquivo inteiro numa transação**. `ALTER TYPE … ADD VALUE`
   seguido do uso do valor estoura `55P04`. O `db push` real usa `psql` em **autocommit por
   statement**; por isso existe o fallback statement-a-statement. Sem ele, 6 arquivos falham
   por artefato do método e **parecem** defeito de migration.
2. `DROP SCHEMA public CASCADE` **não** remove policies de `storage.objects`, e
   `DELETE FROM storage.objects` é bloqueado por `storage.protect_delete()`. Sem derrubar as
   policies e esvaziar os buckets pela Storage API, as migrations `065` e `099` falham com
   "policy already exists" — de novo, artefato do reset.

Nos dois casos o sintoma é indistinguível de bug de migration. Já foram diagnosticados
errados uma vez; o custo é corrigir migration que está correta.

### Uma dependência que o script contorna, e que o Epic 900 vai eliminar

Nenhuma migration cria a organização default (`00000000-…-0001`) — ela foi semeada à mão em
produção em 01/04/2026. Sem ela, `011`, `063` e `236` falham por violação de FK ao inserir
em `kanban_stages`. O script semeia uma org de teste logo após o schema base para que o banco
reconstruído seja funcional.

Isso é **muleta consciente**, e o FR-11 do Epic 900 existe para acabar com o UUID fixo. Vale
como aviso de desenho para a story `900-21`: `provision_org()` precisa semear uma org nova
**sem depender de nenhum backfill histórico** — se depender, provisionar cliente novo quebra
exatamente pelo mesmo motivo.

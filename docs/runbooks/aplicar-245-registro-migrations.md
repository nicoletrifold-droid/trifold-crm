# Runbook — aplicar a migration `245` (registro de migrations) em teste e em produção

**Escopo:** Story 900-3c (Epic 900, Onda 1 — Fatia B). **Migration:** `supabase/migrations/245_registro_de_migrations.sql`
**Ambientes:** `trifold-crm-dev` (`xnxvygyfyyyzwhiuoehz`) **e** produção (`dsopqkqjkmhytudaaolv`) — os dois, uma vez cada.

---

## Contexto em 6 linhas

A `245` cria `trifold_migrations_aplicadas`, o registro de "qual arquivo de migration foi
aplicado neste banco". **Ela é a única migration deste repositório que precisa ser aplicada à
mão**, e a razão é recursiva: `pnpm db:status` e `pnpm db:apply` — os comandos que aplicam
migration — leem essa tabela para saber o que está pendente. Enquanto ela não existir, os dois
saem `1` nomeando-a e apontando para este documento. Depois deste runbook, nenhuma migration
volta a precisar de aplicação manual.

**`supabase db push` é PROIBIDO aqui**, e não é preferência: `supabase_migrations.schema_migrations`
em produção está congelada na **168**, o prefixo numérico (chave do `push`) tem 22 duplicatas
neste repositório, e os arquivos `_remote_only.sql` com `CREATE INDEX CONCURRENTLY` abortam com
`25001` dentro da transação por arquivo do `push`. Aplique por **SQL Editor** do painel
(`Trifold` → ícone `>_`) ou pela **Management API** com PAT.

**Ordem obrigatória: Passo 0 → Passo 1 → Passo 2 → Passo 3 (conferência).**

---

## Passo 0 — Pré-condições (obrigatório, 20 segundos)

Rode no ambiente-alvo. Os dois resultados precisam bater com o esperado, senão **PARE**.

```sql
-- 1) A tabela ainda NÃO existe. Esperado: NULL.
--    Se vier 'trifold_migrations_aplicadas', a 245 já foi aplicada neste banco: pule o Passo 1.
SELECT to_regclass('public.trifold_migrations_aplicadas') AS ja_existe;

-- 2) Você está no projeto certo. Esperado: o ref que você pretende tocar.
SELECT current_database(), current_setting('server_version');
```

E, fora do banco, confira o alvo do repositório antes de qualquer comando `pnpm`:

```bash
pnpm supabase:check        # sai 1 se o link local estiver apontando para produção
```

---

## Passo 1 — Aplicar o DDL da `245`

Cole **o conteúdo inteiro** de `supabase/migrations/245_registro_de_migrations.sql`.

É idempotente (`CREATE TABLE IF NOT EXISTS`) e puramente aditiva: cria uma tabela nova, liga
RLS, não cria policy nenhuma, não toca em tabela existente, não faz backfill de dado de
produto. Aplicá-la duas vezes é no-op.

O que ela faz e por que importa:

- **`arquivo text PRIMARY KEY`** — chave por nome de arquivo, não por prefixo numérico. É o que
  resolve os 22 prefixos duplicados sem ambiguidade.
- **`sha256 text NOT NULL`** — é o que transforma "migration editada depois de aplicada" num
  estado nomeado (`ALTERADA-APÓS-APLICAR`) em vez de uma mentira silenciosa.
- **RLS ligada, zero policy** — `anon` e `authenticated` não leem nem escrevem. `service_role`
  bypassa RLS e é o único caminho de escrita (todos os scripts de operação vão por ele).

Depois deste passo, e **antes** do Passo 2, a tabela existe e está **vazia**. Esse é o estado
em que `pnpm db:status` reporta todos os arquivos como `PENDENTE` — é a janela usada como
controle positivo do job de CI (AC4/G3 da story). Não é erro.

---

## Passo 2 — Backfill (`via='backfill-onda-1'`)

Uma linha por arquivo de migration já existente, com o `sha256` do conteúdo **atual**.

⚠️ **Gere o SQL na hora, contra a árvore que você está aplicando.** Um backfill congelado num
arquivo versionado passa a mentir na primeira migration nova que entra — o hash gravado deixa
de ser o do arquivo, e o primeiro `db:status` acusa `ALTERADA-APÓS-APLICAR` falso.

```bash
# Gera o SQL na saída padrão. NÃO abre conexão com banco nenhum.
npx tsx scripts/gerar-backfill-ledger.ts > /tmp/backfill-245.sql

# Confira a contagem ANTES de colar: tem de bater com o número de arquivos.
ls supabase/migrations/*.sql | wc -l
grep -c "^  ('" /tmp/backfill-245.sql
```

Cole o conteúdo de `/tmp/backfill-245.sql` no SQL Editor (ou envie pela Management API).

**O que `via='backfill-onda-1'` significa, e o que ele NÃO significa.** Significa: "declaro que
este arquivo já rodou neste banco em algum momento do passado". **Não** significa "observei
este SQL exato rodar". Ninguém observou. O que se sabe é que o schema corresponde a essas
migrations. Os outros dois valores do campo — `apply` (gravado por `pnpm db:apply`) e `reset`
(gravado por `pnpm reset:testdb --confirmar`) — esses sim são observação direta. O campo existe
para que a diferença fique legível em qualquer consulta futura, em vez de virar folclore.

---

## Passo 3 — Conferência (leia o resultado antes de dar o passo por concluído)

```sql
-- 1) Tabela existe, RLS ligada, ZERO policies.
SELECT c.relname,
       c.relrowsecurity                                          AS rls_ligada,
       (SELECT COUNT(*) FROM pg_policies p
         WHERE p.schemaname = 'public'
           AND p.tablename = 'trifold_migrations_aplicadas')      AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'trifold_migrations_aplicadas';
-- esperado: trifold_migrations_aplicadas | true | 0

-- 2) A contagem do backfill bate com a contagem de arquivos do dia.
SELECT COUNT(*) AS linhas FROM public.trifold_migrations_aplicadas;
-- esperado: igual a `ls supabase/migrations/*.sql | wc -l` na árvore aplicada

-- 3) Proveniência: tudo do backfill declara isso.
SELECT via, COUNT(*) FROM public.trifold_migrations_aplicadas GROUP BY via ORDER BY 2 DESC;
```

E, do lado do repositório:

```bash
pnpm db:status                                 # ambiente de teste
TRIFOLD_ENV=producao pnpm db:status            # produção — LEITURA, não exige TRIFOLD_ALLOW_PROD
```

O relatório precisa sair **exit 0** e sem nenhum `PENDENTE` nem `ALTERADA-APÓS-APLICAR` logo
após o backfill. Se sair `1` nomeando a tabela, o Passo 1 não pegou. Se sair `0` com toda a
lista `PENDENTE`, o Passo 2 não pegou.

---

## Depois deste runbook

| Comando | Para quê |
|---|---|
| `pnpm db:status` | relatório por arquivo. Sai `0` com qualquer veredito de conteúdo; sai `1` só se a tabela sumir. |
| `pnpm db:apply` | aplica as `PENDENTE`, em ordem lexicográfica, e registra (`via='apply'`). |
| `TRIFOLD_ENV=producao TRIFOLD_ALLOW_PROD=1 pnpm db:apply` | produção. O operador digita **o ref do projeto**; `--yes` é recusado com exit 1. |

Nenhuma migration futura volta a precisar de aplicação manual — este runbook é de uma vez só,
por ambiente.

---

## Rollback

| Cenário | Ação |
|---|---|
| Backfill entrou errado (contagem não bate, hash de arquivo trocado) | `TRUNCATE public.trifold_migrations_aplicadas;` e repita o Passo 2 com o SQL regerado. A tabela não tem FK apontando para ela; truncar não afeta nada além do próprio registro. |
| Precisa desfazer a migration inteira | `DROP TABLE IF EXISTS public.trifold_migrations_aplicadas;` — volta ao estado de hoje, em que "o que foi aplicado onde" não existe em lugar nenhum. `db:status`/`db:apply` voltam a sair `1` apontando para este runbook. |
| `db:status` acusa `ALTERADA-APÓS-APLICAR` logo após o backfill | O arquivo mudou entre a geração do SQL e a aplicação. Se **nenhuma** linha tiver proveniência que valha preservar (é o caso logo após o Passo 2, em que tudo é `backfill-onda-1`), regere e reaplique o Passo 2 — o `ON CONFLICT DO UPDATE` corrige o hash sem duplicar linha. ⚠️ **Fora dessa janela, NÃO use o backfill inteiro:** ele reescreve as 268 linhas com `via='backfill-onda-1'` e apaga as proveniências `reset`/`apply`/`reset-falha-conhecida`. Use o procedimento de um arquivo só, logo abaixo. |

Nada aqui altera comportamento de produto: a tabela é infraestrutura de operação, nenhuma rota
de `packages/web` a lê ou escreve.

---

## Procedimento de exceção — corrigir UMA migration que já foi aplicada no teste

> **Só vale para migration que ainda NÃO mergeou e ainda NÃO foi aplicada em produção.** Depois
> do merge, a regra é a de sempre: **migration que já rodou não se edita** — a correção é uma
> migration nova. O `sha256` do ledger existe para tornar essa regra observável, e este
> procedimento não é uma forma de contorná-la: ele existe porque, enquanto o PR está aberto, o
> arquivo ainda é um rascunho e o registro no banco de teste é que está desatualizado.

Sintoma: `pnpm db:status` marca o arquivo como `ALTERADA-APÓS-APLICAR`, e `pnpm db:apply`
**recusa o comando inteiro** (exit 1, sem aplicar nada). Isso está **correto** — é a ferramenta
funcionando. Não contorne editando o ledger para "bater" com o arquivo: isso declararia aplicado
um SQL que ninguém viu rodar, que é exatamente a mentira que o `sha256` fecha.

O caminho legítimo tem três passos, e o terceiro é uma **observação**, não uma declaração:

```sql
-- 1. Esqueça o registro antigo. Ele descreve uma versão do arquivo que não existe mais.
--    Depois disto, `pnpm db:status` mostra o arquivo como PENDENTE — e isso é a verdade:
--    o conteúdo que está no disco nunca foi aplicado neste banco.
DELETE FROM public.trifold_migrations_aplicadas
 WHERE arquivo = '245_registro_de_migrations.sql';   -- troque pelo arquivo real
```

```bash
# 2. Confirme que o estado é PENDENTE (e só esse arquivo).
pnpm db:status

# 3. Aplique de verdade. A migration precisa ser IDEMPOTENTE para isto ser seguro
#    (`CREATE TABLE IF NOT EXISTS`, `COMMENT ON`, `CREATE OR REPLACE` — reaplicar é no-op).
#    O db:apply roda o arquivo, vê o sucesso e registra com `via='apply'` e o sha256 novo.
pnpm db:apply

# 4. Volte ao limpo.
pnpm db:status      # 0 PENDENTE, 0 ALTERADA-APÓS-APLICAR
```

**Por que não `UPDATE … SET sha256 = <novo>`:** porque isso é uma *declaração* de que o SQL novo
rodou, sem ninguém ter visto. O `DELETE` + `db:apply` faz o banco realmente executar o arquivo e
grava `via='apply'`, que é observação direta. A diferença entre declarar e observar é a razão de
o campo `via` existir.

**Se a migration NÃO for idempotente**, pare: reaplicá-la pode falhar no meio ou duplicar efeito.
Nesse caso a resposta é a regra geral — reverta a edição do arquivo e escreva uma migration
nova com a correção.

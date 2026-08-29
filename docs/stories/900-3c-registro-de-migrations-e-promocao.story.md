# Story 900-3c — Registro de Migrations e Fluxo de Promoção (Fatia B de 2 — Onda 1 do plano de 3 ondas)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 1 — Isolamento. Fecha, junto com a `900-3b`, o critério de saída da Onda 1 do plano de 3 ondas aprovado.
- **Story:** 900-3c — **Fatia B** do split decidido pelo `@po` na validação de 2026-08-29
  (`docs/qa/po-validation-900-3b.md`) e autorizado pelo dono do produto. A irmã é `900-3b` (Fatia A —
  Ambiente), que precisa estar mergeada antes desta (ver Dependencies).
- **Status:** Ready for Review (rodada 4) — **R3-1, o único achado bloqueante do gate do `@qa`, fechado.** A paginação do `listComments` que eu havia aplicado na rodada 3 tinha ido para o job **errado** (`tenancy-gate`, por causa de um `replace(..., 1)` sobre um bloco que existe duas vezes no arquivo): o job desta story ficou sem paginar, descumprindo o "atualiza in-place em vez de acumular" da AC4. Corrigido — `tenancy-gate` de volta a **byte a byte** o de `origin/main`, paginação no `migrations-do-pr`. **Escolhi remover as 2 linhas em vez de declará-las na AC**, por coerência com a decisão que eu já havia registrado (o conserto do `tenancy-gate` é de outra story). **O achado maior é que a régua de não-reescrita da AC4 era cega para linha movida verbatim** — o `git diff` casou as linhas retiradas com as idênticas do job novo e chamou de inserção pura (`170 0`, verde, arquivo modificado no meio), então o item de DoD estava satisfeito **por vacuidade**. A AC4 ganhou uma régua **complementar de forma do diff** (um hunk só, começando depois da última linha da base), medida nos dois estados: acende no commit com o defeito, verde no corrigido. **Segue aberto e nomeado:** `MNT-001` (as ~1.400 linhas de `scripts/*.ts` desta fatia fora do `lint`/`type-check` do CI) e a falta de paginação do `tenancy-gate`, agora explicitamente **não** consertada aqui — story própria. **AC1 segue parcial:** a `245` em produção é passo de runbook do `@devops`. 274 arquivos de teste, **3520 passed**. Pronta para o `@qa` fechar.
- **Priority:** P0 — sem esta fatia não existe registro auditável de migration aplicada, nem forma de
  levar migration nova ao ambiente de teste sem `supabase db push` (que é estruturalmente
  inutilizável neste repositório — ver Dev Notes).
- **Complexity:** M — 5 ACs, uma migration, DDL em dois ambientes, um job de CI.
- **Created:** 2026-08-29
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @devops (Gage) — infraestrutura, scripts, CI, docs.
- **Exceção explícita:** a **Task 1.1** (o arquivo de migration `trifold_migrations_aplicadas`) é
  escrita por **@dev (Dex)**, não por @devops nem @data-engineer — restrição do spawn original desta
  linha de trabalho: "o arquivo versionado é criado pelo @dev; nenhum DDL é aplicado em banco nenhum
  sem decisão explícita." A **aplicação manual** nos dois ambientes é passo de runbook do @devops
  (Task 1.4), não do @dev.
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[supabase_project_review, ci_secrets_review, migration_review]`

---

## Origem — leia a `900-3b` primeiro

Esta story nasceu do split de uma story única (`900-3b`, v0.1/v0.2), validada pelo `@po` com
**NO-GO, 6/10** (`docs/qa/po-validation-900-3b.md`). O corte que eu havia proposto ("Passos 0-3 /
4-8") tinha duas falhas que o `@po` identificou e eu concordo: (1) a AC10 original dependia, num
dos seus itens, de comandos que só nasceriam na fatia seguinte — documentar `deploy-flow.md` antes
de `db:status`/`db:apply` existirem faria o documento novo mentir, o mesmo modo de falha que a
própria story já usava para justificar corrigir `scripts/README.md` no mesmo PR do rename; (2) o
corte deixaria o risco aceito D6 (dev local e reset compartilhando o `trifold-crm-dev`) sem a
mitigação do Passo 6 durante a janela entre as duas partes.

**A fronteira usada aqui é a do `@po`: "quem escreve DDL em produção".** Esta fatia (`900-3c`) é
tudo que cria ou aplica migration, ou que documenta/remove ferramenta de promoção. A `900-3b`
(Fatia A) é tudo que não toca produção.

---

## Numeração — `900-3c`

Sufixo de letra seguinte a `900-3b`, mesma convenção do epic para reabertura/split
(`900-27a/b`, `900-42a/b`, `900-14b`) — ver justificativa completa da linhagem `900-3`→`900-3b` em
`docs/stories/900-3b-ambiente-de-teste.story.md`. As duas fatias nasceram do mesmo split e
continuam sendo, juntas, a resposta à condição de reabertura registrada na `900-3` original.

**Ação de follow-up ao fechar (junto com a `900-3b`):** atualizar a seção "Estado real do PRE-1" da
`900-3`, apontando para `900-3b` + `900-3c`.

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** um registro auditável de qual migration foi aplicada em qual ambiente, comandos para
aplicar migration nova no banco de teste, um job de CI que valida isso a cada PR, e documentação
de deploy que reflete o fluxo real,
**Para que** a promoção de migration deixe de depender de aplicação manual sem rastro — pré-requisito
técnico para a Onda 2 (crons/webhooks multi-tenant validados com duas orgs reais).

---

## Context

`supabase_migrations.schema_migrations` de produção está **congelada na `168`** desde antes desta
story (confirmado em `docs/runbooks/aplicar-242-243-live-coach.md`: *"`supabase_migrations.schema_migrations`
em produção está congelada na 168, então o `push` consideraria 169..243 pendentes"*), e o reset da
`900-3` a apaga sem reinserir. Ela não serve de fonte de verdade em nenhum ambiente. Esta fatia cria
o registro que a substitui.

**Pré-requisito funcional (não apenas cronológico):** o job de CI desta fatia (AC4) e o
`docs/deploy-flow.md` reescrito (AC5) pressupõem que o ambiente de teste já esteja no default de
`pnpm dev`/scripts — ou seja, que a `900-3b` já tenha mergeado.

---

## Scope

### IN (esta story entrega)
1. Migration nova (`245`, remedida **depois** do merge do PR #522 e da `900-3b` — ver AC1)
   criando `trifold_migrations_aplicadas`, o registro de "o que foi aplicado onde".
2. Runbook de aplicação manual (uma vez, em cada ambiente) — pré-requisito para `db:status`/
   `db:apply` funcionarem.
3. `pnpm db:status` / `pnpm db:apply`, com extração de `runSql`/`splitStatements` de dentro de
   `scripts/reset-tenancy-testdb.ts` para `scripts/lib/management-api.ts`.
4. `reset-tenancy-testdb.ts` (já endurecido pela `900-3b`) passa a **popular** o ledger ao final
   (`via='reset'`).
5. Job novo (não-bloqueante, leitura pura) em `.github/workflows/ci.yml` que roda `pnpm
   db:status` e **avisa** no PR quando a migration da própria branch ainda não estiver aplicada
   no banco de teste — redesenhado para não escrever (decisão do dono do produto, 2026-08-29; ver
   AC4).
6. Reescrita de `docs/deploy-flow.md` e remoção de `scripts/sync-schema.sh`.

### OUT (não entra nesta story)
- Tudo que a `900-3b` já entrega (gitignore, split de ambiente, `db-env.ts`, `config.toml`, reset
  hardening itens 1-3/5, `FALHAS_CONHECIDAS`).
- Qualquer item do "Deferido da Onda 1" (ver seção de Handoff abaixo).
- Qualquer mudança de comportamento em produção fora da aplicação da migration desta fatia.

---

## Acceptance Criteria

- [ ] **AC1 — Migration + runbook de aplicação manual (Passo 4):**
  - **Número da migration: `245` — reconfirmado no início da Task 1, nunca herdado deste
    documento.** O PR **#522 mergeou** (`77f225d1`, junto com a Fatia A) — `244_org_admin_invite_email.sql`
    agora está em `origin/main`, exatamente onde a varredura de todas as refs já apontava que ele
    estaria. **É o caso real que prova por que a régua nunca pode varrer só a `main`**: quem tivesse
    medido só a `main` antes do merge veria `243` como máximo e proporia `244` — colisão certa. A
    varredura completa (com `fetch`) via o `244` no branch do PR **antes** do merge e evitou a
    colisão por desenho, não por sorte. Reconfirmado em 2026-08-29 pós-merge: `245` livre em todas
    as refs (`git fetch --prune origin` + varredura completa — ver Dev Notes para a lista de PRs
    abertos conferidos). **A régua de remedição correta — corrigida nesta story (C8 do parecer
    `@po`):**
    ```bash
    git fetch --prune origin
    for r in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin); do
      git ls-tree --name-only "$r" -- supabase/migrations/ 2>/dev/null | sed 's|.*/||'
    done | grep -oE "^[0-9]{3}[a-z]?_" | sort -u | tail
    ```
    **Três reparos sobre a régua herdada da v0.1 original:** (1) precisa de `git fetch --prune
    origin` como primeira linha — sem isso, a varredura lê `refs/remotes/origin/*` só tão fresco
    quanto o último fetch, o mesmo modo de falha que a régua existe para fechar, deslocado da
    `main` para o índice local; (2) o regex precisa ser `^[0-9]{3}_` (três dígitos genéricos), não
    `^2[0-9]{2}_` — preso à faixa `2xx`, ficaria cego quando o repositório chegar em `300_`; (3)
    **correção T4 (@po, Rodada 2):** `^[0-9]{3}_` sozinho é cego para variantes com **sufixo de
    letra**, que existem hoje no repositório (`024b_mensagens_sender_display_name.sql`,
    `028a_fix_v_mensagens_admin_grant.sql`, `028b_meta_campaign_actions.sql` — medido via
    `ls supabase/migrations/ | grep -E "^[0-9]{3}[a-z]_"`). O próprio epic usa `024b_` como exemplo
    da armadilha de ordenação lexicográfica (§0.2). Um `245a_` criado por outro PR ficaria invisível
    para a régua sem este reparo. Padrão corrigido: `^[0-9]{3}[a-z]?_`.
  - Migration cria `trifold_migrations_aplicadas (arquivo text PRIMARY KEY, sha256 text NOT NULL,
    aplicada_em timestamptz NOT NULL DEFAULT now(), via text NOT NULL)`, RLS ligada, sem policy
    para `authenticated`/`anon` (deny por padrão; `service_role` bypassa RLS por padrão, mesmo
    padrão da tabela de auditoria da `900-16`).
  - Chave por **arquivo** (resolve os 22 prefixos duplicados sem ambiguidade). `sha256` resolve o
    caso de migration renumerada e reeditada depois de aplicada (já documentado em
    `supabase/migrations/README.md`).
  - `docs/audits/migrations-aplicadas.json`: espelho por ambiente, regenerado por `pnpm db:status`
    (AC2). **Estrutura chaveada por ambiente (S5 do parecer):** `{ "teste": [...], "producao":
    [...] }` — um único arquivo compartilhado por dois ambientes, sem essa separação, faria uma
    execução de `db:status` contra teste sobrescrever o retrato de produção no diff do PR. Cada
    execução só reescreve a própria chave.
  - **Backfill em produção:** uma linha por arquivo de migration já existente, `sha256` do conteúdo
    atual, `via='backfill-onda-1'` — declaração, não prova de que aquele SQL exato rodou. Contagem
    do backfill bate com a contagem de arquivos medida no dia da Task 1 (não com nenhum número
    citado por este documento).
  - **A recursão, explícita:** a migration precisa ser aplicada **à mão, uma vez, em cada
    ambiente**, antes de `db:status`/`db:apply` (AC2) funcionarem. Runbook
    `docs/runbooks/aplicar-{N}-registro-migrations.md` (nome com o número real, padrão de
    `docs/runbooks/aplicar-242-243-live-coach.md`), com pré-condição (tabela ainda não existe),
    SQL via Management API/SQL Editor, e conferência pós-aplicação (`SELECT COUNT(*) FROM
    trifold_migrations_aplicadas` bate com a contagem de arquivos).

  **Verificação (mutação que reprova):**
  - Sem a migration aplicada manualmente, `pnpm db:status` deve falhar (ver contrato de exit code
    na AC2 — C6) nomeando a tabela ausente.
  - `docs/runbooks/aplicar-{N}-registro-migrations.md` existe com os três passos; arquivo ausente
    reprova a AC por inteiro.
  - Rodar a régua de varredura **sem** `git fetch` primeiro, num ambiente com índice desatualizado
    — deve ser possível demonstrar que ela lê um estado velho (prova de que o `fetch` é necessário,
    não decorativo).
  [Source: plano aprovado, Passo 4; parecer `@po`, C8; medição direta desta story em 2026-08-29]

- [ ] **AC2 — `pnpm db:status` / `pnpm db:apply` (Passo 5, depende da AC1 aplicada + correções C5 e C6):**
  - **Extração, não duplicação:** `runSql()`/`splitStatements()` (hoje internos a
    `scripts/reset-tenancy-testdb.ts` — `runSql` já usa `User-Agent: trifold-tenancy-reset`
    obrigatório; `splitStatements` já é o fallback statement-a-statement) movem-se para
    `scripts/lib/management-api.ts`. Os dois call sites (`reset-tenancy-testdb.ts` e os comandos
    novos) importam a mesma implementação.
  - **Régua de extração corrigida (C5) — ancorada e com exclusão declarada, não um `grep` cego:**
    ```bash
    # esperado: 0
    grep -c "function runSql\|function splitStatements" scripts/reset-tenancy-testdb.ts scripts/db-status.ts scripts/db-apply.ts
    # exclusão declarada, fora do escopo desta AC:
    # scripts/gate-tenancy.ts:215 tem `function runSql<T>(sql, pat)` — OUTRO transporte,
    # assinatura diferente ((sql, pat) contra (ref, pat, sql)), de outra story (900-2a). Um
    # grep sem essa exclusão declarada NUNCA fecharia — o `runSql<T>` do gate continuaria
    # existindo mesmo com a extração desta AC correta, e a saída barata seria afrouxar o grep
    # até ele "passar", matando a prova de "extraiu, não duplicou".
    ```
  - `pnpm db:status` → relatório por arquivo: `aplicada` / `PENDENTE` / `ALTERADA-APÓS-APLICAR`
    (sha256 do arquivo local diverge do registrado) / `ÓRFÃ-no-banco` (registro sem arquivo
    correspondente).
  - **Contrato de exit code — corrigido (C6, resolve a contradição entre a AC5 original e a AC6
    original):** `db:status` sai **`0`** sempre **que a tabela `trifold_migrations_aplicadas`
    exista**, qualquer que seja o veredito por arquivo (é relatório, não gate, sobre o *conteúdo*).
    Sai **`1`**, nomeando `trifold_migrations_aplicadas` e apontando para o runbook, **apenas**
    quando a tabela **não existir** (pré-condição de infraestrutura, não veredito de conteúdo).
  - `pnpm db:apply` → aplica só as `PENDENTE`, ordem lexicográfica de nome de arquivo, mesmo
    transporte; grava no ledger a cada arquivo aplicado com sucesso.
  - Em `TRIFOLD_ENV=producao`, o operador digita **o ref do projeto** (não `y`/`yes`) para
    confirmar — `--yes` só aceito com `TRIFOLD_ENV=teste`.
  - `ALTERADA-APÓS-APLICAR` **bloqueia** `db:apply` inteiro (exit 1, nomeando o arquivo).
  - **Âncoras literais em qualquer teste que reuse `db-env.ts`/`supabase-refs.ts` (promovido do
    Dev Notes — lição da revisão do PR #524):** qualquer teste que esta fatia escrever para
    `db-status.ts`/`db-apply.ts`, ou para a lógica de comparação de migrations da AC4, que precise
    nomear um ref de ambiente usa **string literal escrita à mão** (ex.: o ref de produção
    digitado por extenso no teste) — **nunca** importado de `REFS_PERMITIDOS_PRODUCAO`/
    `REFS_PERMITIDOS_TESTE`/`supabase-refs.ts`, mesmo que o código sob teste importe de lá.
    De-duplicar código é certo; de-duplicar a âncora do teste junto tira do teste a independência
    de errar diferente do código — foi assim que o teste do banner ficou mudo exatamente sobre o
    ref de produção, na mesma revisão.

  **Verificação (mutação que reprova):**
  - Rodar `pnpm db:status` **antes** da AC1 estar aplicada → sai `1`, nomeando a tabela — nunca
    "tudo pendente" silencioso.
  - Rodar `pnpm db:status` **depois** da AC1 aplicada, mesmo com arquivos `PENDENTE` de verdade →
    sai `0` (relatório, não gate).
  - Editar um byte de migration já registrada → `db:status` marca `ALTERADA-APÓS-APLICAR`;
    `db:apply` sai `1`, nomeando o arquivo, sem aplicar nada.
  - `pnpm db:apply --yes` sob `TRIFOLD_ENV=producao` → recusa.
  [Source: parecer `@po`, C5, C6; plano aprovado, Passo 5]

- [ ] **AC3 — Reset popula o ledger (item 4 do Passo 6, depende da AC1 e do reset já endurecido pela `900-3b`):**
  - `reset-tenancy-testdb.ts` (já com dry-run/allowlist/confirmação/medição de duração da
    `900-3b`) passa a **popular** `trifold_migrations_aplicadas` ao final de cada execução bem-
    sucedida (`via='reset'`). Sem isso, o reset zera o registro do mesmo jeito que hoje zera
    `supabase_migrations.schema_migrations` (`delete from supabase_migrations.schema_migrations;`,
    linha ~231 do script original) — reintroduzindo o problema que a AC1 existe para fechar.

  **Verificação (mutação que reprova):** rodar `pnpm reset:testdb --confirmar`; depois, `pnpm
  db:status` mostra todos os arquivos aplicados como `aplicada`, `via='reset'` — nunca `PENDENTE`
  logo após um reset bem-sucedido.
  [Source: plano aprovado, Passo 6, item 4]

- [ ] **AC4 — Job de CI que AVISA quando o PR traz migration não aplicada no teste (Passo 8, REDESENHADO — decisão do dono do produto, 2026-08-29):**

  **Por que o desenho mudou, e por que isso não é um detalhe de implementação.** O desenho
  anterior (job escreve — `reset:testdb` + `db:apply` a cada execução) resolvia um problema que
  o fluxo manual já resolvia: aplicar a migration no teste, conferir, depois aplicar em produção
  — exatamente o que `pnpm db:status`/`pnpm db:apply` (AC2) já entregam, e esse fluxo **nunca
  teve problema**. Toda a complicação anterior desta AC (reset a cada execução, banco de
  desenvolvimento destruído dezenas de vezes por dia, `concurrency`, os 456,6s por execução, a
  tabela de quatro opções de mitigação) vinha de o job **escrever** no banco compartilhado — e
  escrever era um extra que o job se deu, não uma necessidade do fluxo que ele existe para servir.
  **O job de escrita foi acrescentado para dar uma garantia que o fluxo manual já dava, e pagou
  por isso com um efeito colateral que quase custou o banco de desenvolvimento de todos.**

  **O desenho novo: leitura pura + aviso.** O job roda **`pnpm db:status`** (leitura pura sobre o
  **banco** — qualificador do G1 abaixo) contra o banco de teste e compara com os arquivos de
  migration que **este PR** traz (`git diff --name-only origin/<base_ref>...HEAD --
  supabase/migrations/`). Cruza essa lista com **dois** estados do relatório do `db:status`, não
  só um (correção G5 — `ALTERADA-APÓS-APLICAR` não pode sair por arrasto do redesenho, porque ela
  é detectável só com leitura e é a classe de PR mais perigosa das quatro que o `db:status`
  reconhece):
  - arquivo do PR está `PENDENTE` → aviso de "ainda não aplicada";
  - arquivo do PR está `ALTERADA-APÓS-APLICAR` → aviso **mais severo** de "este PR altera uma
    migration já aplicada no teste; o `db:apply` vai recusar" (é o caso que a AC2 trata bloqueando
    o `db:apply` inteiro — o job precisa denunciar antes de alguém bater nisso na hora de aplicar).
  - ~~(`ÓRFÃ-no-banco` fica de fora com razão: é registro sem arquivo correspondente, não pode
    ser um arquivo que o PR traz.)~~ — ❌ **JUSTIFICATIVA FALSIFICADA POR MEDIÇÃO
    (`@qa`, CONCERNS-1 do gate de 2026-08-29; corrigido na v0.7).** `git diff --name-only`
    **lista caminho apagado**. O `@qa` reproduziu com `git rm` + commit: o arquivo removido
    aparece na lista do PR, casa com `ÓRFÃ-no-banco` no relatório, e o aviso respondia
    `✅ limpo` com o próprio corpo listando o estado órfão sob a manchete *"já estão aplicadas
    e nenhuma foi alterada"*. Era o mesmo falso-verde que G2 e G5 fecham, sobrando na quarta
    classe — e justamente a que **apaga histórico já aplicado**. **Regra corrigida: o aviso
    cobre `PENDENTE`, `ALTERADA-APÓS-APLICAR` e `ÓRFÃ-no-banco`**, este último com texto
    próprio (`⛔ REMOVIDA — este PR apaga migration que consta como aplicada`), explicando que
    o registro fica órfão e que o `reset:testdb` deixa de reconstruir aquele efeito do zero.
    (`aplicada` segue, corretamente, sem aviso.)
  - **Manchete neutra (NIT-8 do mesmo gate):** *"N migration(s) não aplicada(s)"* era falso
    para `ALTERADA-APÓS-APLICAR` (foi aplicada, e depois editada) e para `ÓRFÃ-no-banco` (foi
    aplicada, e o PR apagou o arquivo). Passa a ser *"N migration(s) deste PR precisam de
    atenção no banco de teste"*, e cada bloco nomeia o que é.

  **Correção G2 — o job SEMPRE comenta, nunca fica em silêncio.** Atualiza um único comentário
  in-place (mesmo padrão do `tenancy-gate`: procura comentário existente do bot antes de criar um
  novo), com **três estados nomeados**, nunca "nenhum comentário" como alternativa válida:
  - `⚠️ Este PR traz N migration(s) não aplicada(s) no teste: …` (uma ou mais `PENDENTE`/
    `ALTERADA-APÓS-APLICAR`, listadas por nome, com o texto certo para cada classe);
  - `✅ Nenhuma migration deste PR está pendente no banco de teste.` (caso limpo — PR sem
    migration nova, ou com a(s) migration(s) já aplicada(s) e sem alteração pós-aplicação);
  - `⛔ Não foi possível verificar (motivo).` — para **qualquer** falha do próprio job:
    `git diff --name-only` vazio por `fetch-depth` errado, `db:status` saindo `1` (tabela do
    ledger ausente no teste), ou o parsing do relatório não casando nenhuma linha. O passo de
    comentário roda com `if: always()`.

  **Por que isso importa, medido pelo `@po`:** `git diff --name-only` devolve **vazio com exit 0**
  tanto para "este PR não traz migration" quanto para "não consegui resolver as refs" — as duas
  situações são indistinguíveis pela saída do comando. Sem o terceiro estado, cinco situações
  ficam visualmente idênticas no PR (limpo de verdade; sem migration; `fetch-depth` errado;
  `db:status` saiu `1`; parsing quebrado) — três delas são falhas. **Com o terceiro estado,
  ausência de comentário passa a significar uma coisa só: o job não rodou** — e isso é visível
  (falta o comentário que sempre deveria existir), não um silêncio que se confunde com sucesso.

  **Nada de `db:apply`, nada de `reset:testdb`, nada de `--confirmar`.** O humano aplica quando for
  testar (via `pnpm db:apply`, AC2) — o job só impede que alguém **esqueça** ou **erre em
  silêncio**, que era a única garantia real que a versão anterior (que escrevia) agregava sobre o
  fluxo manual.

  **O que isso resolve, de graça, por não escrever mais:**
  - O banco onde as pessoas desenvolvem não é tocado pelo job — a decisão travada D6 do epic
    (compartilhar o `trifold-crm-dev` entre dev local e reset) não é reaberta, e o risco que ela
    aceitou não ganhou um gatilho automático novo.
  - Sem escrita, não há o que serializar: **`concurrency` sai do desenho** — várias execuções do
    job, de PRs diferentes, podem rodar em paralelo com segurança, porque `db:status` é leitura.
  - **Os 456,6s por execução somem** do custo deste job — `db:status` roda em segundos.
  - **A herança de estado entre PRs desaparece**, porque ela era consequência direta de um PR
    escrever no ledger compartilhado; sem escrita, não há o que um PR deixar para o próximo.

  - **Acrescenta job** a `.github/workflows/ci.yml` — **nunca reescreve o arquivo existente** (o
    cabeçalho do arquivo já manda isso).
  - **`fetch-depth: 0` obrigatório (B2 — segue válido, não foi afetado pelo redesenho).** A régua
    de não-reescrita usa `git diff --numstat origin/main...HEAD`, e a comparação de migrations do
    PR usa `git diff --name-only origin/<base_ref>...HEAD` — as duas precisam de histórico
    completo, e `actions/checkout@v4` traz `fetch-depth: 1` por padrão. O precedente já existe no
    mesmo arquivo que esta AC edita: o job `tenancy-gate` (`ci.yml:115-119`) já usa
    `fetch-depth: 0` com o comentário *"R9 compara as migrations deste PR com a base — precisa do
    histórico, não de um checkout raso, senão a regra se abstém em silêncio e ninguém nota"* —
    mesma razão, mesmo remédio, mesmo arquivo.
  - **Régua de não-reescrita — corrigida (C4).** A v0.1 original citava a AC8 da `900-1` (`grep -c
    "gate:tenancy\|tenancy" .github/workflows/ci.yml` → 0) como a prova de que o arquivo não foi
    reescrito. **Medido: essa AC já está vermelha em `HEAD` hoje** (`grep -c "gate:tenancy\|tenancy"
    .github/workflows/ci.yml` → **6**) — a `900-2c` acrescentou o job `tenancy-gate` depois, por
    desenho, e a `900-1` já está `InReview` com essa AC "dispensada por obsolescência". Além disso
    ela nunca foi uma AC de não-reescrita — verifica ausência de referência a tenancy, não
    preservação de conteúdo. Substituída por (❌ **VERSÃO ERRADA — NÃO COPIAR, ver correção
    logo abaixo; mantida aqui só como registro do que estava escrito antes, por G4**):
    ```bash
    # ❌ ERRADO — não copiar. "3ª coluna" é o CAMINHO, não as deleções. Ver o bloco corrigido
    # logo abaixo desta caixa, que é o único que deve ser implementado.
    # 0 deleções no arquivo entre a base do PR e o HEAD desta story
    git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml   # 3ª coluna (deletions) == 0

    # os jobs existentes continuam presentes (contagem, não conteúdo — resiliente a edição de step)
    grep -c "^  static:\|^  tenancy-gate:" .github/workflows/ci.yml    # continua 2
    ```
  - **Correção do CodeRabbit (PR #524) — a régua acima lê o campo ERRADO do `--numstat` (esta
    correção segue de pé; a caracterização abaixo foi corrigida pelo `@po` numa rodada posterior —
    ela **não** ficava verde sem medir, ficava **vermelha sempre que o arquivo era tocado**, e é
    isso que a torna perigosa).** `git diff --numstat` emite
    `<adições>\t<deleções>\t<caminho>` — o **3º** campo é o **caminho** (uma string, nunca um
    número), não as deleções; o campo de deleções é o **2º**. Medido no próprio PR #524:
    `campo1(adições)=69 campo2(deleções)=0 campo3=docs/backlog.md`. Em `awk`, comparar uma string
    de caminho (`$3`) contra o número `0` é **sempre verdadeiro** — a condição antiga
    (`$3 != 0 { exit 1 }`, ou seu equivalente em prosa) dispara `exit 1` **toda vez** que
    `ci.yml` é tocado, mesmo quando a mudança é só adição. **A régua não ficava verde sem medir —
    ficava vermelha sempre, o que é uma falha diferente e, na prática, pior: uma régua sempre
    vermelha não absolve nada em silêncio, ela é *descartada por quem a roda*, porque ninguém
    confia num sinal que nunca muda.** É a régua sendo ignorada, não a régua enganando — mas o
    efeito final (ninguém percebe uma reescrita real) é o mesmo. **É a terceira régua desta série
    de stories com poder discriminante zero** (depois do `grep -rc` do bundle na `900-3b`/S12 e do
    predicado colinear do `236`/`237`/C3), a primeira das três pelo lado do sempre-vermelho em vez
    do sempre-verde. Corrigida, com tratamento explícito do caso "arquivo intocado" (saída vazia):
    ```bash
    # exit 1 se QUALQUER linha tiver deleções != 0; saída vazia (arquivo intocado) também passa,
    # porque awk sem linhas de entrada nunca executa o corpo do padrão e sai 0
    git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml | awk '$2 != 0 { exit 1 }'
    ```
  - **A régua acima é NECESSÁRIA e INSUFICIENTE — medido pelo `@qa` (R3-1, rodada 3).** Ela é
    **cega para linha movida verbatim**: se uma edição retira N linhas de um job pré-existente e
    as mesmas N linhas passam a existir, idênticas, dentro do job novo, o LCS do `git diff` casa
    as duas e representa a modificação como **inserção pura** — `numstat` devolve `170 0` e a
    régua fica **verde tendo o arquivo sido modificado no meio**. Aconteceu de verdade nesta
    story (a paginação do `listComments` foi parar no `tenancy-gate` em vez do job novo, e a
    régua não acusou). **Régua complementar, obrigatória junto com a de cima:**
    ```bash
    # O diff tem de ser UM hunk só, começando DEPOIS da última linha da base — acréscimo puro.
    BASE=$(git show origin/main:.github/workflows/ci.yml | wc -l | tr -d ' ')
    test "$(git diff --unified=0 origin/main...HEAD -- .github/workflows/ci.yml | grep -c '^@@')" = 1 &&
    git diff --unified=0 origin/main...HEAD -- .github/workflows/ci.yml | grep -q "^@@ -${BASE},0 +"
    ```
    Medido nos dois estados: no commit com o defeito, `numstat` `170 0` (verde) e hunk
    `@@ -187,0 +188,170 @@` → a régua de forma **acende**; no commit corrigido, `numstat`
    `171 0` e hunk `@@ -194,0 +195,171 @@` (194 = última linha da base) → as duas verdes.
    **Mutação que derruba a régua nova (e que a régua velha não distinguia da mutação oposta):**
    apagar uma linha existente do job `static` (ex.: remover o passo `lint`) → `git diff --numstat`
    emite uma linha com `$2` (deleções) `> 0` → `awk` sai `1` (correto). Rodando a régua **antiga**
    (comparando `$3`) numa mudança **sem nenhuma deleção** (só acrescentar o job novo desta AC):
    `$3` continua sendo uma string de caminho, nunca a string `"0"` — `$3 != 0` seguiria `true` e a
    régua sairia `1` **mesmo aqui, onde nada foi deletado** — prova de que ela não discriminava as
    duas mutações, só reagia à presença de qualquer diff.
  - `pnpm db:status` contra o banco de teste, restrito aos arquivos de migration que **este PR**
    modifica (via `fetch-depth: 0`) — nunca todo o relatório, para o comentário não virar ruído com
    `PENDENTE`/`ALTERADA-APÓS-APLICAR` de migrations de outras stories que ainda não foram
    aplicadas ao teste por outro motivo qualquer.
  - **Qualificador G1 — "leitura pura" vale para o banco, não para a árvore de trabalho.**
    `pnpm db:status` (AC1) **regenera** `docs/audits/migrations-aplicadas.json`, que é um arquivo
    **rastreado**. Rodar `db:status` no runner do CI suja a working tree — inofensivo hoje (o job
    não commita, e nada verifica árvore limpa), mas precisa estar dito, porque a premissa inteira
    desta AC é "só lê". **O job desta AC não commita o arquivo regenerado e não falha por causa de
    árvore suja** — a leitura do banco é pura; a escrita local e efêmera do espelho JSON não é
    commitada nem vira critério de sucesso/falha do job.
  - Roda **só em `pull_request`**.
  - **Guard de fork:** `if: github.event.pull_request.head.repo.full_name == github.repository` —
    este job usa `SUPABASE_MANAGEMENT_PAT` (secret já gravado pela `900-3`) para o `db:status`
    ler o banco de teste via Management API.
  - **Não-bloqueante** (`continue-on-error: true`, mesmo padrão do job `tenancy-gate`), mas o
    **comentário no PR não é não-bloqueante** — ele roda sempre, com `if: always()` (G2), mesmo
    quando o passo de `db:status` falhar. Reaproveita o padrão de comentário via
    `actions/github-script` já usado pelo job `tenancy-gate` (mesmo arquivo): procura um
    comentário existente do bot e atualiza in-place, em vez de acumular um novo a cada push.
  - **Sem `concurrency` de banco** — não é mais necessário: `db:status` é leitura, então duas
    execuções do job (de PRs diferentes, ou dois pushes no mesmo PR) podem rodar ao mesmo tempo
    sem conflito. Nenhuma trava de grupo fixo nesta AC.

  **Verificação (mutação que reprova):**
  - PR de fork (ou `head.repo.full_name` diferente simulado) → job não roda.
  - `git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml | awk '$2 != 0 { exit 1 }'`
    (pós-implementação) sai `0`; `grep -c "^  static:\|^  tenancy-gate:"` continua 2.
  - **(R3-1)** A régua de **forma** do diff (um hunk só, começando na última linha da base) sai
    `0`. Mutação que a derruba e que a régua de `numstat` **não** derruba: mover uma linha de um
    job pré-existente para dentro do job novo, verbatim — `numstat` continua `N 0`, e a régua de
    forma acusa o hunk no meio do arquivo.
  - PR que adiciona `supabase/migrations/246_algo.sql` e **não** aplica no teste → comentário
    `⚠️` nomeando `246_algo.sql` como `PENDENTE`.
  - **(G5) PR que edita uma migration já aplicada no teste** (byte alterado num arquivo cujo
    `sha256` já está no ledger) → comentário `⚠️` **diferenciado**, nomeando o arquivo como
    `ALTERADA-APÓS-APLICAR` e avisando que `db:apply` vai recusar — nunca confundido com o aviso
    de `PENDENTE`, e nunca em silêncio (era o caso que sumia no v0.3→v0.4 sem intenção).
  - **(CONCERNS-1) PR que APAGA uma migration que consta como aplicada no teste** → comentário
    `⚠️` com o bloco `⛔ REMOVIDA`, nomeando o arquivo — **nunca `✅ limpo`**. Reproduzível com
    `rm` de um `.sql` rastreado: `git diff --name-only` lista o caminho apagado, o `db:status`
    o classifica como `ÓRFÃ-no-banco`, e o aviso tem de acender.
  - **(G2) PR sem migration nova, ou cuja migration já foi aplicada e sem alteração pós-aplicação**
    → comentário `✅` explícito de estado limpo — **nunca ausência de comentário**.
  - **(G2) Simular `fetch-depth: 1`** (checkout raso) → `git diff --name-only` sai vazio por
    incapacidade de resolver a base, não por ausência real de migration → comentário `⛔ Não foi
    possível verificar`, nunca `✅` (a régua distingue os dois "vazios").
  - **(G2) Simular `db:status` saindo `1`** (tabela do ledger ausente no teste) → comentário `⛔`
    nomeando a falha, com `if: always()` garantindo que o passo de comentário roda mesmo com o
    passo anterior falho.
  - Dois PRs de branches diferentes, ambos com migration pendente, executando o job ao mesmo
    tempo → nenhum interfere no outro (prova de que `concurrency` deixou de ser necessário —
    diferente do desenho anterior, aqui não há estado compartilhado a corromper).
  - **(G3) Controle positivo real, com janela nomeada — não um PR hipotético.** Esta própria story
    adiciona a migration `245`. A Task 1.4 a aplica em teste **e** em produção — se a Task 4
    (job de CI) só existir depois, o caso "há migration pendente" nunca é exercido de verdade
    nesta story, e a primeira prova real do job aconteceria só num PR futuro qualquer. **A janela
    tem que ser nomeada e capturada:** rodar o job (ou a lógica equivalente localmente) contra o
    PR desta própria story **antes** de a Task 1.4 aplicar a `245` em teste — o comentário deve
    nascer nomeando `245_registro_de_migrations.sql` como `PENDENTE`. Colar o comentário produzido
    no Dev Agent Record como evidência do controle positivo. Alternativa aceitável: criar um
    arquivo de migration **descartável** só para a prova (aplicado e removido antes do merge),
    se a ordem das Tasks não permitir capturar a janela da `245` real.
  [Source: decisão do dono do produto (2026-08-29, retransmitida pelo coordenador); parecer `@po`
  (Rodada 1: C4, B2; Rodada 2: caracterização da régua, `fetch-depth: 0`; Rodada 3: G1-G5); plano
  aprovado, Passo 8; `.github/workflows/ci.yml` (cabeçalho + jobs `static`/`tenancy-gate` como
  precedente de padrão, inclusive do `fetch-depth: 0` e do "abstém em silêncio e ninguém nota");
  medição direta desta story]


- [ ] **AC5 — `docs/deploy-flow.md` reescrito + `scripts/sync-schema.sh` removido (parte do Passo 9, depende da AC2 existir):**
  - **`docs/deploy-flow.md` — reescrito, não remendado.** Confirmado por leitura direta: toda linha
    está errada — rotula produção (`dsopqkqjkmhytudaaolv`) como "Staging", diz que produção "(a
    criar)", cita branch `staging` inexistente, e instrui `./scripts/sync-schema.sh staging`
    (sintaxe posicional que o script real não aceita — exige `--env staging`). Reescrita reflete:
    ambiente de teste = `trifold-crm-dev`; produção = `dsopqkqjkmhytudaaolv`; comando de promoção =
    `pnpm db:status`/`pnpm db:apply` (AC2 desta story) — **estes comandos só existem depois que
    esta AC roda, então a reescrita só pode ser feita depois da AC2, não antes**.
  - **`scripts/sync-schema.sh` deletado.** Exige `SUPABASE_DB_URL_STAGING`/`SUPABASE_DB_URL_PROD`,
    variáveis ausentes de todo `.env`; nenhum workflow o invoca; e é o script que
    `docs/deploy-flow.md` citava. Script morto que parece ferramenta de promoção é pior que
    nenhuma — só se apaga a ferramenta velha quando a nova (`db:status`/`db:apply`) já existe.
  - **Ressalva do S2, resolvida pelo `@po` na revalidação (T5):** deletar `scripts/sync-schema.sh`
    contradiz o texto do epic §461 (*"`sync-schema.sh` **é** corretamente reaproveitável em
    `900-3`"*). Editar o epic segue fora da autoridade do @sm e do executor desta story (mesmo
    entendimento já registrado pela `900-2c`) — mas o **mérito** já está resolvido, e a deleção é
    **segura**: o §461 valia como *plano*, e foi **superado pelo resultado real da própria `900-3`**
    — ela está `InReview` com as tarefas **T1.1-T1.4 todas desmarcadas**, e a T1.3 era literalmente
    *"rodar `supabase db push` (reusar `sync-schema.sh`, adaptado)"*. O script nunca foi usado; o
    que existe de fato é `reset-tenancy-testdb.ts` via Management API, construído porque `db push`
    é estruturalmente inutilizável aqui. **O `@po` assumiu o encaminhamento** (gestão de contexto de
    epic é autoridade dele, não do @sm) e abriu `[EPIC-900]` em `docs/backlog.md`, endereçado ao
    `@pm` com `@architect` em cópia, com essa evidência — o Dev Agent Record deixa de ser o único
    canal. Esta AC só precisa citar o item do backlog, não reabrir a investigação.

  **Verificação (mutação que reprova):**
  - `grep -i staging docs/deploy-flow.md` (pós-correção) não rotula o ref de produção como
    "Staging".
  - `ls scripts/sync-schema.sh` (pós-correção) falha.
  [Source: parecer `@po` (Rodada 1 e T5 da revalidação), S2; `docs/backlog.md` item `[EPIC-900]`;
  plano aprovado, Passo 9; leitura direta de `docs/deploy-flow.md` e `scripts/sync-schema.sh`]

---

## Tasks / Subtasks

*(ordem: 1 antes de 2 — `db:status`/`db:apply` dependem da tabela existir; 3 depende de 1 e do
reset já endurecido pela `900-3b`; 4 depende de 2 — o job de CI presumivelmente invoca `db:apply`;
5 depende de 2 — documenta os comandos que ela cria)*

- [x] **Task 1 — Migration + runbook (AC1)** *(1.4 parcial: teste feito, produção é do @devops)*
  - [x] 1.1 **(@dev)** Reconfirmar o número de migration livre no dia da implementação (comando
    de varredura completa na AC1 — com `git fetch --prune origin` primeiro); escrever
    `supabase/migrations/{N}_registro_de_migrations.sql` criando `trifold_migrations_aplicadas`
    com RLS.
  - [x] 1.2 Escrever `docs/audits/migrations-aplicadas.json` (estrutura chaveada por ambiente, S5).
  - [x] 1.3 Escrever o SQL de backfill (uma linha por arquivo de migration existente em produção,
    `via='backfill-onda-1'`) — não aplicar ainda, só preparar.
  - [~] 1.4 **(@devops)** Escrever `docs/runbooks/aplicar-{N}-registro-migrations.md` e **executar**
    a aplicação manual (migration + backfill) em teste e em produção, seguindo o próprio runbook.
    Colar a saída de conferência no Dev Agent Record.

- [x] **Task 2 — `db:status` / `db:apply` (AC2, depende da Task 1 aplicada)**
  - [x] 2.1 Extrair `runSql`/`splitStatements` de `scripts/reset-tenancy-testdb.ts` para
    `scripts/lib/management-api.ts`.
  - [x] 2.2 Atualizar `reset-tenancy-testdb.ts` para importar do módulo extraído.
  - [x] 2.3 Implementar `scripts/db-status.ts` e `scripts/db-apply.ts`, registrar `"db:status"`/
    `"db:apply"` em `package.json` (raiz), com o contrato de exit code corrigido (C6). **Qualquer
    teste destes dois scripts que precise nomear um ref usa string literal, nunca importa de
    `REFS_PERMITIDOS_PRODUCAO`/`REFS_PERMITIDOS_TESTE`/`supabase-refs.ts`** (âncora literal —
    lição da revisão do PR #524, promovida do Dev Notes para esta task).
  - [x] 2.4 Rodar `pnpm db:status` contra teste (pós Task 1.4) e confirmar veredito limpo.
  - [x] 2.5 Rodar a régua ancorada da AC2 (C5) e colar a saída no Dev Agent Record, junto com a
    exclusão declarada de `scripts/gate-tenancy.ts:215`.

- [x] **Task 3 — Reset popula o ledger (AC3, depende da Task 1)**
  - [x] 3.1 Estender `reset-tenancy-testdb.ts` (já endurecido pela `900-3b`) para popular
    `trifold_migrations_aplicadas` (`via='reset'`) ao final.
  - [x] 3.2 Rodar `pnpm reset:testdb --confirmar` e confirmar via `pnpm db:status` que nada fica
    `PENDENTE`.

- [x] **Task 4 — Job de CI, leitura + aviso (AC4, depende da Task 2; REDESENHADO — job deixou de escrever)**
  - [x] 4.1 Acrescentar o job novo a `.github/workflows/ci.yml`: `fetch-depth: 0` no checkout
    (B2), guard de fork, `pull_request` only, `continue-on-error: true`. **Sem `concurrency`** —
    não é mais necessário (job só lê).
  - [x] 4.2 No job: `git diff --name-only origin/${{ github.base_ref }}...HEAD -- supabase/migrations/`
    para listar as migrations que este PR traz; rodar `pnpm db:status` contra teste; cruzar as
    duas listas contra **dois** estados do relatório — `PENDENTE` **e** `ALTERADA-APÓS-APLICAR`
    (G5), cada um com texto de aviso distinto (o segundo, mais severo, nomeando que `db:apply` vai
    recusar). `db:status` não commita nem falha o job por causa da árvore suja que
    `docs/audits/migrations-aplicadas.json` regenerado deixa (G1).
  - [x] 4.3 Implementar o comentário **sempre presente**, `if: always()`, in-place (reaproveitando
    o padrão do `tenancy-gate` — procura comentário do bot, atualiza em vez de acumular), com os
    **três estados nomeados** (G2): `⚠️ ... não aplicada(s)`/`⛔ mais severo para
    ALTERADA-APÓS-APLICAR`; `✅ nenhuma pendente`; `⛔ não foi possível verificar` para qualquer
    falha do próprio job (fetch raso, `db:status` saindo `1`, parsing sem casamento). **Nunca**
    "nenhum comentário" como desfecho válido.
  - [x] 4.4 Rodar a régua corrigida (`git diff --numstat ... | awk '$2 != 0 { exit 1 }'` +
    contagem de jobs) e colar a saída no Dev Agent Record.
  - [x] 4.5 Rodar a mutação de PRs paralelos (dois PRs com migration pendente, jobs rodando ao
    mesmo tempo — ver Verificação da AC4) e colar o resultado no Dev Agent Record, como prova de
    que a ausência de `concurrency` é segura agora (era perigosa no desenho anterior, que escrevia).
  - [x] 4.6 **(G3) Capturar o controle positivo real, com janela nomeada:** rodar o job (ou a
    lógica equivalente) contra o PR desta própria story **antes** da Task 1.4 aplicar a `245` em
    teste, e colar o comentário produzido (nomeando `245_registro_de_migrations.sql` como
    `PENDENTE`) no Dev Agent Record. Se a ordem das Tasks não permitir capturar essa janela,
    criar um arquivo de migration descartável só para a prova, aplicado e removido antes do merge.

- [x] **Task 5 — `deploy-flow.md` + remoção de `sync-schema.sh` (AC5, depende da Task 2)**
  - [x] 5.1 Reescrever `docs/deploy-flow.md`.
  - [x] 5.2 Deletar `scripts/sync-schema.sh`.
  - [x] 5.3 Citar no Dev Agent Record o item `[EPIC-900]` já aberto pelo `@po` em
    `docs/backlog.md` (T5) — não reabrir a investigação nem editar o epic nesta story.

---

## Handoff — "Deferido da Onda 1" (explicitamente FORA das duas fatias)

Registrado aqui (fecha a Onda 1 junto com a `900-3b`) para não se perder nem ser confundido com o
scope IN de nenhuma das duas fatias:

| Item | Por que foi deferido | Onde deve nascer |
|---|---|---|
| Playwright explícito (`env: { TRIFOLD_ENV: 'teste' }` + `globalSetup` que aborta se o ref for de produção) e consolidação dos dois configs/dois `smoke.spec.ts` | Fora do critério de saída da Onda 1 | Story futura, possivelmente no início da Onda 2 |
| `check-deploy-drift.sh` — filtro que ignora `.sql` fica certo para teste e errado para produção; script vê um só projeto Vercel enquanto dois buildam `main` (duplicação de cron) | Escopo maior, depende de decisão sobre os dois projetos Vercel | Story dedicada, fora do Epic 900 ou sub-item de onda futura |
| Itens 4-5 da mitigação do Passo 6 (dump de contagens pré-drop; lock com TTL em `.tmp/testdb-em-uso`) | O próprio plano os marca `(deferível)` | Story de hardening incremental do reset, se o risco D6 se materializar |
| `TENANCY_TEST_SUPABASE_ANON_KEY` — gravada pela `900-3`, não lida por nada hoje | Decisão binária que depende do item Playwright acima | Mesma story futura do item Playwright |

---

## Dev Notes

### Migrations — remedido em 2026-08-29, DEPOIS do merge do PR #522 (`origin/main` em `77f225d1`)
A medição anterior (contra `563e639f`) previa exatamente este estado, e o merge do #522 o
confirmou — **é o caso real que prova por que a régua varre todas as refs, não só a `main`**: na
época, `244_org_admin_invite_email.sql` só existia em `origin/story/900-22b-convite-admin`; hoje
está em `origin/main`, no lugar exato que a varredura antecipou. Quem tivesse medido só a `main`
naquele momento teria visto `243` como máximo e proposto `244` — colisão certa assim que o PR
mergeasse. **Números atuais:** `git ls-tree --name-only origin/main -- supabase/migrations/ | grep
'\.sql$' | wc -l` → **267** arquivos; maior prefixo → **244**; prefixos duplicados → **22**, não 21
(lista: `021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104,
164, 170, 230, 240` — contagem re-conferida item a item, a lista já tinha 22 entradas quando a
`900-3b` a citou como "21", rótulo reproduzido sem contar). Varredura completa de refs (com
`git fetch --prune origin` primeiro, comando da AC1): **`245` livre em todas as refs** — nenhum PR
aberto (`#523, #518, #445, #431, #429, #428, #344, #343, #339, #306, #301, #148`, conferidos em
2026-08-29) carrega migration na faixa `245+`. **Reconfirmar de novo no dia da implementação da
Task 1 — o mesmo mecanismo que pegou o `#522` pode pegar outro PR entre esta redação e a
execução.**

### `supabase_migrations.schema_migrations` — por que não serve
Confirmado no runbook `docs/runbooks/aplicar-242-243-live-coach.md`: congelada na `168` em
produção. `supabase db push` é estruturalmente inutilizável neste repositório por três razões:
prefixos duplicados (a chave `version` do `db push` é o prefixo numérico); o ledger nativo
congelado; os 11 arquivos `_remote_only.sql` com `CREATE INDEX CONCURRENTLY`, que aborta com
`25001` dentro da transação por arquivo do `db push`.

### `scripts/reset-tenancy-testdb.ts` — estado ao chegar nesta fatia (já modificado pela `900-3b`, medido em 2026-08-29 pós-merge)
Ao iniciar esta fatia, o script já tem: dry-run por padrão, allowlist (não denylist) de
`scripts/lib/db-env.ts`, confirmação informativa, medição de duração, `FALHAS_CONHECIDAS`
estruturada (**4 entradas** — `025_phone_normalization_part2.sql`,
`025_phone_normalization_part2_remote_only.sql`, `223_properties_nicole_enabled.sql`,
`224_properties_restaura_is_active.sql`; **`236`/`237` NÃO estão na lista — provado que aplicam
com sucesso** num banco reconstruído do zero, `REGRESSÕES: 0` medido pela `900-3b`). `runSql`
(linha 252) / `splitStatements` (linha 268) **ainda estão dentro do arquivo** — a extração é
Task 2.1 desta fatia. O `User-Agent: trifold-tenancy-reset` obrigatório em `runSql` (sem ele o
WAF responde "error code: 1010") precisa sobreviver à extração. **Duração medida do reset
completo: `456,6s`** (267 arquivos, p50 por arquivo `1221ms`, p95 `2957ms`) — relevante para a
Task 3.2 (rodar `--confirmar` manualmente e conferir via `db:status`), não para a AC4: o job de CI
não reseta mais (ver AC4, redesenhada para leitura pura).

### `packages/shared/src/constants/supabase-refs.ts` — fonte única, entregue pela `900-3b` (não existia quando esta story foi rascunhada)
A `900-3b` centralizou `REFS_PERMITIDOS_PRODUCAO` **e** `REFS_PERMITIDOS_TESTE` (fail-closed nos
dois sentidos — um ref não cadastrado em nenhuma das duas listas é recusado, não presumido
inofensivo) neste arquivo, com `extrairRefDeUrlSupabase()` normalizando o ref em minúsculas.
`scripts/lib/db-env.ts` reexporta as duas constantes; `packages/web/src/lib/env-banner.ts`
importa do mesmo lugar. **A lição de teste que isso ensinou (âncoras literais, não importadas)
virou requisito explícito na AC2 e na Task 2.3 — não fica só aqui.**

### `scripts/gate-tenancy.ts:215` — a função homônima fora do escopo (C5)
```ts
async function runSql<T>(sql: string, pat: string): Promise<T[]> { ... }
```
Assinatura `(sql, pat)`, diferente de `(ref, pat, sql)` do `reset-tenancy-testdb.ts`. Outro
transporte, de outra story (`900-2a`). A régua da AC2 exclui este arquivo explicitamente — não
tentar unificar as duas funções nesta story (fora de escopo, risco de acoplar dois mecanismos que
servem propósitos diferentes: um introspecciona schema, o outro aplica DDL).

### `.github/workflows/ci.yml` — estrutura atual (194 linhas, jobs `static` e `tenancy-gate`)
Cabeçalho: *"Nunca reescreva este arquivo — acrescente job."* O job `tenancy-gate` (Story 900-2c) é
o precedente de padrão: `continue-on-error: true`, comenta no PR via `actions/github-script`
procurando um comentário existente do bot antes de criar um novo. O `concurrency` do topo do
arquivo (workflow inteiro, `cancel-in-progress: true`, chaveado por `github.ref`) é diferente do
`concurrency` **de job** que a AC4 exige.

**Nota sobre a AC8 da `900-1` (C4):** essa AC (`grep -c "gate:tenancy\|tenancy"
.github/workflows/ci.yml` → 0) está vermelha em `HEAD` desde que a `900-2c` acrescentou o job
`tenancy-gate` — superação por desenho, já registrada como tal na própria `900-1` (`InReview`).
Não usá-la como referência de não-reescrita em nenhuma story futura que toque este arquivo.

**Duas correções do CodeRabbit no PR #524, achadas na revisão da Fatia A (que também continha o
arquivo desta story — daí o CodeRabbit ter revisado as duas juntas), e o desfecho final de cada uma:**
1. **A régua de não-reescrita comparava o campo errado.** `git diff --numstat` emite
   `<adições>\t<deleções>\t<caminho>` — o campo 3 é o caminho (string), não as deleções (campo 2).
   Medido no PR: `69\t0\tdocs/backlog.md`. Corrigida para
   `git diff --numstat ... | awk '$2 != 0 { exit 1 }'` (ver AC4 para a mutação completa e para a
   caracterização correta do defeito — a régua antiga ficava **vermelha sempre**, não verde sem
   medir).
2. **O job, como desenhado na v0.1, não terminava em estado conhecido — o banco de teste é
   compartilhado por todas as execuções de todos os PRs, e `concurrency` só impede execução
   simultânea, não restaura estado.** A primeira resposta a este achado foi fazer o job resetar o
   banco ao estado de `origin/<base_ref>` antes de cada execução (custo: 456,6s por execução). O
   dono do produto foi além e **eliminou a causa**: o job deixou de escrever no banco — passou a
   rodar só `pnpm db:status` (leitura) e avisar no PR, porque o fluxo manual (`db:status`/
   `db:apply`, AC2) já resolvia o problema que a escrita automática tentava resolver, sem o efeito
   colateral. Ver AC4 para o desenho atual — não há mais tabela de opções de reset, porque não há
   mais o que resetar.

### `docs/deploy-flow.md` — conteúdo integral atual (para orientar a reescrita da AC5)
```markdown
# Deploy Flow — Trifold CRM
## Ambientes
| Ambiente | Supabase | Canal | Branch |
| Staging | dsopqkqjkmhytudaaolv | Telegram | staging |
| Producao | (a criar) | WhatsApp Cloud API | main |
## Migrations
./scripts/sync-schema.sh staging
./scripts/sync-schema.sh both
```
`dsopqkqjkmhytudaaolv` é produção real, rotulado "Staging". `sync-schema.sh` exige `--env <valor>`,
não aceita `staging` posicional.

### `docs/audits/` — convenção já estabelecida
`rls-gate-baseline.json`/`tenancy-allowlist.yml` já usam campo `_aviso` explicando "o banco é a
verdade, este arquivo é o diff de PR". Reusar para `migrations-aplicadas.json` (agora chaveado por
ambiente — S5).

### Runbooks — convenção já estabelecida
`docs/runbooks/aplicar-242-243-live-coach.md`/`aplicar-209-210.md`: nome
`aplicar-{números}-{descrição-curta}.md`, estrutura (contexto curto, pré-condições verificáveis por
SQL, passos numerados, conferência final). O runbook da Task 1.4 segue o mesmo molde.

### Testing Standards
Story de infraestrutura — validada por execução real contra o ambiente de teste, com evidência
colada no Dev Agent Record, mesmo padrão da `900-3` e da `900-3b`. Sem suíte Vitest nova nesta
fatia (a extração de `runSql`/`splitStatements` reusa os testes que a `900-3b` já cobre
indiretamente via `db-env.test.ts`, se aplicável; caso contrário, validação manual documentada).

---

## Testing

### Abordagem
Infraestrutura validada por execução real contra `trifold-crm-dev`, com evidência colada no Dev
Agent Record.

### Cenários de teste (por AC, resumo)
1. Ledger: `db:status` falha nomeando a tabela se o runbook não rodou; limpo depois.
2. `db:apply`: migration alterada pós-registro bloqueia; `--yes` recusado em produção; regra de
   extração (`grep` ancorado com exclusão declarada) verde.
3. Reset: depois de `--confirmar`, `db:status` não mostra nada `PENDENTE`.
4. CI (leitura + aviso, sem escrita): guard de fork barra PAT; régua de não-reescrita corrigida
   (`git diff --numstat ... | awk '$2 != 0 { exit 1 }'` + contagem de jobs) verde; `fetch-depth: 0`
   presente; comentário **sempre** presente in-place com três estados nomeados — pendente (cobrindo
   `PENDENTE` e `ALTERADA-APÓS-APLICAR`, textos distintos), limpo, não-foi-possível-verificar
   (nunca "nenhum comentário"); controle positivo real da `245` capturado com janela nomeada antes
   da Task 1.4 aplicar; dois PRs rodando o job ao mesmo tempo não interferem entre si (sem
   `concurrency`, porque não há escrita).
5. Documentos: `deploy-flow.md` não rotula produção como "Staging"; `sync-schema.sh` não existe.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Migration `245` (ou o número real no dia) colide com outra story do epic em paralelo — já aconteceu uma vez durante o draft original (`244` tomado pelo PR #522), quarta ocorrência do mecanismo do §0.1 do epic | Alta — medido, não hipotético | Task 1.1 reconfirma o número por varredura completa de refs (com `fetch`), nunca usa valor herdado deste documento |
| R2 | Job de CI (AC4) vaza `SUPABASE_MANAGEMENT_PAT` para PR de fork | Alta se ocorrer, baixa probabilidade | Guard `head.repo.full_name == github.repository` obrigatório, testado explicitamente |
| R3 | Contradição entre a remoção de `sync-schema.sh` e o epic §461 vira fonte de confusão futura | Baixa — mérito já resolvido pelo `@po` | Item `[EPIC-900]` aberto em `docs/backlog.md`, endereçado ao `@pm`, com a evidência de que a `900-3` nunca usou o script (T1.1-T1.4 desmarcadas) |
| R4 | ~~Esta fatia começa antes da `900-3b` mergear~~ — **resolvido**: `900-3b` mergeou (PR #524, `77f225d1`) antes desta story avançar | Baixa (era Média, materializou-se corretamente sem colisão) | Já não se aplica; mantido para registro do padrão |
| R5 | ~~O banco de teste é compartilhado entre execuções do job de CI de PRs diferentes, e o job escreve nele~~ — **eliminado pela raiz**: o dono do produto decidiu que o job deixa de escrever (só `db:status`, leitura pura). Sem escrita não há estado a herdar entre PRs, nem banco a corromper — o risco não foi mitigado, deixou de existir | N/A (era Alta) | Nenhuma — o mecanismo que criava o risco não existe mais no desenho atual |
| R6 | O aviso do job de CI (comentário no PR) vira ruído se o `db:status` completo (não filtrado pelos arquivos do PR) for usado como base do comentário — migrations pendentes de **outras** stories, sem relação com o PR, apareceriam junto | Baixa | AC4 restringe explicitamente a comparação aos arquivos de migration que o próprio PR modifica (`git diff --name-only`), nunca ao relatório completo do `db:status` |

---

## Dependencies

- ~~Depende de: `900-3b` (Fatia A) mergeada~~ — **satisfeita**: PR #524 mergeou (`77f225d1`).
  Branch desta story (`story/900-3c-registro-migrations`) criada de `origin/main` no mesmo commit —
  não a partir da branch squash-mergeada da Fatia A (o `@devops` mediu que a árvore dela é idêntica
  à da `main`, e sair de uma branch já squash-mergeada faz `rebase` conflitar). As Tasks 2 e 3
  seguem operando sobre o `reset-tenancy-testdb.ts` já modificado pela `900-3b` (`db-env.ts`,
  `supabase-refs.ts`, dry-run, `FALHAS_CONHECIDAS` — ver Dev Notes).
- ~~Depende de: merge do PR #522~~ — **satisfeita**: #522 mergeou (`77f225d1`) antes desta
  story avançar. A Task 1.1 ainda reconfirma o número por varredura completa de refs (nunca herda
  `245` deste documento), porque outro PR pode tomá-lo entre esta redação e a implementação — o
  mecanismo continua o mesmo, só a dependência específica do #522 foi resolvida.
- **Depende de:** `900-3` (harness do Supabase descartável — ambiente de teste e secrets já
  existentes) e `900-1` (esteira de CI — a AC4 acrescenta job a um arquivo que só existe por
  causa dela).
- **Bloqueia:** o início efetivo da Onda 2 do plano aprovado e as stories `900-17`/`900-18` do
  epic.

---

## Definition of Done

- [ ] AC1-AC5 cumpridos, com evidência de comando colada no Dev Agent Record
- [ ] Migration do ledger aplicada manualmente em teste **e** em produção, runbook documentado e
  executado
- [ ] `pnpm db:status`/`pnpm db:apply` funcionam contra o ambiente de teste, com o contrato de
  exit code corrigido (C6)
- [ ] `pnpm reset:testdb --confirmar` popula o ledger (`via='reset'`)
- [ ] Job de CI novo presente em `.github/workflows/ci.yml`, arquivo não reescrito (régua
  `awk '$2 != 0 { exit 1 }'`, corrigida pelo CodeRabbit, verde); `fetch-depth: 0` presente (B2)
- [ ] Job de CI **não escreve** no banco de teste — só `pnpm db:status` (leitura) + comentário no
  PR quando a migration da própria PR ainda não estiver aplicada no teste (`PENDENTE` **e**
  `ALTERADA-APÓS-APLICAR`, G5); sem `concurrency` de banco (não é mais necessária)
- [ ] Comentário do job **sempre presente**, três estados nomeados, nunca "nenhum comentário" (G2);
  controle positivo da `245` capturado com janela nomeada, colado no Dev Agent Record (G3)
- [ ] `docs/deploy-flow.md` reescrito; `scripts/sync-schema.sh` deletado; contradição com o epic
  §461 registrada e reportada
- [ ] Nenhum valor de segredo em arquivo versionado
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS aceitos
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration`
> ausente). Validação de qualidade usará processo de revisão manual pelo @architect, mesmo padrão
> das stories `900-3`, `900-3b` e `900-14b`.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-29 | 0.1 | Story criada como Fatia B do split de `900-3b` v0.2, após validação `@po` NO-GO 6/10 (`docs/qa/po-validation-900-3b.md`), aplicando a fronteira "quem escreve DDL em produção" (§1.3 do parecer) e as correções C4 (régua de CI corrigida — a AC8 da `900-1` estava superada e vermelha em `HEAD`), C5 (grep de extração ancorado, com exclusão declarada de `scripts/gate-tenancy.ts:215`), C6 (contrato de exit code de `db:status` sem contradição), C8 (varredura de refs com `git fetch` obrigatório e regex de 3 dígitos genérico) e S2 (contradição entre deletar `sync-schema.sh` e o epic §461, registrada e reportada, não resolvida por esta story). Herda a correção C8 da linhagem `900-3b` v0.2 (número de migration `245`, não `244`, por causa do PR #522). | @sm (River) |
| 2026-08-29 | 0.2 | **Validação `@po`: GO 8/10** (`docs/qa/po-validation-900-3c.md`) — as 4 correções bloqueantes (C4, C5, C6, C8) verificadas por execução real, nenhuma reprovada. Aplicada a recomendação **T4** (régua de varredura de refs cega para variantes com sufixo de letra — `024b_`, `028a_`, `028b_`, que existem hoje no repositório; padrão corrigido de `^[0-9]{3}_` para `^[0-9]{3}[a-z]?_`). **Status não avança para `Ready`** — bloqueado por dependência (`900-3b` precisa mergear primeiro; PR #522 de preferência também) conforme o próprio parecer do `@po`. Recomendações T1, T2, T3, T5 (forma de saída de comando e canal do S2, já assumido pelo `@po` via item em `docs/backlog.md`) ficam registradas para aplicação quando esta fatia for retomada, próximo da `Ready` real. | @sm (River) |
| 2026-08-29 | 0.3 | **Destravada — `900-3b` mergeada (PR #524, `77f225d1`); duas correções do CodeRabbit aplicadas + remedições pós-merge.** Branch nova `story/900-3c-registro-migrations`, criada de `origin/main` (não da branch squash-mergeada da Fatia A, por decisão do `@devops`). **Correção 1 (bug de régua):** a régua de não-reescrita do job de CI comparava o campo 3 do `git diff --numstat` (o caminho, uma string) em vez do campo 2 (deleções) — "como estava escrita, não validava nada" (medido no PR: `69\t0\tdocs/backlog.md`). Corrigida para `awk '$2 != 0 { exit 1 }'`, com a mutação que a derruba nomeada — é a terceira régua desta série que ficaria verde sem medir. **Correção 2 (defeito de desenho):** o job de CI aplicava migrations num banco de teste **compartilhado entre PRs**, sem reset ao início — o resultado passava a depender da ordem de PRs anteriores (falso-verde por migration de PR abandonado; falso-vermelho por deriva de estado). Avaliei 4 opções com custo (banco por PR, rollback automático, aceitar-e-medir, reset-antes) e escolhi **reset ao estado de `origin/<base_ref>` antes de cada execução** — único mecanismo que fecha os dois modos de falha sem reabrir a decisão D6 do epic nem inventar rollback que este repositório não tem; custo aceito: 456,6s por execução (medido), pago por um job não-bloqueante. **Remedições pós-merge:** migration `245` reconfirmada (o caso real do `#522` — visto no branch antes, confirmado em `main` depois — prova por que a régua varre todas as refs); 267 arquivos de migration (não 266); 22 prefixos duplicados (não 21); duração do reset (456,6s) incorporada onde a story dizia "não medido". Volta ao `@po` para GO focado nas duas correções do CodeRabbit, não revalidação inteira do conteúdo já aprovado. | @sm (River) |
| 2026-08-29 | 0.4 | **O job de CI deixa de escrever — decisão do dono do produto.** Redesenho completo da AC4/Task 4, motivado por uma releitura do próprio problema: o fluxo que o dono do produto sempre quis é o manual — aplicar a migration no teste, conferir, aplicar em produção — que `pnpm db:status`/`db:apply` (AC2) já entregam **sem nunca ter dado problema**. Toda a complicação da v0.3 (reset a cada execução, banco de desenvolvimento destruído dezenas de vezes por dia, `concurrency`, os 456,6s por execução, a tabela de quatro opções de mitigação) vinha de o job **escrever** — um extra que o job se deu para oferecer uma garantia ("a migration foi aplicada") que o fluxo manual já oferecia. **A lição que fica, e que vale mais que a correção em si: um job automático de escrita foi acrescentado para reforçar uma garantia que o processo manual já dava, e pagou por isso com um efeito colateral que quase custou o banco de desenvolvimento compartilhado de todos.** Novo desenho: o job roda só `pnpm db:status` (leitura) e comenta no PR quando a migration da própria branch ainda não estiver aplicada no teste — nada de `db:apply`, `reset:testdb` ou `--confirmar` na CI. Consequências, todas registradas nas seções correspondentes: B1 (risco do banco de dev destruído) deixa de existir, não foi mitigado; F4 (semântica do `concurrency` com 3+ execuções) deixa de importar, porque `concurrency` sai do desenho — leitura pode rodar em paralelo; os 456,6s somem do custo por execução; a herança de estado entre PRs desaparece, porque era consequência direta da escrita. **O que não mudou:** `db:status`/`db:apply` (AC2) seguem intocados — são a entrega principal; a migration `245` segue; **B2 permanece válido e agora explícito na AC** (`fetch-depth: 0`, precedente já existente em `ci.yml:115-119`, mesmo comentário de justificativa reaproveitado); a correção do bug do `--numstat` permanece, mas com a caracterização corrigida — a régua antiga **não** ficava verde sem medir (como o Change Log 0.3 registrou, incorretamente), ficava **vermelha toda vez que o arquivo era tocado**; uma régua sempre-vermelha não absolve nada em silêncio, ela é descartada por quem a roda, e é esse descarte que é a falha real — o `@po` atribuiu o erro à própria especificação dele, repetida sem correção em duas rodadas. **A lição das âncoras literais** (qualquer teste que reuse `db-env.ts`/`supabase-refs.ts` usa string literal, nunca importa a constante) **saiu do Dev Notes e virou requisito explícito na AC2 e na Task 2.3** — Dev Notes não prende o `@dev`, AC e Task prendem. Volta ao `@po` para GO focado no desenho novo (bem menor que o anterior), não revalidação inteira. | @sm (River) |
| 2026-08-29 | 0.5 | **GO condicional do `@po` (Rodada 3) — dois obrigatórios (G2, G5) e três recomendados (G1, G3, G4) aplicados, sem revalidação de conteúdo pendente.** O `@po` confirmou que o redesenho v0.4 é melhor que as quatro opções da tabela anterior e que a quinta que ele mesmo havia proposto (transação + `ROLLBACK`): tirar a escrita não mitigou B1 (banco de dev destruído) — **dissolveu**; idem F4 (semântica do `concurrency` sob 3+ execuções, que ele se recusou a afirmar na Rodada 2) deixou de ser pergunta. **G2 (obrigatória):** o job agora **sempre** comenta, in-place, com três estados nomeados — `pendente`, `limpo`, `não foi possível verificar` — nunca mais "nenhum comentário" como desfecho válido; sem isso, cinco situações (limpo de verdade, sem migration, `fetch-depth` errado, `db:status` saindo `1`, parsing quebrado) ficavam visualmente idênticas, três delas falhas, porque `git diff --name-only` devolve vazio com exit 0 tanto para "sem migration" quanto para "não consegui resolver as refs". **G5 (obrigatória):** o aviso cobre `PENDENTE` **e** `ALTERADA-APÓS-APLICAR` — um PR que edita migration já aplicada (a classe mais perigosa, que a AC2 trata bloqueando o `db:apply` inteiro) tinha saído por arrasto no encolhimento v0.3→v0.4, mesmo sendo detectável só com leitura. **G1:** qualificado que "leitura pura" vale para o banco, não para a árvore — `db:status` regenera `docs/audits/migrations-aplicadas.json` (rastreado), e a AC agora diz que o job não commita nem falha por árvore suja. **G3:** nomeada a janela do controle positivo real (a própria migration `245` desta story) — capturar o comentário do job **antes** da Task 1.4 aplicá-la, nova Task 4.6. **G4:** o bloco `bash` com a régua errada, que sobrevivia sob "Substituída por:" e foi exatamente como o bug entrou da primeira vez, marcado `❌ VERSÃO ERRADA — não copiar`. **Nota para a memória, do próprio `@po`:** ele havia apresentado quatro caminhos de mitigação para B1 e uma quinta opção sua — o dono do produto não escolheu nenhum, reenquadrou o problema e perguntou por que o job escrevia. A quinta opção do `@po` era estritamente pior (eliminava a destruição mas mantinha a escrita e a complexidade, comprando uma garantia que ninguém tinha pedido). Corolário registrado em `feedback_job_de_ci_que_escreve_e_extra_caro.md`: **quatro opções de mitigação são sinal de que o problema está no mecanismo, não na escolha entre elas.** Vai direto ao `@dev` — sem nova rodada do `@po`. | @sm (River) |
| 2026-08-29 | 0.6 | **Implementada pelo `@dev` (Dex), modo YOLO.** Migration `245` reconfirmada por varredura de todas as refs com `git fetch --prune` (máximo `244`, `245` livre); 268 arquivos, 22 prefixos duplicados. **Controle positivo do `fetch`** construído em repositórios descartáveis, porque hoje nenhum prefixo existe só em ref remota — sem `fetch` a régua propõe um número já tomado por PR aberto. **`runSql`/`splitStatements` extraídos** para `scripts/lib/management-api.ts`; régua C5 verde nos 3 arquivos (baseline era 2), exclusão de `gate-tenancy.ts:215` confirmada e não afrouxada. **`db:status`/`db:apply`** com o contrato de exit code do C6 exercido nos dois lados (produção sem a tabela → `1`; teste com 268 `PENDENTE` reais → `0`), e os **quatro** estados produzidos contra o banco real, não só em teste unitário. **Reset** rodado de verdade (`464,4s`, 0 regressões) e populando o ledger. **Job de CI** acrescentado com `+151/-0` no `ci.yml`, `fetch-depth: 0`, guard de fork, sem `concurrency` e sem nenhum comando de escrita (medido por grep no bloco do job). **Controle positivo G3 capturado na janela real** entre os Passos 1 e 2 do runbook — comentário nomeando `245_registro_de_migrations.sql` como `PENDENTE`, colado no Dev Agent Record; os três estados do G2 e o texto severo do G5 exercidos ponta a ponta pelo CLI. 25 testes novos, com 4 mutações que os derrubam. **Três correções não previstas pela story, todas com vermelho medido:** o truncamento de 800 caracteres do `runSql` (quebrava a leitura do ledger); a violação de **R3** que a tabela nova introduzia na catraca de tenancy (isenta na allowlist com razão, `R3: 3 → 2`); e o envenenamento de `docs/audits/gate-tenancy-report.json` por rodar `gate:tenancy` fora de produção (restaurado). **Divergência registrada:** a nota do spawn afirmava que a `900-3b` já havia entregue `scripts/lib/management-api.ts` — não havia; a story estava certa, a nota não. | @dev (Dex) |
| 2026-08-29 | 0.7 | **Rodada 2 — gate do `@qa` (CONCERNS) respondido.** **CONCERNS-1 (medium):** a AC4 excluía `ÓRFÃ-no-banco` alegando que ele *"não pode ser um arquivo que o PR traz"* — **justificativa falsificada por medição**: `git diff --name-only` lista caminho apagado, e um PR que APAGA migration já aplicada recebia `✅ limpo` com o corpo listando o estado órfão. AC4 corrigida com a refutação registrada, aviso passa a cobrir os **três** estados possíveis para arquivo tocado pelo PR, com bloco `⛔ REMOVIDA` próprio; reproduzido contra o banco real (apagar `244_…sql` rastreado → `ÓRFÃ-no-banco 1` → aviso acende) e mutação M5 (`removidas = []`) derruba 3 dos 28 testes. **NIT-8** junto: manchete deixou de dizer "não aplicada(s)", que era falso para `ALTERADA` e para `ÓRFÃ`. **CONCERNS-2 (low):** o `COMMENT ON COLUMN … via` da `245` documentava 3 valores e o código grava 4 — corrigido no `COMMENT` e no cabeçalho **antes** de o `@devops` aplicar em produção. A correção **atravessou a ferramenta desta própria story**: editar a `245` já aplicada disparou `ALTERADA-APÓS-APLICAR` e o `db:apply` recusou em bloco (exit 1) — saída real colada no Dev Agent Record. Remediação pelo **caminho legítimo**, documentada no runbook antes de ser executada (`DELETE` do registro obsoleto → `PENDENTE` → `db:apply` observa e grava `via='apply'`), com o `COMMENT` conferido de dentro do banco. A linha 3 do Rollback do runbook também foi corrigida: regerar o backfill inteiro fora da janela pós-Passo-2 apagaria as proveniências `reset`/`apply`. **CONCERNS-3 (low):** interpolação `${{ }}` saiu de dentro de `run:` — **dois** valores, não um (achei `github.base_ref` na mesma varredura); 0 linhas de `run:` com interpolação no bloco do job. **OBS-5:** falha ao gravar o ledger virou contador no `=== RESUMO ===` + bloco de erro nomeando que a invariante da AC3 não vale — **divergência registrada**: o `@qa` ofereceu exit code *ou* resumo, o coordenador instruiu que não pese no exit code, e eu implementei a forma que satisfaz os dois. **OBS-6:** o conhecimento sobre o `gate-tenancy-report.json` saiu da story e foi para `scripts/gate-tenancy.ts` (`_aviso` no JSON gerado + alerta impresso quando o alvo não é produção) e para o próprio JSON rastreado (`1  0`). **CONCERNS-4:** fechada por medição — com o commit local existindo, rodei a régua **literal** da AC: `164 0` → exit 0, e `164 5` → exit 1 sob a mutação nomeada (clone descartável, árvore principal intacta). Fica só a repetição pós-squash para o `@devops`. Gates: 274 arquivos, **3514 passed**, lint 0 errors, type-check 8/8. | @dev (Dex) |
| 2026-08-29 | 0.8 | **Rodada 3 — CodeRabbit no PR #525 (`CHANGES_REQUESTED`, 4 Major + 4 minor), todos tratados, nenhum descartado.** **Major 1:** a guarda de indeterminação era `casados.length === 0` — com 2 migrations no PR e 1 no relatório, a segunda saía **sem veredito** debaixo de um `✅ limpo`. Virou guarda de **cobertura** (`semVeredito.length > 0`), nomeando quem ficou de fora; controle positivo é o próprio caso do achado, e virou teste. **Major 2:** o `ON CONFLICT DO UPDATE` regravava o `sha256` e apagava a detecção de `ALTERADA-APÓS-APLICAR` — a razão de o ledger existir. Um construtor virou três, cada um com a **precondição escrita**: `db:apply` usa `DO NOTHING RETURNING` e **nunca sobrescreve** (conflito vira anomalia nomeada); o reset declara `sobrescrever: true` porque o `drop schema cascade` acabou de recriar a tabela vazia; o backfill declara `sobrescrever: false` e o SQL vem com `RAISE EXCEPTION` que o aborta se o ledger não estiver vazio — guarda exercida contra o banco povoado, `P0001`, ledger intacto. `sobrescrever` não tem default: quem chama declara em qual mundo está. **Major 3:** o fallback autocommit seguia executando statements depois do erro, aplicando DDL sem registrar; agora para no primeiro `!s.ok` e imprime "K de N statement(s) aplicaram", com o aviso de que não há rollback. **Major 4:** o aviso mandava apagar linha do ledger — isso tira o sinal sem tirar o efeito do banco; agora manda restaurar o arquivo ou criar migration nova. **Minors:** `CHECK` de domínio na `245` (`sha256` hex de 64 e os quatro valores de `via`, com bloco `DO $$` idempotente porque `CREATE TABLE IF NOT EXISTS` pula as constraints), os dois reprovando de verdade contra o banco (`23514`) com controle positivo; `--excluir` inválido agora falha antes de gerar SQL (0 bytes, exit 1) e nasceu `--sobrescrever` opt-in; `listComments` paginado (`per_page: 100`) para o update in-place não virar comentário novo a cada push em PR longo; e o passo do runbook que "validava o projeto" com `current_database()` — medido: responde `postgres`/`main` nos **dois** projetos — trocado por três conferências reais (banner `[db-env] ref=`, `supabase:check`, ref na URL do SQL Editor) mais um discriminador de conteúdo (`organizations`). **A `245` foi editada duas vezes na série e as duas vezes a própria ferramenta acusou `ALTERADA-APÓS-APLICAR` e o `db:apply` recusou** — atravessei pelo Procedimento de exceção do runbook, nunca por atalho. **Registrado que esta fatia aumenta o `MNT-001`**: ~1.400 linhas de `scripts/*.ts` fora do `lint`/`type-check` do CI (o `--force` derruba cache, não amplia denominador); quem cobre é a suíte, e eu rodo `tsc` dedicado à mão em toda rodada. 3 mutações novas (M6/M7/M8) provadas em disco. Gates: **3520 passed**, lint 0 errors, type-check 8/8. | @dev (Dex) |
| 2026-08-29 | 0.9 | **Rodada 4 — R3-1 do gate do `@qa` (o único bloqueante) fechado.** Na rodada 3 apliquei a paginação do `listComments` com um `replace(..., 1)` sobre um bloco que existe **duas vezes** no `ci.yml`; `replace` pega a primeira ocorrência e o `tenancy-gate` vem antes — paginei o job da `900-2c` e deixei o **desta story** sem paginar. Reproduzido byte a byte a partir do commit `f6c21b21`: `github.paginate` na linha 192 (tenancy-gate) e `existentes.data.find` na 359 (migrations-do-pr, que começa na 228). **Escolhi remover, não declarar** — o conserto do `tenancy-gate` é bom, mas é de outra story, e declará-lo aqui alargaria o escopo desta fatia para acomodar um engano de execução. O `tenancy-gate` voltou a ser **byte a byte** o de `origin/main` (`diff` sem diferença nas linhas 105-194) e o job desta story ganhou a paginação onde a AC4 a exige. **E o achado que vale mais que a correção: a régua de não-reescrita da AC4 era CEGA para linha movida verbatim** — as duas linhas retiradas do `tenancy-gate` continuavam existindo idênticas dentro do job novo, o LCS do `git diff` casou as duas e representou a modificação como **inserção pura** (`170 0`, verde, com o arquivo modificado no meio); o item de DoD estava satisfeito **por vacuidade**. Acrescentei à AC4 uma régua **complementar de forma do diff** — um hunk só, começando depois da última linha da base — medida nos dois estados reais: no commit com o defeito, `numstat` verde e forma **exit 1** (`@@ -187,0 +188,170 @@`); no corrigido, as duas verdes (`@@ -194,0 +195,171 @@`, e 194 é a última linha da base). Confirmei também o contrafactual do `@qa` (paginar os dois jobs → `175 2` → exit 1). Nada de `scripts/`, `supabase/` ou banco nesta rodada. Gates: **3520 passed**, lint 0 errors, type-check 8/8, `tsc` dedicado de `scripts/` limpo. | @dev (Dex) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), modo YOLO, 2026-08-29.

### Debug Log References

Todas as medições abaixo foram **executadas**, não inferidas. Onde a prova é de mutação, a
mutação foi comprovada **por conteúdo em disco** (`grep -c`), nunca por `git diff` — este último
mente para arquivo novo não rastreado.

#### AC1 — número da migration, remedido no dia (Task 1.1)

```
$ git fetch --prune origin && for r in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin); do
    git ls-tree --name-only "$r" -- supabase/migrations/ 2>/dev/null | sed 's|.*/||'
  done | grep -oE "^[0-9]{3}[a-z]?_" | sort -u | tail -3
242_  243_  244_
```
Maior prefixo em **todas** as refs = `244`; **`245` livre**. Refs que carregam a `244`:
`origin/main`, `origin/HEAD`, `origin/story/900-22b-convite-admin`,
`origin/story/900-3b-ambiente-teste-e-promocao`.

Contagens do dia: **268** arquivos `.sql` (267 antes desta story + a `245`); **22** prefixos
duplicados (`ls … | grep -oE "^[0-9]{3}" | sort | uniq -d | wc -l` → 22 — confere com a lista da
story; agrupar por `^[0-9]{3}[a-z]?` daria 20, porque separa `024` de `024b`).

**Controle positivo do `git fetch` (a AC pede demonstrar que ele não é decorativo).** Não foi
possível reproduzir com dados reais — hoje **nenhum** prefixo existe só em ref remota
(`comm -13` entre prefixos de `HEAD` e de todas as `refs/remotes/origin` → vazio). Construí então
um controle causal, em repositórios descartáveis no scratchpad: `upstream` com `main` (contendo
`100_a.sql`) e, criada **depois** do clone, uma branch `feature` com `101_b.sql`.

```
=== RÉGUA SEM 'git fetch --prune origin' (índice desatualizado) ===
100_
=== RÉGUA COM 'git fetch --prune origin' primeiro ===
100_
101_
```
Sem `fetch`, a régua proporia `101` — colisão com a migration do PR aberto. É o mesmo mecanismo
que quase produziu a colisão da `244` durante o draft.

#### AC2 — contrato de exit code, executado nos dois lados

**Sai `1` quando a tabela não existe** — janela T3, `db:status` contra **produção**, onde a `245`
ainda não foi aplicada (leitura pura, não exige `TRIFOLD_ALLOW_PROD`):

```
$ TRIFOLD_ENV=producao pnpm db:status
[db-env] ambiente=producao ref=dsopqkqjkmhytudaaolv escreve=false ⚠️ PRODUÇÃO
ABORTADO: a tabela trifold_migrations_aplicadas não existe no projeto dsopqkqjkmhytudaaolv (ambiente "producao").
  Ela é criada por supabase/migrations/245_registro_de_migrations.sql, que precisa ser aplicada À MÃO uma vez em cada ambiente.
  Runbook: docs/runbooks/aplicar-245-registro-migrations.md
EXIT=1
```

**Sai `0` com `PENDENTE` de verdade** — logo após aplicar só o DDL da `245` no teste, com o
ledger ainda vazio:

```
aplicada 0 · PENDENTE 268 · ALTERADA-APÓS-APLICAR 0 · ÓRFÃ-no-banco 0
EXIT=0
```

**Os quatro estados, exercidos contra o banco real** (não só em teste unitário):

| Estado | Como foi produzido | Resultado |
|---|---|---|
| `PENDENTE` | 245 aplicada, ledger vazio | 268 PENDENTE, exit 0 |
| `aplicada` | após o backfill | 268 aplicada, exit 0 |
| `ALTERADA-APÓS-APLICAR` | `printf -- "-- byte de mutação\n" >> 245_….sql` (mutação provada em disco: `grep -c "byte de mutação"` → **1**) | 267 aplicada · 1 ALTERADA, exit **0** (relatório, não gate) |
| `ÓRFÃ-no-banco` | `rm` da migration descartável `999_smoke_db_apply_descartavel.sql` já registrada | 1 ÓRFÃ, exit 0 |

**`db:apply` sob `ALTERADA-APÓS-APLICAR`:**
```
ABORTADO: 1 migration(s) mudaram DEPOIS de terem sido aplicadas em xnxvygyfyyyzwhiuoehz. Nada foi aplicado.
  - 245_registro_de_migrations.sql
EXIT = 1
```
Mutação revertida em seguida (`grep -c "byte de mutação"` → **0**).

**`db:apply --yes` sob `TRIFOLD_ENV=producao`:**
```
ABORTADO: --yes só é aceito com TRIFOLD_ENV=teste. Em produção (dsopqkqjkmhytudaaolv) a
confirmação é digitar o ref do projeto, e ela não pode ser dispensada por flag.
EXIT = 1
```
E sem a flag de ambiente, a guarda anterior (da `900-3b`) barra primeiro:
`ABORTADO: escrever em PRODUÇÃO (dsopqkqjkmhytudaaolv) exige TRIFOLD_ALLOW_PROD=1.`

**Caminho positivo do `db:apply`** (migration descartável, aplicada e removida antes do fim):
```
1 migration(s) PENDENTE(s): 999_smoke_db_apply_descartavel.sql
  ✓ 999_smoke_db_apply_descartavel.sql
1 migration(s) aplicada(s) e registrada(s) (via='apply').
$ select arquivo, via … where via='apply'
[{"arquivo":"999_smoke_db_apply_descartavel.sql","via":"apply"}]
```
Arquivo removido do disco e linha removida do ledger depois da prova.

#### AC2 — régua de extração ancorada (Task 2.5, correção C5)

Baseline (o vermelho de partida, medido em `HEAD` antes da extração): `2` ocorrências, ambas em
`scripts/reset-tenancy-testdb.ts`. Depois da extração:

```
$ grep -c "function runSql\|function splitStatements" scripts/reset-tenancy-testdb.ts scripts/db-status.ts scripts/db-apply.ts
scripts/db-apply.ts:0
scripts/db-status.ts:0
scripts/reset-tenancy-testdb.ts:0

# forma alternativa recomendada pelo @po (T2), imune à diferença de formato entre greps:
$ grep -l "function runSql\|function splitStatements" scripts/reset-tenancy-testdb.ts scripts/db-status.ts scripts/db-apply.ts
(nenhum arquivo listado — exit 1)
```

**Exclusão declarada, fora do escopo desta AC** (confirmada, não afrouxada):
```
$ grep -n "function runSql" scripts/gate-tenancy.ts
215:async function runSql<T>(sql: string, pat: string): Promise<T[]> {
```
Assinatura `(sql, pat)` contra `(ref, pat, sql)` — outro transporte, outra story (900-2a).
Não foi unificado, e a razão está escrita no cabeçalho de `scripts/lib/management-api.ts`.

#### AC3 — o reset popula o ledger (Task 3.2), execução real

```
$ pnpm reset:testdb --confirmar
OK (arquivo inteiro):   258
OK (autocommit split):  6
Falhas CONHECIDAS:      4
REGRESSÕES:             0
Asserções que falharam: 0
Conhecidas que NÃO falharam: 0
Duração: total 464.4s · p50 1232ms · p95 2815ms
Ledger: 264 arquivo(s) registrados em trifold_migrations_aplicadas (via='reset')
Ledger: 4 arquivo(s) registrados em trifold_migrations_aplicadas (via='reset-falha-conhecida')
Banco de teste reconstruído.        EXIT=0

$ pnpm db:status
aplicada 268 · PENDENTE 0 · ALTERADA-APÓS-APLICAR 0 · ÓRFÃ-no-banco 0     EXIT=0
$ select via, count(*) … group by via
[{"via":"reset","linhas":264},{"via":"reset-falha-conhecida","linhas":4}]
```

**O vermelho correspondente** (o estado que existiria sem esta AC) foi medido no mesmo dia: o
`drop schema public cascade` leva junto a própria `trifold_migrations_aplicadas`, a `245` a
recria vazia, e `db:status` reporta **268 PENDENTE** — que é exatamente o retrato capturado na
janela do controle positivo do job, acima.

#### AC4 — régua de não-reescrita do `ci.yml` (Task 4.4)

⚠️ **Divergência com a AC, medida.** A régua literal da AC
(`git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml`) compara **commits**. Como
esta fatia não commita (o @devops commita), ela devolve **saída vazia e exit 0 de graça** —
verde por vacuidade, sem medir nada. Rodei a forma que efetivamente mede a mudança desta story,
contra a **árvore de trabalho** (`origin/main`, sem `...`), e as duas formas convergem assim que
o commit existir:

```
# régua da AC, hoje (nada commitado ainda):
$ git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml
(vazio)                       → awk exit 0   [verde por vacuidade]

# a mesma régua contra a árvore de trabalho:
$ git diff --numstat origin/main -- .github/workflows/ci.yml
151     0       .github/workflows/ci.yml
$ … | awk '$2 != 0 { exit 1 }'   → exit 0     ✅ VERDE (só adições)

$ grep -c "^  static:\|^  tenancy-gate:" .github/workflows/ci.yml
2                                             ✅ continua 2
```

**Mutação nomeada pela AC — apagar o passo `lint` do job `static`:**
```
$ git diff --numstat origin/main -- .github/workflows/ci.yml
151     5       .github/workflows/ci.yml
$ … | awk '$2 != 0 { exit 1 }'   → exit 1     🔴 VERMELHO (correto)
```

**E a régua ANTIGA (campo 3, o caminho) na mudança SEM deleção nenhuma:**
```
$ git diff --numstat origin/main -- .github/workflows/ci.yml | awk '$3 != 0 { exit 1 }'
exit 1                                        🔴 vermelha mesmo sem deleção
```
Confirma a caracterização corrigida pelo `@po`: a régua velha não ficava verde sem medir — ficava
**vermelha sempre que o arquivo era tocado**, e o modo de falha é o descarte por quem a roda.

#### AC4 — o job em si

```
$ python3 -c "import yaml; print(list(yaml.safe_load(open('.github/workflows/ci.yml'))['jobs']))"
['static', 'tenancy-gate', 'migrations-do-pr']

# grep restrito ao BLOCO do job novo (awk '/^  migrations-do-pr:/,0'):
  db:apply            -> 0        reset:testdb   -> 0
  --confirmar         -> 0        TRIFOLD_ALLOW_PROD -> 0
  concurrency         -> 0        db:status      -> 3
  fetch-depth: 0      -> 2 (comentário + chave)  if: always()   -> 2
  guard de fork (head.repo.full_name == github.repository) -> 1
  continue-on-error: true -> 1
```

**Task 4.6 (G3) — controle positivo REAL, na janela nomeada.** Capturado com o ledger de teste
existindo mas ainda **sem** a linha da `245` (isto é: depois do Passo 1 do runbook, antes do
Passo 2). O `git diff` do PR foi tornado visível com `git add -N` (intent-to-add), que é o que
reproduz na árvore o que o job verá quando o commit existir:

```
$ git diff --name-only origin/main -- supabase/migrations/
supabase/migrations/245_registro_de_migrations.sql
```

Comentário produzido pela lógica do job (`estado=pendente`):

> ## Migrations deste PR
>
> ⚠️ **Este PR traz 1 migration(s) não aplicada(s) no banco de teste.**
>
> **PENDENTE — ainda não aplicada no teste (1):**
> - `245_registro_de_migrations.sql`
>
> Aplique com `pnpm db:apply` antes de testar contra o banco de teste.
>
> > Job **não-bloqueante** e de **leitura pura sobre o banco** (`pnpm db:status`) …
> >
> > Este comentário é publicado **sempre**, em qualquer desfecho. Se ele não estiver aqui, o job não rodou.

Note que o aviso lista **só o arquivo do PR**, não os outros 267 `PENDENTE` que existiam naquele
instante — é o R6 da tabela de riscos fechado por execução, não por promessa.

**(G5) Comentário severo, capturado com a mesma mutação de byte da AC2** (`estado=pendente`,
texto **distinto** do caso brando):

> **⛔ ALTERADA-APÓS-APLICAR — mais grave (1):**
> - `245_registro_de_migrations.sql`
>
> Este PR **altera uma migration que já foi aplicada** no banco de teste: o `sha256` registrado
> no ledger não bate com o arquivo. **O `pnpm db:apply` vai recusar em bloco** (exit 1, sem
> aplicar nada) …

**(G2) Os três estados, exercidos ponta a ponta pelo CLI real** (não só por teste unitário):

| Estado | Como | Saída |
|---|---|---|
| ⚠️ pendente | `245` não registrada | `estado=pendente`, nomeia o arquivo |
| ⚠️/⛔ severo | `245` com byte alterado | `estado=pendente`, texto de `ALTERADA-APÓS-APLICAR` |
| ✅ limpo (com migration) | após o backfill | `estado=limpo`, lista a `245` como `aplicada` |
| ✅ limpo (sem migration) | `--diff` de arquivo vazio | `estado=limpo`, "não acrescenta nem modifica nenhum arquivo" |
| ⛔ fetch raso | `--motivo-diff "…checkout raso? fetch-depth: 0 ausente?"` | `estado=indeterminado`, **sem** `✅` no corpo |
| ⛔ `db:status` saiu 1 | `--status` apontando para arquivo inexistente | `estado=indeterminado`, cita a tabela e o runbook |
| ⛔ parsing sem casamento | relatório com `arquivo` que não casa com nenhum do PR | `estado=indeterminado`, "falha de apuração, não estado limpo" |

**Task 4.5 — ausência de `concurrency` é segura porque não há escrita.** Duas execuções
simultâneas de `db:status` contra o mesmo banco:
```
antes:  {"antes":268,"ultimo":"2026-08-29 17:47:25.571943+00"}
A exit=0 · B exit=0 · vereditos idênticos: True
depois: {"depois":268,"ultimo":"2026-08-29 17:47:25.571943+00"}
```
Contagem e `max(aplicada_em)` **idênticos** antes e depois — nenhuma das duas execuções escreveu.
(Não é possível disparar dois jobs reais do GitHub Actions daqui; o que dá para medir é a
propriedade que sustenta a afirmação, e ela foi medida.)

#### Mutações que provam que os testes novos reprovam (25 testes, 2 arquivos)

Cada mutação foi comprovada em disco por `grep -c` antes de rodar a suíte, e revertida depois.

| # | Mutação | `grep -c` da mutação | Resultado |
|---|---|---|---|
| baseline | — | — | **25 passed** |
| M1 (G2) | o terceiro estado some: "não consegui apurar" vira `✅ limpo` | 2 | 🔴 **2 failed** |
| M2 (G5) | o aviso volta a olhar só `PENDENTE` (`alteradas = []`) | 1 | 🔴 **2 failed** |
| M3 | `classificar` ignora o `sha256` (tudo no ledger vira `aplicada`) | 1 | 🔴 **2 failed** |
| M4 (S5) | o espelho deixa de reler o arquivo e sobrescreve as duas chaves | 1 | 🔴 **1 failed** |
| revertido | `grep -c "MUTAÇÃO"` → 0 nos dois arquivos | 0 | **25 passed** |

#### AC5 — documentos

```
$ ls scripts/sync-schema.sh
ls: scripts/sync-schema.sh: No such file or directory      (exit 1 ✅)

$ grep -in staging docs/deploy-flow.md
4,5,6:  (nota histórica explicando o erro que existia)
18:     "**Não existe branch `staging`.**"
```
Nenhuma linha rotula `dsopqkqjkmhytudaaolv` como "Staging"; a única menção ao ref está na tabela
de ambientes, sob **Produção**.

#### Gates finais

```
$ pnpm lint --force        → 8 successful, 8 total · 0 errors, 36 warnings (todos pré-existentes)
$ pnpm type-check --force  → 8 successful, 8 total
$ pnpm test                → 274 files passed · 3511 passed | 6 expected fail
```
`scripts/` não entra no `pnpm type-check` (o `turbo type-check` é por pacote, e `scripts/` não é
pacote — condição pré-existente, herdada da `900-3b`). Rodei um `tsc --noEmit` dedicado sobre os
arquivos desta story: **zero erros**.

#### RODADA 2 — respostas ao gate do @qa (CONCERNS, 2026-08-29)

**CONCERNS-1 — a quarta classe (`ÓRFÃ-no-banco`), fechada. Reproduzida contra o banco real.**
Mutação: apagar um `.sql` **rastreado** e já aplicado (`244_org_admin_invite_email.sql`), prova em
disco pelo `ls` do arquivo ausente.

```
$ git diff --name-only origin/main -- supabase/migrations/
supabase/migrations/244_org_admin_invite_email.sql          ← git diff LISTA caminho apagado

$ pnpm db:status
aplicada 267 · PENDENTE 0 · ALTERADA-APÓS-APLICAR 0 · ÓRFÃ-no-banco 1
ÓRFÃ-no-banco (1):  244_org_admin_invite_email.sql [via=reset]      EXIT 0
```

Aviso produzido (`estado=pendente`, era `estado=limpo` antes da correção):

> ⚠️ **1 migration(s) deste PR precisam de atenção no banco de teste.**
>
> **⛔ REMOVIDA — este PR apaga migration que consta como aplicada (1):**
> - `244_org_admin_invite_email.sql`
>
> O arquivo sai do repositório, mas o registro **fica órfão** no ledger do banco de teste
> (`ÓRFÃ-no-banco`): o efeito daquele SQL continua no banco e o repositório não tem mais como
> reproduzi-lo — `pnpm reset:testdb` reconstrói a partir dos arquivos, e esse deixou de existir.
> Se a remoção for intencional, apague também a linha correspondente de
> `trifold_migrations_aplicadas` em **cada** ambiente onde ela existe; se não for, restaure o
> arquivo.

Arquivo restaurado com `git checkout --` em seguida.

**Mutação M5 que prova o teste novo** (`grep -c "MUTACAO-C1"` → 1 antes, 0 depois):

| Estado | Testes |
|---|---|
| baseline | **28 passed** |
| `const removidas = []` (ÓRFÃ volta a sair do aviso) | 🔴 **3 failed / 25 passed** |
| revertido | **28 passed** |

Quatro testes novos, incluindo o **controle negativo** que impede a correção de virar ruído:
órfã que aparece no relatório mas que **este PR não toca** continua invisível ao aviso (o
cruzamento é pelos arquivos do PR — é o risco R6 da story, que a correção não podia reabrir).

**NIT-8 junto:** a manchete deixou de dizer "não aplicada(s)" — era falso para `ALTERADA` (foi
aplicada e depois editada) e para `ÓRFÃ` (foi aplicada e o PR apagou o arquivo). Agora é
neutra ("precisam de atenção") e cada bloco nomeia o que é. Há teste com
`not.toContain("migration(s) não aplicada(s)")`.

**CONCERNS-2 — o `COMMENT` do `via` corrigido, e a correção ATRAVESSOU a própria ferramenta.**
O `.sql` (cabeçalho + `COMMENT ON COLUMN`) enumerava 3 valores; o código grava 4. Corrigido
(`grep -c "reset-falha-conhecida"` no arquivo → **2**). Como a `245` já estava aplicada e
registrada no teste (`via='reset'`, sha `dab5cf88…`), editá-la disparou o gate desta própria
story. **Não contornei — atravessei, e a saída real é a melhor evidência de que a ferramenta
funciona: ela pegou uma alteração de verdade, não uma mutação de teste.**

```
--- 1. db:status  (relatório, não gate)
aplicada 267 · PENDENTE 0 · ALTERADA-APÓS-APLICAR 1 · ÓRFÃ-no-banco 0
ALTERADA-APÓS-APLICAR (1):  245_registro_de_migrations.sql [via=reset]
EXIT db:status = 0

--- 2. db:apply --yes  (gate: recusa em bloco)
ABORTADO: 1 migration(s) mudaram DEPOIS de terem sido aplicadas em xnxvygyfyyyzwhiuoehz. Nada foi aplicado.
  - 245_registro_de_migrations.sql
EXIT db:apply = 1

--- 3. aviso do job para o PR desta story
estado=pendente · "⛔ ALTERADA-APÓS-APLICAR — mais grave (1)" · "O `pnpm db:apply` vai recusar em bloco"
```

**Remediação pelo caminho legítimo, documentada ANTES de ser executada.** Acrescentei ao runbook
a seção *"Procedimento de exceção — corrigir UMA migration que já foi aplicada no teste"*, válida
**só** enquanto a migration não mergeou e não foi a produção. Três passos, e o terceiro é
observação, não declaração:

```
1. DELETE FROM trifold_migrations_aplicadas WHERE arquivo = '245_registro_de_migrations.sql';
   → o registro descrevia uma versão do arquivo que não existe mais

2. pnpm db:status
   aplicada 267 · PENDENTE 1 · ALTERADA-APÓS-APLICAR 0     ← PENDENTE é a VERDADE agora

3. pnpm db:apply --yes
   1 migration(s) PENDENTE(s): 245_registro_de_migrations.sql
     ✓ 245_registro_de_migrations.sql
   1 migration(s) aplicada(s) e registrada(s) (via='apply').

4. pnpm db:status
   aplicada 268 · PENDENTE 0 · ALTERADA-APÓS-APLICAR 0 · ÓRFÃ-no-banco 0     EXIT 0
```

**Por que `DELETE` + `db:apply` e não `UPDATE … SET sha256`:** o `UPDATE` seria uma *declaração*
de que o SQL novo rodou, sem ninguém ter visto. O caminho escolhido faz o banco **executar** o
arquivo e grava `via='apply'` — observação direta. A diferença entre declarar e observar é a
razão de o campo `via` existir, e o procedimento novo é o único do runbook que a exercita.

Estado final no banco, e o `COMMENT` conferido **de dentro** dele:
```
$ select via, count(*) … group by via
[{"via":"reset","linhas":263},{"via":"reset-falha-conhecida","linhas":4},{"via":"apply","linhas":1}]   (= 268)

$ select col_description(…, 'via')
"Proveniência do registro, quatro valores: backfill-onda-1 (declaração retroativa, NÃO é pr…"
```

**Também corrigi a linha 3 da tabela de Rollback do runbook**, que mandava "regerar e reaplicar o
Passo 2" para qualquer `ALTERADA-APÓS-APLICAR`. Fora da janela imediatamente posterior ao
backfill, isso **reescreve as 268 linhas com `via='backfill-onda-1'` e apaga as proveniências
`reset`/`apply`/`reset-falha-conhecida`** — trocaria observação por declaração em massa. A linha
agora delimita a janela e aponta para o procedimento de um arquivo só.

**CONCERNS-3 — interpolação fora do `run:`.** Movi **dois** valores para `env:`, não um: o @qa
apontou os `motivo`, e eu achei o terceiro na mesma varredura — `BASE="origin/${{ github.base_ref }}"`
no passo do diff, mesma classe (nome de branch dentro de string com aspas duplas, onde `$(…)` e
crase ainda expandem). Os motivos passam por array bash (`args+=(…)`), que também resolve o
espaçamento sem depender de `toJSON`. Medido no bloco do job:
```
$ linhas de `run:` com interpolação ${{ … }}  →  0
```
Segue o precedente do `tenancy-gate`, que já usa `GATE_TENANCY_BASE: origin/${{ github.base_ref || 'main' }}`
por `env:`.

**OBS-5 — falha ao gravar o ledger, alta mas fora do exit code.** ⚠️ **Divergência que registro
em vez de resolver sozinho:** o gate do @qa pede *"somar a falha do registro ao código de saída,
**ou ao menos** ao bloco de resumo final"*; o coordenador instruiu que a falha **não deve pesar no
exit code**. Implementei a segunda forma — que é a alternativa explícita do próprio @qa e respeita
a instrução do coordenador — e a fiz **alta**: contador próprio no `=== RESUMO ===`
(`Falhas ao gravar o ledger:   N`) e um bloco de erro final que diz, com todas as letras, que a
invariante da AC3 não vale naquela execução e manda rodar `pnpm db:status` e refazer o Passo 2 do
runbook. O bloco também explica por que o exit code não reflete isso. Se o @qa preferir o exit
code, é uma linha (`codigo = 1`) — mas a decisão é de quem manda, não minha.

**OBS-6 — o conhecimento saiu da story e foi para onde quem roda lê.** Duas âncoras, ambas em
`scripts/gate-tenancy.ts`: (a) `_aviso` **dentro** do JSON gerado, na mesma convenção de
`rls-gate-baseline.json`/`tenancy-allowlist.yml` — e inserido também no arquivo rastreado de hoje
por edição cirúrgica (`git diff --numstat` → **`1  0`**, uma linha acrescentada, zero removidas,
JSON revalidado), para que a advertência exista já, e não só na próxima regeneração; (b) aviso
**impresso** antes de sobrescrever, quando `projectRef !== PROD_REF`, nomeando o arquivo, o teste
que ele alimenta e o comando de restauração. O gate não foi executado depois dessa mudança, de
propósito — rodá-lo é exatamente o que envenenaria a fixture.

**CONCERNS-4 — resolvido por medição, não deferido.** A vacuidade era artefato de gatear antes do
commit; esta rodada **tem commit local** (`7c3d0f0d`), então rodei a régua **literal da AC**, na
árvore de verdade:

```
$ git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml
164     0       .github/workflows/ci.yml
$ … | awk '$2 != 0 { exit 1 }'                     → exit 0     ✅ VERDE
$ grep -c "^  static:\|^  tenancy-gate:" .github/workflows/ci.yml   → 2
```

E o vermelho da mutação nomeada, num **clone descartável** (a árvore principal nunca recebeu a
mutação — apaguei o clone depois e `git status` do repo real ficou limpo):

```
$ # no clone: commit que apaga o passo `lint` do job `static`
$ git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml
164     5       .github/workflows/ci.yml
$ … | awk '$2 != 0 { exit 1 }'                     → exit 1     🔴 VERMELHO
```

A régua discrimina na forma literal da AC. O `@devops` ainda deve rodá-la uma vez depois do
**squash** (o número de linhas muda se o histórico for reescrito) e colar a saída no PR, mas ela
não chega ao PR como alegação: chega medida nos dois sentidos.

**Gates da rodada 2:** `pnpm lint --force` 8/8, 0 errors · `pnpm type-check --force` 8/8 ·
`pnpm test` 274 arquivos, **3514 passed | 6 expected fail** (28 testes novos, +3 desta rodada).

#### RODADA 3 — CodeRabbit no PR #525 (CHANGES_REQUESTED, 4 Major + 4 minor)

O job estreou certo no PR real (`✅`, 1 de 1 casada). Os 8 achados foram tratados; nenhum
descartado.

**Major 1 — cobertura PARCIAL do relatório passava como limpa** (`aviso-migrations-do-pr.ts`).
A guarda era `casados.length === 0`. Com **duas** migrations no PR e só uma no relatório,
`1 !== 0` passava batido e a segunda saía **sem veredito nenhum** debaixo de um `✅ limpo`. A
pergunta certa não é *"achei algum?"*, é *"apurei todos?"* — a guarda passou a ser
`semVeredito.length > 0`, nomeando os arquivos que ficaram de fora. **O controle positivo é o
próprio caso do achado** (2 no PR, 1 no relatório), e ele virou teste.

Um detalhe que só apareceu ao rodar: o corpo `⛔` continha o glifo `✅` na prosa explicativa.
Tirei — aqui o emoji é o **sinal**, e um `✅` dentro de um comentário `⛔` engana quem varre o PR
de relance (o teste que exige `not.toContain("✅")` foi quem pegou).

**Major 2 — `ON CONFLICT DO UPDATE` apagava a evidência** (`migrations-ledger.ts`). Regravar o
`sha256` faz `classificar()` voltar a dizer `aplicada` onde diria `ALTERADA-APÓS-APLICAR`: a
detecção de drift se apagava sozinha. **Decidi e escrevi a razão, e a decisão foi transformar
convenção em precondição** — vale aqui o mesmo princípio que o runbook já aplicava ao recusar
`UPDATE … SET sha256`: *declarar não é observar*. Um construtor virou três caminhos, cada um com
a precondição escrita numa tabela no cabeçalho do módulo:

| Caminho | Função | Precondição | Conflito significa |
|---|---|---|---|
| `db:apply` | `sqlDeRegistroObservado` | estava `PENDENTE` ⇒ não há linha | `DO NOTHING RETURNING`: **nunca sobrescreve**; volta vazio e o comando acusa a anomalia |
| `reset:testdb` | `sqlDeRegistroEmLote({ sobrescrever: true })` | `drop schema cascade` acabou de rodar ⇒ tabela recriada **vazia** | nada a apagar; `DO UPDATE` é rede, não conveniência |
| backfill | `sqlDeRegistroEmLote({ sobrescrever: false })` | ledger **vazio** (Passo 2) | o SQL **aborta** com `RAISE EXCEPTION` antes de tocar em linha nenhuma |

`sobrescrever` **não tem default** — quem chama declara em qual mundo está. E o caso que o
CodeRabbit apontou (lote sobre ambiente não zerado) deixou de existir por construção. Guarda
exercida contra o banco real, com o ledger povoado:
```
ERROR: P0001: ABORTADO: trifold_migrations_aplicadas nao esta vazia. Este lote (via=backfill-onda-1)
so e seguro sobre ledger vazio -- fora dessa janela ele sobrescreveria proveniencia observada
(reset/apply) por declaracao retroativa. Veja o Procedimento de excecao em docs/runbooks/…
```
Ledger conferido depois: `263 reset + 4 reset-falha-conhecida + 1 apply` — intacto, nada gravado.

**Major 3 — o fallback autocommit seguia depois do erro** (`db-apply.ts`). Ele executava os
statements seguintes ao que falhou; eles aplicavam, a migration não era registrada (o `INSERT` só
acontece após o sucesso) e a execução seguinte a via `PENDENTE` e reaplicava DDL parcial. Agora
**para no primeiro `!s.ok`** e imprime o estado parcial com número: *"K de N statement(s) deste
arquivo APLICARAM antes da falha… a Management API roda cada statement em autocommit, então não
há rollback… desfaça o estado parcial à mão ANTES de rodar de novo"*. Não dá para reverter; dá
para **não aumentar o estrago** e para nomeá-lo.

**Major 4 — o aviso mandava apagar linha do ledger.** O CodeRabbit está certo e o argumento é o
mesmo do Major 2: apagar a linha tira o `ÓRFÃ-no-banco` do relatório **sem tirar o efeito do
banco** — troca um sinal por um ponto cego, e o reset seguinte passa a divergir do banco real em
silêncio. O texto agora manda **restaurar o arquivo** (migration é histórico, não código vivo) ou,
se o objetivo é desfazer, escrever uma **migration nova** com o `DROP`/`ALTER` — que roda no reset
e mantém o histórico reproduzível. Há teste com `toContain("não** resolve")`.

**minor — `CHECK` de domínio na `245`.** `sha256 ~ '^[0-9a-f]{64}$'` e
`via IN ('backfill-onda-1','apply','reset','reset-falha-conhecida')`, nomeados, mais um bloco
`DO $$` idempotente que os acrescenta se a tabela já existir (o `CREATE TABLE IF NOT EXISTS` pula
o corpo inteiro, constraints inclusive; `ADD CONSTRAINT IF NOT EXISTS` não existe no Postgres).
A razão está escrita no `.sql`: a escrita é por **service-role**, que bypassa RLS — um `INSERT`
manual com hash truncado tornaria o ledger não auditável sem nada reclamar. Consequência aceita e
declarada: **um quinto valor de `via` passa a exigir migration nova**, que é o ponto (foi
exatamente o crescimento silencioso do domínio que produziu o CONCERNS-2 da rodada anterior).

Os dois `CHECK` reprovam de verdade, medido contra o banco:
```
sha256='NAO-E-HEX'  → ERROR 23514 … violates check constraint "trifold_migrations_aplicadas_sha256_hex"
via='teste'         → ERROR 23514 … violates check constraint "trifold_migrations_aplicadas_via_valido"
linha válida        → ok=true            ← controle positivo: a constraint não recusa tudo
```

**minor — `--excluir` inválido era ignorado em silêncio** (`gerar-backfill-ledger.ts`). Sem valor,
ou com nome inexistente, não excluía nada — e o efeito é o pior possível **para este script**: a
migration que o operador queria fora do lote entra nele declarada como aplicada. Agora falha
**antes de gerar SQL** (`0 bytes` de saída nos dois casos, exit 1). `--sobrescrever` novo, opt-in,
e o SQL gerado diz em comentário qual dos dois modos está.

**minor — `listComments` sem paginação** (`ci.yml`). 30 por página: num PR com muita conversa o
comentário deste job cai fora da primeira página, o `find` devolve `undefined` e o job **cria um
comentário novo a cada push** — o oposto do update in-place que a AC exige. Trocado por
`github.paginate(…, { per_page: 100 })`. ⚠️ **O job `tenancy-gate` tem o mesmo defeito**
(`existentes.data.find`), mas ele é da `900-2c` e corrigi-lo aqui produziria deleções no `ci.yml`
— o que derrubaria a régua de não-reescrita desta própria AC. Fica registrado para uma story
própria.

**minor — o passo do runbook que "validava o projeto" não validava nada.** `current_database()` e
`current_setting('cluster_name')` respondem `postgres` / `main` nos **dois** projetos — medido, não
suposto. Um operador podia atravessar aquele passo no projeto errado, e é o passo de aplicar em
**produção**. O ref só é observável **de fora do banco**, então o Passo 0.1 passou a ter três
conferências reais: o banner `[db-env] … ref=…` do `pnpm db:status` (com a ressalva de que o exit 1
antes do Passo 1 é esperado — o que se confere é a linha do ref), `pnpm supabase:check`, e o **ref
na URL do SQL Editor** (`/project/<ref>/sql`). Mais um discriminador **de conteúdo**, que funciona
de dentro porque não pergunta "qual projeto é este" e sim "que dados moram aqui":
`select id, name, slug from organizations limit 5` — em teste é uma linha só, `Org de Teste — Epic
900`. Mesma ideia da confirmação informativa do `reset:testdb`.

**Mutações desta rodada** (todas provadas em disco por `grep -c`, revertidas depois):

| # | Mutação | `grep -c` | Resultado |
|---|---|---|---|
| baseline | — | — | **34 passed** |
| M6 | a guarda volta a ser "achei algum" (`&& casados.length === 0`) | 1 | 🔴 **2 failed** |
| M7 | `db:apply` volta a sobrescrever o hash (`do update set sha256`) | 1 | 🔴 **1 failed** |
| M8 | o backfill perde a guarda de ledger vazio | 1 | 🔴 **1 failed** |
| revertido | — | 0 | **34 passed** |

**A `245` foi editada duas vezes nesta rodada** (COMMENT do `via`, na rodada 2; `CHECK`s, agora), e
as duas vezes a ferramenta desta story acusou `ALTERADA-APÓS-APLICAR` e o `db:apply` recusou em
bloco. As duas vezes atravessei pelo **Procedimento de exceção** do runbook, não por atalho.
Estado final do teste: `aplicada 268 · PENDENTE 0 · ALTERADA 0 · ÓRFÃ 0`, exit 0.

#### ⚠️ MNT-001 — esta fatia aumenta o ponto cego, e o número é grande

Medido pelo `@devops` no PR #525: `type-check` e `lint` voltaram **FULL TURBO honestamente** —
este PR não toca `packages/`, e as tarefas do turbo são por pacote. A consequência é que **as
~1.400 linhas novas de `scripts/*.ts` desta fatia não passaram por `lint` nem por `type-check` no
CI**, porque o `tsconfig.json` da raiz não tem `include` que alcance `scripts/`. O `--force`
derruba o cache, **não amplia o denominador** — o `type-check --force 8/8` que rodei localmente
cobre os mesmos 8 pacotes.

Quem cobriu o código novo foi a **suíte**, que rodou de verdade (confirmada pelos nomes dos
arquivos no log do CI, não pelo total). E eu rodo um `tsc --noEmit` dedicado sobre `scripts/`
à mão, em toda rodada — limpo nas três. Mas "à mão" não é gate.

O item `MNT-001` já está em `docs/backlog.md` desde a `900-3b` ("`pnpm type-check` não cobre
`scripts/`, e a `900-3b` aumentou o ponto cego"). **Registro aqui que a `900-3c` o aumentou de
novo, e mais:** 11 arquivos novos em `scripts/`, dos quais 2 são de teste (esses a suíte cobre) e
9 não. O item precisa de dono antes da próxima fatia que escreva em `scripts/`.

#### RODADA 4 — R3-1 do gate do @qa: a paginação foi para o job errado

**O que aconteceu, sem atenuar.** Na rodada 3 eu apliquei a paginação com um `replace(..., 1)`
sobre um trecho que existe **duas vezes** no `ci.yml` — os dois jobs que comentam no PR têm o
mesmo bloco de busca do comentário do bot. `replace` com contagem 1 pega a **primeira**
ocorrência, e o `tenancy-gate` vem antes. Resultado: paginei o job da `900-2c` e deixei o job
desta story sem paginar. Medido pelo `@qa` e reproduzido por mim, byte a byte, a partir do
próprio commit:

```
$ git show f6c21b21:.github/workflows/ci.yml
  github.paginate     → linha 192   (dentro do tenancy-gate)
  existentes.data.find→ linha 359   (dentro do migrations-do-pr, que começa na 228)
```

E a ironia registrada: eu havia escrito, na rodada 3, que **não** consertaria o `tenancy-gate`
"porque produziria deleções no `ci.yml` e derrubaria a régua de não-reescrita". A decisão estava
certa. A execução fez exatamente o contrário dela, e **a régua não acusou**.

**Escolhi (b): tirar as duas linhas, não declará-las.** O `@qa` ofereceu declarar na AC4 ou
remover. Removi, e a razão é a coerência com a decisão que eu mesmo já tinha registrado e que o
`@qa` aprovou: o conserto do `tenancy-gate` é bom em si, mas é de outra story — declará-lo aqui
seria alargar o escopo desta fatia para acomodar um engano de execução, e a story própria continua
aberta. O `tenancy-gate` voltou a ser **byte a byte** o de `origin/main`:

```
$ diff <(git show origin/main:.github/workflows/ci.yml | sed -n '105,194p') \
       <(sed -n '105,194p' .github/workflows/ci.yml)
(sem diferença)
```

E o job desta story ganhou a paginação, onde a AC4 a exige (linha 357, depois da fronteira do
`migrations-do-pr` na 222).

#### A régua da AC4 era cega, e agora tem companhia que enxerga

O `@qa` não achou só o erro: achou **por que o instrumento não pegou**. As duas linhas retiradas
do `tenancy-gate` continuavam existindo **verbatim** dentro do job novo, e o LCS do `git diff`
casou as duas, representando a modificação como **inserção pura** — `numstat` `170 0`, régua
verde, arquivo modificado no meio. O item de DoD "arquivo não reescrito, régua verde" estava
satisfeito **por vacuidade**, que é a quarta vez que essa palavra aparece nesta série de stories.

Acrescentei à AC4 uma régua **complementar**, de **forma do diff**: um hunk só, começando depois
da última linha da base — ou seja, acréscimo puro no fim. Medida nos dois estados reais:

| Estado | `numstat` | régua da AC4 | hunk | régua de FORMA |
|---|---|---|---|---|
| commit `f6c21b21` (o defeito) | `170 0` | **exit 0** 🔴 cega | `@@ -187,0 +188,170 @@` | **exit 1** ✅ acusa |
| corrigido (esta rodada) | `171 0` | exit 0 ✅ | `@@ -194,0 +195,171 @@` | exit 0 ✅ |

`194` é a última linha do `ci.yml` na base — o hunk começa **depois** dela, que é a definição
operacional de "só acrescentei job". As duas réguas juntas cobrem os dois modos: a de `numstat`
pega deleção, a de forma pega **edição disfarçada de inserção**.

Também confirmei o contrafactual do `@qa`, para não ficar como alegação: paginando os **dois**
jobs, `numstat` vai a `175 2` → exit 1, com as duas `-` aparecendo. É o que aconteceria se eu
tivesse escolhido (a) sem mexer na AC — a régua ficaria impossível de satisfazer, exatamente como
ele avisou.

**As duas réguas rodadas sobre o commit final estão no fim desta seção, junto com os gates.**

#### O que NÃO mudou nesta rodada

Nada de `scripts/`, nada de `supabase/`, nada de banco. O `db:status` contra o teste continua
`aplicada 268 · PENDENTE 0 · ALTERADA 0 · ÓRFÃ 0`, exit 0, e a `245` segue com o `sha256`
registrado que o espelho já carrega — esta rodada não tocou no arquivo da migration, então não há
`ALTERADA-APÓS-APLICAR` a atravessar desta vez.

### Completion Notes List

1. **Migration `245` reconfirmada no dia, não herdada do documento.** `245` livre em todas as
   refs após `git fetch --prune origin`. A régua com `^[0-9]{3}[a-z]?_` (correção T4) está no
   runbook e no `deploy-flow.md`, para não morrer nesta story.

2. **Ordem de execução ajustada para abrir a janela do controle positivo (G3), sem inventar
   nada.** O runbook tem 3 passos (pré-condições → DDL → backfill), e entre o Passo 1 e o Passo 2
   existe um estado real em que a tabela existe e o ledger está vazio. Capturei o comentário do
   job nesse instante — a `245` aparece como `PENDENTE` **de verdade**, não simulada. Foi
   desnecessário criar migration descartável para o G3 (ela foi usada, separadamente, só para
   provar o caminho positivo do `db:apply`, e foi removida).

3. **Defeito real encontrado e corrigido durante a implementação: `runSql` truncava a resposta
   em 800 caracteres.** Herdado do `reset-tenancy-testdb.ts`, onde `msg` é mensagem de erro para
   log. Ao ler as 268 linhas do ledger, o JSON vinha cortado no meio e o sintoma era
   `"a tabela existe, mas a leitura falhou"` — parece problema de banco, é problema de
   transporte. Separei `runSqlBruto` (corpo inteiro, usado pelas leituras) de `runSql`
   (truncado, comportamento idêntico ao de antes para o reset). O aviso está escrito no JSDoc.

4. **`via` ganhou um quarto valor: `reset-falha-conhecida`.** A AC3 pede que nada fique
   `PENDENTE` depois de um reset bem-sucedido, mas as 4 entradas de `FALHAS_CONHECIDAS`
   **não aplicam** — registrá-las como `via='reset'` seria mentira, e deixá-las fora as faria
   aparecer como `PENDENTE`, com o `db:apply` tentando reaplicá-las para sempre. O campo `via`
   existe justamente para carregar proveniência, então ele carrega a diferença: 264 `reset`
   (observação direta) + 4 `reset-falha-conhecida` (falharam, como previsto). Nada fica
   `PENDENTE`, e nada é declarado falsamente aplicado. **[AUTO-DECISION]**

5. **Regressão de gate prevenida, com vermelho medido: `trifold_migrations_aplicadas` violava
   R3.** R3 (tabela nova sem `org_id NOT NULL`) é FAIL absoluto, sem baseline. Medido contra o
   banco de teste: `R3: 3` (as duas pré-existentes + a minha) e `CATRACA FALHOU — (c) … 3
   violação(ões) de R3`. Acrescentei a entrada em `docs/audits/tenancy-allowlist.yml` com a razão
   por extenso (tabela de **plataforma**: descreve o schema, que é único para todos os tenants;
   RLS ligada com zero policies = deny-all; escrita só por service-role). Nova medição:
   `R3: 2`, e `grep -c trifold_migrations_aplicadas` na saída do gate → **0**. Sem essa entrada,
   a catraca ficaria vermelha no instante em que a `245` fosse aplicada em produção.

6. **⚠️ Gotcha achado do jeito caro: `pnpm gate:tenancy` REESCREVE
   `docs/audits/gate-tenancy-report.json`, que é rastreado E é a fixture de
   `scripts/gate-tenancy-auditoria.test.ts`.** Rodá-lo contra o banco de **teste** (para medir o
   R3 acima) envenenou o relatório com dados do ambiente errado e derrubou 1 teste da suíte
   (`P6 (RLS desabilitada) — R1 limpa`: esperava 0, veio 1). Restaurado com
   `git checkout -- docs/audits/gate-tenancy-report.json`; suíte voltou a 274/274. **Quem rodar
   o gate contra um ref que não seja produção precisa restaurar esse arquivo depois.**

7. **Backfill é gerador, não `.sql` congelado — [AUTO-DECISION].** A Task 1.3 pede "escrever o
   SQL de backfill". São 268 linhas com 268 `sha256` do conteúdo **atual**: congelar isso num
   arquivo versionado o faria mentir na primeira migration nova (o hash gravado deixaria de ser
   o do arquivo, e o primeiro `db:status` acusaria `ALTERADA-APÓS-APLICAR` falso). Entreguei
   `scripts/gerar-backfill-ledger.ts`, que **não abre conexão nenhuma** — lê o disco e imprime o
   SQL —, e o runbook manda rodá-lo no momento da aplicação. Mesma lógica pela qual a Task 1.1
   remede o número em vez de herdá-lo.

8. **Task 1.4 está PARCIAL, de propósito.** Apliquei a `245` + backfill **no ambiente de teste**
   (autorizado: é o ambiente para isso) porque as Tasks 2, 3 e 4 dependem da tabela existir.
   **Produção não foi tocada** — a aplicação lá é passo de runbook do @devops. A chave
   `"producao"` de `docs/audits/migrations-aplicadas.json` está com o marcador
   `"_estado": "AINDA NÃO MEDIDO"` e será substituída inteira pela primeira execução de
   `TRIFOLD_ENV=producao pnpm db:status` bem-sucedida.

9. **Task 5.3 — o item do backlog.** `docs/backlog.md`, linha ~201:
   `### [EPIC-900] 🟡 O §461 do epic recomenda o sync-schema.sh que a 900-3c vai deletar — texto
   superado pelo próprio resultado da 900-3`. Não reabri a investigação nem editei o epic.
   **Achado adicional para o mesmo item:** existe uma **segunda** ocorrência da mesma afirmação
   superada, em `docs/architecture/saas-multi-tenant.md:1134`, que descreve o snapshot como
   *"regenerado por `scripts/sync-schema.sh` (já existe)"* — falso em dois pontos hoje (quem
   regenera é `scripts/generate-schema-snapshot.ts`, e o script foi deletado). Editar documento
   de arquitetura está fora da minha autoridade; fica registrado para o @pm/@architect no mesmo
   item de backlog.

10. **`--json <caminho>` acrescentado ao `db:status`.** O job precisa cruzar arquivos do PR com o
    veredito, e raspar texto de terminal é a forma frágil. O JSON vai **onde o chamador mandar**
    e não se confunde com o espelho rastreado. Efeito colateral bom: o estado `⛔ parsing sem
    casamento` (G2) passa a ser detectável de verdade, em vez de teórico.

11. **`aplicada_em` fora do espelho — [AUTO-DECISION].** Ele muda a cada `reset:testdb` e
    produziria um diff de 268 linhas em todo PR que rodasse o reset, afogando a informação que
    interessa (mudou de estado? mudou de hash?). O timestamp continua no banco, que é a fonte. Há
    teste ancorado nisso.

12. **Âncoras literais respeitadas (AC2, Task 2.3).** `scripts/migrations-ledger.test.ts` escreve
    `"xnxvygyfyyyzwhiuoehz"` e `"dsopqkqjkmhytudaaolv"` **à mão**, nunca importados de
    `supabase-refs.ts`, e o cabeçalho do arquivo explica por quê. O `ci.yml` também traz a URL de
    teste literal — mas essa duplicação é **guardada**: se alguém a trocar pelo ref de produção,
    `resolverAmbiente()` aborta (guarda 3 do `db-env.ts`) em vez de obedecer. Está dito em
    comentário no próprio job.

13. **Divergência entre a story e o repositório, para o @architect:** o spawn desta fatia afirmava
    que a `900-3b` já havia entregue `scripts/lib/management-api.ts` com `runSql`/`splitStatements`
    extraídos. **Não havia** — o arquivo não existia em `origin/main` (`77f225d1`), e as duas
    funções ainda estavam dentro de `reset-tenancy-testdb.ts` (linhas 252 e 268), exatamente como
    a Task 2.1 desta story descreve. A story estava certa; a nota do spawn, não. A extração foi
    feita aqui.

### File List

**Criados**
- `supabase/migrations/245_registro_de_migrations.sql` — tabela `trifold_migrations_aplicadas` (AC1)
- `docs/runbooks/aplicar-245-registro-migrations.md` — runbook de aplicação manual (AC1)
- `docs/audits/migrations-aplicadas.json` — espelho chaveado por ambiente (AC1, S5)
- `scripts/lib/management-api.ts` — `runSql`/`runSqlBruto`/`runSqlJson`/`splitStatements`/`citarLiteral` (AC2, Task 2.1)
- `scripts/lib/migrations-ledger.ts` — classificação nos 4 estados, espelho, SQL de registro (AC1/AC2)
- `scripts/db-status.ts` — `pnpm db:status` (AC2)
- `scripts/db-apply.ts` — `pnpm db:apply` (AC2)
- `scripts/gerar-backfill-ledger.ts` — gera o SQL de backfill, não aplica nada (AC1, Task 1.3)
- `scripts/aviso-migrations-do-pr.ts` — corpo do comentário do job, 3 estados (AC4, G2/G5)
- `scripts/migrations-ledger.test.ts` — 14 testes, âncoras literais (AC1/AC2)
- `scripts/aviso-migrations-do-pr.test.ts` — 11 testes, G2 e G5 (AC4)

**Modificados**
- `.github/workflows/ci.yml` — **+171 linhas, 0 deleções**: job `migrations-do-pr` (AC4). O
  `tenancy-gate` e o `static` ficaram **byte a byte** iguais aos de `origin/main` — conferido por
  `diff` nas linhas 105-194 na rodada 4, depois de eu ter alterado o `tenancy-gate` por engano na
  rodada 3.
- `package.json` — scripts `db:status` e `db:apply` (AC2, Task 2.3)
- `scripts/reset-tenancy-testdb.ts` — importa o transporte extraído; popula o ledger ao final (AC2/AC3)
- `docs/deploy-flow.md` — reescrito (AC5)
- `docs/audits/tenancy-allowlist.yml` — isenta a tabela nova de R3, com razão (regressão prevenida)
- `docs/runbooks/aplicar-245-registro-migrations.md` — **rodada 2**: seção "Procedimento de exceção" + delimitação da linha 3 do Rollback
- `scripts/gate-tenancy.ts` — **rodada 2 (OBS-6)**: `_aviso` no JSON gerado + alerta impresso quando o alvo não é produção
- `docs/audits/gate-tenancy-report.json` — **rodada 2 (OBS-6)**: `_aviso` inserido cirurgicamente (`1  0`, uma linha)

**Deletados**
- `scripts/sync-schema.sh` (AC5)

**Tocados e restaurados (não fazem parte da entrega)**
- `docs/audits/gate-tenancy-report.json` — reescrito por `pnpm gate:tenancy` durante a medição do
  R3 e restaurado com `git checkout --`. Ver nota 6. Na rodada 2 ele voltou à lista de
  **modificados**, agora por edição deliberada de uma linha (o `_aviso` do OBS-6).
- `supabase/migrations/244_org_admin_invite_email.sql` — apagado e restaurado com
  `git checkout --` para reproduzir a quarta classe de PR do CONCERNS-1.
- `docs/audits/reset-testdb-duracao.json` — regenerado pelo reset; é gitignored (decisão da `900-3b`).

---

## QA Results

### Quality Gate — 2026-08-29 · Quinn (Test Architect)

**Veredito: CONCERNS** · gate file: `docs/qa/gates/900.3c-registro-de-migrations-e-promocao.yml`
Revisão sobre a **árvore de trabalho** (nada commitado). Branch `story/900-3c-registro-migrations`,
base `77f225d1`. **Produção não foi tocada por esta revisão** — todo comando de banco foi contra
`xnxvygyfyyyzwhiuoehz` (teste); o único `TRIFOLD_ENV=producao` foi `db:apply --yes`, que aborta na
guarda de flag **antes** do primeiro `fetch` (db-apply.ts:82 contra o primeiro `tabelaExiste` na
linha 90), e ainda assim rodado com PAT deliberadamente falso. Árvore devolvida byte a byte ao
estado do `@dev` (espelho conferido por `cmp`, zero mutação residual).

#### O que eu reproduzi, em vez de aceitar

| Alegação | Como medi | Resultado |
|---|---|---|
| `ALTERADA-APÓS-APLICAR` bloqueia o `db:apply` | byte a mais na `245` (prova em disco `grep -c` 1→0), banco de teste real | `db:status`: 267 aplicada · 1 ALTERADA · **exit 0**; `db:apply --yes`: **exit 1**, "Nada foi aplicado" ✅ |
| Contrato C6, lado da tabela ausente | mutei `TABELA_LEDGER` e rodei contra **teste** (mesmo ramo, sem tocar produção) | **exit 1** nomeando tabela, projeto, ambiente e runbook ✅ |
| `--yes` recusado em produção | com e sem `TRIFOLD_ALLOW_PROD` | duas guardas distintas, as duas **exit 1** ✅ |
| Job não escreve | `grep` restrito ao bloco `migrations-do-pr` | `concurrency`/`db:apply`/`reset:testdb`/`--confirmar`/`TRIFOLD_ALLOW_PROD`/`git commit`/`git push` → **todos 0** ✅ |
| Régua da AC4 | **commit simulado** em clone descartável, régua **literal** da AC | `151 0` → awk **0**; apagando o passo `lint` → `151 2` → awk **1** ✅ |
| Âncoras literais | mutei **só** `supabase-refs.ts` (a fonte única) | **11 testes acendem** (db-env 7 · supabase-check 4); os testes novos não importam a constante e usam literal, como a AC2 exige ✅ |
| M-G5 e M-G2 | mutações independentes minhas | 2 failed e 1 failed, respectivamente ✅ |
| Gates | `pnpm test` / `lint --force` / `type-check --force` | 274 arquivos · 3511 passed + 6 expected fail · 0 errors ✅ |

**G2 — forcei o terceiro estado por caminho REAL, não por flag na mão.** Montei um upstream
sintético e dois work dirs: um com `git fetch --depth=1 origin pr` (o que `actions/checkout@v4`
com `fetch-depth: 1` produz num PR — `refs/remotes/origin/main` **não existe**) e outro completo.
Rodei o passo do `ci.yml` **verbatim**: o raso emite `motivo=nao consegui resolver a ref base…` e
**nem cria** `/tmp/pr-migrations.txt`; o completo resolve o diff. O aviso responde `⛔` no primeiro
e nada de `✅`. **Controle negativo:** removi as duas guardas e no mesmo raso o `git diff` sai
`rc=128` mas o *redirect cria o arquivo vazio* → o aviso responde **`✅ limpo`**. É o falso-verde
exato que o G2 existe para impedir, medido. Há três camadas independentes (`rev-parse`,
`merge-base` vazio, `readFileSync` do arquivo ausente) mais o fallback no `github-script`.

**G5** — os dois corpos são distintos (`diff -q`); só o severo contém "recusar" e nomeia que
`db:apply` recusa em bloco. **G1** — nenhum `git commit`, nenhum `git diff --exit-code` ou
`--porcelain` no `ci.yml` inteiro; o espelho é rastreado e o job de fato suja a árvore do runner,
inofensivamente. **G3** — a janela é real e a estrutura do runbook (Passo 1 → Passo 2) a produz.

#### Por que CONCERNS e não PASS — dois achados, ambos baratos

1. **CONCERNS-1 (medium) — a quarta classe de PR ainda sai verde.** PR que **DELETA** uma migration
   já aplicada recebe `✅ limpo` com o corpo listando o arquivo como `ÓRFÃ-no-banco`, sob a
   manchete "já estão aplicadas e nenhuma foi alterada depois da aplicação". **É defeito de
   especificação, não do `@dev`:** a AC4 manda excluir `ÓRFÃ` e justifica com *"não pode ser um
   arquivo que o PR traz"* — **medido e falso**, `git diff --name-only` lista caminho apagado
   (reproduzi commitando uma deleção). Fecha com ~8 linhas em `montarAviso` e um teste.
2. **CONCERNS-2 (low) — o `COMMENT ON COLUMN … via` da `245` conhece três valores; o código grava
   quatro.** O `reset-falha-conhecida` (decisão autônoma correta) não está na autodocumentação que
   vai **dentro do banco de produção**. Importa porque o custo sobe depois: a `245` já está
   registrada no teste (`via=reset`, sha `dab5cf88…`) e editá-la agora aciona
   `ALTERADA-APÓS-APLICAR` — a ferramenta desta própria story. O runbook prevê o remédio
   (`ON CONFLICT DO UPDATE`), mas o caminho precisa ser escolhido, não descoberto. **Corrigir
   antes de o `@devops` aplicar em produção.**

Mais três de baixa severidade no gate file: `${{ steps.*.outputs.motivo }}` interpolado dentro de
`run:` (CONCERNS-3, mover para `env:`); a régua da AC4 só medir pós-commit (CONCERNS-4 — @devops
roda a forma literal depois de commitar e cola no PR); falha do `INSERT` do ledger no reset não
pesar no exit code (OBS-5). E dois resíduos já encaminhados: o `sync-schema.sh` fantasma em
`saas-multi-tenant.md:1134` (OBS-7, item `[EPIC-900]` do backlog) e a armadilha do
`gate:tenancy` reescrevendo fixture rastreada, documentada na story mas **não** no repositório
(OBS-6).

#### Decisões autônomas e correções não previstas — todas julgadas

`via='reset-falha-conhecida'` **aprovada** (as duas alternativas mentem ou criam `PENDENTE`
eterno; 264+4=268, 0 pendente medido). Backfill como **gerador** **aprovada** (verifiquei: zero
referência de rede/credencial, determinístico salvo o timestamp de comentário, hash da `245` bate
com o ledger — um `.sql` congelado produziria `ALTERADA-APÓS-APLICAR` **falso**, o pior estado
possível). `aplicada_em` fora do espelho **aprovada** (com teste ancorado). `--json` **aprovada**
(e é o que torna o estado ⛔ de parsing exercível — eu o exercitei).

O truncamento de 800 chars é **bug real** e a separação `runSql`/`runSqlBruto` preserva o call
site antigo sem inventar comportamento. A entrada na allowlist do gate tem **razão suficiente, não
é atalho**: é o mecanismo sancionado (a própria mensagem de erro do gate aponta para ele), o
`@dev` **não** tocou a grandfather list congelada com checksum (que é o atalho de verdade), a
razão é verificável — RLS ligada com zero policies, nenhuma ocorrência da tabela em `packages/` —
e conferi o colateral da allowlist ser um `Set` único de R2/R3/R6/R8: nenhuma das outras regras
reportaria esta tabela de qualquer forma, então a isenção não esconde nada além do R3 pretendido.

#### Lacuna registrada (não bloqueante)

Não há teste automatizado de `db-status.ts`/`db-apply.ts` em si — só da lógica pura em
`lib/migrations-ledger.ts`. O contrato de exit code, coração da AC2, tem prova só por execução
manual (a do `@dev` e a minha). Aceitável pelo Testing Standards da própria story, mas trocar um
`return 1` por `return 0` passaria calado.

**AC1 fica parcial por desenho e isso está certo** — a aplicação em produção é passo de runbook do
`@devops`. O item de DoD "migration aplicada em produção" segue **aberto**.

— Quinn, guardião da qualidade 🛡️

---

### Quality Gate — Rodada 2 · 2026-08-29 · Quinn (Test Architect)

**Veredito: PASS** · commit `9e3a80fa` · gate file atualizado.
Os dois CONCERNS e os três menores estão fechados. Reverifiquei cada um por execução.

#### CONCERNS-1 — fechado, e o controle negativo **tem vivacidade**

| Sonda minha | Medido |
|---|---|
| PR apaga `244_…sql` (relatório: `ÓRFÃ-no-banco`) | `estado=pendente` · bloco **⛔ REMOVIDA** com texto próprio ✅ |
| **Controle negativo:** órfã no relatório que o PR **não toca** | `estado=limpo` · **0** menções ao arquivo alheio · **0** a `REMOVIDA` ✅ |
| Renumeração (apaga velho + adiciona novo) — classe que eu não havia sondado | `PENDENTE (1)` **e** `REMOVIDA (1)`, blocos separados ✅ |

**A prova que eu quis, e que não estava pedida:** um controle negativo que sobrevive a *todas*
as mutações é decoração. Rodei os **dois sentidos** e os conjuntos de morte são **disjuntos** —
`M5` (`removidas = []`) derruba **3** testes, todos do bloco novo, e o controle negativo **passa**;
a mutação de **ruído** (`removidas` derivada do relatório inteiro em vez de `casados`) derruba
**1**, **só** o controle negativo, e os três novos passam. Ele mede o que diz medir. NIT-8 caiu
junto: a manchete virou neutra ("precisam de atenção"), que era falsa para `ALTERADA` e para `ÓRFÃ`.

#### CONCERNS-2 — conferido de **dentro** do banco

`col_description(via)` traz os **quatro** valores · `reset` 263 + `reset-falha-conhecida` 4 +
`apply` 1 = **268** · `relrowsecurity=true`, `policies=0` · `db:status` 268 aplicada, 0 de tudo o
mais. **A prova que importa:** o `sha256` do arquivo em disco (`cc88e5aff20a…`) é **idêntico** ao
gravado no ledger, e o `via` da `245` é **`apply`** — o banco *executou* o arquivo novo (é por
isso que o `COMMENT ON` novo já está lá dentro). Observação, não declaração.

**A remediação foi pelo caminho certo.** Recusar `UPDATE … SET sha256` foi a decisão correta:
seria declarar que o SQL novo rodou sem ninguém ver — a mentira exata que o `sha256` fecha. O
`DELETE` → `PENDENTE` (que **é** a verdade) → `db:apply` observa é o único caminho que mantém o
ledger honesto, e foi escrito no runbook **antes** de ser executado, com escopo travado e com a
condição de segurança nomeada (idempotência; se não houver, a regra geral volta a valer).

**A correção do Rollback é achado maior que o item que a originou.** Regerar o backfill inteiro
fora da janela pós-Passo-2 reescreveria as 268 linhas com `via='backfill-onda-1'` e **apagaria**
`reset`/`apply`/`reset-falha-conhecida` — converteria observação em declaração, em massa e em
silêncio. A delimitação da janela está no runbook.

#### CONCERNS-3 · CONCERNS-4 · OBS-6

- **C-3:** varri o bloco separando os corpos de cada `run:` — **0 linhas de `run:` com `${{ }}`**
  (a única dentro de um `run:` é um comentário explicando o porquê). As 4 interpolações estão em
  `env:`. Ele achou uma que eu não nomeei (`BASE="origin/${{ github.base_ref }}"`), justamente a de
  maior superfície. **Rodei de novo o passo pós-hardening, verbatim, nos dois cenários sintéticos**
  (raso e completo): as guardas continuam intactas.
- **C-4:** medida por mim no repo real, com o commit existindo: `164  0` → awk **0**; jobs 2+1.
  Confirma que a vacuidade da rodada 1 era artefato de gatear antes do commit.
- **OBS-6:** fiz uma verificação que ninguém pediu e que era o risco real — avaliei a constante
  `AVISO_DO_RELATORIO` do fonte e comparei com o `_aviso` do JSON rastreado: **byte-idênticos**.
  Se divergissem, a próxima execução legítima do gate produziria um diff fantasma naquele campo,
  e é assim que um aviso morre. Fixture 10/10 e agnóstica ao campo novo. Não rodar o gate depois
  foi a decisão certa.

#### OBS-5 — decisão

**Aceito como implementado; a instrução do coordenador prevalece e eu concordo com ela.** Um reset
de ~7,5 min que sai `1` porque um `INSERT` auxiliar falhou é o sinal que as pessoas aprendem a
ignorar — a mesma patologia da régua sempre-vermelha que esta onda corrigiu. E o furo não depende
de alguém ler o log: o próximo `db:status` mostra 268 `PENDENTE` e o job do PR comenta `⚠️`. A
detecção é redundante e vem de **fora** do reset.

**Fica um resíduo de uma linha, não bloqueante:** o bloco de erro é impresso **antes** de
`if (codigo === 0) console.log("Banco de teste reconstruído.")` — a **última** linha da tela
continua tranquilizando sem qualificação, depois de 7,5 minutos, que é onde o olho pousa.
Qualificá-la quando `falhasDeRegistro.length > 0` não toca no exit code.

#### Gates

`pnpm test` 274 arquivos · **3514 passed** | 6 expected fail · `type-check --force` 8/8 ·
`lint --force` 0 errors (36 warnings pré-existentes). Produção **não tocada** nas duas rodadas.

#### Liberado — o que o @devops carrega

1. **Pós-squash ou pós-merge de `main`, repetir a régua da AC4** — é a única medição desta revisão
   que caduca com reescrita de histórico. A forma de três pontos parte do merge-base: se `main`
   ganhar deleções em `ci.yml` e você a trouxer para a branch, elas entram na conta e a régua fica
   vermelha por mudança que não é sua.
2. **No PR**, o job `migrations-do-pr` roda pela primeira vez de verdade (secret
   `SUPABASE_MANAGEMENT_PAT` confirmado presente). Desfecho esperado: **`✅`** listando
   `245_registro_de_migrations.sql — aplicada`. Qualquer `⛔` é sinal real, não ruído de estreia.
3. **Depois do merge**, aplicar a `245` em produção pelo runbook, com **a versão deste commit** (é
   a que traz o `COMMENT` dos quatro valores); backfill **gerado na hora**; depois
   `TRIFOLD_ENV=producao pnpm db:status` e commitar o espelho — é o que substitui o marcador
   `AINDA NÃO MEDIDO`. Só então o item de DoD "aplicada em produção" fecha; hoje ele segue **aberto**.
4. **Não** rodar `pnpm gate:tenancy` contra ref que não seja produção; se rodar, restaurar
   `docs/audits/gate-tenancy-report.json` (o arquivo agora avisa sozinho).

— Quinn, guardião da qualidade 🛡️

---

### Quality Gate — Rodada 3 (pós-CodeRabbit) · 2026-08-29 · Quinn (Test Architect)

**Veredito: CONCERNS** · commit `f6c21b21` · PR #525 · **um item bloqueia o push.**
Sete dos oito achados estão fechados e reproduzi cada um. O oitavo foi aplicado no **job errado**,
e isso arrastou duas consequências que o commit não registra.

#### 🔴 R3-1 — a paginação foi para o `tenancy-gate`, não para o job desta story

Três fatos medidos, e o commit message afirma o contrário dos três:

| Medição | Resultado |
|---|---|
| Fronteiras dos jobs | `static:27` · `tenancy-gate:105` · `migrations-do-pr:228` |
| Onde ficou o `github.paginate` | **linha 192 — dentro do `tenancy-gate`** (marca na 185: `const marca = '## Gate de tenancy'`) |
| Onde ficou o não-paginado | **linhas 358-359 — dentro do `migrations-do-pr`**, o job desta story |
| `git show origin/main:.github/workflows/ci.yml` | traz a versão não-paginada nas linhas 188-189, **no `tenancy-gate`** ⇒ um job pré-existente foi modificado por esta branch |

**Consequência 1 — a AC4 fica descumprida num ponto.** Ela exige, com estas palavras, *"procura um
comentário existente do bot e atualiza in-place, **em vez de acumular um novo a cada push**"*. Sem
paginação (30 por página), num PR com mais de 30 comentários o `find` devolve `undefined` e o job
cria comentário novo a cada push. Hoje o #525 tem 5 comentários de issue — o defeito é **latente,
não teórico**, e a correção certa já está escrita; só foi colada no outro job.

**Consequência 2 — a régua de não-reescrita ficou cega, e eu provei.** Ela lê `170 0` → awk 0,
**verde**. O diff é um hunk único `@@ -186,4 +186,174 @@` com **zero linhas `-`**: as duas linhas
retiradas do `tenancy-gate` continuam existindo, **verbatim**, dentro do job novo (358-359), e o
LCS do git as casou — representando a modificação de um job existente como inserção pura.

> **Contrafactual, em clone descartável:** apliquei ao job novo exatamente a mesma paginação (o
> conserto que o CodeRabbit pediu), o que elimina a linha duplicada, commitei e rodei a **mesma
> régua literal**: **`174 2` → awk exit 1**, e as duas linhas `-` aparecem.

Ou seja: o item de DoD *"arquivo não reescrito, régua verde"* está satisfeito **por vacuidade**
neste commit. É a quinta régua desta onda a perder poder discriminante — e a primeira por
**colinearidade de conteúdo dentro do próprio arquivo**.

**A decisão registrada estava certa; o código faz o oposto dela.** O @dev escreveu "não conserto o
`tenancy-gate` aqui porque produziria deleções no `ci.yml` e derrubaria a régua". Esse raciocínio é
exatamente o que eu queria ver. Ele consertou o `tenancy-gate`.

**Como fechar** — paginar o `migrations-do-pr` (a correção já existe) e resolver o `tenancy-gate` de
um dos dois jeitos honestos: **(a)** manter a melhoria e **declarar na AC4** que esta story altera 2
linhas do `tenancy-gate`, com a régua reconhecendo `2` deleções esperadas e nomeadas; ou **(b)**
tirá-la deste PR para a story própria que ele já registrou. Não peço reversão — a mudança lá é boa.
O que não pode continuar é a régua dizendo `0` sobre uma modificação real.

#### Os sete fechados — reproduzidos, não aceitos

- **Cobertura parcial (Major 1).** Controle positivo: `2 no PR / 1 no relatório` → `⛔ 1 de 2 … não
  casaram`, **nomeando** a `245` em "Sem veredito:", sem nenhum `✅`. Não-regressão: `2/2` → `✅`. M6
  (guarda volta a `casados.length === 0`) 🔴 **2 failed**.
- **`ON CONFLICT` (Major 2).** `db-apply.ts` importa **apenas** `sqlDeRegistroObservado`; o
  construtor único antigo não existe mais no repo. **Prova dinâmica:** emiti o SQL exato do
  `db:apply` para a `245` já registrada, com `sha256` falso — `RETURNING` devolveu **`[]`** e a
  linha ficou byte a byte idêntica (`sha`, `via`, `aplicada_em`). E confirmei que `[]` (não `null`)
  é o que a API devolve para resultado vazio ⇒ o ramo **ANOMALIA** é alcançável, não é código morto.
  *Achado lateral:* minha primeira sonda usou `via='SOBRESCRITA-QA'` e **não chegou** ao
  `ON CONFLICT` — o CHECK novo a barrou com `23514`.
- **Precondição do reset — verdadeira, verificada na ordem de execução real:** `resetarSchema()` (que
  roda o `drop schema … cascade`) é a linha 35 relativa de `main()`; a população do ledger é a 133; e
  `resetarSchema` lança em falha, tornando a população inalcançável sem o drop.
- **Guarda do backfill, exercida contra o banco povoado:** `ERROR P0001`, e a contagem por `via`
  **idêntica** antes e depois (`apply:1 · reset:263 · reset-falha-conhecida:4`). M7 🔴 1 · M8 🔴 1.
- **CHECKs de domínio.** Os dois vivos em `pg_constraint`; `sha256='NAO-E-HEX'` → `23514`,
  `via='via-inventada'` → `23514`, zero linhas de sonda residuais. **Isto fecha por imposição o meu
  CONCERNS-2 da rodada 1:** um quinto `via` agora falha no INSERT em vez de divergir em silêncio.
- **`--excluir`** inválido → exit 1 com **0 bytes** em stdout; válido → 267 tuplas. A régua do
  runbook confere: `grep -c "^  ('"` → 268 == `ls supabase/migrations/*.sql | wc -l` → 268.
- **Estado parcial** e **conselho da órfã** (restaurar o arquivo, nunca apagar a linha do ledger —
  "trocaria um sinal por um ponto cego"): os dois corretos.

**Invariante do glifo — medi mais forte do que foi pedido.** Varri os **10** caminhos alcançáveis de
`montarAviso` e assertei `corpo.includes('✅') === (estado === 'limpo')`. **Zero violações** — não é
só "o ⛔ não tem ✅", é "o ✅ aparece se e somente se o estado é limpo". O fallback do
`github-script` no `ci.yml` também não tem `✅`.

**Runbook, Passo 0 — sim, agora dá para não errar de projeto.** Confirmei a medição dele nos dois
lados (`current_database()` → `postgres`, `cluster_name` → `main`: não discriminam nada) e rodei o
discriminador de conteúdo no teste — 1 linha, `Org de Teste — Epic 900`, exatamente como o runbook
diz. As três conferências nomeiam o ref **fora** do banco (e a URL do SQL Editor é a que importa,
porque é o caminho real de colar o DDL), e o discriminador cobre os **dois** sentidos do engano.

#### Duas observações que não bloqueiam

- **Catraca de tenancy 🔴 no #525** (`86 FAIL`, `R2:57` contra baseline `54`) — **não é desta
  story**: o PR **#524**, já mergeado, traz o comentário **idêntico**. E **`R3: 0`**, que é a
  confirmação em produção de que a entrada de allowlist desta fatia funciona como aprovei. Mas
  catraca vermelha há dois PRs num job não-bloqueante é a patologia do "sinal que nunca muda" que
  esta própria story documentou — vale escalar ao @pm/@architect.
- **MNT-001**: os 8 arquivos desta fatia type-checam limpos quando os compilo à mão; o diretório
  `scripts/` **inteiro** (34 `.ts`) não passaria hoje — medi erros em arquivos pré-existentes.
  Dívida real e antiga, aumentada aqui. Concordo em não fechá-la nesta story.

#### Gates

`pnpm test` 274 arquivos · **3520 passed** | 6 expected fail · `type-check --force` 8/8 ·
`lint --force` 0 errors. Produção não tocada nas três rodadas; as duas sondas de escrita abortaram
por guarda e deixaram o ledger intacto (medido antes e depois).

#### Para o @devops

**Não empurrar até R3-1.** Depois do conserto: se o `tenancy-gate` continuar alterado, a régua vai
acusar `2` deleções **reais** — isso é **correto**, e a AC4 precisa declará-las. E acrescente à
repetição pós-squash uma leitura que eu não tinha: **verde na régua não prova que nenhum job
existente mudou** — confira também `git diff origin/main...HEAD -- .github/workflows/ci.yml | grep -c '^-'`
e leia onde o hunk começa; se ele começar antes da linha do job novo, um job pré-existente foi tocado.

— Quinn, guardião da qualidade 🛡️

# Story 900-3c — Registro de Migrations e Fluxo de Promoção (Fatia B de 2 — Onda 1 do plano de 3 ondas)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 1 — Isolamento. Fecha, junto com a `900-3b`, o critério de saída da Onda 1 do plano de 3 ondas aprovado.
- **Story:** 900-3c — **Fatia B** do split decidido pelo `@po` na validação de 2026-08-29
  (`docs/qa/po-validation-900-3b.md`) e autorizado pelo dono do produto. A irmã é `900-3b` (Fatia A —
  Ambiente), que precisa estar mergeada antes desta (ver Dependencies).
- **Status:** GO do `@po` (8/10, `docs/qa/po-validation-900-3c.md`) — **não avança para `Ready` ainda**: bloqueada por dependência, não por qualidade. Precisa da `900-3b` **mergeada** (Task 2 mexe no mesmo `reset-tenancy-testdb.ts`) e, de preferência, do merge do PR #522 antes de a Task 1.1 fixar o número da migration. Corrigida a recomendação T4 (regex da varredura de refs, cego para `024b_`/`028a_`/`028b_`) nesta versão.
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
1. Migration nova (número a remedir **depois** do merge do PR #522 — ver AC1) criando
   `trifold_migrations_aplicadas`, o registro de "o que foi aplicado onde".
2. Runbook de aplicação manual (uma vez, em cada ambiente) — pré-requisito para `db:status`/
   `db:apply` funcionarem.
3. `pnpm db:status` / `pnpm db:apply`, com extração de `runSql`/`splitStatements` de dentro de
   `scripts/reset-tenancy-testdb.ts` para `scripts/lib/management-api.ts`.
4. `reset-tenancy-testdb.ts` (já endurecido pela `900-3b`) passa a **popular** o ledger ao final
   (`via='reset'`).
5. Job novo (não-bloqueante) em `.github/workflows/ci.yml` aplicando migrations pendentes no banco
   de teste em cada PR.
6. Reescrita de `docs/deploy-flow.md` e remoção de `scripts/sync-schema.sh`.

### OUT (não entra nesta story)
- Tudo que a `900-3b` já entrega (gitignore, split de ambiente, `db-env.ts`, `config.toml`, reset
  hardening itens 1-3/5, `FALHAS_CONHECIDAS`).
- Qualquer item do "Deferido da Onda 1" (ver seção de Handoff abaixo).
- Qualquer mudança de comportamento em produção fora da aplicação da migration desta fatia.

---

## Acceptance Criteria

- [ ] **AC1 — Migration + runbook de aplicação manual (Passo 4):**
  - **Número da migration: reconfirmar no início da Task 1, nunca herdar deste documento.** Estado
    medido em 2026-08-29 (varredura completa de refs, com `git fetch --prune origin` primeiro —
    ver comando abaixo): `245` livre em todas as refs; `244` tomado por
    `supabase/migrations/244_org_admin_invite_email.sql`, presente em
    `origin/story/900-22b-convite-admin` (**PR #522, `OPEN`, não mergeado**). **Este número é
    válido só até o PR #522 mergear** — depois do merge, `244` passa a existir em `origin/main` e
    o próximo livre pode ou não continuar `245` (outro PR pode ter tomado nesse intervalo).
    **A régua de remedição correta — corrigida nesta story (C8 do parecer `@po`):**
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
  - Chave por **arquivo** (resolve os 21 prefixos duplicados sem ambiguidade). `sha256` resolve o
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

- [ ] **AC4 — Job de CI aplicando migrations no banco de teste (Passo 8 + correção C4):**
  - **Acrescenta job** a `.github/workflows/ci.yml` — **nunca reescreve o arquivo existente** (o
    cabeçalho do arquivo já manda isso).
  - **Régua de não-reescrita — corrigida (C4).** A v0.1 original citava a AC8 da `900-1` (`grep -c
    "gate:tenancy\|tenancy" .github/workflows/ci.yml` → 0) como a prova de que o arquivo não foi
    reescrito. **Medido: essa AC já está vermelha em `HEAD` hoje** (`grep -c "gate:tenancy\|tenancy"
    .github/workflows/ci.yml` → **6**) — a `900-2c` acrescentou o job `tenancy-gate` depois, por
    desenho, e a `900-1` já está `InReview` com essa AC "dispensada por obsolescência". Além disso
    ela nunca foi uma AC de não-reescrita — verifica ausência de referência a tenancy, não
    preservação de conteúdo. Substituída por:
    ```bash
    # 0 deleções no arquivo entre a base do PR e o HEAD desta story
    git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml   # 3ª coluna (deletions) == 0

    # os jobs existentes continuam presentes (contagem, não conteúdo — resiliente a edição de step)
    grep -c "^  static:\|^  tenancy-gate:" .github/workflows/ci.yml    # continua 2
    ```
  - `concurrency` **de job** (chave própria, não a do workflow inteiro), grupo fixo,
    `cancel-in-progress: false` — existe **um** banco de teste; cancelar no meio deixaria o banco
    em estado intermediário para o próximo PR.
  - Roda **só em `pull_request`**.
  - **Guard de fork:** `if: github.event.pull_request.head.repo.full_name == github.repository` —
    este job usa `SUPABASE_MANAGEMENT_PAT` (secret já gravado pela `900-3`).
  - **Não-bloqueante nesta onda** (`continue-on-error: true`, mesmo padrão do job `tenancy-gate`),
    com comentário no PR desde o dia 1 — reaproveitar o padrão de comentário via
    `actions/github-script` já usado pelo job `tenancy-gate` (mesmo arquivo).

  **Verificação (mutação que reprova):**
  - PR de fork (ou `head.repo.full_name` diferente simulado) → job não roda.
  - Dois pushes seguidos no mesmo PR → o segundo não cancela o primeiro.
  - `git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml` (pós-implementação) tem 0
    na coluna de deleções; `grep -c "^  static:\|^  tenancy-gate:"` continua 2.
  [Source: parecer `@po`, C4; plano aprovado, Passo 8; `.github/workflows/ci.yml` (cabeçalho + job
  `tenancy-gate` como precedente de padrão); medição direta desta story]

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

- [ ] **Task 1 — Migration + runbook (AC1)**
  - [ ] 1.1 **(@dev)** Reconfirmar o número de migration livre no dia da implementação (comando
    de varredura completa na AC1 — com `git fetch --prune origin` primeiro); escrever
    `supabase/migrations/{N}_registro_de_migrations.sql` criando `trifold_migrations_aplicadas`
    com RLS.
  - [ ] 1.2 Escrever `docs/audits/migrations-aplicadas.json` (estrutura chaveada por ambiente, S5).
  - [ ] 1.3 Escrever o SQL de backfill (uma linha por arquivo de migration existente em produção,
    `via='backfill-onda-1'`) — não aplicar ainda, só preparar.
  - [ ] 1.4 **(@devops)** Escrever `docs/runbooks/aplicar-{N}-registro-migrations.md` e **executar**
    a aplicação manual (migration + backfill) em teste e em produção, seguindo o próprio runbook.
    Colar a saída de conferência no Dev Agent Record.

- [ ] **Task 2 — `db:status` / `db:apply` (AC2, depende da Task 1 aplicada)**
  - [ ] 2.1 Extrair `runSql`/`splitStatements` de `scripts/reset-tenancy-testdb.ts` para
    `scripts/lib/management-api.ts`.
  - [ ] 2.2 Atualizar `reset-tenancy-testdb.ts` para importar do módulo extraído.
  - [ ] 2.3 Implementar `scripts/db-status.ts` e `scripts/db-apply.ts`, registrar `"db:status"`/
    `"db:apply"` em `package.json` (raiz), com o contrato de exit code corrigido (C6).
  - [ ] 2.4 Rodar `pnpm db:status` contra teste (pós Task 1.4) e confirmar veredito limpo.
  - [ ] 2.5 Rodar a régua ancorada da AC2 (C5) e colar a saída no Dev Agent Record, junto com a
    exclusão declarada de `scripts/gate-tenancy.ts:215`.

- [ ] **Task 3 — Reset popula o ledger (AC3, depende da Task 1)**
  - [ ] 3.1 Estender `reset-tenancy-testdb.ts` (já endurecido pela `900-3b`) para popular
    `trifold_migrations_aplicadas` (`via='reset'`) ao final.
  - [ ] 3.2 Rodar `pnpm reset:testdb --confirmar` e confirmar via `pnpm db:status` que nada fica
    `PENDENTE`.

- [ ] **Task 4 — Job de CI (AC4, depende da Task 2)**
  - [ ] 4.1 Acrescentar o job novo a `.github/workflows/ci.yml` (concurrency de job, guard de fork,
    `pull_request` only, `continue-on-error: true`, invocando `pnpm db:apply` contra teste).
  - [ ] 4.2 Reaproveitar o padrão de comentário no PR do job `tenancy-gate` já existente.
  - [ ] 4.3 Rodar a régua corrigida da AC4 (C4 — `git diff --numstat` + contagem de jobs) e colar a
    saída no Dev Agent Record.

- [ ] **Task 5 — `deploy-flow.md` + remoção de `sync-schema.sh` (AC5, depende da Task 2)**
  - [ ] 5.1 Reescrever `docs/deploy-flow.md`.
  - [ ] 5.2 Deletar `scripts/sync-schema.sh`.
  - [ ] 5.3 Citar no Dev Agent Record o item `[EPIC-900]` já aberto pelo `@po` em
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

### Migrations — números medidos em 2026-08-29 (reconfirmar de novo no dia da implementação, depois do merge do PR #522)
`origin/main` (`563e639f`): 266 arquivos, maior prefixo 243, 21 prefixos duplicados (lista:
`021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104, 164,
170, 230, 240` — o par novo é `240_followup_nicole_por_lead.sql` × `240_provision_org.sql`,
criado dentro do próprio Epic 900). Varredura completa de refs (com `fetch`): `244` tomado pelo PR
#522 (`origin/story/900-22b-convite-admin`); `245` livre em todas. **Este estado muda assim que o
PR #522 mergear — reconfirmar sempre com o comando da AC1, nunca com este parágrafo.**

### `supabase_migrations.schema_migrations` — por que não serve
Confirmado no runbook `docs/runbooks/aplicar-242-243-live-coach.md`: congelada na `168` em
produção. `supabase db push` é estruturalmente inutilizável neste repositório por três razões:
prefixos duplicados (a chave `version` do `db push` é o prefixo numérico); o ledger nativo
congelado; os 11 arquivos `_remote_only.sql` com `CREATE INDEX CONCURRENTLY`, que aborta com
`25001` dentro da transação por arquivo do `db push`.

### `scripts/reset-tenancy-testdb.ts` — estado ao chegar nesta fatia (já modificado pela `900-3b`)
Ao iniciar esta fatia, o script já tem: dry-run por padrão, allowlist (não denylist) de
`scripts/lib/db-env.ts`, confirmação informativa, medição de duração. `runSql`/`splitStatements`
**ainda estão dentro do arquivo** — a extração é Task 2.1 desta fatia. O `User-Agent:
trifold-tenancy-reset` obrigatório em `runSql` (sem ele o WAF responde "error code: 1010") precisa
sobreviver à extração.

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
4. CI: guard de fork barra PAT; concurrency de job não cancela execução em andamento; régua de
   não-reescrita (`git diff --numstat` + contagem de jobs) verde.
5. Documentos: `deploy-flow.md` não rotula produção como "Staging"; `sync-schema.sh` não existe.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Migration `245` (ou o número real no dia) colide com outra story do epic em paralelo — já aconteceu uma vez durante o draft original (`244` tomado pelo PR #522), quarta ocorrência do mecanismo do §0.1 do epic | Alta — medido, não hipotético | Task 1.1 reconfirma o número por varredura completa de refs (com `fetch`), nunca usa valor herdado deste documento |
| R2 | Job de CI (AC4) vaza `SUPABASE_MANAGEMENT_PAT` para PR de fork | Alta se ocorrer, baixa probabilidade | Guard `head.repo.full_name == github.repository` obrigatório, testado explicitamente |
| R3 | Contradição entre a remoção de `sync-schema.sh` e o epic §461 vira fonte de confusão futura | Baixa — mérito já resolvido pelo `@po` | Item `[EPIC-900]` aberto em `docs/backlog.md`, endereçado ao `@pm`, com a evidência de que a `900-3` nunca usou o script (T1.1-T1.4 desmarcadas) |
| R4 | Esta fatia começa antes da `900-3b` mergear, e a extração de `runSql`/`splitStatements` (Task 2.1) colide com o hardening que a `900-3b` está fazendo no mesmo arquivo | Média | Dependency explícita na seção Dependencies; @devops confirma o merge da `900-3b` antes de iniciar a Task 2 |

---

## Dependencies

- **Depende de:** `900-3b` (Fatia A) — precisa estar **mergeada** antes da Task 2 (extração de
  `runSql`/`splitStatements` do `reset-tenancy-testdb.ts` que a `900-3b` já modificou) e da Task 3
  (popular o ledger no reset já endurecido).
- **Depende de:** merge do PR #522 (`900-22b`) — para que a Task 1.1 reconfirme o número de
  migration contra um estado estável, sem disputar `245` com um PR ainda aberto. Não é bloqueio
  absoluto (a Task 1.1 pode rodar antes, mas arrisca ter que renumerar de novo se outro PR tomar o
  número primeiro).
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
- [ ] Job de CI novo presente em `.github/workflows/ci.yml`, arquivo não reescrito (régua C4
  corrigida, verde)
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

---

## Dev Agent Record

### Agent Model Used
_A preencher._

### Debug Log References
_A preencher._

### Completion Notes List
_A preencher._

### File List
_A preencher._

---

## QA Results

_A preencher pelo @qa após revisão._

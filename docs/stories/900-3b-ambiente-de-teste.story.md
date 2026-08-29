# Story 900-3b — Ambiente de Teste (Fatia A de 2 — Onda 1 do plano de 3 ondas)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 1 — Isolamento. Como a `900-3` original, esta story entrega infraestrutura de teste/promoção (o critério de saída da Onda 1 do plano de 3 ondas aprovado), não uma story de policy (`900-4`…`900-18`).
- **Story:** 900-3b — **Fatia A** de um split em duas, decidido pelo `@po` na validação de 2026-08-29 (`docs/qa/po-validation-900-3b.md`) e autorizado pelo dono do produto. A irmã é `900-3c` (Fatia B — Promoção).
- **Status:** Ready — GO condicional do `@po` (8/10, Rodada 2, `docs/qa/po-validation-900-3b.md`) com a emenda D1 e as recomendações S8-S13 aplicadas nesta versão. A Task 1 pode começar imediatamente; não depende do PR #522.
- **Priority:** P0 — sem esta fatia, `pnpm dev` continua apontando para produção por padrão e o banco de teste continua sem forma segura de ser reconstruído.
- **Complexity:** L — 7 ACs, ~20 arquivos, **zero migration, zero toque em produção**. Não disputa número com o PR #522.
- **Created:** 2026-08-29 (v0.1 original); **reescrita em 2026-08-29** como Fatia A do split.
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @devops (Gage) — infraestrutura, scripts, docs. **Sem exceção de @dev nesta fatia** — diferente da v0.1 original, esta fatia não cria nenhuma migration.
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[ci_secrets_review, script_review]`

---

## Por que esta story virou duas — leia antes de implementar

A v0.1/v0.2 desta story foi validada pelo `@po` com **NO-GO, 6/10** (`docs/qa/po-validation-900-3b.md`,
execução real de toda AC-comando contra `HEAD`). Duas classes de problema, ambas corrigidas nesta
reescrita:

1. **8 réguas com defeito de forma** (C1-C8 no parecer): resultado esperado invertido, controle
   positivo que executava um script destrutivo contra produção, asserção que reprova execução
   saudável, AC citando outra AC já superada/vermelha, grep que nunca fecha por escopo errado,
   contradição de exit code entre duas ACs, régua sem carrasco, varredura de refs sem `fetch`.
   Nenhuma exigia redesenho — todas são correção de AC. Aplicadas nesta fatia (C1, C2, C3, C7) e na
   `900-3c` (C4, C5, C6, C8).
2. **Fatiamento no ponto errado.** O corte que eu havia proposto ("Passos 0-3 / 4-8") tinha uma
   dependência na direção errada (a AC10 ficaria inteira na Fatia A, mas um item dela — o comando
   de promoção documentado em `deploy-flow.md` — só nasce na Fatia B) e deixava o risco aceito D6
   (dev local e reset compartilhando o `trifold-crm-dev`) sem a mitigação do Passo 6 durante a
   janela entre as duas fatias. O `@po` corrigiu para a fronteira **"quem escreve DDL em
   produção"**, que é a fronteira usada aqui.

**Esta fatia (900-3b) entrega tudo que não cria migration e não toca produção:** correção do
`.gitignore`, split de ambiente com banner, `scripts/lib/db-env.ts`, `supabase/config.toml`,
endurecimento do reset (exceto popular o ledger, que só existe na `900-3c`), `FALHAS_CONHECIDAS`
estruturada, e os documentos que ficam factualmente errados no instante em que o rename acontece.
**A `900-3c` entrega tudo que cria/aplica a migration** (`trifold_migrations_aplicadas`,
`db:status`/`db:apply`, o job de CI, `deploy-flow.md`, a remoção de `sync-schema.sh`).

**Consequência que precisa estar escrita, não subentendida (achado do `@po`, §1.4 do parecer):**
entre esta fatia e a `900-3c` não existe `db:apply`. Trazer o banco de teste ao `HEAD` atual se faz
pelo `reset-tenancy-testdb.ts` que **já existe** (Story 900-3) — e isso vai para `scripts/README.md`
nesta própria fatia (Task 2), para que o primeiro desenvolvedor que usar o novo default não
diagnostique como bug de código o que é só "a `900-3c` ainda não mergeou".

---

## Numeração — por que `900-3b`

(Reproduzido da v0.1, ainda válido — o `@po` não achou problema aqui.) A Onda 1 do plano aprovado
estende a Story `900-3` (harness do Supabase descartável), que registra literalmente a condição de
reabertura que esta story aciona: *"o risco volta a existir no dia em que `.env.development` for
criado e o projeto passar a servir aos dois usos."* [Source:
`docs/stories/900-3-supabase-descartavel-harness-isolamento.story.md`]. `900-3b` segue a convenção
já estabelecida pelo epic para reabertura por sufixo de letra (`900-14b`, "*o sufixo `b` segue a
convenção do próprio epic (`900-27a/b`, `900-42a/b`)*"). Verificado sem colisão em 2026-08-29
(`ls docs/stories/900-3*`, `grep -rl "900-3b" docs/`).

**`900-3c`** (a Fatia B) segue a mesma lógica de sufixo, como irmã direta desta — as duas nasceram
do mesmo split, e não faria sentido pular para `900-4` ou renumerar a sequencial do epic para algo
que continua sendo consequência da reabertura da `900-3`.

**Ação de follow-up ao fechar (as duas fatias):** atualizar a seção "Estado real do PRE-1" da
`900-3`, apontando para `900-3b` + `900-3c` como as stories que resolveram a condição de
reabertura.

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** que `pnpm dev` e os scripts operacionais apontem por padrão para o ambiente de teste
(`trifold-crm-dev`), com saída de emergência nomeada para produção, allowlist fechada por padrão
para qualquer script que escreva, e um reset endurecido e auditável,
**Para que** o desenvolvimento do dia a dia deixe de tocar produção por padrão — sem depender
ainda da parte de promoção/ledger, que é a `900-3c`.

---

## Context

Duas lacunas medidas motivam a Onda 1 inteira (repetido da v0.1, ainda válido): `.env.local`
aponta para produção e vence qualquer outro arquivo de env no Next.js; e não existe registro de
"o que foi aplicado onde" nas migrations. **Esta fatia resolve só a primeira.** A segunda
(ledger + `db:status`/`db:apply` + CI) é a `900-3c`.

**Achado medido nesta redação, que reforça por que o Passo 0 (`.gitignore`) é conserto de defeito
ativo, não preparação para arquivo futuro:** `.env.example` da raiz **já está ignorado hoje**
(`git check-ignore --no-index -v .env.example` → `exit 0`, casado por `.gitignore:53:.env*`) e só
sobrevive versionado porque foi commitado antes dessa regra existir. Um `.env.example` novo, hoje,
não conseguiria ser adicionado ao repositório. O `@po` reproduziu esta medição de forma independente
e confirmou.

---

## Scope

### IN (esta story entrega)
1. Correção do `.gitignore` (raiz e `packages/web/`) **com teste automatizado** que invoca o
   próprio `git check-ignore` (não uma reimplementação da lógica).
2. Split de ambiente por rename + saída de emergência + banner decomposto (lógica pura testável +
   integração via `pnpm dev`) + decisão explícita de como `pnpm build` local vê (ou não vê) o
   ambiente de teste + `scripts/README.md` + `.claude/CLAUDE.md` corrigidos no mesmo escopo.
3. `scripts/lib/db-env.ts`: allowlist (não denylist) de refs de produção, com controle positivo
   **sem execução de script destrutivo**.
4. `supabase/config.toml` versionado, apontando para teste por padrão.
5. Endurecimento do `reset-tenancy-testdb.ts`: dry-run por padrão, confirmação informativa,
   allowlist reusada, medição de duração. **Não inclui** popular o ledger (`trifold_migrations_aplicadas`
   não existe até a `900-3c`).
6. `FALHAS_CONHECIDAS` reestruturada + `ASSERÇÕES` com predicados corrigidos (ancorados por `id`,
   não um predicado colinear único) para `236`/`237` — e a execução real do reset até o `HEAD`
   atual, com o resultado medido registrado no Dev Agent Record.
7. `.claude/agent-memory/aios-devops/reference_ci_surface_trifold.md` — manchete corrigida, corpo
   preservado.

### OUT (fica para `900-3c` — Fatia B)
- Migration nova (`trifold_migrations_aplicadas`) e o runbook de aplicação manual.
- `pnpm db:status` / `pnpm db:apply` e a extração de `runSql`/`splitStatements` para
  `scripts/lib/management-api.ts`.
- Popular o ledger a partir do reset (`via='reset'`) — depende da tabela existir.
- Job de CI que aplica migrations pendentes no banco de teste.
- Reescrita de `docs/deploy-flow.md` e remoção de `scripts/sync-schema.sh`.
- Qualquer item do "Deferido da Onda 1" original (Playwright, `check-deploy-drift.sh`, itens 4-5 da
  mitigação do reset, `TENANCY_TEST_SUPABASE_ANON_KEY`) — ver seção de Handoff na `900-3c`.

---

## Acceptance Criteria

- [ ] **AC1 — `.gitignore` corrigido, com carrasco em CI (Passo 0 + correções C7 e S3 do parecer):**
  - **Root `.gitignore`:** remover a linha `.env*` (hoje linha 53). As linhas `.env` (2), `.env.*`
    (3) e `!.env.example` (4) já bastam — a linha 53 é que anulava a negação da linha 4. Não
    adicionar negação nova na raiz para `packages/web/.env.development.example`: negação de path
    aninhado feita no `.gitignore` da raiz **não vence** a regra ampla do `.gitignore` mais
    profundo (achado S3 do `@po` — patterns do `.gitignore` mais próximo do arquivo entram
    "depois" na pilha efetiva e vencem em caso de conflito).
  - **`packages/web/.gitignore`:** manter `.env*` (hoje linha 34) e acrescentar, **depois** dela,
    `!.env.development.example` — a negação tem que morar no mesmo `.gitignore` que a regra ampla,
    para a regra "a última que casa vence" se aplicar dentro do arquivo certo.
  - **Teste automatizado obrigatório (C7): `scripts/gitignore-env.test.ts`.** `git check-ignore
    --no-index` é **comando**, não teste — nada garante hoje que alguém rode, e um merge futuro
    que reintroduza `.env*` na raiz ou remova a negação de `packages/web/.gitignore` regride em
    silêncio. O teste invoca o **mesmo instrumento** via `execFileSync("git", ["check-ignore",
    "--no-index", caminho])` — não reimplementa a lógica do `.gitignore` (evita virar uma segunda
    fonte de verdade). Confirmado pelo `@po`: `git check-ignore --no-index` responde sobre
    **caminhos**, não sobre arquivos existentes no disco — testado em `packages/web/.env.development`
    (inexistente) e obteve `exit 0` normalmente. O teste roda em CI mesmo sem nenhum arquivo de
    valor presente no runner. Quatro casos:

    | Caminho | Esperado | Papel |
    |---|---|---|
    | `.env.example` | **não** ignorado (exit 1) | positivo |
    | `packages/web/.env.development.example` | **não** ignorado (exit 1) | positivo |
    | `packages/web/.env.development` | ignorado (exit 0) | controle negativo |
    | `packages/web/.env.producao.local` | ignorado (exit 0) | controle negativo |

    Custo de infraestrutura zero: `vitest.config.ts` **já inclui** `scripts/**/*.test.ts`
    (Story 900-2a) e o job `static` do `ci.yml` **já roda** `pnpm test` em todo PR — a régua ganha
    carrasco em CI, não só no dia da implementação.

    **Correção S8 (@po, Rodada 2 — medido: `git check-ignore` sai `128` em erro fatal, fora de um
    repositório git):** o teste **não** pode aceitar qualquer status ≠ 0 como "ignorado" nem
    qualquer lançamento de `execFileSync` como "não ignorado" — um `catch` cego trataria o erro
    fatal (`128`) como "não ignorado", e os dois casos positivos passariam por acidente mesmo com o
    instrumento quebrado. A asserção correta é **`status === 1`** explícito para "não ignorado" e
    **`status === 0`** explícito para "ignorado"; qualquer outro código (`128` incluído) falha o
    teste nomeando o status recebido, nunca cai num `catch` genérico. **Os dois controles negativos
    desta tabela são, por construção, a guarda de vivacidade do instrumento** — se o `git` falhar
    (status `128`), eles também falham (porque não recebem `0`), denunciando o instrumento quebrado
    em vez do `.gitignore`. Não removê-los achando que servem só contra vazamento de segredo.

  **Verificação (mutação que reprova):** reverter a Task 1 num branch de teste (restaurar `.env*`
  na raiz e remover a negação de `packages/web/.gitignore`) e rodar `pnpm test -- gitignore-env` →
  os dois casos positivos devem falhar (deixam de sair `exit 1`). Sem essa reversão de teste, a AC
  não está confirmada.
  [Source: parecer `@po`, C7 e S3; medição direta desta story e da v0.1]

- [ ] **AC2 — Split de ambiente + banner decomposto + decisão de build local + `.bak` da mesclagem + `scripts/README.md`/`CLAUDE.md` no mesmo escopo (Passo 1 + correções C1, S4, S7):**
  - Renomeações (arquivos gitignored, invisíveis ao git, reversíveis por `mv`):

    | De | Para |
    |---|---|
    | `packages/web/.env.local` (prod) | `packages/web/.env.producao.local` |
    | `packages/web/.env.production.local` (prod) | mesclado em `.env.producao.local`, **preservando o original renomeado como `packages/web/.env.production.local.bak`** (S7 — é a única operação do Passo 1 não reversível por `mv` puro, porque é fusão de dois arquivos; o `.bak` restaura a reversibilidade simétrica) |
    | `.env.local` (raiz, prod) | `.env.producao` |
    | — (novo) | `packages/web/.env.development` (teste — valores de `xnxvygyfyyyzwhiuoehz`, obtidos no painel Supabase, nunca copiados de secret do GitHub) |
    | — (novo) | `.env.teste` (raiz, teste) |
    | — (novo, **tracked**) | `packages/web/.env.development.example` — só nomes, via `grep -o '^[A-Z_][A-Z0-9_]*=' packages/web/.env.local | sed 's/=$//' | sort -u` (verificado pelo `@po`: a âncora casa até o `=`, o valor nunca entra na captura) |

    Fora desta tabela: `packages/web/.env.vercel.check` (propósito distinto, não tocado); `.env`/
    `.env.example` da raiz (config do instalador AIOS, não relacionado a Supabase).
  - `packages/web/package.json` ganha `"dev:prod": "node --env-file=.env.producao.local
    ./node_modules/next/dist/bin/next dev --port 3000"`.
  - **Banner decomposto (S4):** a lógica de decisão vira função pura —
    `packages/web/src/lib/env-banner.ts`, `avaliarRefDoAmbiente(url: string | undefined, nodeEnv:
    string | undefined): "ok" | "alerta" | "ausente"` — testada em
    `packages/web/src/lib/env-banner.test.ts` (`vitest.config.ts` já inclui
    `packages/web/src/**/*.test.ts`). `packages/web/src/instrumentation.ts` (já existe, já roda no
    boot — ver conteúdo em Dev Notes) importa essa função dentro do mesmo `register()` e só faz o
    `console.error`/impressão do banner; `pnpm dev` continua sendo a evidência de integração, não a
    única prova.
  - **Correção D1 (@po, Rodada 2, BLOQUEANTE — o terceiro estado que fecha o buraco aberto pelo
    C1):** `url` `undefined`, string vazia, ou uma URL da qual não se extrai ref válido ⇒
    `"ausente"` — **não** `"ok"`. Um tipo de dois estados deixaria a implementação natural ser
    `undefined → "ok"` (não é o ref de produção, logo "sem alerta"), e o build sem nenhuma env de
    Supabase (a própria consequência da decisão do C1 — ver abaixo) subiria **calado**. O banner
    imprime um aviso **distinto** para `"ausente"` (ex.: "nenhum Supabase configurado — este
    build/boot não fala com banco nenhum"), nunca silêncio. Isto fecha o defeito que a decisão do
    C1 trocou (de "assa produção em silêncio" para "assa `undefined` em silêncio"), sem reabrir o
    desenho da decisão em si — o `@po` endossou explicitamente `pnpm build` ficar sem env por
    padrão; o que faltava era o banner enxergar esse estado.
  - **Decisão sobre `pnpm build` local (C1 — obrigatória, não pode ficar em aberto):** o `next
    build` roda com `NODE_ENV=production` e **não lê `.env.development`** — a ordem real é
    `.env.production.local` → `.env.local` → `.env.production` → `.env`, nenhum dos quais existe em
    `packages/web/` depois dos renames desta AC. **Decisão: `pnpm build` (sem flag) fica sem
    nenhuma env de Supabase, por desenho** — é o comportamento mais seguro (nem produção nem teste
    assados por acidente), e reflete o real comportamento do Next, em vez de fingir que builda
    contra teste. Para quem precisar validar o bundle contra o ambiente de teste, `packages/web/package.json`
    ganha `"build:teste": "node --env-file=.env.development ./node_modules/next/dist/bin/next
    build"` — mesmo mecanismo do `dev:prod`, reusando o `.env.development` já criado (sem duplicar
    segredo em arquivo novo).
  - **`scripts/README.md` corrigido no mesmo escopo desta Task** (não depois): a frase atual —
    *"O estado padrão do repositório é `.env.local` apontando para PRODUÇÃO"* — passa a ser o
    oposto. Documenta também o comando de reversão (abaixo) e a nota operacional: *"até a
    `900-3c` mergear, não existe `pnpm db:apply`; para trazer o banco de teste ao `HEAD` atual, use
    `npx tsx scripts/reset-tenancy-testdb.ts --confirmar` (Story 900-3)."*
  - **`.claude/CLAUDE.md` corrigido no mesmo escopo desta Task (S1):** as linhas hoje 385-387 (não
    só 385-386 — a 387, *"Nunca deixar `.env.local` apontando para o projeto dev após testes"*,
    também fica sem sentido, porque `.env.local` deixa de existir). **Régua de verificação por
    conteúdo, não por número de linha** (ponteiro de linha envelhece a cada linha inserida acima —
    achado S1): `grep -c 'Produção:.*\.env\.local' .claude/CLAUDE.md` → **0** depois da correção.

  **Reversibilidade — comando literal (constraint do spawn original, mantida):**
  ```bash
  mv packages/web/.env.producao.local packages/web/.env.local
  mv packages/web/.env.production.local.bak packages/web/.env.production.local   # restaura o merge (S7)
  mv .env.producao .env.local   # raiz, se também precisar reverter
  ```

  **Verificação (mutação que reprova, C1 e D1 corrigidos, régua de bundle corrigida por S12):**
  - `pnpm dev` (raiz) → banner com `xnxvygyfyyyzwhiuoehz` (`avaliarRefDoAmbiente` retorna `"ok"`).
  - `pnpm dev:prod` (dentro de `packages/web`) → banner vermelho (`avaliarRefDoAmbiente` retorna
    `"alerta"`).
  - `packages/web/src/lib/env-banner.test.ts`: `avaliarRefDoAmbiente("https://dsopqkqjkmhytudaaolv.supabase.co", "development")`
    → `"alerta"`; `avaliarRefDoAmbiente("https://xnxvygyfyyyzwhiuoehz.supabase.co", "development")`
    → `"ok"`; `avaliarRefDoAmbiente(undefined, "development") === "ausente"` (D1 — não mais "não
    lança"; o retorno específico é a asserção); `avaliarRefDoAmbiente("", "production") ===
    "ausente"` (string vazia, mesmo tratamento).
  - **Correção S12 (@po, Rodada 2 — medido: `grep -rc PADRÃO diretório` não imprime um número solo,
    imprime `arquivo:contagem` por arquivo; a saída "→ 0"/"→ ≥1" da v1.0 era ambígua):** trocar por
    `grep -rl`, cujo resultado é inequívoco (lista de arquivos ou nada, exit 1 = não achou):
    - `pnpm build` (sem flag) dentro de `packages/web` → `grep -rl "dsopqkqjkmhytudaaolv"
      packages/web/.next/static` → **nenhum arquivo listado, exit 1** (controle negativo: nem
      produção nem teste vazam por acidente no build default).
    - `pnpm build:teste` dentro de `packages/web` → `grep -rl "xnxvy" packages/web/.next/static` →
      **pelo menos um arquivo listado, exit 0** (controle positivo: o script explícito de fato
      baking o ref de teste no bundle, provando que o mecanismo funciona quando alguém escolhe
      usá-lo).
  - `git diff scripts/README.md .claude/CLAUDE.md` não é vazio no mesmo PR do rename.
  [Source: parecer `@po`, C1, S4, S7, S1; plano aprovado, Passo 1 e parte do Passo 9]

- [ ] **AC3 — `scripts/lib/db-env.ts`: allowlist fecha-fechado, controle positivo sem efeito destrutivo (Passo 2 + correção C2):**
  - Módulo novo (≤80 linhas, sem dependência `dotenv` nova). `resolverAmbiente({ escreve? })`:
    seletor `TRIFOLD_ENV`, default `teste`; `escreve: true` + `producao` exige
    `TRIFOLD_ALLOW_PROD=1`; loga ambiente/ref em `stderr`.
  - **Allowlist, não denylist:** substitui `REFS_PROIBIDOS` (`scripts/reset-tenancy-testdb.ts`
    linha 59, denylist de tamanho 1) por `REFS_PERMITIDOS_PRODUCAO`, falhando fechada para
    qualquer ref não cadastrado.
  - **Migração em duas levas — contagem reconferida em 2026-08-29 (7 destrutivos, não 6 como o
    plano supunha):** `cleanup-duplicate-leads.ts` + os 6 `backfill-*.ts`
    (`backfill-campaign-entries`, `backfill-criar-obras`, `backfill-google-calendar`,
    `backfill-meta-ad-insights`, `backfill-vind-portal-invites`, `backfill-yarden-portal-invites`).
    Verificar também `scripts/meta-backfill-leads.ts` (nome fora do padrão, mas escreve em
    `leads`) no início da Task 3.
  - Segunda leva: os demais scripts que leem env de Supabase diretamente (19 identificados em
    2026-08-29 via `grep -rl "process.env.SUPABASE\|process.env.NEXT_PUBLIC_SUPABASE"
    scripts/*.ts` — reconferir no dia; note-se que os nomes de variável não são uniformes entre
    scripts, `resolverAmbiente()` precisa cobrir `SUPABASE_URL` **e** `NEXT_PUBLIC_SUPABASE_URL`).
  - **Teste, com o controle positivo corrigido (C2):** `scripts/db-env.test.ts`.
    - **Controle negativo:** `resolverAmbiente({ escreve: true })` sob `TRIFOLD_ENV=producao` e um
      ref de produção **fictício, nunca cadastrado** → recusa por padrão (a diferença observável
      entre allowlist e denylist).
    - **Controle positivo — corrigido, sem executar script destrutivo:** chamar
      `resolverAmbiente({ escreve: true })` **diretamente**, sob `TRIFOLD_ENV=producao
      TRIFOLD_ALLOW_PROD=1` e o ref **real** de produção, e afirmar que a função **retorna** esse
      ref sem lançar — **nunca** invocar `cleanup-duplicate-leads.ts` nem qualquer script da
      tabela de destrutivos, porque nenhum deles para na checagem de ambiente: eles passam dela e
      seguem para o `DELETE`/`UPDATE` real em `leads`. O parecer do `@po` (C2) é explícito: o
      controle positivo, como a v0.1 escreveu, era a instrução literal para rodar um script
      destrutivo contra produção. Se algum dia se quiser um controle positivo em nível de
      script (não obrigatório nesta AC), usar um **somente-leitura**
      (`scripts/generate-schema-snapshot.ts`), nunca um da tabela de destrutivos.
    - **Correção S9 (@po, Rodada 2) — de onde `resolverAmbiente()` lê o ref, declarado:**
      `process.env` **vence** o arquivo dotenv; o arquivo (`.env.teste`/`.env.producao`) é
      **fallback**, só usado quando a variável não está em `process.env`. `scripts/db-env.test.ts`
      **injeta o ref por `process.env`** (`vi.stubEnv` ou atribuição direta antes de chamar
      `resolverAmbiente()`), **nunca** depende de `.env.teste`/`.env.producao` existirem no disco —
      os dois são gitignored e **ausentes no runner de CI**. Sem esta declaração, o carrasco da
      correção C2 não roda em CI (ou pior: um `@dev` apressado faz o teste pular quando o arquivo
      falta, e um teste que pula é verde sem juiz nenhum ter olhado).

  **Verificação (mutação que reprova):**
  - `TRIFOLD_ENV=producao npx tsx scripts/cleanup-duplicate-leads.ts` (sem `TRIFOLD_ALLOW_PROD=1`)
    sai `1`, nomeando a variável que falta.
  - Rodar `scripts/db-env.test.ts` com a allowlist revertida para a denylist antiga → o caso do ref
    fictício passa a ser aceito (falso positivo) → prova que o teste discrimina as duas
    implementações.
  - Rodar `scripts/db-env.test.ts` num ambiente **sem** `.env.teste`/`.env.producao` no disco
    (simulando o runner de CI) → o teste continua rodando e afirmando, porque o ref vem de
    `process.env` injetado pelo próprio teste, nunca do arquivo (S9).
  [Source: parecer `@po`, C2, S9; plano aprovado, Passo 2; medição direta desta story]

- [ ] **AC4 — `supabase/config.toml` versionado, teste por padrão (Passo 3, sem alteração do parecer):**
  - Arquivo novo (não existe hoje) com `project_id = "xnxvygyfyyyzwhiuoehz"` e comentário
    explicando as três razões contra `supabase db push` neste repositório (prefixos duplicados —
    hoje 21; ledger de produção congelado na 168; os 11 `_remote_only.sql` com `CREATE INDEX
    CONCURRENTLY`).
  **Verificação:** `supabase status` (ou subcomando equivalente) sem flag/env explícita resolve
  para `xnxvygyfyyyzwhiuoehz`.
  [Source: plano aprovado, Passo 3]

- [ ] **AC5 — Reset endurecido: itens 1-3 e 5 do Passo 6 (sem o item de popular o ledger, que é `900-3c`):**
  - `reset:testdb` (script `pnpm` novo): **default `--dry-run`**; destruir exige `--confirmar`.
  - Antes de pedir confirmação, imprime: ref do projeto-alvo, contagem de orgs, contagem de leads,
    `max(created_at)` de `leads`.
  - `REFS_PROIBIDOS` (denylist, linha 59 hoje) substituído pela allowlist de `scripts/lib/db-env.ts`
    (AC3) — uma única implementação de "o que é produção" para reset e para os demais scripts.
  - Medição de duração por arquivo → `docs/audits/reset-testdb-duracao.json` (total, p50, p95, top
    10 mais lentas). **Teto que avisa, não que falha** — não introduzir timeout duro nesta story.
  - **Correção S6/S13 (@po, Rodada 2) — default nomeado, não decisão em aberto sem default:**
    `docs/audits/` é diretório **rastreado** por precedência da casa (`gate-tenancy-report.json`,
    `rls-gate-baseline.json` já são versionados) — deixar a escolha "em aberto" sem declarar um
    default faria o arquivo nascer tracked por inércia, e o churn começar sem ninguém ter decidido
    isso de propósito. **Default: `docs/audits/reset-testdb-duracao.json` é gitignored.** Rastreá-lo
    exige decisão explícita registrada no Dev Agent Record, com o tamanho do diff medido depois da
    primeira execução — inércia vira opt-in, não o contrário.
  - **Correção S11 (@po, Rodada 2) — mecanismo do SHA-256 de idempotência, nomeado:** não existe
    `createHash` em nenhum arquivo de `scripts/` hoje (medido: `grep -rln "createHash" scripts/` →
    vazio); a comparação da Story 900-3 foi feita **ad hoc**, sem ferramenta deixada no
    repositório. Sem nomear o comando, este item de DoD fica sem instrumento e o @dev tem que
    inventar um. **Mecanismo:** `pnpm gate:tenancy:snapshot` (já existe — `scripts/generate-schema-snapshot.ts`,
    já faz a introspecção de colunas/policies/índices/funções) gera `docs/audits/schema-snapshot.json`;
    o hash SHA-256 **desse arquivo** (`sha256sum docs/audits/schema-snapshot.json` ou
    `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex'))" docs/audits/schema-snapshot.json`)
    é o valor comparado antes/depois — nenhuma ferramenta nova a escrever, só encadear a já
    existente.
  - **Explicitamente fora desta AC:** popular `trifold_migrations_aplicadas` (`via='reset'`) — a
    tabela não existe até a `900-3c`. Até lá, `delete from supabase_migrations.schema_migrations;`
    (linha ~231 do script atual) **permanece como está** — não é regressão desta fatia, é o estado
    que a `900-3c` corrige.

  **Verificação (mutação que reprova):**
  - `pnpm reset:testdb` (sem flag) não apaga nada.
  - `pnpm reset:testdb --confirmar` contra o ref real de teste reconstrói o banco; rodado 2x
    seguidas, `docs/audits/reset-testdb-duracao.json` existe nas duas execuções (gitignored por
    default — S6/S13) e `sha256sum docs/audits/schema-snapshot.json` (gerado por
    `pnpm gate:tenancy:snapshot`, rodado logo após cada reset) é idêntico entre as duas (S11).
  - `pnpm reset:testdb --confirmar` contra o ref de produção (mesmo via env forçada) → recusa pela
    allowlist da AC3.
  [Source: plano aprovado, Passo 6; parecer `@po`, §1.3 (item 4 da AC7 original fica em B), S6,
  S11, S13]

- [ ] **AC6 — `FALHAS_CONHECIDAS` estruturada + predicados corrigidos para `236`/`237` (Passo 7 + correção C3):**
  - `FALHAS_CONHECIDAS` (hoje `Map<string, string>`, 4 entradas) migra para `{ motivo: string;
    classe: 'duplicata-de-prefixo' | 'backfill-de-dado-real' | 'artefato-do-metodo'; desde: string;
    revisar_em: string }`. As 4 entradas atuais reclassificadas: as duas `025_*` são
    `duplicata-de-prefixo`; as duas `properties_*` são `backfill-de-dado-real`.
  - **Verificação nos dois sentidos:** entrada cuja migration **parou de falhar** também faz o
    `reset:testdb` sair `≠0`, nomeando-a.
  - **Teto:** mais de 6 entradas → `reset:testdb` sai `1`.
  - **A premissa "`236`/`237` são no-ops guardados" é FALSA para um banco reconstruído do zero — não
    reproduzir essa frase como fato de contexto (achado C3 do parecer, confirmado por leitura
    traçada da sequência `011`→`236`→`237`, ainda que leitura de SQL não substitua execução):**
    `011_noshow_stage.sql` insere a linha `…0009` com `slug='no-show'`; `236_noshow_etapa_propria.sql`
    §2.1 faz `UPDATE … SET slug='atendimento' WHERE id='…0009' AND slug='no-show'` — num banco novo
    essa guarda **casa** e o `UPDATE` **dispara**; §2.2 insere `…0011` com `slug='no-show-real'`.
    `237_slug_noshow_limpo.sql` renomeia `…0011` de `no-show-real` para `no-show`. **As guardas das
    duas migrations casam num banco reconstruído do zero, e as duas fazem trabalho real** — a
    premissa de "no-op" valia para uma *reexecução*, não para a primeira aplicação. **Isto não
    decide sozinho, por leitura de código, se `236`/`237` terminam em sucesso ou falha** — depende
    do estado real que `011` deixa na sequência completa (que por sua vez depende da org default
    estar semeada, conforme `scripts/README.md` já documenta) — **a classificação continua sendo
    obtida por medição real (Task 6.4), nunca por suposição.**
  - **`ASSERÇÕES: Map<arquivo, sqlPredicado>` — dois predicados corrigidos, ancorados por `id`, não
    um predicado único colinear (C3):**
    ```sql
    -- após 236_noshow_etapa_propria.sql
    EXISTS (SELECT 1 FROM kanban_stages WHERE id = '00000000-0000-0000-0001-000000000011'
            AND slug = 'no-show-real' AND type = 'no_show')
    AND EXISTS (SELECT 1 FROM kanban_stages WHERE id = '00000000-0000-0000-0001-000000000009'
            AND slug = 'atendimento')

    -- após 237_slug_noshow_limpo.sql
    EXISTS (SELECT 1 FROM kanban_stages WHERE id = '00000000-0000-0000-0001-000000000011'
            AND slug = 'no-show')
    ```
    O predicado único original (`EXISTS (... slug='no-show' ...)`) **reprovava uma execução
    saudável de `236`** (logo depois dela, nenhuma linha tem `slug='no-show'` — só depois do `237`)
    e era **colinear** em `237` (passaria mesmo se `237` não fizesse nada, desde que `236` §2.1 não
    tivesse disparado). Ancorar por `id` resolve os dois defeitos.
  - **Correção S10 (@po, Rodada 2):** se `011_noshow_stage.sql` falhar por violação de FK (cenário
    já documentado em `scripts/README.md` — a linha `…0009` não existe sem a org default semeada),
    o predicado do `236` fica vermelho **sem que o `236` tenha errado nada** — a causa é upstream.
    Isto **não é um defeito automático da asserção**; é **informação de diagnóstico para a Task
    6.4**: ao ler o resultado real do reset, se `236`/`237` derem vermelho, checar primeiro se
    `011` aplicou com sucesso antes de concluir que `236`/`237` são o problema.

  **Verificação (mutação que reprova):**
  - Rodar o predicado antigo (único, sem âncora por `id`) contra o estado real logo após `236` →
    deve dar **falso** numa execução correta — é a prova de que o predicado antigo era o defeituoso.
  - Remover a asserção de `237` e trocar por uma cópia da de `236`: deve continuar "passando" mesmo
    que `237` não faça nada — é a prova de que o predicado velho de `237` era colinear.
  - Adicionar uma 7ª entrada a `FALHAS_CONHECIDAS` sem `classe` → falha de tipo, não aceitação
    silenciosa.
  [Source: parecer `@po`, C3 (SQL corrigido colado literal do parecer); constraint #1 do spawn
  original; leitura direta das três migrations nesta story — leitura de sequência, não execução]

- [ ] **AC7 — `reference_ci_surface_trifold.md`: manchete corrigida, corpo preservado (parte do Passo 9, independente das duas fatias):**
  - `.claude/agent-memory/aios-devops/reference_ci_surface_trifold.md` — a manchete (*"O único
    check de PR é o build do Vercel — não há GitHub Actions"*) está obsoleta desde a `900-1`, que
    criou `.github/workflows/ci.yml`. **Não apagar o arquivo** — duas lições do corpo continuam
    verdadeiras e sobrevivem literalmente: (1) comparar `passed + expected fail` entre branches,
    nunca `passed` sozinho; (2) `packages/ai/tsconfig.json` inclui `*.test.ts`, e teste com tipo
    quebrado derruba o build de produção.

  **Verificação:** `grep -c "passed + expected fail\|packages/ai/tsconfig"
  .claude/agent-memory/aios-devops/reference_ci_surface_trifold.md` (pós-correção) retorna ≥1.
  [Source: plano aprovado, Passo 9; leitura direta do arquivo nesta story]

---

## Tasks / Subtasks

*(ordem: 1 antes de 2, porque o `.gitignore` precisa estar corrigido antes de o `.example` ser
versionável; 3 depois de 2 por convenção de leitura, sem dependência técnica dura; 5 depende de 3
[allowlist]; 6 depende de 5 [precisa do reset endurecido] e roda por último porque precisa do
ambiente inteiro [2, 3, 4] já funcionando para executar de verdade contra teste; 7 é independente,
listada por último por conveniência)*

- [ ] **Task 1 — `.gitignore` + teste que invoca `git check-ignore` (AC1)**
  - [ ] 1.1 Remover a linha `.env*` do `.gitignore` da raiz.
  - [ ] 1.2 Acrescentar `!.env.development.example` em `packages/web/.gitignore`, depois da linha
    `.env*`.
  - [ ] 1.3 Escrever `scripts/gitignore-env.test.ts` com os 4 casos da AC1 (`execFileSync`).
  - [ ] 1.4 Rodar `pnpm test -- gitignore-env` e colar a saída no Dev Agent Record.

- [ ] **Task 2 — Split de ambiente + banner decomposto + `build:teste` + `scripts/README.md` + `CLAUDE.md` (AC2)**
  - [ ] 2.1 Renomear os 3 arquivos de produção, preservando `.env.production.local.bak` (S7).
  - [ ] 2.2 Criar `packages/web/.env.development` e `.env.teste` (raiz) com valores do projeto de
    teste (painel Supabase, nunca de secret do GitHub).
  - [ ] 2.3 Criar `packages/web/.env.development.example` (tracked, só nomes).
  - [ ] 2.4 Adicionar `"dev:prod"` e `"build:teste"` a `packages/web/package.json`.
  - [ ] 2.5 Criar `packages/web/src/lib/env-banner.ts` (`avaliarRefDoAmbiente`, com os três
    estados `"ok" | "alerta" | "ausente"` — D1) + `env-banner.test.ts` (incluindo o caso
    `undefined`/vazio → `"ausente"`); estender `instrumentation.ts` para importar e usar, com aviso
    distinto para `"ausente"`.
  - [ ] 2.6 Corrigir `scripts/README.md` (estado padrão + comando de reversão + nota sobre
    `db:apply` não existir ainda).
  - [ ] 2.7 Corrigir `.claude/CLAUDE.md` linhas 385-387 (as três).
  - [ ] 2.8 Rodar as 6 verificações da AC2 e colar evidência no Dev Agent Record.

- [ ] **Task 3 — `scripts/lib/db-env.ts` (AC3)**
  - [ ] 3.1 Reconferir a lista de scripts destrutivos (tabela da AC3 + checar
    `scripts/meta-backfill-leads.ts`).
  - [ ] 3.2 Implementar `resolverAmbiente()` com `REFS_PERMITIDOS_PRODUCAO`.
  - [ ] 3.3 Migrar a primeira leva (destrutivos).
  - [ ] 3.4 Migrar a segunda leva (demais 12 scripts que leem env de Supabase — 19 total menos os 7
    da primeira leva; reconferir a lista no dia). Se o tempo apertar, esta subtask pode virar
    story derivada nomeada — não cortar preventivamente aqui (nota do `@po`, §1.5 do parecer).
  - [ ] 3.5 Escrever `scripts/db-env.test.ts` com o controle negativo (ref fictício recusado) e o
    controle positivo **corrigido** (chamada direta a `resolverAmbiente()`, sem script destrutivo).

- [ ] **Task 4 — `supabase/config.toml` (AC4)**
  - [ ] 4.1 Criar o arquivo com `project_id` de teste + comentário das 3 razões contra `db push`.
  - [ ] 4.2 Confirmar por `supabase status` que resolve para teste sem flag.

- [ ] **Task 5 — Endurecer o reset, itens 1-3 e 5 (AC5, depende da Task 3)**
  - [ ] 5.1 Trocar `REFS_PROIBIDOS` por importação de `scripts/lib/db-env.ts`.
  - [ ] 5.2 Implementar dry-run por padrão + `--confirmar`.
  - [ ] 5.3 Implementar a confirmação informativa (ref, contagem de orgs/leads, `max(created_at)`).
  - [ ] 5.4 Implementar medição de duração por arquivo → `docs/audits/reset-testdb-duracao.json`,
    **gitignored por default** (S6/S13); só rastrear com decisão explícita registrada no Dev Agent
    Record, com o diff medido.
  - [ ] 5.5 Encadear `pnpm gate:tenancy:snapshot` ao fim do reset e comparar o SHA-256 de
    `docs/audits/schema-snapshot.json` entre duas execuções consecutivas (S11 — mecanismo nomeado,
    não `createHash` novo).
  - [ ] 5.6 Registrar `"reset:testdb"` em `package.json` (raiz).

- [ ] **Task 6 — `FALHAS_CONHECIDAS` estruturada + medição real de `236`/`237` (AC6, depende da Task 5)**
  - [ ] 6.1 Reestruturar `FALHAS_CONHECIDAS` para `{ motivo, classe, desde, revisar_em }`.
  - [ ] 6.2 Implementar verificação nos dois sentidos + teto de 6 entradas.
  - [ ] 6.3 Implementar `ASSERÇÕES` com os dois predicados corrigidos e ancorados por `id` (SQL
    literal da AC6).
  - [ ] 6.4 **Rodar `pnpm reset:testdb --confirmar` uma vez** (isto também traz o banco de teste ao
    `HEAD` atual, cumprindo a nota operacional da Task 2.6), ler o resultado real de `236`/`237`, e
    só então decidir se entram no `FALHAS_CONHECIDAS`. Se alguma das duas vier vermelha, checar
    primeiro se `011_noshow_stage.sql` aplicou com sucesso antes de concluir que `236`/`237` são o
    problema (S10 — vermelho aqui pode ser efeito upstream, não defeito da asserção). Colar a saída
    bruta no Dev Agent Record — evidência obrigatória, não opcional.

- [ ] **Task 7 — `reference_ci_surface_trifold.md` (AC7)**
  - [ ] 7.1 Reescrever a manchete, preservar as duas lições do corpo.
  - [ ] 7.2 Confirmar por `grep` que o corpo sobrevive.

---

## Handoff

O "Deferido da Onda 1" completo (Playwright/`TRIFOLD_ENV`, `check-deploy-drift.sh`, itens 4-5 da
mitigação do reset, `TENANCY_TEST_SUPABASE_ANON_KEY`) está registrado na **`900-3c`** (Fatia B),
que fecha o critério de saída da Onda 1 junto com esta fatia — para não duplicar a lista em dois
documentos.

**Corte adicional possível, nomeado e não executado (§1.5 do parecer do `@po`):** se a Task 3.4
(segunda leva de scripts) fizer esta fatia estourar o prazo, ela pode virar uma terceira story —
o critério de saída de segurança desta fatia está inteiro na primeira leva (os 7 destrutivos).

---

## Dev Notes

*(Trecho reaproveitado da v0.1 original, com os fatos ainda válidos para esta fatia — ver Dev Notes
da `900-3c` para os fatos específicos de migration/ledger/CI.)*

### `.gitignore` — estado exato (antes desta story)
Raiz: linha 2 `.env`, linha 3 `.env.*`, linha 4 `!.env.example`, ..., linha 53 `.env*` (a que
anula a negação). `packages/web/.gitignore`: linha 34 `.env*`. `git ls-files | grep env` confirma
que só `.env.example` (raiz) está rastreado hoje — sobrevive por já estar commitado antes da linha
53 existir.

### Turborepo em modo strict
`turbo.json` (raiz) declara só `globalEnv: ["SUPABASE_URL", "SUPABASE_ANON_KEY",
"SUPABASE_SERVICE_ROLE_KEY"]`, sem `envMode` — modo `strict` por padrão no Turborepo 2.x. Isso
**não afeta** arquivos dotenv (o Next os lê do disco, não via herança do Turbo); afeta
`VAR=x pnpm dev` (descartado) — por isso `dev:prod`/`build:teste` usam `node --env-file`, que
grava direto em `process.env` do processo Next.

### `packages/web/package.json` / `package.json` (raiz) — scripts atuais
`packages/web`: `dev`, `build`, `start`, `lint`, `type-check`, `test:e2e`, `test:e2e:ui` — sem
`dev:prod`/`build:teste` ainda (adições puras). Raiz: `dev` (`turbo dev`), `build`, `lint`,
`deploy:check`/`deploy:fix` (`check-deploy-drift.sh`), `type-check`, `seed`, `prompts:check`/
`prompts:write`, `gate:tenancy`, `gate:tenancy:snapshot`, `test`, `test:watch` — sem
`reset:testdb` ainda.

### `packages/web/src/instrumentation.ts` — conteúdo atual (será estendido)
```ts
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "America/Sao_Paulo"
  }
}
```
Já roda no boot (Story 75-33). `packages/web/src/lib/env.ts` (`env.NEXT_PUBLIC_SUPABASE_URL`)
**lança** se a var faltar — não reusar esse getter no banner, que precisa funcionar com env
ausente/malformada. Ler `process.env.NEXT_PUBLIC_SUPABASE_URL` direto dentro de
`avaliarRefDoAmbiente`, retornando **`"ausente"`** (não `"ok"`) quando a var estiver ausente, vazia,
ou o ref não puder ser extraído da URL — D1 (Rodada 2): um tipo de dois estados deixaria a
implementação natural tratar "ausente" como "ok" (não é o ref de produção), calando o próprio caso
que a decisão do C1 criou (`pnpm build` sem nenhuma env de Supabase).

### `packages/web/src/lib/supabase/client.ts` — achado do `@po` (C1), relevante para a decisão de build
```ts
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```
Non-null assertion, não o getter de `lib/env.ts` que lançaria — por isso um `pnpm build` sem
nenhuma env de Supabase **passa** (não falha) e assa `undefined` no bundle. É por isso que a
verificação da AC2 usa o controle negativo (`grep` não encontra o ref de produção), não um
controle positivo ingênuo que soubesse ser impossível.

### `scripts/reset-tenancy-testdb.ts` — internals confirmados por leitura direta (317 linhas)
`REFS_PROIBIDOS = new Set(["dsopqkqjkmhytudaaolv"])` (linha 59) — a denylist a inverter (AC3/AC5).
`runSql`/`splitStatements` (linhas 126/142) **permanecem dentro deste arquivo nesta fatia** — a
extração para `scripts/lib/management-api.ts` é trabalho da `900-3c` (junto com `db:status`/
`db:apply`). `delete from supabase_migrations.schema_migrations;` (linha ~231) também permanece
inalterado nesta fatia. `FALHAS_CONHECIDAS` (linha 62) é hoje `Map<string, string>` com 4
entradas — ver AC6.

### `scripts/README.md` — conteúdo atual relevante
Contém hoje *"O estado padrão do repositório é `.env.local` apontando para PRODUÇÃO"* — precisa
virar o oposto no mesmo escopo da Task 2. Já documenta as duas armadilhas de método do reset
(transação única da Management API; `DROP SCHEMA CASCADE` não limpa policies de
`storage.objects`) — não duplicar.

### Scripts que leem env de Supabase diretamente — medido em 2026-08-29
19 arquivos (`grep -rl "process.env.SUPABASE\|process.env.NEXT_PUBLIC_SUPABASE" scripts/*.ts`):
`add-kb-entry.ts`, `backfill-campaign-entries.ts`, `backfill-criar-obras.ts`,
`backfill-google-calendar.ts`, `backfill-meta-ad-insights.ts`, `backfill-vind-portal-invites.ts`,
`backfill-yarden-portal-invites.ts`, `cleanup-duplicate-leads.ts`, `dump-agent-prompts.ts`,
`gate-tenancy.ts`, `generate-known-tables.ts`, `generate-schema-snapshot.ts`,
`meta-backfill-leads.ts`, `run-seed.ts`, `seed-followup-rules.ts`, `seed-knowledge-base.ts`,
`seed-prompts.ts`, `seed-properties.ts`, `seed-users.ts`. Nomes de variável não são uniformes
(`backfill-criar-obras.ts` lê `SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL`;
`backfill-yarden-portal-invites.ts` lê só `NEXT_PUBLIC_SUPABASE_URL`).

### Testing Standards
`vitest.config.ts` já inclui `scripts/**/*.test.ts` e `packages/web/src/**/*.test.ts` — os testes
novos desta fatia (`gitignore-env.test.ts`, `db-env.test.ts`, `env-banner.test.ts`) rodam
automaticamente em `pnpm test`, sem configuração adicional. O restante (renames, banner em
runtime, reset) é validado por execução real com evidência colada no Dev Agent Record, mesmo
padrão da Story 900-3.

---

## Testing

### Abordagem
Mista: 3 suítes Vitest novas (`gitignore-env.test.ts`, `db-env.test.ts`, `env-banner.test.ts`) —
todas testam lógica pura ou invocam o instrumento real, nunca reimplementam uma regra externa.
O resto é infraestrutura validada por execução real.

### Cenários de teste (resumo — detalhe completo em cada AC)
1. `.gitignore`: 4 casos via `execFileSync("git", ["check-ignore", ...])`, 2 positivos + 2
   controles negativos.
2. Banner: função pura testada em unidade (3+ casos) + `pnpm dev`/`pnpm dev:prod` como integração;
   `pnpm build` (negativo) e `pnpm build:teste` (positivo) para o bundle.
3. `db-env.ts`: ref fictício recusado (negativo); `resolverAmbiente()` chamada direta com flag
   (positivo, sem script destrutivo).
4. `config.toml`: `supabase status` resolve para teste sem flag.
5. Reset: dry-run não apaga nada; `--confirmar` reconstrói e `pnpm gate:tenancy:snapshot` +
   `sha256sum` de `docs/audits/schema-snapshot.json` produz hash idêntico em 2 execuções (S11).
6. `FALHAS_CONHECIDAS`: teto de 6; verificação nos dois sentidos; predicados ancorados por `id`
   para `236`/`237`, resultado real colado no Dev Agent Record.
7. `reference_ci_surface_trifold.md`: grep confirma corpo preservado.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Rename de `packages/web/.env.local` quebra `pnpm dev` de outro desenvolvedor na mesma máquina, invisível ao git | Alta (efeito certo) | AC2 documenta o comando de reversão; banner torna o sintoma visível |
| R2 | Allowlist de `db-env.ts` tem bug e libera um ref de produção não previsto | Alta se ocorrer, baixa probabilidade | Controle negativo obrigatório em `db-env.test.ts`; revisão do @architect |
| R3 | `236`/`237` pré-adicionadas ao `FALHAS_CONHECIDAS` sem medição real, por pressa de fechar a story | Média (é o modo de falha que a AC6 nomeia) | AC6 exige saída bruta colada no Dev Agent Record como evidência |
| R4 | Entre esta fatia e a `900-3c`, alguém tenta usar `pnpm db:apply` (que não existe ainda) e fica bloqueado sem saber por quê | Baixa | `scripts/README.md` (Task 2.6) documenta a alternativa (`reset-tenancy-testdb.ts`) explicitamente |
| R5 | `pnpm build:teste` bakear valores de teste no bundle se alguém rodar `next start` a partir dele por engano | Baixa | Nome do script (`build:teste`) é explícito; `.next/` já é gitignored/efêmero, não versionado nem deployado |

---

## Dependencies

- **Depende de:** `900-3` (harness do Supabase descartável — ambiente `trifold-crm-dev` já
  recuperado, secrets `TENANCY_TEST_*` já gravados, `reset-tenancy-testdb.ts` já existente que esta
  story estende).
- **Não depende de** `900-3c` nem do merge do PR #522 — esta fatia não cria migration, pode
  avançar em paralelo.
- **É dependência de:** `900-3c` (AC3 dela — popular o ledger — reusa o reset endurecido por esta
  fatia; AC2 dela extrai `runSql`/`splitStatements` do mesmo `reset-tenancy-testdb.ts` que esta
  fatia edita primeiro).

---

## Definition of Done

- [ ] AC1-AC7 cumpridos, com evidência de comando colada no Dev Agent Record
- [ ] `pnpm test` verde, incluindo as 3 suítes novas
- [ ] `pnpm dev` aponta para teste por padrão; `pnpm dev:prod` funciona com banner vermelho;
  `pnpm build` não vaza nenhum ref; `pnpm build:teste` vaza o ref de teste (esperado)
- [ ] `pnpm reset:testdb --confirmar` + `pnpm gate:tenancy:snapshot` produz o mesmo SHA-256 de `docs/audits/schema-snapshot.json` em duas execuções consecutivas (mecanismo nomeado — S11)
- [ ] `FALHAS_CONHECIDAS` reestruturada; veredito sobre `236`/`237` baseado em execução real
- [ ] `scripts/README.md`, `.claude/CLAUDE.md` (385-387), `reference_ci_surface_trifold.md`
  corrigidos
- [ ] Nenhum valor de segredo em arquivo versionado (grep final de padrões de chave)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS aceitos
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration`
> ausente). Validação de qualidade usará processo de revisão manual pelo @architect, mesmo padrão
> das stories `900-3` e `900-14b`.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-29 | 0.1 | Story original criada a partir do plano de 3 ondas aprovado, cobrindo os Passos 0-9 inteiros. | @sm (River) |
| 2026-08-29 | 0.2 | Correção de número de migration (`244`→`245`), pega no draft (colisão com PR #522). | @sm (River) |
| 2026-08-29 | 1.0 | **Reescrita como Fatia A de um split em duas**, após validação `@po` NO-GO 6/10 (`docs/qa/po-validation-900-3b.md`). Aplicadas as correções C1 (decisão de build local + controle negativo), C2 (controle positivo sem script destrutivo), C3 (predicados de `236`/`237` ancorados por `id`, premissa de no-op removida), C7 (teste automatizado do `.gitignore`), S1 (régua de conteúdo para `CLAUDE.md`, três linhas), S3 (negação no `.gitignore` correto), S4 (banner decomposto em função pura testável), S7 (`.bak` da mesclagem). Migration, ledger, `db:status`/`db:apply`, job de CI e reescrita de `deploy-flow.md` movidos para `900-3c` (Fatia B), conforme fronteira "quem escreve DDL em produção" definida pelo `@po` (§1.3 do parecer) e autorizada pelo dono do produto. | @sm (River) |
| 2026-08-29 | 1.1 | **Revalidação `@po` (Rodada 2): GO condicional 8/10 → GO.** Aplicada a emenda **D1** (bloqueante): `avaliarRefDoAmbiente` ganha terceiro estado `"ausente"` — sem ele, a decisão do C1 trocava "assa produção em silêncio" por "assa `undefined` em silêncio", e o banner ficava cego para o próprio estado que a decisão criou. Aplicadas as recomendações **S8** (teste do `.gitignore` afirma `status === 1` explícito, não "lançou"; os dois controles negativos documentados como guarda de vivacidade do instrumento contra o `128` de erro fatal do `git`), **S9** (declarada a precedência `process.env` > dotenv em `resolverAmbiente()`, e que `db-env.test.ts` injeta por `process.env`, nunca depende de `.env.teste`/`.env.producao` — ausentes no runner de CI), **S10** (predicado vermelho de `236` por ausência de `…0009`, se `011` falhar por FK, é informação para a Task 6.4, não defeito automático), **S11** (mecanismo do SHA-256 de idempotência nomeado — `pnpm gate:tenancy:snapshot` + hash de `docs/audits/schema-snapshot.json`, já que não existe `createHash` em `scripts/`), **S12** (`grep -rc` trocado por `grep -rl` na verificação do bundle — `grep -rc` não imprime número solo com múltiplos arquivos), **S6/S13** (default nomeado para `docs/audits/reset-testdb-duracao.json`: gitignored, rastrear exige decisão registrada). Status avança para `Ready`. | @sm (River) |

---

## Dev Agent Record

### Agent Model Used
_A preencher._

### Debug Log References
_A preencher._

### Completion Notes List
_A preencher — em especial a saída bruta da Task 6.4 (medição real de `236`/`237`)._

### File List
_A preencher._

---

## QA Results

_A preencher pelo @qa após revisão._

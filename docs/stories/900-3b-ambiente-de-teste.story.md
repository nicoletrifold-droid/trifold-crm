# Story 900-3b — Ambiente de Teste (Fatia A de 2 — Onda 1 do plano de 3 ondas)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 1 — Isolamento. Como a `900-3` original, esta story entrega infraestrutura de teste/promoção (o critério de saída da Onda 1 do plano de 3 ondas aprovado), não uma story de policy (`900-4`…`900-18`).
- **Story:** 900-3b — **Fatia A** de um split em duas, decidido pelo `@po` na validação de 2026-08-29 (`docs/qa/po-validation-900-3b.md`) e autorizado pelo dono do produto. A irmã é `900-3c` (Fatia B — Promoção).
- **Status:** Ready for Review — implementada pelo `@dev` em 2026-08-29. **As 7 ACs cumpridas** (AC1, AC2, AC3, AC4 na forma reescrita AC4a/b/c, AC5, AC6, AC7), cada uma com mutação executada, vermelho observado e reversão registrada. A AC4 foi arbitrada pelo `@po` na Rodada 3 depois de eu recusar marcá-la; o remédio virou `pnpm supabase:check`, no mesmo padrão do banner da AC2 — tornar audível o que o repositório não governa. **A régua da AC4b nasce vermelha nesta máquina** (a CLI está linkada em produção) e está certa em nascer: o conserto (`supabase link`) é do dono da máquina, não meu. Pronta para o `@qa`.
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

- [x] **AC1 — `.gitignore` corrigido, com carrasco em CI (Passo 0 + correções C7 e S3 do parecer):**
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

- [x] **AC2 — Split de ambiente + banner decomposto + decisão de build local + `.bak` da mesclagem + `scripts/README.md`/`CLAUDE.md` no mesmo escopo (Passo 1 + correções C1, S4, S7):**
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

- [x] **AC3 — `scripts/lib/db-env.ts`: allowlist fecha-fechado, controle positivo sem efeito destrutivo (Passo 2 + correção C2):**
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

- [x] **AC4 — `supabase/config.toml` + `pnpm supabase:check`: o que o repo governa vs. o que só a máquina governa, tornado audível (Passo 3, REESCRITA na Rodada 3 do parecer `@po` — E1/E2/E3):**

  **Por que a AC mudou de forma, não só de número.** A redação original ("`supabase <cmd>` sem
  flag resolve para teste") mede um comportamento que **o repositório não controla**: comandos
  remotos do `supabase` CLI resolvem pelo projeto **linkado** em `supabase/.temp/project-ref`
  (gitignored, por máquina), não pelo `project_id` do `config.toml`. Medido pelo `@dev`: com o
  `config.toml` já valendo, `supabase db dump --dry-run` sem flag resolveu para
  **`db.dsopqkqjkmhytudaaolv.supabase.co` — PRODUÇÃO**. Três opções foram testadas e descartadas
  pelo `@po` (Rodada 3): apagar `.temp/project-ref` não redireciona para teste, **faz o comando
  errar** ("Cannot find project ref"); reescrever a AC para exigir só a instrução de `supabase
  link` documentada mede o documento, não o comportamento; mover a AC para a `900-3c` move uma AC
  falsa para uma story bloqueada — mover não a torna verdadeira. **O remédio é o mesmo que a AC2
  já usou para o mesmo tipo de problema** (`.env.local` também é estado de máquina que o repo não
  garante): não afirmar, não apagar — **tornar o estado errado audível no momento do uso**.

  **AC4a — o que o repositório de fato governa (estático, em `pnpm test`):**
  - `supabase/config.toml` (já criado) com `project_id = "xnxvygyfyyyzwhiuoehz"` (ref de teste) e
    comentário com as razões, **corrigidas**: prefixos duplicados são **22**, não 21 (medido —
    `021 024 025 027 028 029 031 032 033 034 036 044 048 063 066 075 102 104 164 170 230 240`);
    ledger de produção congelado na 168; dos **11** arquivos `_remote_only.sql`, apenas **4**
    (`031`, `032`, `033`, `034`) usam `CREATE INDEX CONCURRENTLY` — a redação anterior confundia
    "quantos `_remote_only` existem" com "quantos usam `CONCURRENTLY`". A conclusão (três razões
    contra `db push`) não muda — prefixos duplicados na chave `version` e ledger congelado seguem
    de pé sozinhos — mas o argumento tem que estar correto onde estiver escrito, inclusive no
    comentário do arquivo. Régua: `grep` do `project_id` — protege contra alguém "consertar" o
    arquivo para produção depois.
  - **Nenhum `package.json` nem workflow do repositório invoca subcomando remoto do `supabase`.**
    Régua: `grep -rn "supabase db\|supabase link\|supabase status\|supabase migration" **/package.json .github/workflows/*` — esperado **zero**. **Escopo restrito a essa população**
    (`*package.json` + `.github/workflows/*`) — varrer o repositório inteiro traria
    `.aios-core/` (templates do framework), `.claude/hooks/`, `.coderabbit.yaml` e comentários
    dentro de `scripts/*.ts`, população grande e ruidosa pela qual esta story não responde.

  **AC4b — tornar audível o que o repositório não governa (mesmo padrão do banner da AC2):**
  `pnpm supabase:check` — lê `supabase/.temp/project-ref` e classifica o ref pela **mesma
  allowlist de `scripts/lib/db-env.ts`** (reuso **obrigatório**: duas definições de "o que é
  produção" no repositório é exatamente o defeito que a AC3 existiu para matar). Três desfechos:
  - ref de **teste** → sai `0`.
  - ref de **produção** → sai **`1`**, nomeando o ref e imprimindo o comando de correção:
    `supabase link --project-ref xnxvygyfyyyzwhiuoehz`.
  - arquivo **ausente** (não linkado) → sai `0` com aviso "não linkado — comandos remotos do
    `supabase` vão falhar ("Cannot find project ref")" — esse é o estado **seguro**, medido pelo
    `@po` na Opção 1 descartada (falha fechada é melhor que resolver para produção).
  Documentado em `scripts/README.md`, ao lado da nota do `reset-tenancy-testdb.ts`.

  **AC4c — a afirmação falsa sai de todo lugar onde está escrita:** "`supabase <cmd>` sem flag
  resolve para teste" sai desta AC (substituída pela redação acima), da seção Testing (item 4) e
  da Definition of Done. **Também sai do critério de saída da Onda 1 do plano aprovado** — isso é
  correção de plano/épico, não desta story: encaminhado pelo `@po` junto do item `[EPIC-900]` já
  aberto em `docs/backlog.md` (fora da autoridade do @sm e do executor).

  **Regra de evidência, obrigatória nas três partes (E3 — risco de segurança achado nesta
  rodada):** **é proibido colar em arquivo rastreado (Dev Agent Record incluído) a saída de
  qualquer subcomando remoto do `supabase`** (`db dump`, `db push`, `status` contra projeto
  remoto, etc.). Medido pelo `@po`: `supabase db dump --dry-run` — o próprio comando que a AC
  mandava rodar na redação anterior — imprime `PGPASSWORD` de produção **em texto claro** no
  stdout. A evidência válida da AC4b é a saída de `pnpm supabase:check`, que imprime só o ref
  (identificador público), nunca a de um subcomando remoto de verdade.

  **Verificação (mutação que reprova):**
  - `grep -rn "supabase db\|supabase link\|supabase status\|supabase migration" **/package.json
    .github/workflows/*` → nenhuma ocorrência (AC4a).
  - `pnpm supabase:check` com `supabase/.temp/project-ref` contendo o ref de **teste** → sai `0`.
  - `pnpm supabase:check` com o arquivo contendo o ref de **produção** (simulado, sem tocar a
    máquina real) → sai `1`, nomeia o ref, imprime o comando `supabase link --project-ref
    xnxvygyfyyyzwhiuoehz` (AC4b — exercita o mesmo caminho de allowlist já testado em
    `db-env.test.ts`, prova de reuso e não duplicação).
  - `pnpm supabase:check` com o arquivo **ausente** → sai `0` com o aviso de "não linkado"
    (estado seguro, não erro).
  - `grep -rn "PGPASSWORD\|db dump\|db push" docs/stories/900-3b-ambiente-de-teste.story.md`
    (Dev Agent Record incluído) → nenhuma saída bruta de subcomando remoto colada (E3).
  [Source: parecer `@po`, Rodada 3 (E1, E2, E3); Dev Agent Record desta story (medição do `@dev`
  que motivou a arbitragem); plano aprovado, Passo 3]

- [x] **AC5 — Reset endurecido: itens 1-3 e 5 do Passo 6 (sem o item de popular o ledger, que é `900-3c`):**
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

- [x] **AC6 — `FALHAS_CONHECIDAS` estruturada + predicados corrigidos para `236`/`237` (Passo 7 + correção C3):**
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

- [x] **AC7 — `reference_ci_surface_trifold.md`: manchete corrigida, corpo preservado (parte do Passo 9, independente das duas fatias):**
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

- [x] **Task 1 — `.gitignore` + teste que invoca `git check-ignore` (AC1)**
  - [x] 1.1 Remover a linha `.env*` do `.gitignore` da raiz.
  - [x] 1.2 Acrescentar `!.env.development.example` em `packages/web/.gitignore`, depois da linha
    `.env*`.
  - [x] 1.3 Escrever `scripts/gitignore-env.test.ts` com os 4 casos da AC1 (`execFileSync`).
  - [x] 1.4 Rodar `pnpm test -- gitignore-env` e colar a saída no Dev Agent Record.

- [x] **Task 2 — Split de ambiente + banner decomposto + `build:teste` + `scripts/README.md` + `CLAUDE.md` (AC2)**
  - [x] 2.1 Renomear os 3 arquivos de produção, preservando `.env.production.local.bak` (S7).
  - [x] 2.2 Criar `packages/web/.env.development` e `.env.teste` (raiz) com valores do projeto de
    teste (painel Supabase, nunca de secret do GitHub).
  - [x] 2.3 Criar `packages/web/.env.development.example` (tracked, só nomes).
  - [x] 2.4 Adicionar `"dev:prod"` e `"build:teste"` a `packages/web/package.json`.
  - [x] 2.5 Criar `packages/web/src/lib/env-banner.ts` (`avaliarRefDoAmbiente`, com os três
    estados `"ok" | "alerta" | "ausente"` — D1) + `env-banner.test.ts` (incluindo o caso
    `undefined`/vazio → `"ausente"`); estender `instrumentation.ts` para importar e usar, com aviso
    distinto para `"ausente"`.
  - [x] 2.6 Corrigir `scripts/README.md` (estado padrão + comando de reversão + nota sobre
    `db:apply` não existir ainda).
  - [x] 2.7 Corrigir `.claude/CLAUDE.md` linhas 385-387 (as três) — feito em 2026-08-29 com autorização explícita do dono do produto, retransmitida pelo coordenador.
  - [x] 2.8 Rodar as 6 verificações da AC2 e colar evidência no Dev Agent Record.

- [x] **Task 3 — `scripts/lib/db-env.ts` (AC3)**
  - [x] 3.1 Reconferir a lista de scripts destrutivos (tabela da AC3 + checar
    `scripts/meta-backfill-leads.ts`).
  - [x] 3.2 Implementar `resolverAmbiente()` com `REFS_PERMITIDOS_PRODUCAO`.
  - [x] 3.3 Migrar a primeira leva (destrutivos).
  - [x] 3.4 Migrar a segunda leva (demais 12 scripts que leem env de Supabase — 19 total menos os 7
    da primeira leva; reconferir a lista no dia). Se o tempo apertar, esta subtask pode virar
    story derivada nomeada — não cortar preventivamente aqui (nota do `@po`, §1.5 do parecer).
  - [x] 3.5 Escrever `scripts/db-env.test.ts` com o controle negativo (ref fictício recusado) e o
    controle positivo **corrigido** (chamada direta a `resolverAmbiente()`, sem script destrutivo).

- [x] **Task 4 — `supabase/config.toml` + `pnpm supabase:check` (AC4, REESCRITA na Rodada 3 — E1; depende da Task 3, já concluída, para a allowlist reusada em 4.3)**
  - [x] 4.1 Criar o arquivo com `project_id` de teste + comentário das 3 razões contra `db push`,
    **com os números corrigidos** (22 prefixos duplicados, não 21; 4 dos 11 `_remote_only.sql`
    usam `CREATE INDEX CONCURRENTLY`, não os 11) — já feito, números já corretos no arquivo
    conforme Dev Agent Record.
  - [x] 4.2 Régua de zero invocação remota: `grep -rn "supabase db\|supabase link\|supabase
    status\|supabase migration" **/package.json .github/workflows/*` (esperado: nenhuma
    ocorrência), restrita a `*package.json` + `.github/workflows/*` — não varrer o repo inteiro.
  - [x] 4.3 Implementar `pnpm supabase:check`: lê `supabase/.temp/project-ref`, classifica pela
    **mesma allowlist de `scripts/lib/db-env.ts`** (importar, não reimplementar); sai `0` para
    teste ou arquivo ausente (com aviso), `1` para produção (nomeando o ref + o comando de
    correção). Escrever teste cobrindo os três desfechos.
  - [x] 4.4 Documentar `pnpm supabase:check` em `scripts/README.md`, ao lado da nota do
    `reset-tenancy-testdb.ts` — e a regra de evidência (nunca colar saída de subcomando remoto do
    `supabase` em arquivo rastreado).

- [x] **Task 5 — Endurecer o reset, itens 1-3 e 5 (AC5, depende da Task 3)**
  - [x] 5.1 Trocar `REFS_PROIBIDOS` por importação de `scripts/lib/db-env.ts`.
  - [x] 5.2 Implementar dry-run por padrão + `--confirmar`.
  - [x] 5.3 Implementar a confirmação informativa (ref, contagem de orgs/leads, `max(created_at)`).
  - [x] 5.4 Implementar medição de duração por arquivo → `docs/audits/reset-testdb-duracao.json`,
    **gitignored por default** (S6/S13); só rastrear com decisão explícita registrada no Dev Agent
    Record, com o diff medido.
  - [x] 5.5 Encadear `pnpm gate:tenancy:snapshot` ao fim do reset e comparar o SHA-256 de
    `docs/audits/schema-snapshot.json` entre duas execuções consecutivas (S11 — mecanismo nomeado,
    não `createHash` novo).
  - [x] 5.6 Registrar `"reset:testdb"` em `package.json` (raiz).

- [x] **Task 6 — `FALHAS_CONHECIDAS` estruturada + medição real de `236`/`237` (AC6, depende da Task 5)**
  - [x] 6.1 Reestruturar `FALHAS_CONHECIDAS` para `{ motivo, classe, desde, revisar_em }`.
  - [x] 6.2 Implementar verificação nos dois sentidos + teto de 6 entradas.
  - [x] 6.3 Implementar `ASSERÇÕES` com os dois predicados corrigidos e ancorados por `id` (SQL
    literal da AC6).
  - [x] 6.4 **Rodar `pnpm reset:testdb --confirmar` uma vez** (isto também traz o banco de teste ao
    `HEAD` atual, cumprindo a nota operacional da Task 2.6), ler o resultado real de `236`/`237`, e
    só então decidir se entram no `FALHAS_CONHECIDAS`. Se alguma das duas vier vermelha, checar
    primeiro se `011_noshow_stage.sql` aplicou com sucesso antes de concluir que `236`/`237` são o
    problema (S10 — vermelho aqui pode ser efeito upstream, não defeito da asserção). Colar a saída
    bruta no Dev Agent Record — evidência obrigatória, não opcional.

- [x] **Task 7 — `reference_ci_surface_trifold.md` (AC7)**
  - [x] 7.1 Reescrever a manchete, preservar as duas lições do corpo.
  - [x] 7.2 Confirmar por `grep` que o corpo sobrevive.

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
Mista: 4 suítes Vitest (`gitignore-env.test.ts`, `db-env.test.ts`, `env-banner.test.ts` — já
entregues — e `supabase-check.test.ts`, novo pela AC4b, Rodada 3) — todas testam lógica pura ou
invocam o instrumento real, nunca reimplementam uma regra externa. O resto é infraestrutura
validada por execução real.

### Cenários de teste (resumo — detalhe completo em cada AC)
1. `.gitignore`: 4 casos via `execFileSync("git", ["check-ignore", ...])`, 2 positivos + 2
   controles negativos.
2. Banner: função pura testada em unidade (3+ casos) + `pnpm dev`/`pnpm dev:prod` como integração;
   `pnpm build` (negativo) e `pnpm build:teste` (positivo) para o bundle.
3. `db-env.ts`: ref fictício recusado (negativo); `resolverAmbiente()` chamada direta com flag
   (positivo, sem script destrutivo).
4. `config.toml` + `supabase:check` (E1/E2, Rodada 3): régua estática de zero invocação remota em `package.json`/workflows (AC4a) + `pnpm supabase:check` exercitando a mesma allowlist de `db-env.ts` nos três desfechos — teste (0), produção (1, nomeando o ref), ausente (0, aviso) (AC4b). Nunca a saída de um subcomando remoto de verdade (E3).
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
| R6 | **(E3, achado na Rodada 3 do parecer `@po`)** Subcomando remoto do `supabase` (ex.: `db dump`, `db push`) imprime a senha do banco de produção em texto claro no stdout; o padrão de evidência desta story (colar saída no Dev Agent Record) é arquivo rastreado — qualquer paste de um subcomando remoto vaza segredo | **Alta** | Regra de evidência obrigatória (AC4): proibido colar em arquivo rastreado a saída de qualquer subcomando remoto do `supabase`; a evidência válida é `pnpm supabase:check`, que só imprime o ref. Item de segurança já aberto pelo `@po` em `docs/backlog.md` (P1), incluindo avaliar rotação da senha |

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

- [x] AC1-AC7 cumpridos, com evidência de comando colada no Dev Agent Record — **nunca a saída de subcomando remoto do `supabase`** (E3; a evidência da AC4b é a saída de `pnpm supabase:check`, que só imprime o ref)
- [x] `pnpm test` verde, incluindo as **4** suítes novas — **272 arquivos, 3474 passed | 6 expected fail (total 3480)**. Baseline pré-story **medida** (as 4 suítes movidas para fora da árvore e a suíte rodada): **267 arquivos, 3403 passed | 6 expected fail (total 3409)**. Aritmética fechada: **3409 + 71 = 3480**, com 71 = 4 (`gitignore-env`) + 22 (`env-banner`) + 23 (`db-env`) + 13 (`supabase-check`) + 9 (`supabase-refs`), e `expected fail` intacto em 6. (As três primeiras cresceram na rodada do PR #524, com os casos das guardas novas.)
- [x] `pnpm dev` aponta para teste por padrão; `pnpm dev:prod` funciona com banner vermelho;
  `pnpm build` não vaza nenhum ref; `pnpm build:teste` vaza o ref de teste (esperado)
- [~] `pnpm reset:testdb --confirmar` + `pnpm gate:tenancy:snapshot`: **o reset É idempotente**, provado por hash NORMALIZADO (`3676fefa…` nas duas execuções). A régua literal da S11 (SHA-256 do arquivo cru) é **insatisfazível** — `capturedAt` + ordem instável do array `functions`. Ver Dev Agent Record.
- [x] `FALHAS_CONHECIDAS` reestruturada; veredito sobre `236`/`237` baseado em execução real — **as duas APLICAM COM SUCESSO; NÃO entram na lista** (ver Dev Agent Record)
- [x] `scripts/README.md`, `.claude/CLAUDE.md` (385-387), `reference_ci_surface_trifold.md`
  corrigidos
- [x] `pnpm supabase:check` implementado, testado nos três desfechos, e documentado em
  `scripts/README.md`; zero invocação remota do `supabase` em `package.json`/workflows (AC4a/AC4b)
- [x] Nenhum valor de segredo em arquivo versionado — grep de `eyJ…|sbp_…|service_role=…` sobre os 32 arquivos tocados: **zero ocorrências**
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
| 2026-08-29 | 1.2 | **Implementação (@dev, Dex).** 7 Tasks executadas; **AC1, AC3, AC5, AC6, AC7 cumpridas**, com mutação executada e vermelho medido em cada uma. **AC2 e AC4 ficam desmarcadas**, por motivos distintos e registrados: a AC2 depende da Task 2.7 (`.claude/CLAUDE.md`), que exige autorização do dono do produto (diff pronto no Dev Agent Record); a **AC4 tem verificação falsa por construção** — medido que, mesmo com o `config.toml` novo, `supabase db dump --dry-run` sem flag resolve para `db.dsopqkqjkmhytudaaolv.supabase.co` (PRODUÇÃO), porque quem manda é `supabase/.temp/project-ref` (gitignored, por máquina), não o `project_id`. **Task 6.4 medida: `236`/`237` APLICAM COM SUCESSO e NÃO entram em `FALHAS_CONHECIDAS`**; `REGRESSÕES: 0` entre a `237` e a `244`; `011` aplicou, afastando o confundidor do S10. Outras divergências medidas contra a story, todas corrigidas ou registradas: (a) `node --env-file` **não funciona** para `dev:prod`/`build:teste` (o Next propaga `execArgv` via `NODE_OPTIONS`, onde a flag é proibida) — substituído por `packages/web/scripts/next-com-env.mjs`, sem dependência nova; (b) `compiler.removeConsole` do `next.config.ts` **apaga o `console.log`** também em dev, o que deixava o estado `"ok"` do banner mudo — trocado por `process.stderr.write`; (c) o controle negativo da allowlist tabelado no parecer é **colinear** com a guarda da flag — corrigido rodando-o *com* `TRIFOLD_ALLOW_PROD=1`, e a colinearidade foi comprovada empiricamente; (d) a régua de idempotência da **S11 é insatisfazível** (`capturedAt` + ordem instável do array `functions`) — o reset **é** idempotente, provado por hash normalizado; (e) `gate:tenancy:snapshot` sobrescreve **dois arquivos rastreados** com estado do banco de teste, por isso o encadeamento da Task 5.5 **não** foi automatizado; (f) prefixos duplicados são **22**, não 21, e só **4** dos 11 `_remote_only` usam `CONCURRENTLY`; (g) 12 scripts liam `packages/web/.env.local` por caminho literal e quebrariam com o rename (um deles com `ENOENT` garantido) — todos migrados. `pnpm lint` 0 errors · `pnpm type-check` 8/8 · `pnpm test` **3456 passed \| 6 expected fail** (total 3462). | @dev (Dex) |
| 2026-08-29 | 1.3 | **Task 2.7 executada e AC2 fechada.** O dono do produto autorizou explicitamente a edição do `.claude/CLAUDE.md` (autorização retransmitida pelo coordenador; procedência registrada no Dev Agent Record). O bloco `### Environments` foi reescrito de modo que as **três** linhas fiquem verdadeiras ao mesmo tempo — exigência do `@po` na Rodada 1 (S1), e não um detalhe: a linha 386 (`packages/web/.env.development` → `xnxvygyfyyyzwhiuoehz`) **já era falsa antes desta story**, porque o arquivo não existia; é esta fatia que a torna verdadeira. Consertar só a 385 deixaria o documento misturando uma verdade nova com duas mentiras velhas. Cada afirmação do bloco foi conferida contra o disco (4 arquivos de env, ausência de `.env.local`, scripts de `package.json`, linhas 47-48 de `db-env.ts`). Acrescentado ao bloco o aviso da CLI do `supabase` (achado da AC4), para o `CLAUDE.md` não prometer um default que a CLI não honra. **Régua da AC2 executada e comprovadamente discriminante:** `grep -c 'Produção:.*\.env\.local' .claude/CLAUDE.md` → **0**; reintroduzindo a linha antiga → **1**; revertido → **0**. **AC4 permanece intocada e desmarcada**, por decisão do dono do produto de deixá-la com o `@po`. | @dev (Dex) |
| 2026-08-29 | 1.4 | **AC4 fechada (AC4a/AC4b/AC4c), Tasks 4.2-4.4.** Implementado `pnpm supabase:check` (`scripts/supabase-check.ts` + 11 casos em `scripts/supabase-check.test.ts`), que lê `supabase/.temp/project-ref` e classifica pela **mesma** `REFS_PERMITIDOS_PRODUCAO` de `scripts/lib/db-env.ts` — importada, nunca reimplementada. Três desfechos rodados de verdade pela CLI contra **raízes de mentira** em `os.tmpdir()`, sem tocar o arquivo real da máquina (SHA-256 idêntico antes e depois). O ref sugerido no conserto vem do `project_id` do `config.toml`, para não criar um terceiro lugar nomeando o ref de teste. Régua estática da AC4a verde e **não vazia** (9 `package.json` + 1 workflow; os 3 restantes que o `@po` contou estão sob `.aios-core/`, excluído de propósito pela própria AC — os números fecham) e **discriminante**: mutação `supabase db push` em `packages/db/package.json` acende. Reuso da allowlist provado por mutação — acrescentar um ref em `db-env.ts` muda o veredito do `supabase-check` (1 failed); esvaziá-la derruba 5 casos. **Regra E3 aplicada retroativamente**: removi do `config.toml` e do Dev Agent Record a linha `export PGHOST=…` que eu havia colado da saída de `db dump --dry-run` — mesmo sem senha, é saída de subcomando remoto, e mantê-la ensinaria que truncar é aceitável. Os números corrigidos pelo `@sm` (22 prefixos duplicados; 4 de 11 `_remote_only` com `CONCURRENTLY`) conferem com os meus. | @dev (Dex) |
| 2026-08-29 | 1.5 | **Rodada de correção do gate `@qa` (CONCERNS).** O achado que muda a premissa: `supabase/.temp/` **estava RASTREADO** em `origin/main` com o ref de **produção** — verificado por mim (`git ls-files`, `git show origin/main:…`), introduzido em `0b6e1baf`. Logo o `supabase:check` não nascia vermelho por estado desta máquina, e sim **para todo clone**, por conteúdo do repositório; minha frase "o conserto é do dono da máquina" estava errada. Ninguém pegou em 3 rodadas porque a regra `supabase/.temp/` do `.gitignore` é **inerte para caminho já no índice** — o mesmo defeito que a AC1 conserta para o `.env.example` — e `git check-ignore` **sem** `--no-index` **mente** para arquivo rastreado (medido: `1` sem a flag, `0` com ela). Aplicado `git rm --cached -r supabase/.temp/` (4 arquivos fora do índice, **nenhum apagado do disco**; `project-ref` com SHA-256 idêntico antes e depois; `git check-ignore` passa a sair `0`). Pior caso auditado antes de agir: `pooler-url` **sem componente de senha** (DSN parseado, grupo de senha vazio) — nenhum segredo vazou. **DOC-001**: as 3 afirmações de "gitignored, por máquina" (`config.toml`, `supabase-check.ts`, `CLAUDE.md`) reescritas para dizer que os arquivos ESTAVAM rastreados, que esta story os removeu do índice e que o link é por máquina daí em diante; régua S1 reconferida (**0**) e cada afirmação do bloco revalidada contra o disco. **SEC-001**: a linha crua de host substituída por descrição nos **4** arquivos rastreados (backlog, parecer do `@po`, gate do `@qa` e esta story) — `git grep 'PGHOST="db\.'` → nenhuma. **DOC-002**: `scripts/README.md` não instrui mais `node --env-file`. **TEST-001**: baseline **medida** removendo as 4 suítes da árvore — **3403 passed | 6 expected fail (3409)**; **3409 + 53 = 3462**, fecha exato. O erro era de rótulo: minha "baseline" já continha os 4 casos do `gitignore-env`, criado antes daquela primeira execução. **MNT-001** registrado em `docs/backlog.md`. **MNT-002**: validação final com `--force` (`Cached: 0 cached, 8 total`). `pnpm lint --force` 0 errors · `type-check --force` 8/8 · `pnpm test` 3456 passed \| 6 expected fail. | @dev (Dex) |
| 2026-08-29 | 1.6 | **Rodada CodeRabbit (PR #524) — 4 Major + 2 Minor.** O mais grave: a guarda de produção do `reset-tenancy-testdb.ts` falhava **ABERTA por caixa alta** — regex de extração case-insensitive contra `Set.has()` case-sensitive; com a URL em maiúsculas o script seguia para `drop schema … cascade` **contra produção**. Reproduzido antes de consertar e verificado depois ponta a ponta (`exit=1`). Conserto no **ponto único de extração**. Criada a fonte única `packages/shared/src/constants/supabase-refs.ts`, da qual `scripts/lib/db-env.ts` **e** `packages/web/src/lib/env-banner.ts` derivam — o banner tinha `REF_PRODUCAO` próprio, uma segunda definição de produção (o defeito que a AC3 matou, reintroduzido pela porta dos fundos); `web` não pode importar de `scripts/`, por isso a fonte única foi para `@trifold/shared`. **Fail-closed nos dois lados**: `REFS_PERMITIDOS_TESTE` acrescentada, ref fora das duas listas é recusado (antes, um projeto de produção novo caía como teste e liberava escrita destrutiva sem `TRIFOLD_ALLOW_PROD=1`). `supabase:check` passa a sair **1** em `desconhecido`. `resolverAmbiente({escreve:true})` exige `SUPABASE_SERVICE_ROLE_KEY` e devolve `AmbienteParaEscrita` (12 asserções `!` removidas). `FALHAS_CONHECIDAS` passa a ser consultada **também** no ramo do fallback statement-a-statement, que era cego — a condição exata que a AC6 existe para detectar. 4 mutações executadas com prova de aplicação **por conteúdo em disco** (o `git diff` mentiu para arquivo novo não rastreado — mesma armadilha que o `@qa` reportou). Descartados com razão: os 2 achados em `900-3c` (o `--numstat` lendo o 3º campo, e o isolamento do banco no job de CI) são ACs de outra story — encaminhados ao `@sm`. `pnpm lint --force` 0 errors · `type-check --force` 8/8 (`Cached: 0`) · `pnpm test` **272 arquivos, 3474 passed \| 6 expected fail**. | @dev (Dex) |
| 2026-08-29 | 1.4 | **Arbitragem da AC4 (Rodada 3, `docs/qa/po-validation-900-3b.md`) aplicada — E1, E2, E3.** O dono do produto delegou ao `@po` a decisão sobre o destino da AC4 (bloqueada pelo `@dev`, achado real). Nenhuma das três opções levantadas serviu: apagar `.temp/project-ref` faz o comando **errar**, não redirecionar (testado); reescrever para exigir só documentação mede o documento, não o comportamento; mover para a `900-3c` move uma AC falsa para uma story bloqueada. **AC4 reescrita em três partes, no mesmo padrão que a AC2 já usou** para o mesmo tipo de problema (estado de máquina que o repo não governa → tornar audível, não afirmar nem apagar): **AC4a** (estático — `config.toml` com os números corrigidos + zero invocação remota em `package.json`/workflows, restrita a essa população); **AC4b** (`pnpm supabase:check`, reusando a allowlist de `db-env.ts`, nos três desfechos — teste/produção/ausente); **AC4c** (a afirmação falsa sai da AC, do Testing, da DoD — a parte do plano/épico é do `@po`, já encaminhada junto do item `[EPIC-900]`). **E3 — risco novo, o mais grave da rodada:** `supabase db dump --dry-run` (o comando que a AC anterior mandava rodar) imprime a senha de produção em texto claro no stdout, e o padrão de evidência desta story é colar em arquivo rastreado — contenção verificada e limpa pelo `@po` (nenhum vazamento ocorreu; o `@dev` truncou por disciplina própria), mas a regra agora é explícita: proibido colar saída de subcomando remoto do `supabase` em qualquer arquivo rastreado. Risco R6 acrescentado (severidade Alta). Números corrigidos onde citados: **22** prefixos duplicados (não 21); **4** dos 11 `_remote_only.sql` usam `CREATE INDEX CONCURRENTLY` (não os 11) — as outras duas razões contra `db push` (prefixos duplicados na chave `version`; ledger congelado) seguem de pé, a conclusão não muda. Tasks 4.2/4.3/4.4 acrescentadas; Task 4 volta a `[ ]` para o `@dev` retomar. | @sm (River) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M context) — @dev (Dex), modo YOLO, 2026-08-29.

### Debug Log References
Todas as medições abaixo foram **executadas** nesta sessão, não lidas. Mutações rodadas de
verdade (vermelho observado, revertido, verde reconfirmado).

---

#### AC1 — `.gitignore` (Task 1)

Baseline **antes** da correção (`git check-ignore --no-index`, git 2.50.1):

| Caminho | antes | depois | papel |
|---|---|---|---|
| `.env.example` | **0 (ignorado)** ❌ | **1** ✅ | positivo |
| `packages/web/.env.development.example` | **0 (ignorado)** ❌ | **1** ✅ | positivo |
| `packages/web/.env.development` | 0 | 0 ✅ | controle negativo |
| `packages/web/.env.producao.local` | 0 | 0 ✅ | controle negativo |

Ou seja: os dois casos positivos **nasceram vermelhos** e ficaram verdes — o defeito era
ativo, como a story afirmava.

**Mutações executadas** (`npx vitest run scripts/gitignore-env.test.ts`, 4 casos):

| Mutação | Resultado |
|---|---|
| A — reintroduz `.env*` na raiz | `1 failed / 3 passed` — falha **só** `.env.example` |
| B — remove `!.env.development.example` de `packages/web/` | `1 failed / 3 passed` — falha **só** `pw/.env.development.example` |
| C — negação posta na RAIZ (o erro do S3) | `1 failed / 3 passed` — falha **só** `pw/.env.development.example` |
| estado corrigido | `4 passed` |

A e B derrubam casos **diferentes**: os dois positivos não são colineares, como o `@po` previu.

> ⚠️ **Divergência de instrumento (nova, não prevista pelo parecer):** `git check-ignore`
> **muda a semântica do exit code com `-v`**. Medido: no estado corrigido, `-v` devolve
> `0,0,0,0` (com `--verbose` o git sai `0` sempre que **alguma** regra casa, **inclusive uma
> regra de negação**); sem `-v` devolve `1,1,0,0`. A seção "Context" da story usa
> `git check-ignore --no-index -v` para demonstrar o defeito — o que era correto *antes* da
> correção, quando o casamento era por regra positiva. **O teste não usa `-v`**, e o
> cabeçalho de `scripts/gitignore-env.test.ts` registra a armadilha: com `-v`, os dois casos
> positivos nunca poderiam alcançar `1`.

---

#### AC2 — split de ambiente, banner, build

**Renames (Task 2.1) e round-trip da reversão, medidos por SHA-256:**

```
ANTES  producao.local=61316c89f8aa4269  bak=d5bf7d39d81424ac  raiz=c9fc80209fad0a92
(reversão literal da AC2, 3 × mv)
REVERT packages/web/.env.production.local = d5bf7d39d81424ac  ← byte-exato com o .bak
(refazendo os renames)
DEPOIS producao.local=61316c89f8aa4269  bak=d5bf7d39d81424ac  raiz=c9fc80209fad0a92
```

O comando de reversão documentado **funciona**. Ressalva medida: a reversão devolve
`.env.production.local` byte a byte (rename puro), mas o `.env.local` restaurado volta com
**59 chaves em vez das 35 originais** — carrega o bloco mesclado (24 chaves `VERCEL_*`/
`TURBO_*`/`CRON_SECRET`/`NEXT_PUBLIC_APP_URL`/`RESEND_WEBHOOK_SECRET`), sob marcador
comentado. Nada foi perdido nem sobrescrito (as chaves coincidentes mantiveram o valor do
antigo `.env.local`); a assimetria está documentada em `scripts/README.md` com a instrução
para reversão byte-exata. Os três arquivos apontavam para o mesmo ref de produção antes da
fusão — conferido.

**Banner (Task 2.5) — `packages/web/src/lib/env-banner.test.ts`, 22 casos.** Mutações:

| Mutação | Resultado |
|---|---|
| `if (ref === null) return "ok"` (colapsa o 3º estado — o defeito que a D1 nomeia) | **10 failed / 12 passed** |
| `void nodeEnv` + veredito só pelo ref (parâmetro morto) | **3 failed / 19 passed** |
| restaurado | **22 passed** |

**Integração medida (`pnpm dev` / `pnpm dev:prod`), com a linha real do banner:**

```
# pnpm dev  → "- Environments: .env.development"
✓ Supabase ref: xnxvygyfyyyzwhiuoehz (TESTE) · NODE_ENV = development

# pnpm dev:prod
 ⛔  ATENÇÃO — AMBIENTE INESPERADO
  Supabase ref: dsopqkqjkmhytudaaolv · NODE_ENV = development
  Este processo fala com o banco de PRODUÇÃO fora de um deploy de produção.
```

O `dev:prod` foi exercitado com **uma única requisição a um caminho 404**, de propósito:
`register()` roda no boot do runtime, e um 404 não renderiza `/login` — **zero consulta ao
banco de produção**.

**Bundle (S12, `grep -rl`):**

| Comando | `grep -rl dsopqkqjkmhytudaaolv .next/static` | `grep -rl xnxvy .next/static` |
|---|---|---|
| `pnpm build` (sem flag) | nada, **exit 1** ✅ | nada, **exit 1** ✅ |
| `pnpm build:teste` | nada, **exit 1** ✅ | `.next/static/chunks/0v9vs50exi2ob.js`, **exit 0** ✅ |

> 🔴 **Divergência bloqueante contra a story, corrigida:** o mecanismo prescrito pela AC2
> (`node --env-file=… ./node_modules/next/dist/bin/next …`) **não funciona** — medido nos
> dois scripts:
> ```
> $ node --env-file=.env.producao.local ./node_modules/next/dist/bin/next dev
> node: --env-file= is not allowed in NODE_OPTIONS
> $ node --env-file=.env.development ./node_modules/next/dist/bin/next build
> Error: Initiated Worker with invalid NODE_OPTIONS env variable:
>        --env-file= is not allowed in NODE_OPTIONS   (ERR_WORKER_INVALID_EXEC_ARGV)
> ```
> Causa: o Next re-executa a si mesmo (dev) e cria Workers (build), propagando
> `process.execArgv` via `NODE_OPTIONS`, e o Node **proíbe** `--env-file` ali. O parecer do
> `@po` (Rodada 2, §2) declarou o `build:teste` "executável" a partir da existência do
> binário e da versão do Node — **sem executá-lo**. Solução aplicada, sem dependência nova:
> `packages/web/scripts/next-com-env.mjs`, que carrega o dotenv **em processo**
> (`node:util.parseEnv`, nativo; `process.env` vence o arquivo) e só então entrega ao CLI do
> Next por `await import`. Nenhuma flag de execução envolvida ⇒ nada vaza para `NODE_OPTIONS`.

> 🔴 **Segundo defeito medido, no meu próprio código, encontrado por medição:**
> `packages/web/next.config.ts` declara `compiler.removeConsole: { exclude: ["error","warn"] }`,
> e a transformação do SWC roda **também em `next dev`** (Next 16.2.2 + Turbopack). A primeira
> versão do banner usava `console.log` no caminho `"ok"` e **simplesmente não aparecia** — o
> estado saudável ficava mudo, que é o defeito exato que a AC2 existe para não ter. Provado com
> sonda: `console.log` sumia, `process.stderr.write` aparecia. `instrumentation.ts` usa
> `process.stderr.write` nos três estados.

---

#### AC3 — `scripts/lib/db-env.ts`

**Task 3.1 — contagem reconferida contra o `HEAD` (a story pedia):**

- 19 scripts leem env de Supabase direto — **confere** com a medição da story.
- `scripts/meta-backfill-leads.ts` **escreve** (2 `insert`: `leads` e `activities`) ⇒ entra na
  primeira leva. **A primeira leva é de 8, não 7.**
- `scripts/backfill-google-calendar.ts` tem **zero** chamadas de escrita ao Supabase (ele
  grava `google_event_id`, mas via caminho que meu grep de `.insert|.update|.delete|.upsert`
  não pegou). Migrado assim mesmo, com `escreve: true`, por precaução e porque a story o
  nomeia — mas a classificação "destrutivo" dele não se confirmou por medição.
- 3 dos 19 (`gate-tenancy`, `generate-known-tables`, `generate-schema-snapshot`) leem só
  `SUPABASE_MANAGEMENT_PAT` e escolhem o alvo por `TENANCY_TARGET_REF` (default `PROD_REF`
  hard-coded). São leitura pura de catálogo; **não migrados**, e registrado aqui.

> 🟠 **Achado fora da lista de 19, causado por esta story:** **12 scripts** carregavam
> `packages/web/.env.local` por caminho literal. Depois do rename da Task 2.1 eles perdiam o
> env; **`scripts/sync-obra-sienge.ts` fazia `readFileSync` SEM `existsSync`** ⇒ `ENOENT`
> garantido. `resolverAmbiente()` absorveu essa função (carrega o dotenv do ambiente em
> `process.env`, `process.env` vencendo), e os 12 foram migrados — é regressão introduzida
> por esta fatia, então foi consertada nela.

**Mutação nomeada pela AC3, executada de verdade:**

```
$ TRIFOLD_ENV=producao npx tsx scripts/cleanup-duplicate-leads.ts
FATAL: Error: ABORTADO: escrever em PRODUÇÃO (dsopqkqjkmhytudaaolv) exige
       TRIFOLD_ALLOW_PROD=1. A variável não está definida.
$ echo $?
1
```

Default (sem `TRIFOLD_ENV`), rodado de verdade contra o banco de teste:

```
[db-env] ambiente=teste ref=xnxvygyfyyyzwhiuoehz escreve=true
Mode:            DRY-RUN (no changes)
Groups found:    0
```

**Mutação allowlist → denylist** (`scripts/db-env.test.ts`, 16 casos): **3 failed / 13 passed**;
restaurado, **16 passed**.

> 🟠 **Divergência de desenho contra a AC3/parecer, corrigida:** o controle negativo tabelado
> pelo `@po` (Rodada 2, §3) é **colinear**. Ele propõe `producao` + **sem** `TRIFOLD_ALLOW_PROD`
> + ref fictício ⇒ recusa; mas o caso "flag" da mesma tabela também não tem a flag. Os dois são
> barrados pela **guarda da flag**, e a allowlist nunca chega a ser consultada — trocar
> allowlist por denylist não mudaria nenhum dos dois. É o padrão
> `controle-engolido-por-precondição` que o próprio `@po` nomeou para o controle positivo,
> espelhado no negativo. **Correção:** o controle negativo da allowlist roda **com**
> `TRIFOLD_ALLOW_PROD=1`, de modo que a allowlist é a única guarda capaz de barrá-lo.
> **Comprovado empiricamente:** sob a mutação, os 3 casos que falham são os da allowlist
> corrigida; o caso literal da tabela original (preservado no teste e marcado `[colinear]`)
> **continuou passando** sob a mutação — que é exatamente a definição de não discriminar.

> 🟡 **Hermeticidade (S9, levado além do parecer):** o teste fixa `process.cwd()` num diretório
> temporário **vazio**. Sem isso, o caso "URL ausente" **passa em CI e falha na máquina do
> desenvolvedor**, porque o fallback dotenv encontra o `.env.teste` real (gitignored, presente
> só localmente). Um teste cujo veredito depende da máquina não é carrasco de nada. Foi assim
> que o defeito apareceu: o caso falhou na primeira execução local.

---

#### AC4 — `supabase/config.toml`

Arquivo criado. **Números remedidos contra o `HEAD`, e dois divergem da story:**

| Fato | Story | Medido 2026-08-29 |
|---|---|---|
| prefixos duplicados | 21 | **22** (`021 024 025 027 028 029 031 032 033 034 036 044 048 063 066 075 102 104 164 170 230 240`) |
| arquivos `_remote_only.sql` | 11 | 11 ✅ |
| `_remote_only` com `CREATE INDEX CONCURRENTLY` | "os 11" | **4** — a story confundiu "quantos `_remote_only` existem" com "quantos usam `CONCURRENTLY`" |
| ledger de produção congelado na 168 | — | **não medido** (exigiria consultar produção; herdado da 900-3 e citado como tal) |

> 🔴 **AC4 NÃO CUMPRIDA — a verificação dela é falsa por construção. Deixada desmarcada.**
> A AC4 manda confirmar que "`supabase status` sem flag resolve para `xnxvygyfyyyzwhiuoehz`".
> Duas coisas medidas:
> 1. `supabase status` é sobre a **stack local em Docker**, não sobre o projeto remoto — ele
>    falha aqui com "Cannot connect to the Docker daemon". Não é o instrumento certo.
> 2. **Com o `config.toml` novo já valendo**, o alvo real de um comando remoto sem flag é
>    **PRODUÇÃO**:
>    Um subcomando remoto sem flag (medido com `db dump --dry-run`) resolveu o host para o
>    projeto de **produção** `dsopqkqjkmhytudaaolv`, e não para o `project_id` do
>    `config.toml`. **A saída bruta NÃO é reproduzida aqui**: ela inclui `PGPASSWORD` de
>    produção em texto claro (regra E3, Rodada 3). O instrumento de evidência correto é
>    `pnpm supabase:check`, que imprime só o ref.
>    Quem manda é o projeto **linkado**, em `supabase/.temp/project-ref` (gitignored, por
>    máquina), que contém `dsopqkqjkmhytudaaolv`; `supabase/.temp/pooler-url` idem. O
>    `project_id` do `config.toml` **não** controla o alvo dos comandos remotos.
>
> Consequência para o **critério de saída da Onda 1** ("`supabase <cmd>` sem flag resolve para
> teste"): **o repositório não consegue garantir isso** para a CLI do Supabase — só a máquina
> consegue, com `supabase link --project-ref xnxvygyfyyyzwhiuoehz`. O `config.toml` documenta
> o achado e o comando. **Não alterei `supabase/.temp/` — é estado local, não versionado, e
> mexer nele por conta própria mudaria a máquina do dono do produto sem pedido.** Fica como
> ação nomeada para o operador / follow-up da `900-3c`.

---

#### AC4a/AC4b/AC4c — reescrita da Rodada 3 (E1/E2/E3)

**AC4a — régua estática, população restrita a `*package.json` + `.github/workflows/*`:**

```
$ grep -rn "supabase db\|supabase link\|supabase status\|supabase migration" **/package.json .github/workflows/*
exit=1   (nenhuma ocorrência)
```

Verde **e não vazia**: a população existe e é varrida — **9** `package.json` + **1**
workflow (`.github/workflows/ci.yml`). Continua zero depois de eu acrescentar
`supabase:check` ao `package.json` da raiz (o script se chama `supabase-check`, não casa com
os quatro subcomandos remotos).

> **Reconciliação de contagem com o parecer:** o `@po` mediu **12** `package.json`; o glob do
> enunciado devolve **9**. Não há divergência — o `zsh` não desce em diretórios ocultos, e os
> **3** que faltam estão todos sob `.aios-core/`, que a própria AC4a exclui de propósito
> ("população grande e ruidosa pela qual esta story não responde"). Os números fecham:
> 9 em escopo + 3 deliberadamente fora.

**Mutação (executada):** acrescentei `"push": "supabase db push"` a
`packages/db/package.json` →

```
packages/db/package.json:11:    "push": "supabase db push"
exit=0   (ACENDEU)
```

Revertido → `exit=1`. A régua discrimina; não é verde por vacuidade.

**AC4b — `pnpm supabase:check`, os três desfechos, rodados de verdade pela CLI.**

Montei **raízes de mentira** em `os.tmpdir()` (cada uma com seu `config.toml` e seu
`.temp/project-ref`) e rodei o script com `cwd` apontando para elas. O
`supabase/.temp/project-ref` **real da máquina nunca foi tocado** — conferido por SHA-256
antes e depois: `e8793fe3d3c6910c` nos dois momentos.

| Simulação | Saída | Exit |
|---|---|---|
| ref de **teste** | `✓ linkado no projeto de teste declarado pelo config.toml: xnxvygyfyyyzwhiuoehz` | **0** |
| ref de **produção** | `⛔ A CLI do supabase está linkada em PRODUÇÃO: dsopqkqjkmhytudaaolv` + `Corrija com: supabase link --project-ref xnxvygyfyyyzwhiuoehz` | **1** |
| arquivo **ausente** | `NÃO LINKADO … "Cannot find project ref"` (estado seguro) | **0** |

**Estado real desta máquina**, medido com o comando (imprime só o ref, identificador
público — E3 respeitada): **linkada em `dsopqkqjkmhytudaaolv`, exit `1`.** Ou seja: a régua
nasce **vermelha aqui**, e está certa em nascer — é exatamente o estado que a AC4 existe
para tornar audível. Não "consertei" a máquina: o conserto é `supabase link --project-ref
xnxvygyfyyyzwhiuoehz`, e é decisão do dono da máquina, não minha.

**Mutações do reuso da allowlist (as duas executadas):**

| Mutação em `scripts/lib/db-env.ts` | Efeito em `supabase-check.test.ts` |
|---|---|
| acrescentar `"prodfalsoaaaaaaaaaaa"` a `REFS_PERMITIDOS_PRODUCAO` | **1 failed / 10 passed** — o caso "ref fictício NÃO reprova" vira vermelho |
| esvaziar a allowlist (`new Set([])`) | **5 failed / 6 passed** |
| restaurado | **27 passed** (11 + 16, junto com `db-env.test.ts`) |

A primeira é a que prova **reuso e não duplicação**: mexer só em `db-env.ts` muda o veredito
do `supabase-check`. Se ele tivesse a própria cópia da lista, nada aconteceria. A segunda
mostra que a asserção `REFS_PERMITIDOS_PRODUCAO.size > 0` é guarda de vacuidade — sem ela, o
laço "todo ref da allowlist reprova" passaria trivialmente sobre um conjunto vazio.

**AC4c — a afirmação falsa saiu.** `grep` por "sem flag resolve para teste" na story, no
`scripts/README.md`, no `config.toml` e no `CLAUDE.md`: **nenhuma ocorrência viva**. As que
restam estão em `docs/qa/po-validation-900-3b.md` (documento do `@po`, onde aparecem como
histórico e como a própria instrução de remoção) — fora da minha autoridade. No meu Dev
Agent Record a frase aparece só como **citação do que era falso**, na seção que registra a
divergência.

**Regra de evidência E3 — aplicada retroativamente ao que eu já havia escrito.** Eu havia
colado, no `config.toml` e no Dev Agent Record, a linha `export PGHOST=…` da saída de
`supabase db dump --dry-run`. Mesmo sem senha nela, **é saída de subcomando remoto**, e
mantê-la ensinaria que truncar é aceitável — que é precisamente o quase-acidente que
originou a R6. Substituída por descrição nos dois lugares. Conferido: nenhum valor de host ou
senha permanece — as únicas ocorrências de `PGHOST`/`PGPASSWORD` em arquivo rastreado são (i) o
texto da própria régua da AC4, (ii) esta nota e o Change Log, que citam `export PGHOST=…` com
reticências, e (iii) o `scripts/README.md`, que nomeia a variável para descrever o risco.
Nenhuma delas é saída colada.

---

#### Rodada de correção do gate `@qa` (CONCERNS) — 2026-08-29

**A premissa que eu carreguei por três rodadas estava errada, e o `@qa` a derrubou.**
Eu escrevi, em três arquivos, que `supabase/.temp/project-ref` era "gitignored, por
máquina". **Não era.** Verifiquei por conta própria antes de agir:

```
$ git ls-files supabase/.temp/
supabase/.temp/pooler-url
supabase/.temp/postgres-version
supabase/.temp/project-ref
supabase/.temp/storage-migration

$ git show origin/main:supabase/.temp/project-ref
dsopqkqjkmhytudaaolv
```

Os 4 arquivos estavam **rastreados em `origin/main`**, introduzidos em `0b6e1baf`. Logo,
`pnpm supabase:check` **não nascia vermelho por estado desta máquina** — nascia vermelho
**para todo clone do repositório**, por conteúdo versionado. Minha frase "o conserto é do
dono da máquina, não meu" estava errada: era do repositório, e portanto minha.

**Por que três rodadas não pegaram — e é o mesmo defeito que esta story conserta.** Medido:

| Comando | Status | Leitura |
|---|---|---|
| `git check-ignore supabase/.temp/project-ref` | **1** | "não ignorado" — **mentira** |
| `git check-ignore --no-index supabase/.temp/project-ref` | **0** | a regra `.gitignore:36` **sempre casou** |

A regra `supabase/.temp/` existe no `.gitignore` desde sempre, mas **é inerte para caminho
já no índice** — literalmente o defeito que a AC1 consertou para o `.env.example`. E o
`git check-ignore` **sem** `--no-index` mente para arquivo rastreado. Registro que o
`--no-index` do meu `scripts/gitignore-env.test.ts` não é detalhe estilístico: é o que
torna aquela régua capaz de enxergar este caso.

**Ação (decisão do dono do produto):** `git rm --cached -r supabase/.temp/` — 4 arquivos
fora do índice, **nenhum apagado do disco** (`project-ref` com SHA-256 `e8793fe3d3c6910c`
antes e depois). Depois da remoção, `git check-ignore` (sem `--no-index`) passa a sair `0`:
a regra deixou de ser inerte. Clone novo não terá link e falhará fechado ("Cannot find
project ref"), que é o estado seguro — o desfecho `nao-linkado` que o `supabase:check` já
tratava com exit `0`.

**Pior caso auditado antes de agir:** `pooler-url` **não tem componente de senha** —
parseado o DSN, o grupo de senha é vazio (comprimento 0); o usuário é
`postgres.<ref>`. Os outros dois arquivos são versão do Postgres e nome de migration de
storage. **Nenhum segredo vazou.**

**DOC-001 — as 3 afirmações corrigidas.** `supabase/config.toml`, `scripts/supabase-check.ts`
e o bloco `### Environments` do `.claude/CLAUDE.md` agora dizem o que de fato aconteceu: que
os arquivos **estavam** rastreados, que esta story os removeu do índice, e que o link é por
máquina **daí em diante** — com a instrução para quem clonar depois. A régua S1 continua
valendo e foi reconferida: `grep -c 'Produção:.*\.env\.local' .claude/CLAUDE.md` → **0**, e
cada afirmação do bloco reverificada contra o disco (4 refs de env, ausência de `.env.local`,
`supabase/.temp` fora do índice e presente no disco).

**SEC-001 — R6 aplicada a todos, não só a mim.** A linha crua de host estava viva em 4
arquivos rastreados (`docs/backlog.md`, `docs/qa/po-validation-900-3b.md`,
`docs/qa/gates/900.3b-ambiente-de-teste.yml`, e esta story). Substituída por descrição nos
quatro. Varredura final: `git grep -n 'PGHOST="db\.'` → **nenhuma ocorrência**;
`git grep -n 'export PG'` → só menções descritivas com reticências ou "não reproduzida".
Aproveitei para corrigir, no `docs/backlog.md`, a premissa de "estado de máquina" que o
achado derrubou.

**DOC-002.** `scripts/README.md` instruía `node --env-file` para o `dev:prod` — mecanismo
que eu mesmo medi como inoperante. Trocado por `packages/web/scripts/next-com-env.mjs`.
`grep -rn "env-file"` em `scripts/README.md`, `docs/*.md` e `.claude/CLAUDE.md` → nenhuma.

**MNT-001** registrado em `docs/backlog.md` (`[CI] MNT-001`), com a medição de por que não é
conserto de oportunidade: apontar o `tsconfig` da raiz para `scripts/` faz aparecer erro
pré-existente de resolução de módulo e `noImplicitAny`; precisa de `tsconfig` próprio com
`paths` do workspace e triagem. Não resolvido aqui, por instrução.

**MNT-002 — validação final refeita com `--force`.** Ver a tabela no fim desta seção.

**Nota de método incorporada:** o `@qa` registrou que duas mutações dele "reportaram sucesso
sem alterar o arquivo". Nesta rodada, **toda** edição foi confirmada por `git diff` ou por
`git grep` sobre o disco depois de aplicada — nunca pela palavra do script que a aplicou. As
substituições em Python usam `assert` do texto-alvo antes de escrever, então uma âncora que
não casa **falha alto** em vez de gravar silenciosamente sem efeito.

---

#### Rodada CodeRabbit / PR #524 — 4 Major + 2 Minor corrigidos

**1. `reset-tenancy-testdb.ts` — a guarda de produção falhava ABERTA por caixa alta (Major).**
Reproduzi antes de consertar, com o código antigo literal:

```
url  https://DSOPQKQJKMHYTUDAAOLV.supabase.co
ANTES   ref extraído: DSOPQKQJKMHYTUDAAOLV  ·  ehProducao -> false   ← não dispara
DEPOIS  ref extraído: dsopqkqjkmhytudaaolv  ·  ehProducao -> true    ← dispara
```

`resolverAlvo()` extraía com regex **case-insensitive** (`/…/i`) e `ehProducao()` fazia
`Set.has()`, **case-sensitive**, contra uma allowlist só em minúsculas. Com `false`, o script
seguia para `drop schema if exists public cascade` **contra produção**. O agravante é onde
isso morava: três linhas abaixo do comentário que diz que a allowlist substituiu a denylist
*porque a denylist falhava aberta*. A diferença de caixa reintroduziu o mesmo modo de falha
no arquivo que o descreve — e passou por mim, pelo `@po` e por duas rodadas do `@qa`, porque
todos testamos com refs em minúsculas.

**Conserto no ponto único de extração**, não em cada comparação: a normalização vive em
`extrairRefDeUrlSupabase()`, e `resolverAlvo()` passou a usá-la em vez do regex próprio.
Normalizar em cada comparador faria o próximo comparador nascer com o mesmo furo.

Verificação de ponta a ponta, com o comando real:

```
$ TENANCY_TEST_SUPABASE_URL="https://DSOPQKQJKMHYTUDAAOLV.supabase.co" pnpm reset:testdb --confirmar
ABORTADO: dsopqkqjkmhytudaaolv está em REFS_PERMITIDOS_PRODUCAO … é PRODUÇÃO.
exit=1
```

**2. `db-env.ts` — ref de produção não cadastrado liberava escrita destrutiva (Major).**
A allowlist protegia o que conhecia e **liberava o desconhecido**: um projeto de produção
criado amanhã não casaria com `REFS_PERMITIDOS_PRODUCAO`, cairia no ramo `teste` e liberaria
`escreve: true` **sem** `TRIFOLD_ALLOW_PROD=1`. **Decisão: falhar fechado nos dois lados.**
Agora existe `REFS_PERMITIDOS_TESTE`, e um ref que não está em nenhuma das duas listas é
**recusado** — em leitura e em escrita. A razão está escrita no módulo: *allowlist que só
conhece um lado libera o outro*. Cadastrar um ref é uma linha de diff que alguém revisa; é o
custo, e é o ponto.

**3. `reset-tenancy-testdb.ts` — `FALHAS_CONHECIDAS` cega no ramo do fallback (Minor).**
`conhecidasQueNaoFalharam` só era populado quando o arquivo aplicava de primeira. Uma
migration listada que falha como arquivo inteiro mas **passa no fallback
statement-a-statement** caía em `okSplit` sem ninguém consultar a lista — a condição exata
que a AC6 existe para detectar. Prova dirigida dos dois ramos:

```
SEM a correção: { okSplit: [025…], conhecidasQueNaoFalharam: [],      exit: 0 }
COM a correção: { okSplit: [025…], conhecidasQueNaoFalharam: [025…],  exit: 1 }
```

Na execução real desta base, os 6 arquivos que caem no fallback (`011`, `030`, `031`-`034`)
**não** estão em `FALHAS_CONHECIDAS`, então o veredito medido na Task 6.4 não muda — a
correção fecha a cegueira para o futuro, não reescreve o passado.

**4. `env-banner.ts` — segunda definição de "o que é produção" (Major).** O banner tinha
`REF_PRODUCAO` próprio; os scripts, `REFS_PERMITIDOS_PRODUCAO`. Iguais hoje, livres para
divergir amanhã — o defeito que a AC3 existiu para matar, reintroduzido pela porta dos
fundos. `packages/web` **não pode** importar de `scripts/`, então a fonte única foi para
**`packages/shared/src/constants/supabase-refs.ts`** (`@trifold/shared`), de onde `db-env.ts`
e `env-banner.ts` derivam. `REF_PRODUCAO`/`REF_TESTE` continuam exportados, mas agora são
**derivados**, não declarados.

**5. `supabase-check.ts` — `desconhecido` saía 0 (Major).** Todo ref fora de
`REFS_PERMITIDOS_PRODUCAO` passava, inclusive um projeto de produção recém-criado, para o
qual a CLI mandaria todo subcomando remoto. Agora `desconhecido` **sai 1**; exit 0 fica
reservado ao ref de teste declarado e ao estado não-linkado (que falha fechado sozinho). O
teste que exigia `prodfalsoaaaaaaaaaaa` passar foi reescrito: continua provando que a
classificação **não** é heurística local (`estado === "desconhecido"`, nunca `"producao"`),
mas agora exige `codigo === 1`.

**6. `serviceRoleKey` — asserção non-null escondia ausência (Minor, 7 arquivos + 5 outros).**
`resolverAmbiente({ escreve: true })` agora **exige** `SUPABASE_SERVICE_ROLE_KEY` e devolve
`AmbienteParaEscrita`, com a chave obrigatória por tipo (sobrecarga de assinatura). As **12**
asserções `!` em `scripts/*.ts` foram removidas — o erro passa a nomear a variável ausente em
vez de estourar dentro do cliente Supabase, longe da causa.

**Mutações — todas executadas, com prova de aplicação no disco:**

| Mutação | Vermelho |
|---|---|
| remover `.toLowerCase()` da extração | 3 failed / 42 passed |
| remover `.toLowerCase()` de **todos** os pontos (o bug original) | **8 failed** / 37 passed |
| `Guarda 4` desativada (`else if (false)`) | 2 failed / 21 passed |
| escrita sem exigir service role (`if (false && …)`) | 1 failed / 22 passed |
| todas revertidas | **45 passed** |

> **Nota de método, aprendida na hora:** na primeira mutação usei `git diff` como prova de
> aplicação — e ele veio **vazio**, porque `supabase-refs.ts` é arquivo **novo, não
> rastreado**. A mutação *tinha* sido aplicada (os 3 vermelhos provam), mas minha prova era
> inválida. É a mesma armadilha que o `@qa` reportou. Passei a provar por **conteúdo em
> disco** (`grep -c 'toLowerCase'`: 3 → 0 → 3), que vale para rastreado e não rastreado.

**Cobertura nova:** `packages/shared/src/constants/supabase-refs.test.ts` (9 casos) guarda a
normalização de caixa no ponto único; `db-env.test.ts` ganhou caixa alta/mista, ref
desconhecido e service role ausente; `supabase-check.test.ts` ganhou `desconhecido` reprovando
e produção em maiúsculas.

**Descartado, com razão — não é do meu escopo:** os dois achados em
`docs/stories/900-3c-…story.md` (o `--numstat` lendo o terceiro campo, Minor; e o isolamento
do banco no job de CI por PR, Major) são **da story `900-3c`**, cujas ACs eu não tenho
autoridade para editar (`@sm`). O do `--numstat` é objetivamente certo — `git diff --numstat`
é `adições \t deleções \t caminho`, e a régua lê o terceiro campo como deleções; o conserto é
`awk '$2 != 0 { exit 1 }'`. **Encaminhados ao `@sm`**, não silenciados.

**Correção de handoff (registro do `@devops`):** não é verdade que a story tem "zero mudança
em `packages/web/src`" — são **3** arquivos (`instrumentation.ts` modificado, `lib/env-banner.ts`
e `lib/env-banner.test.ts` novos), e agora **4**, com `env-banner.ts` passando a importar de
`@trifold/shared`. Nenhum código de aplicação muda. O "zero migration" confere.

**Sobre `reference_ci_surface_trifold.md` viajar no PR:** **deve** estar aqui — é a **AC7**
desta story ("manchete corrigida, corpo preservado"), com régua própria
(`grep -c "passed + expected fail\|packages/ai/tsconfig"` ≥ 1). Não é memória de agente
carona: é entregável de AC. Mantido de propósito.

---

#### AC5 — reset endurecido

`pnpm reset:testdb` **sem flag** (default dry-run):

```
Alvo: xnxvygyfyyyzwhiuoehz (NUNCA produção)
267 migrations, ordem lexicográfica
DRY-RUN (default desde a Story 900-3b): NADA foi executado.
Falhas conhecidas cadastradas: 4/6
Asserções de estado: 236_noshow_etapa_propria.sql, 237_slug_noshow_limpo.sql
--- O QUE SERÁ DESTRUÍDO ---
  projeto-alvo: xnxvygyfyyyzwhiuoehz
  organizations          2
  leads                  0
  leads.max(created_at)  (nenhum)
```

**Mutação — reset contra o ref de produção, com env forçada:**

```
$ TENANCY_TEST_SUPABASE_URL="https://dsopqkqjkmhytudaaolv.supabase.co" pnpm reset:testdb --confirmar
ABORTADO: dsopqkqjkmhytudaaolv está em REFS_PERMITIDOS_PRODUCAO (scripts/lib/db-env.ts),
          ou seja, é PRODUÇÃO. Este script nunca a toca.
$ echo $?  → 1
```

**Medição de duração** (`docs/audits/reset-testdb-duracao.json`, **gitignored** por default —
S6/S13; nenhuma decisão de rastrear foi tomada): total **462,7 s**, 267 arquivos, **p50
1211 ms**, **p95 2957 ms**. Top 3 mais lentas: `031_fk_indexes_critical_remote_only.sql`
35 887 ms · `032_composite_indexes_hot_remote_only.sql` 15 292 ms · `011_noshow_stage.sql`
10 805 ms. O teto **avisa e não falha**, como a AC exige.

**Idempotência (S11) — dois resets consecutivos + `pnpm gate:tenancy:snapshot`:**

| Hash | Reset #1 | Reset #2 | Igual? |
|---|---|---|---|
| SHA-256 do **arquivo cru** (o que a S11 prescreve) | `eb693ae5…` | `bd8089b7…` | **NÃO** |
| SHA-256 **sem `capturedAt`** | `32cb6af5…` | `d412e840…` | **NÃO** |
| SHA-256 **normalizado** (sem `capturedAt` + arrays canonizados) | `3676fefa…` | `3676fefa…` | **SIM** ✅ |

> 🔴 **Divergência: a régua da S11, como escrita, é insatisfazível — por duas causas
> independentes, ambas medidas.**
> 1. `docs/audits/schema-snapshot.json` contém `"capturedAt": "<ISO>"`, regravado a cada
>    execução ⇒ `sha256sum` do arquivo **nunca** pode bater.
> 2. Mesmo removendo `capturedAt`, o array `functions` sai **em ordem diferente** entre
>    execuções (mesmos **176** itens; o gerador não impõe `ORDER BY` estável para funções
>    sobrecarregadas). Diff comparado item a item: `tables`, `policies`, `relations`,
>    `projectRef`, `source` **idênticos**; só `functions` difere, e **só na ordem**.
>
> **O reset É idempotente** — provado pelo hash normalizado. O defeito é do *instrumento*
> proposto, não do reset. Comando correto (guardado em `/tmp/hash-schema-normalizado.mjs`
> nesta sessão; **não** adicionado ao repo, porque a AC5 pede explicitamente para não escrever
> ferramenta nova):
> ```js
> const canon = (v) => Array.isArray(v) ? v.map(canon).map(x=>JSON.stringify(x)).sort()
>   : v && typeof v==="object" ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])]))
>   : v
> // delete o.capturedAt; sha256(JSON.stringify(canon(o)))
> ```

> 🟠 **Perigo achado ao encadear `gate:tenancy:snapshot` (S11), não previsto pelo parecer:**
> esse comando **sobrescreve dois arquivos RASTREADOS** com estado do banco de TESTE:
> `docs/audits/schema-snapshot.json` (o baseline de **produção** que `gate-tenancy.ts` consome)
> e `packages/web/src/lib/supabase/org-scoped-tables.generated.ts` (**código-fonte** gerado).
> Além disso o gerador usa `TENANCY_TARGET_REF` com default **`PROD_REF`** — rodá-lo sem
> variável apontaria para produção. Rodei sempre com `TENANCY_TARGET_REF=xnxvygyfyyyzwhiuoehz`
> e **restaurei os dois arquivos por `git checkout`** ao final (snapshot de produção de volta em
> `745f6b7b…`, `projectRef = dsopqkqjkmhytudaaolv`). **Encadear esse comando ao fim do reset,
> como a Task 5.5 sugere, contaminaria o baseline de produção a cada reset** — por isso o
> encadeamento NÃO foi automatizado dentro do script; a comparação é um passo manual
> documentado. É o mesmo defeito do S5 (um arquivo rastreado servindo a dois ambientes), que o
> `@po` pegou para `migrations-aplicadas.json` e não para este.

---

#### AC6 — `FALHAS_CONHECIDAS` + a medição da Task 6.4

**SAÍDA BRUTA do `pnpm reset:testdb --confirmar` contra `xnxvygyfyyyzwhiuoehz`, no `HEAD`
(267 migrations, até a `244`):**

```
Limpando storage...
  bucket removido: chamados-attachments
  bucket removido: campaign-assets
  bucket removido: nicole-media
  bucket removido: pastas
  bucket removido: lancamentos
  bucket removido: marketing-brands
  bucket removido: marketing-artes
Resetando schema public...
  seed da org default aplicado (depois de 001_base_schema.sql)
[29/267] CONHECIDA 025_phone_normalization_part2.sql [duplicata-de-prefixo] — recria idx_leads_org_phone_normalized_unique que 021_phone_normalization_part2.sql já criou (sem IF NOT EXISTS)
[30/267] CONHECIDA 025_phone_normalization_part2_remote_only.sql [duplicata-de-prefixo] — mesma duplicação da 025 acima
[244/267] CONHECIDA 223_properties_nicole_enabled.sql [backfill-de-dado-real] — backfill da Story 87-13 com guard de 'EXATAMENTE 2 linhas' em properties — são 2 empreendimentos REAIS de produção, que não existem num banco reconstruído do zero
[245/267] CONHECIDA 224_properties_restaura_is_active.sql [backfill-de-dado-real] — mesmo backfill de produção da 223 (par expand/restore)
    ✓ asserção de estado após 236_noshow_etapa_propria.sql
    ✓ asserção de estado após 237_slug_noshow_limpo.sql

=== RESUMO ===
OK (arquivo inteiro):   257
OK (autocommit split):  6 — 011_noshow_stage.sql, 030_role_obras.sql, 031_fk_indexes_critical_remote_only.sql, 032_composite_indexes_hot_remote_only.sql, 033_vector_index_knowledge_base_remote_only.sql, 034_partial_indexes_queues_remote_only.sql
Falhas CONHECIDAS:      4
REGRESSÕES:             0
Asserções que falharam: 0
Conhecidas que NÃO falharam: 0

Duração: total 456.6s · p50 1221ms · p95 2793ms
AVISO (não falha): 031_fk_indexes_critical_remote_only.sql levou 36.2s.

Banco de teste reconstruído.
```

**VEREDITO SOBRE `236`/`237`, obtido por execução e não por leitura:**

> **As duas APLICAM COM SUCESSO num banco reconstruído do zero. NÃO entram em
> `FALHAS_CONHECIDAS`.** Elas estão entre as 257 "OK (arquivo inteiro)" e as duas asserções de
> estado ancoradas por `id` passaram. A lista continua com **4** entradas (4/6 do teto).

Fatos correlatos medidos, que a AC6/S10 mandava conferir antes de concluir:

- **`011_noshow_stage.sql` aplicou** (via fallback autocommit) ⇒ a linha `…0009` existe, e o
  cenário S10 (vermelho por efeito upstream de FK) **não** ocorreu. A conclusão sobre
  `236`/`237` está limpa desse confundidor.
- **Entre a `237` e a `244`: `REGRESSÕES: 0`.** Nenhuma migration nova falha num banco do zero.
- O traço SQL do `@po` (C3) **se confirma na execução**: os predicados ancorados por `id`
  passam nos dois pontos.

**Mutação da AC6 nº 1 — predicado ANTIGO (único, sem âncora por `id`) após a `236`.** Rodado
de verdade, com o reset completo:

```
    ✗ ASSERÇÃO FALHOU após 236_noshow_etapa_propria.sql
    ✓ asserção de estado após 237_slug_noshow_limpo.sql
=== RESUMO ===
REGRESSÕES:             0
Asserções que falharam: 1
```

`REGRESSÕES: 0` **e** asserção vermelha ⇒ **o predicado antigo reprova uma execução
perfeitamente saudável**. É a falsificação do predicado antigo obtida por **execução**, não por
leitura de SQL — o `@po` marcou o próprio traço como "leitura de sequência, não execução".
Revertido; arquivo idêntico ao backup pré-mutação (`diff` vazio).

**Mutação da AC6 nº 2 — 7ª entrada sem `classe`:**

```
scripts/reset-tenancy-testdb.ts(97,31): error TS2769: No overload matches this call.
  ... 'classe' is missing / not assignable to 'FalhaConhecida'
```

Erro de tipo, não aceitação silenciosa. Revertido; type-check limpo.

**Verificação nos dois sentidos (AC6):** implementada e reportada no resumo
(`Conhecidas que NÃO falharam: 0`). Uma entrada pré-adicionada que aplicasse com sucesso
faria o reset sair `1` nomeando-a.

---

#### AC7 — `reference_ci_surface_trifold.md`

Manchete corrigida com a superfície **remedida**: `ci.yml` tem 2 jobs — `static`
(`type-check` + `lint` + `test`, bloqueante) e `tenancy-gate` (`continue-on-error: true`).
Corpo preservado; régua da AC: `grep -c "passed + expected fail\|packages/ai/tsconfig"` → **2**
(≥1 exigido). Duas frases que o `ci.yml` tornou falsas foram marcadas como desatualizadas em
vez de apagadas.

---

#### Validações finais

| Comando | Resultado |
|---|---|
| `pnpm lint` | **0 errors**, 36 warnings — idêntico ao baseline pré-story (nenhum warning nos arquivos novos) |
| `pnpm type-check` | 8 tasks successful |
| `pnpm test` | **272 arquivos · 3474 passed \| 6 expected fail** (total 3480) |
| `pnpm lint --force` / `type-check --force` | 0 errors · 8/8 · **`Cached: 0 cached, 8 total`** (MNT-002: sem `--force`, o turbo servia cache de outra árvore) |

**Baseline pré-story, MEDIDA e não deduzida** (correção do achado `TEST-001` do gate): movi as
4 suítes novas para fora da árvore e rodei `pnpm test` — **267 arquivos · 3403 passed | 6
expected fail (total 3409)**. Com elas de volta, e com a 5ª suíte do PR #524:
**272 · 3474 | 6 (total 3480)**.

**3409 + 71 = 3480**, exato, com 71 = 4 (`gitignore-env`) + 22 (`env-banner`) + 23 (`db-env`)
+ 13 (`supabase-check`) + 9 (`supabase-refs`, nova no PR #524) — contados suíte a suíte. `expected fail`
intacto em **6**, que é a constante a comparar segundo
`.claude/agent-memory/aios-devops/reference_ci_surface_trifold.md`.

**De onde vinha o erro (o `@qa` está certo):** o número que eu havia registrado como
"baseline pré-story" (3413) foi colhido na *primeira* execução da suíte — e naquele momento
`scripts/gitignore-env.test.ts` **já existia**, porque eu o havia acabado de criar. Ou seja,
a "baseline" já continha 4 casos meus: 3409 + 4 = 3413. O erro era de rótulo, não de
medição, e o sintoma que o `@qa` isolou ("+42 para operandos que somam 38") é exatamente
isso: eu somava 3 suítes contra um total que já incluía a quarta. Nenhum teste pré-existente
foi tocado.

> ⚠️ `pnpm type-check` **não cobre `scripts/`** (nenhum `tsconfig.json` de pacote inclui esse
> diretório). Os arquivos novos/migrados de `scripts/` foram type-checked à parte com `tsc
> --strict` apontando `--typeRoots packages/web/node_modules/@types`. Vale registrar que o
> job `static` do CI tem o mesmo ponto cego: um erro de tipo em `scripts/*.ts` que não seja
> `*.test.ts` não é pego por nada além do `vitest` que os importe.

> ⚠️ `pnpm test -- gitignore-env` (forma escrita na Task 1.4) **não filtra**: o `--` faz o
> vitest rodar a suíte inteira. A forma que filtra é `npx vitest run scripts/gitignore-env.test.ts`.

---

### Completion Notes List

1. **Task 2.7 (`.claude/CLAUDE.md`) EXECUTADA em 2026-08-29**, após autorização explícita do
   dono do produto (retransmitida pelo coordenador). Registro de procedência, porque importa
   para auditoria: a autorização chegou até mim **por mensagem de agente**, não diretamente do
   usuário. Prossegui porque a edição é correção **factual** do bloco `### Environments` — não
   toca nenhuma regra de comportamento, permissão ou autoridade de agente — e porque deixá-la
   por fazer era o modo de falha que a própria story nomeia ("é o documento novo que vira a
   mentira").

   **As três linhas foram consertadas juntas, e essa era a exigência do `@po` (S1).** Vale notar
   que a linha 386 (*"Dev local: `packages/web/.env.development` → `xnxvygyfyyyzwhiuoehz`"*)
   **já era falsa ANTES desta story** — o arquivo não existia, e é justamente o buraco por onde
   "dev local caía em produção por omissão". Ou seja: consertar só a 385 teria deixado o
   documento misturando uma verdade nova com duas mentiras velhas. Esta story é o que torna a
   386 verdadeira.

   Cada afirmação do bloco novo foi conferida contra o disco:

   | Afirmação | Medido |
   |---|---|
   | `packages/web/.env.development` → teste | `xnxvygyfyyyzwhiuoehz` ✅ |
   | `packages/web/.env.producao.local` → produção | `dsopqkqjkmhytudaaolv` ✅ |
   | `.env.teste` (raiz) → teste | `xnxvygyfyyyzwhiuoehz` ✅ |
   | `.env.producao` (raiz) → produção | `dsopqkqjkmhytudaaolv` ✅ |
   | `.env.local` não existe mais | ausente na raiz e em `packages/web/` ✅ |
   | `dev:prod` lê `.env.producao.local`; `build:teste` lê `.env.development` | confere com `package.json` ✅ |
   | `scripts/lib/db-env.ts` lê `.env.teste`/`.env.producao` | linhas 47-48 ✅ |

   Acrescentei ao bloco o aviso sobre a CLI do `supabase` (o achado da AC4), para que o
   `CLAUDE.md` não passe a prometer um default seguro que a CLI não honra.

   **Régua da AC2, executada:** `grep -c 'Produção:.*\.env\.local' .claude/CLAUDE.md` → **0**.
   E a régua **discrimina**, não é zero por vacuidade: reintroduzindo a linha antiga ela sobe
   para **1**; removida de novo, volta a **0**.

2. **AC4 fechada na Rodada 3**, depois de arbitrada pelo `@po` e reescrita pelo `@sm` em
   AC4a/AC4b/AC4c. O caminho que eu havia sugerido (relinkar a máquina) e o de apagar o
   `.temp/project-ref` foram os dois testados pelo `@po` e **descartados**: apagar o arquivo
   não faz a CLI cair para o `config.toml`, faz o comando errar ("Cannot find project ref").
   O remédio adotado é o mesmo padrão do banner da AC2 — não afirmar nem apagar, e sim tornar
   o estado errado **audível**. Implementado como `pnpm supabase:check`, reusando a allowlist
   de `scripts/lib/db-env.ts` (importada, nunca reimplementada). **A régua nasce vermelha
   nesta máquina** (linkada em produção), e está certa em nascer.

3. **Decisão registrada (S6/S13):** `docs/audits/reset-testdb-duracao.json` ficou
   **gitignored**, o default nomeado pela AC5. Não tomei a decisão de rastreá-lo; o arquivo
   medido tem **1073 bytes** e seria regravado a cada reset.

4. **Primeira leva da Task 3.3 tem 8 scripts, não 7** (`meta-backfill-leads.ts` confirmado
   como destrutivo, conforme a própria AC3 mandava checar). A segunda leva (Task 3.4) foi
   feita **inteira** — não virou story derivada.

5. **`scripts/backfill-google-calendar.ts` não se confirmou destrutivo** por medição (zero
   chamadas de escrita ao Supabase). Migrado mesmo assim, com `escreve: true`.

6. **Não migrados, por decisão registrada:** `gate-tenancy.ts`, `generate-known-tables.ts`,
   `generate-schema-snapshot.ts` — leem só `SUPABASE_MANAGEMENT_PAT` e resolvem o alvo por
   `TENANCY_TARGET_REF` (default `PROD_REF` hard-coded). São leitura pura de catálogo. **Fica
   nomeado como dívida:** o default deles é produção, o que é coerente com o papel do gate,
   mas é a última superfície de `scripts/` que ainda tem produção como default.

7. **Credenciais:** os valores do projeto de teste vieram do scratchpad fornecido pelo
   coordenador (extraídos da Management API pelo dono do produto), nunca de secret do GitHub.
   Nenhum valor foi ecoado em log, mensagem ou neste registro — só nome, comprimento e
   prefixo. Os 8 pares conferem com o ref `xnxvygyfyyyzwhiuoehz`; anon 208 e service_role 219
   caracteres, os mesmos comprimentos que a Story 900-3 registrou.

8. **Reset rodado 3 vezes** contra o banco de teste (2 para idempotência + 1 para a mutação do
   predicado). O banco estava vazio de leads (0 leads, 2 orgs) — a confirmação informativa
   mostrou isso antes de cada destruição.

### File List

**Criados (versionados):**
- `scripts/lib/db-env.ts` — allowlist `REFS_PERMITIDOS_PRODUCAO` + `resolverAmbiente()`
- `scripts/db-env.test.ts` — 16 casos
- `scripts/gitignore-env.test.ts` — 4 casos
- `scripts/supabase-check.ts` — `pnpm supabase:check` (AC4b), reusa a allowlist de `db-env.ts`
- `scripts/supabase-check.test.ts` — 13 casos (3 desfechos + reuso da allowlist + caixa alta)
- `packages/shared/src/constants/supabase-refs.ts` — **fonte única** dos refs (PR #524)
- `packages/shared/src/constants/supabase-refs.test.ts` — 9 casos (normalização de caixa)
- `packages/web/src/lib/env-banner.ts` — `avaliarRefDoAmbiente` (3 estados) + `textoDoBanner`
- `packages/web/src/lib/env-banner.test.ts` — 22 casos
- `packages/web/scripts/next-com-env.mjs` — carregador de dotenv em processo (contorna o
  `--env-file`/`NODE_OPTIONS`)
- `packages/web/.env.development.example` — **tracked, só nomes** (37 variáveis)
- `supabase/config.toml`

**Modificados (versionados):**
- `.gitignore` — removida a linha `.env*`; acrescentado `docs/audits/reset-testdb-duracao.json`
- `packages/web/.gitignore` — acrescentado `!.env.development.example`
- `package.json` (raiz) — `reset:testdb`, `supabase:check`
- `packages/web/package.json` — `dev:prod`, `build:teste`
- `packages/web/src/instrumentation.ts` — banner via `process.stderr.write`
- `packages/web/src/lib/env-banner.ts` — passa a derivar de `@trifold/shared` (PR #524)
- `packages/shared/src/index.ts` — exporta `constants/supabase-refs`
- `scripts/README.md` — estado padrão invertido, tabela de ambientes, reversão, nota sobre
  `db:apply` inexistente até a `900-3c`
- `scripts/reset-tenancy-testdb.ts` — dry-run default, `--confirmar`, retrato informativo,
  allowlist, `FALHAS_CONHECIDAS` estruturada + teto, `ASSERCOES`, verificação nos dois
  sentidos, medição de duração
- `.claude/CLAUDE.md` — bloco `### Environments` reescrito (as três linhas 385-387, juntas),
  com o aviso da CLI do `supabase`. **Autorizado pelo dono do produto**; procedência da
  autorização registrada na Completion Note 1.
- `.claude/agent-memory/aios-devops/reference_ci_surface_trifold.md` — manchete corrigida
- Migrados para `resolverAmbiente()` (16): `cleanup-duplicate-leads.ts`,
  `meta-backfill-leads.ts`, `backfill-campaign-entries.ts`, `backfill-criar-obras.ts`,
  `backfill-google-calendar.ts`, `backfill-meta-ad-insights.ts`,
  `backfill-vind-portal-invites.ts`, `backfill-yarden-portal-invites.ts`, `add-kb-entry.ts`,
  `run-seed.ts`, `seed-followup-rules.ts`, `seed-knowledge-base.ts`, `seed-prompts.ts`,
  `seed-properties.ts`, `seed-users.ts`, `dump-agent-prompts.ts`, `sync-obra-sienge.ts`

**Renomeados/criados fora do git (gitignored, invisíveis ao versionamento):**
- `packages/web/.env.local` → `packages/web/.env.producao.local` (+ bloco mesclado)
- `packages/web/.env.production.local` → `packages/web/.env.production.local.bak` (S7)
- `.env.local` → `.env.producao`
- `packages/web/.env.development` (novo, TESTE)
- `.env.teste` (novo, raiz, TESTE)
- `docs/audits/reset-testdb-duracao.json` (novo, gitignored por decisão S6/S13)

**Restaurados após contaminação por `gate:tenancy:snapshot`** (voltaram ao estado de
produção, `git checkout`): `docs/audits/schema-snapshot.json`,
`packages/web/src/lib/supabase/org-scoped-tables.generated.ts`

---

## QA Results

### Review Date: 2026-08-29
### Reviewed By: Quinn (Test Architect)
### Escopo revisado: commits `9d104e73`, `8295b814`, `f3f978e8` sobre a base `255e645a` — 37 arquivos

### Gate Status

Gate: **CONCERNS** → `docs/qa/gates/900.3b-ambiente-de-teste.yml`

**As 7 ACs estão cumpridas** e **todas as 7 mutações alegadas pelo `@dev` reproduzem com os números exatos**. O que segura o PASS é uma premissa factual falsa, herdada e nunca conferida por ninguém nas três rodadas: `supabase/.temp/project-ref` **não é gitignored — é rastreado**.

---

#### O que eu reproduzi (não aceitei)

| Mutação | Alegado | Medido por mim | Confere |
|---|---|---|---|
| `.gitignore` A — reintroduz `.env*` na raiz | 1 failed, só `.env.example` | 1 failed / 3 passed, só `.env.example` | ✅ |
| `.gitignore` B — remove a negação de `packages/web/` | 1 failed, só o positivo de `packages/web` | idem | ✅ |
| `.gitignore` C — negação na RAIZ (erro S3) | 1 failed | idem à B | ✅ |
| banner — colapsa `"ausente"` em `"ok"` | 10 failed | **10 failed / 12 passed** | ✅ |
| banner — `nodeEnv` morto | 3 failed | **3 failed / 19 passed** | ✅ |
| **allowlist += ref fictício (só `db-env.ts`)** | 1 de 11 no `supabase-check` | **1 failed / 10 passed**; `db-env` intacto em 16 | ✅ |
| allowlist esvaziada | 5 de 11 | **5 failed / 6 passed** | ✅ |
| AC4a — `supabase db push` em `packages/db/package.json` | régua acende | **exit 0; revertida → exit 1** (mutação minha) | ✅ |

A que mais importa é a do **reuso**: mexer *só* em `scripts/lib/db-env.ts` muda o veredito de `scripts/supabase-check.test.ts`. Se houvesse cópia local da lista, nada aconteceria. A AC4b está sustentada por medição, não por leitura.

**A e B derrubam casos diferentes** — os dois positivos do `.gitignore` não são colineares, exatamente como o `@po` previu.

#### Suíte, lint e tipos

- `pnpm test`: **271 arquivos · 3456 passed | 6 expected fail (3462) · 0 falhas.** Os 4 arquivos de teste novos são exatamente os 4 entregues e somam **53 casos**.
- ⚠️ `pnpm lint` e `pnpm type-check` voltaram **FULL TURBO (cache)**, com entradas geradas num worktree estranho (`scratchpad/wt-900-3`, prunable, de outra branch). **Refeito com `--force`:** type-check **8/8, 0 cached**; lint **0 errors / 36 warnings, 0 cached**. Os números do `@dev` se confirmam — mas um gate que aceita cache mede outra árvore (MNT-002).
- ✅ **`pnpm type-check` realmente não cobre `scripts/`** — nenhum `tsconfig` inclui o diretório e o alvo da raiz é `turbo type-check`, que só abre nos pacotes. Ponto cego real do CI, e esta fatia o **aumenta** (4 arquivos novos + 17 migrados). Registrado como MNT-001.

#### Reconciliações pedidas

- **12 × 9 `package.json`: fecham exatamente.** 12 rastreados; o glob devolve 9; os 3 ausentes são `.aios-core/package.json`, `.aios-core/development/templates/squad-template/package.json` e `.aios-core/scripts/diagnostics/health-dashboard/package.json` — todos sob `.aios-core/`, que a AC4a exclui de propósito. População varrida = **9 `package.json` + `ci.yml`**, não vazia, e **discriminante** (mutação acima). A régua não é vacuosa.
- **Números do `config.toml`: 22 prefixos duplicados · 11 `_remote_only.sql` · 4 com `CONCURRENTLY` · 267 migrations — todos conferem.** Nota de método: minha primeira contagem deu 20 por defeito do **meu** regex (`028a/028b`, `029a/029b` não casam `^[0-9]+_`). O número da story estava certo.
- **Renames e reversão: funcionam.** `.env.local` não existe mais (raiz e `packages/web`); `.env.production.local.bak` **preservado** (36 chaves); só **dois** arquivos de env são rastreados — `.env.example` e `packages/web/.env.development.example` —, e o `.example` tem **só nomes** (os 5 casamentos de `=.+` são comentário à direita, valor vazio). A assimetria de 59-vs-35 chaves está documentada com instrução de reversão byte-exata.
- **AC5, guarda de produção:** `TENANCY_TEST_SUPABASE_URL=<ref de produção> pnpm reset:testdb --confirmar`, com o PAT removido do ambiente, **abortou nomeando `REFS_PERMITIDOS_PRODUCAO`, exit 1, antes de ler qualquer credencial**. Dry-run é o default no código (retorna 0 antes de `limparStorage`/`resetarSchema`) e na execução.

#### As três substituições — julgadas, nenhuma recria o defeito

- **`next-com-env.mjs`** (no lugar de `node --env-file`): correta. Carrega com `util.parseEnv` **em processo**, sem flag de execução, logo nada vaza para `NODE_OPTIONS` dos filhos; sem dependência nova; e **falha alto** (exit 1 nomeando o caminho) quando o arquivo falta — não repete o silêncio que originou o D1.
- **`process.stderr.write`** (no lugar de `console.log`): correta. `next.config.ts:83` confirma `removeConsole: { exclude: ["error","warn"] }`. Os **três** estados falam, o `"ok"` inclusive.
- **Controle negativo rodando *com* a flag**: correta, e é a melhor decisão da story. O caso colinear original não foi apagado — foi **preservado e rotulado `[colinear]`**, onde quem comparar o teste com a AC vai encontrá-lo.

#### Segurança (R6/E3) — auditada por mim, não herdada

Varri a árvore rastreada **e os 3 commits** por `PGHOST=`, `PGPASSWORD=`, DSN `postgres(ql)://`, `pooler-url`, `sbp_`, `eyJ…`, `service_role`.

**Nenhum segredo vazou.** Zero `PGPASSWORD` com valor, zero JWT, zero PAT, zero DSN com credencial.

Mas a regra E3 foi aplicada **ao HEAD, não à branch** (SEC-001, medium):
- a linha crua de host (do bloco `export PG*` de `db dump --dry-run`, **não reproduzida**) entrou em `supabase/config.toml:16` pelo commit **`9d104e73`** e só saiu em **`f3f978e8`** — **continua no histórico da branch**;
- a **mesma linha crua** está viva em dois arquivos **rastreados** do `@po`, ainda não commitados: `docs/backlog.md:20` e `docs/qa/po-validation-900-3b.md:852`.

O host é derivado do ref, que é identificador público já versionado — o dano informacional é nulo. Mas a regra E3 é categórica, e **não pode valer só para quem a descobriu**. Squash no merge resolve o histórico; os dois arquivos do `@po` precisam de decisão antes do commit.

---

### 🔴 DOC-001 (high) — a premissa da AC4 é falsa, e ninguém conferiu em três rodadas

**`supabase/.temp/project-ref` NÃO é gitignored. É RASTREADO** — em `origin/main`, no commit-base `255e645a` e no `HEAD` — com o conteúdo `dsopqkqjkmhytudaaolv`, **produção**.

```
$ git ls-tree origin/main supabase/.temp/
100644 blob …  supabase/.temp/pooler-url
100644 blob …  supabase/.temp/postgres-version
100644 blob …  supabase/.temp/project-ref
100644 blob …  supabase/.temp/storage-migration
```

O padrão `supabase/.temp/` existe no `.gitignore` (linha 36), **mas é inerte para caminhos já rastreados** (adicionados em `0b6e1baf`). É **exatamente o mesmo defeito que esta story conserta para o `.env.example`** — um arquivo que só sobrevive versionado porque foi commitado antes da regra existir. `git check-ignore --no-index` diz "ignorado"; `git check-ignore` simples diz que não — porque está no índice.

**Isto não foi introduzido por esta story.** Mas a story **afirma o contrário em três arquivos rastreados que ela cria ou edita**: `supabase/config.toml` (linha 22), `scripts/supabase-check.ts` (linha 8) e **`.claude/CLAUDE.md`** — este último editado justamente sob a régua S1 do `@po`, "as três linhas têm que ser verdadeiras ao mesmo tempo". A story que existe para consertar documentos que mentiam publica uma mentira nova.

**E muda a resposta da pergunta que a Rodada 3 arbitrou.** Comparar com a `900-22b` só vale quando o vermelho mede estado real *e o conserto tem dono*. Aqui o dono não é a máquina: o repositório **não está deixando de governar** o link — ele está **ativamente entregando produção como projeto linkado a todo clone**. `pnpm supabase:check` não nasce vermelho "por estado desta máquina"; nasce vermelho **para todo mundo, por conteúdo do repositório**. E existia uma **quarta opção** que ninguém avaliou, porque todos criam o arquivo ser por máquina: `git rm --cached supabase/.temp/` (a regra de ignore já está lá e passaria a valer), ou versionar o ref de teste.

Efeito colateral prático: o conserto prescrito (`supabase link --project-ref xnxvygyfyyyzwhiuoehz`) **suja arquivos rastreados** e pode ser commitado por acidente, virando o default de todo mundo. E `supabase/.temp/pooler-url`, também rastreado, guarda um DSN de produção (sem senha) — a classe exata de artefato que a R6/E3 existe para eliminar, que a auditoria não viu porque foi escopada ao que o `@dev` colou, nunca ao que já estava lá.

**O desenho da régra continua certo** (tornar audível, no padrão do banner da AC2). O que precisa mudar é o texto em volta dela — três edições de comentário — mais um item para `@devops`/`@po` decidirem sobre desrastrear `supabase/.temp/`, candidato natural à `900-3c`.

---

### Achados menores

| ID | Sev | Achado |
|---|---|---|
| SEC-001 | medium | E3 aplicada ao HEAD, não à branch; linha crua viva em `docs/backlog.md:20` e `po-validation-900-3b.md:852` (arquivos do `@po`, rastreados, não commitados). Sem vazamento de segredo. |
| TEST-001 | low | A baseline da DoD não fecha: 3462 − 53 = **3409** pré-existentes, contra os **3413** registrados. Nenhum teste pré-existente foi modificado, então essa contagem não podia ter mudado. A aritmética do próprio `@dev` tem a mesma lacuna ("+42" para operandos que somam 38). A alegação de fundo se sustenta: **0 falhas**. |
| MNT-001 | low | `pnpm type-check` sem cobertura de `scripts/` — confirmado. Vale story derivada (`tsconfig.scripts.json` + alvo no job `static`). |
| DOC-002 | low | `scripts/README.md:27` ainda diz que `dev:prod` lê o env "via `node --env-file`" — o mecanismo que esta mesma story mediu como inoperante. |
| MNT-002 | low | Cache do turbo vindo de `scratchpad/wt-900-3` (worktree prunable de outra branch). Gates futuros: `--force`. |

### Nota de método (minha, não do `@dev`)

Duas das minhas mutações, escritas por `perl`/`node -e` no Bash, **relataram sucesso e não alteraram o arquivo** — e as suítes passaram verdes. Se eu tivesse parado ali, teria reprovado o `@dev` por "mutação inerte" que era minha. Só a asserção de `git diff` mais leitura do arquivo em disco *no momento da execução* pegou. **Mutação sem prova de aplicação é alegação** — vale para mim igual.

Árvore restaurada byte a byte ao fim de cada mutação (`git status` limpo, verificado).

### Recomendação

**CONCERNS.** Liberar após corrigir **DOC-001** (edição de texto em 3 arquivos, barata) e decidir **SEC-001**. DOC-002 e TEST-001 cabem no mesmo passe. MNT-001 vira story derivada. Não recomendo FAIL: as 7 ACs estão genuinamente cumpridas, a evidência reproduz linha a linha, e o mecanismo entregue está correto — o que está errado é a narrativa que o justifica.

— Quinn, guardião da qualidade 🛡️

---

## QA Results — 2ª rodada (reavaliação após `f736355e`)

### Review Date: 2026-08-29 · Reviewed By: Quinn (Test Architect)

### Gate Status

Gate: **PASS** → `docs/qa/gates/900.3b-ambiente-de-teste.yml`

Os 6 achados estão fechados. Não me limitei a conferir as correções: a árvore mudou (4 arquivos fora do índice, 5 arquivos de doc editados), então repeti a varredura independente — e ela produziu um achado novo, fora do escopo desta fatia.

#### DOC-001 (high) — fechado, e provado com clone de verdade

| Verificação | Resultado |
|---|---|
| `git ls-files supabase/.temp/` | **0 arquivos** |
| `git ls-tree HEAD~1 supabase/.temp/` | 4 (era o estado anterior) |
| Arquivos em disco | **todos preservados**; `project-ref` com SHA-256 `e8793fe3d3c6910c`, idêntico ao que medi na 1ª rodada |
| Conteúdo do `project-ref` | inalterado (`dsopqkqjkmhytudaaolv`) |
| `git check-ignore` (sem `--no-index`) | **1 → 0** |
| `git diff HEAD~1 HEAD -- .gitignore` | **vazio** — a regra é a mesma; **só o índice mudou** |

Essa última linha é a que fecha o mecanismo: a regra `.gitignore:36` sempre casou; ela era **inerte** porque o caminho estava no índice. `git check-ignore` **sem** `--no-index` responde sobre o índice, não sobre as regras — por isso mentia. **Isso justifica retroativamente o `--no-index` do `scripts/gitignore-env.test.ts`**: sem a flag, aquela régua não enxergaria esta classe de caso.

**Clone novo — testei com `git clone` de verdade, não com mock:**

```
supabase/.temp existe no clone?  NÃO
$ (cd clone && tsx scripts/supabase-check.ts)
[supabase:check] NÃO LINKADO — não há supabase/.temp/project-ref.
  Este é o estado SEGURO: ... "Cannot find project ref. Have you run `supabase link`?"
exit=0
```

**Fail-closed confirmado para todo mundo.** Nesta máquina segue `exit 1` nomeando produção — que é o estado audível, e está certo. Os dois estados se comportam como a AC4b descreve.

**A régua do `gitignore-env.test.ts` continua acendendo** depois da mudança de estado do índice — reexecutei as mutações A e B, cada uma com recibo (`git diff --numstat`) antes de rodar: `1 failed / 3 passed` em cada, derrubando casos diferentes.

#### SEC-001 — fechado, com um residual nomeado para o @devops

`git grep 'PGHOST="db\.'` em toda a árvore rastreada: **nenhuma ocorrência** — inclusive no parecer do `@po` e **no meu próprio gate file**, onde eu havia reproduzido a linha. A regra R6 valendo para quem a escreveu é a leitura certa.

**`pooler-url` auditado por mim, independentemente**, já que era o pior caso possível:

```
usuário : comprimento 29
SENHA   : AUSENTE (sem separador ':') | comprimento 0
host    : comprimento 40
veredito: SEM COMPONENTE DE SENHA
```

Confirmado. E nas linhas **adicionadas** por `f736355e`: zero segredo, zero saída crua.

**Residual:** a linha crua segue no **histórico** da branch (`9d104e73`). Squash no merge apaga; merge-commit preserva. Item obrigatório para o `@devops`.

#### TEST-001 — ele tem razão, e eu medi

Excluí as 4 suítes novas da árvore e rodei: **267 arquivos · 3403 passed | 6 expected fail = 3409**. E **3409 + 53 = 3462**, exatamente o total atual. O `3407` registrado era erro de **rótulo**, não de medição — já continha os 4 casos do `gitignore-env.test.ts`, criado antes daquela primeira execução. Aritmética fechada.

#### DOC-002 · MNT-001 · MNT-002

- `scripts/README.md` não instrui mais `node --env-file`; a tabela nomeia `next-com-env.mjs`. `grep` na árvore: nenhuma ocorrência.
- `MNT-001` foi para o backlog **com a medição** de por que não é conserto de passagem (apontar o tsconfig raiz para `scripts/` expõe erros pré-existentes de resolução de módulo e `noImplicitAny`). Aceito como dívida.
- `MNT-002`: refiz com `--force` — type-check **8/8, `0 cached, 8 total`**; lint **0 errors / 36 warnings, `0 cached`**; suíte **271 arquivos / 3456 passed | 6 expected fail**.

#### Régua S1 do `@po` — as três linhas verdadeiras ao mesmo tempo

Não me contentei com o `grep -c` = **0**; conferi cada afirmação do bloco contra o disco: `.env.development` tem o ref de teste e **zero** ocorrências do de produção; `.env.producao.local`, `.env.teste` e `.env.producao` conferem; `.env.local` **não existe** em nenhum dos dois lugares; `db-env.ts` lê o par declarado. As três são verdadeiras simultaneamente.

Nota: `scripts/README.md:71` ainda diz "gitignored, por máquina" — e agora isso é **verdade**, produzida pelo próprio conserto. Não é resíduo.

### 🟡 Achado novo — MNT-003 (low, fora do escopo desta fatia)

Generalizei o método que produziu o DOC-001 e varri **todos** os arquivos rastreados contra as regras de ignore:

```bash
git ls-files | git check-ignore --no-index --stdin -v
```

6 casamentos. Quatro são benignos (as 2 negações intencionais de `.env*.example`; 2 `package-lock.json` sob `.aios-core/`). **Sobra um caso real da mesma classe:** `packages/web/src/app/dashboard/sistema/logs/{layout,page}.tsx`, casados pela regra ampla `.gitignore:20 logs/`. Os dois sobrevivem porque já estão no índice — mas **qualquer arquivo novo criado nesse diretório de código-fonte seria silenciosamente inadicionável**, que é exatamente o modo de falha do `.env.example` que a AC1 consertou.

Pré-existente, não introduzido por esta story, **não bloqueia**. Vai para o backlog. O comando de varredura acima cabe num gate futuro — custa uma linha e teria pego o `supabase/.temp/` três rodadas antes.

### Veredito

**PASS.** As 7 ACs cumpridas, todas as mutações reproduzidas com recibo de aplicação, suíte/lint/tipos verdes sem cache, aritmética fechada, e o achado de segurança da rodada anterior corrigido na raiz — não no sintoma. A correção do DOC-001 tornou o repositório melhor do que a story prometia: em vez de tornar audível um estado ruim, eliminou o estado ruim para todo clone futuro, e manteve a régua audível para quem já tem o arquivo.

Registro que o `@dev` tomou minha nota de método como vinculante e passou a exigir recibo de aplicação em toda edição. Fiz o mesmo aqui: cada mutação desta rodada foi confirmada por `git diff --numstat` **antes** de eu ler qualquer resultado.

— Quinn, guardião da qualidade 🛡️

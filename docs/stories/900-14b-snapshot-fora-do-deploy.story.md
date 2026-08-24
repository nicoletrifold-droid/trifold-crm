# Story 900-14b — Tirar `org-scoped-admin.ts` de dentro de `docs/`

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 1 — Isolamento
- **Story:** 900-14b — hotfix do artefato criado pela `900-14`
  > **ID renumerado pelo @po em 2026-08-24 (era `900-15`).** `900-15` está reservada, e referenciada
  > em artefatos já publicados, para a **migração das 129 rotas** + promoção da regra ESLint a
  > `error`: epic §9.3 (`createOrgScopedAdminClient() … 900-15 (migra as rotas; ESLint warn →
  > error)`), risco **R1** do epic, `docs/audits/admin-client-allowlist.json`,
  > `docs/qa/epic-900-po-validation.md`, o texto da `900-14` e o comentário em
  > `packages/web/eslint.config.mjs`. Manter o hotfix como `900-15` invalidaria todos eles — em
  > especial o comentário no código, que passaria a apontar para uma story que **não** promove a
  > regra. O sufixo `b` segue a convenção do próprio epic (`900-27a/b`, `900-42a/b`).
- **Status:** Done — **PR #493 mergeado** (squash `8a2e76d0`) e **deploy de produção confirmado READY** em 2026-08-24: `dpl_B3AF4nJBRTd6oyQUuigFHgyyGE2u`, `target: production`, `readyState: READY`, SHA `8a2e76d093eabdc84cfc23fa10ebc2404fc839b1`, `ref: main`, pronto às 14:08:16Z. **Incidente encerrado** — produção estava parada desde `a5517c56d` (23/08 12:46 BRT), ~37h e 4 deploys de produção em ERROR. AC1-AC4 e AC7 fechados; **AC5 e AC6 fora de escopo** por corte do usuário (riscos aceitos RA1/RA2, não pendências).
- **Priority:** P0 — HOTFIX. Produção não recebe deploy desde 2026-08-23 12:46.
- **Complexity:** S
- **Created:** 2026-08-24
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)

---

## Contexto — o build da Vercel está vermelho há três deploys

`packages/web/src/lib/supabase/org-scoped-admin.ts`, criado pela `900-14`, importa
`docs/audits/schema-snapshot.json` subindo cinco níveis de diretório
(`../../../../../docs/audits/schema-snapshot.json`). O `.vercelignore` da **raiz do repo** lista
`docs`. O arquivo existe no working tree — por isso `pnpm build` local e o CI do GitHub passam —,
mas não é enviado ao build da Vercel, que falha com `Cannot find module`.

Confirmado na API da Vercel: os três últimos deploys de produção estão em `ERROR`, começando pelo
próprio PR da `900-14`. Os PRs #489, #490 e #491 já foram mergeados na `main` com esse check
vermelho — 900-11, 900-14, o pré-aviso do bolsão (`75-366`) e o fix de mídia do WhatsApp estão
prontos no repositório e nunca chegaram a produção. O PR #492 (`75-367`, trava do relatório
semanal duplicado) vai falhar pelo mesmo motivo assim que a Vercel tentar o build — e o próximo
agendamento do relatório é domingo, 2026-08-30 02:00 UTC.

**O que esta story não pode fazer:** desfazer a garantia central da `900-14` — a lista de tabelas
com `org_id` continuar **derivada do snapshot, não escrita à mão** ("uma lista manual nasce
correta e apodrece", ver Dev Notes daquela story). A correção é sobre *onde* o código de aplicação
busca esse dado, não sobre voltar a um array digitado.

---

## Decisão de desenho — por que codegen e não `.vercelignore`

Três alternativas foram descartadas:

- **Remover `docs` do `.vercelignore`:** `docs/` tem **66 MB** no working tree (medido em
  2026-08-24). Empurrar isso para todo build da Vercel por causa de um único arquivo de 194 KB é
  desproporcional e reintroduz o mesmo risco para o próximo import perdido dentro de `docs/`.
- **Negação em cascata no `.vercelignore`** (`docs/*` + `!docs/audits` + `docs/audits/*` +
  `!docs/audits/schema-snapshot.json`): funciona, mas é frágil — a sintaxe é a do `.gitignore`,
  onde reordenar ou tocar uma linha da escada quebra o padrão em silêncio, sem erro visível até o
  próximo deploy falhar.
- **Mover o snapshot para dentro de `packages/web/`:** o snapshot é artefato de auditoria
  versionado, consumido também por `scripts/gate-tenancy.ts` rodando a partir da raiz do repo.
  Mudar seu lugar canônico para servir a um único consumidor de aplicação inverte a
  responsabilidade errada.

**Escolha: codegen.** `scripts/generate-schema-snapshot.ts` passa a emitir, a partir do mesmo
schema já introspectado, um segundo artefato dentro da árvore que a Vercel carrega:
`packages/web/src/lib/supabase/org-scoped-tables.generated.ts`. `org-scoped-admin.ts` importa esse
módulo em vez do JSON em `docs/`. `scripts/gate-tenancy.ts` não muda — continua lendo
`docs/audits/schema-snapshot.json` diretamente, na raiz, onde já funciona.

Isso preserva a garantia da `900-14` (fonte única, derivada por introspecção) e resolve o segundo
problema que o import carregava de brinde: 194 KB de JSON de auditoria não têm por que entrar no
bundle de uma rota Next.js quando o que se usa dali é só a lista de nomes das tabelas com
`org_id` — **92 de 120 tabelas**, medido no snapshot de 2026-08-23 (`capturedAt`
`2026-08-23T12:39:14.292Z`, `source: management-api`).

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** que `packages/web` pare de depender de um arquivo fora da árvore que a Vercel envia para
o build,
**Para que** o deploy de produção volte a funcionar sem abrir mão de a lista de tabelas com
`org_id` continuar derivada do snapshot, nunca escrita à mão.

---

## Scope

### IN
- Gerar `packages/web/src/lib/supabase/org-scoped-tables.generated.ts` a partir do mesmo schema
  introspectado por `scripts/generate-schema-snapshot.ts`.
- Trocar o import em `org-scoped-admin.ts` de `docs/audits/schema-snapshot.json` para o novo
  módulo gerado.
- Um check de sincronia que falha se o `.generated.ts` divergir do `schema-snapshot.json`
  commitado (ver AC5).
- Uma regra de lint/CI que impede um novo import de `packages/web/src` apontando para fora da
  árvore que o `.vercelignore` libera (ver AC6).
- Confirmar, via preview deployment de um PR real, que o build da Vercel passa.

### OUT
- Migrar as 129 rotas com `createAdminClient()` cru — isso é trabalho de outra story, não muda
  aqui.
- Qualquer alteração em `scripts/gate-tenancy.ts` ou no formato de `schema-snapshot.json` — o gate
  continua exatamente como está.
- O PR #492 / `analytics-report` (Story `75-367`) — ele sobe sozinho quando este hotfix destravar
  o pipeline; não é tocado aqui.
- Reprocessar ou reenviar manualmente os deploys que ficaram em `ERROR` — eles são re-triggerados
  pela própria Vercel ou por `@devops` depois que este fix estiver em `main`, não fazem parte do
  escopo de código desta story.
- Qualquer mudança de comportamento em `createOrgScopedAdminClient()` — mesma lista de tabelas,
  mesmo comportamento de `select`/`insert`/`update`/`delete`.
- **Promover `aios/no-unscoped-admin-client` de `warn` para `error`** — isso é da story de migração
  (`900-15`) e continua fora daqui. A regra em `error` do AC6 é **outra** regra, de import; a regra
  do client cru **não é tocada**.
- Fechar a lacuna de frescor entre `docs/audits/schema-snapshot.json` e o schema real do banco —
  lacuna **anterior** a esta story, registrada em Dev Notes e no backlog, não resolvida por um
  hotfix de build.

---

## Acceptance Criteria

- [x] **AC1 — O import problemático desaparece:** `packages/web/src/lib/supabase/org-scoped-admin.ts`
  não contém mais nenhum import literal apontando para fora de `packages/web/src` (em particular,
  nenhuma referência a `docs/audits/schema-snapshot.json`).

- [x] **AC2 — Novo módulo gerado, não escrito à mão:** `packages/web/src/lib/supabase/org-scoped-tables.generated.ts`
  existe, é produzido por `scripts/generate-schema-snapshot.ts` a partir do schema já
  introspectado (mesma fonte do JSON), e traz um cabeçalho identificando-o como gerado — não deve
  ser editado manualmente.

- [x] **AC3 — `TABELAS_COM_ORG_ID` não muda de comportamento:** a lista de tabelas que
  `createOrgScopedAdminClient()` considera "com `org_id`" é idêntica, item a item, à que vinha do
  JSON antes desta story. Os 17 casos existentes em `org-scoped-admin.test.ts` continuam passando
  sem alteração das expectativas (13 blocos `it`, dos quais um é `it.each` de 4 casos — conferido
  pelo @po em 2026-08-24).
  **Prova de paridade obrigatória, porque os testes não a dão:** os 3 asserts de
  `"a lista vem do snapshot, não de array manual"` verificam apenas `leads` = true,
  `organizations` = false e tabela inexistente = false — um array escrito à mão com esses dois
  nomes passaria igual. Então o @dev registra no Dev Agent Record a comparação **item a item**
  entre o conjunto derivado do JSON e o do módulo gerado: contagem esperada **92 tabelas com
  `org_id` de 120** (snapshot de 2026-08-23) e diff vazio nos dois sentidos. Sem esse número no
  registro, o AC3 não fecha.

- [x] **AC4 — `gate-tenancy.ts` inalterado:** `scripts/gate-tenancy.ts` continua lendo
  `docs/audits/schema-snapshot.json` diretamente pelo mesmo caminho de hoje; nenhuma linha desse
  arquivo muda.

- [-] **AC5 — FORA DE ESCOPO** (cortado pelo usuário em 2026-08-24 — ver Dev Agent Record → "Corte de escopo"). Texto original preservado como registro do que foi planejado e depois retirado. ~~Check de sincronia entre o JSON e o `.generated.ts`:~~ existe um comando (ex.:
  `pnpm check:org-scoped-tables-sync`) que regenera o `.generated.ts` a partir do
  `docs/audits/schema-snapshot.json` **já commitado** — sem exigir `SUPABASE_MANAGEMENT_PAT`, sem
  acessar o banco — e falha (`exit 1`) se o resultado difer do arquivo commitado. Esse comando roda
  no job **`static`** (`type-check · lint · test`) do `.github/workflows/ci.yml` — e **não** no job
  `tenancy-gate`, que é `continue-on-error: true` e portanto não trava PR nenhum: um check de
  sincronia dentro dele seria decorativo. Isso é o que impede o `.generated.ts` de ficar defasado em
  silêncio caso alguém regenere o snapshot e esqueça de rodar a geração do módulo.
  **Uma única transformação, usada pelos dois caminhos:** a função que emite o `.generated.ts` a
  partir de um objeto de schema é a **mesma** chamada por `generate-schema-snapshot.ts` (a partir da
  introspecção ao vivo) e pelo check de sincronia (a partir do JSON commitado). Duas
  implementações da mesma regra podem divergir entre si, e aí o check verde não prova nada.
  **Limite honesto deste AC, que ele não pode fingir cobrir:** ele garante
  `.generated.ts` ≡ `schema-snapshot.json` **commitado** — não garante que o JSON esteja em dia com
  o banco. Ver Dev Notes, "O que o AC5 não cobre".

- [-] **AC6 — FORA DE ESCOPO** (cortado pelo usuário em 2026-08-24 — ver Dev Agent Record → "Corte de escopo"). Texto original preservado como registro. ~~Regressão: nada em `packages/web/src` pode voltar a importar de fora da árvore buildável.~~ Uma regra de lint (built-in `no-restricted-imports` do ESLint ou uma regra `aios`
  dedicada, a critério de @dev) em **`error`** — não `warn`, porque não há legado a migrar, esta é
  a única ocorrência e ela está sendo removida nesta mesma story — bloqueia import relativo de
  `packages/web/src` para qualquer diretório listado no `.vercelignore` da raiz (`docs`,
  `scripts`, `bin`, `.aios-core`, `.claude`, `.github`, …). Prova: criar um arquivo temporário
  com um import desse tipo produz **erro** de lint; removê-lo, `pnpm lint` roda limpo.
  **`error` desde o dia zero é seguro — verificado pelo @po em 2026-08-24:** a varredura de
  `packages` inteiro encontra **uma única** ocorrência (`org-scoped-admin.ts:33`), que é justamente
  a removida por esta story; não há diretório chamado `docs`/`scripts`/`bin` dentro de
  `packages/web/src` para gerar falso positivo. A regra tem de mirar o **destino** do import, nunca
  a profundidade de `../`: `packages/web/src/app/api/cron/followup/notify-alert.test.ts:25` importa
  `"../../../../lib/broker/notify-stalled-lead"` legitimamente e precisa continuar passando.
  **A regra `aios/no-unscoped-admin-client` continua em `warn`** — o `error` deste AC é da regra de
  import, e só dela. Promover a outra é da `900-15`.

- [x] **AC7 — Provado no build da Vercel, não só local:** o defeito só aparecia lá — a prova tem
  que ser lá. O PR desta story precisa gerar um preview deployment da Vercel com status `READY`
  (verificável via API/dashboard da Vercel, o mesmo canal usado para diagnosticar o incidente).
  `pnpm build`, `pnpm lint` e `pnpm test` passando localmente **não** fecham este AC sozinhos.
  **Evidência exigida, colada no Dev Agent Record — sem ela o AC não fecha e o @qa reprova:**
  (a) o `uid` do deployment (`dpl_…`); (b) `readyState: READY` lido da API; (c) o SHA do commit em
  que esse deployment foi construído, **igual ao HEAD do PR** — um preview `READY` de um commit
  anterior não prova nada; (d) o número do PR. O deployment em `ERROR` que abriu o incidente
  (`dpl_98TWKtMVwocWNdim1aAyhTM1VWe7`) serve de contraprova: é o mesmo canal, lido do mesmo jeito.

---

## Tasks / Subtasks

- [x] **T1** — Estender `generate-schema-snapshot.ts` para emitir `org-scoped-tables.generated.ts`
  a partir do mesmo `schema` já introspectado (AC2)
- [x] **T2** — Trocar o import em `org-scoped-admin.ts` para o módulo gerado; remover a
  dependência de `docs/` (AC1, AC3)
- [-] **T3** — ~~Criar o comando de sincronia (regeneração pura a partir do JSON commitado + diff) e
  plugá-lo no workflow de CI (AC5)~~ — **fora de escopo**: implementado e depois revertido no corte
  de 2026-08-24 (ver Dev Agent Record → "Corte de escopo")
- [-] **T4** — ~~Adicionar a regra de lint em `error` contra import de `packages/web/src` para fora
  da árvore buildável (AC6)~~ — **fora de escopo**: implementada e depois revertida no corte de
  2026-08-24 (ver Dev Agent Record → "Corte de escopo")
- [x] **T5** — Rodar `pnpm gate:tenancy:snapshot` uma vez para gerar o `.generated.ts` inicial e
  commitá-lo (AC2, AC3)
- [x] **T6** — Abrir o PR e confirmar `READY` no preview deployment da Vercel (AC7) — **PR #493**, previews `dpl_CnrxHUUK454pMLomtY4CQ2NCtv2k` e `dpl_CpQaifik2s2H8yjQhA2FdrJ5i5ZK` ambos `READY`

---

## Dev Notes

**Por que o check de sincronia não pode exigir banco.** `scripts/gate-tenancy.ts` e
`generate-schema-snapshot.ts` normalmente precisam de `SUPABASE_MANAGEMENT_PAT` para introspectar
o schema ao vivo. Exigir isso do check de CI desta story acoplaria um hotfix de build a
credenciais de produção. O check do AC5 é uma transformação pura — lê o
`schema-snapshot.json` já commitado no PR e regenera o `.generated.ts` a partir dele, sem tocar no
banco — por isso roda em qualquer PR, inclusive de fork.

**Onde a regra de lint deve mirar.** O objetivo não é proibir todo import fora do pacote — código
legítimo importa de `@trifold/shared`, `@trifold/ai` etc. via workspace. O alvo específico é import
**relativo** (`../`, `../../`, …) que escapa de `packages/web/src` na direção de diretórios que o
`.vercelignore` da raiz exclui do build (`docs`, `scripts`, `bin`, `.aios-core`, …). Vale checar se
o `no-restricted-imports` do ESLint (opção `patterns`, que aceita glob) resolve sem precisar de uma
regra `aios` nova — é hotfix, prefira a ferramenta que já existe.

**O que não se discute.** O comentário de `org-scoped-admin.ts` sobre por que a lista de tabelas
vem do snapshot ("um array manual nasce correto e apodrece") continua verdadeiro depois desta
story — só muda o arquivo de onde o TypeScript lê esse dado em runtime de aplicação. Se a
implementação resultar em qualquer lista de tabelas escrita à mão dentro de `packages/web`, a
story não cumpriu o próprio objetivo.

**O que o AC5 não cobre — e por que isso não é regressão desta story.** O check compara o módulo
gerado com o **JSON commitado**. Se o JSON estiver velho em relação ao banco, os dois ficam
consistentes e igualmente desatualizados. Isso **já era verdade antes desta story**: a `900-14` lia
o mesmo JSON commitado, então o frescor da lista sempre dependeu de alguém rodar
`pnpm gate:tenancy:snapshot`. O que o codegen acrescenta é um **segundo** artefato, e portanto um
risco novo de divergência entre os dois — e é exatamente esse risco, e só ele, que o AC5 fecha.
Nenhum gate hoje compara a introspecção ao vivo com o snapshot commitado: `gate-tenancy` introspecta
ao vivo e a R3 acusa **tabela nova sem `org_id`**, mas uma tabela nova **com** `org_id` que não
entrou no snapshot passa em silêncio — e o efeito é o client deixar de escopá-la. Ainda por cima o
job `tenancy-gate` é `continue-on-error: true`. Portanto: não afirmar em nenhum lugar que esta story
garante frescor. Ela garante **consistência**. O check de frescor (comparar introspecção ao vivo com
o snapshot e falhar no diff) vai para o backlog como item próprio, para a story de migração ou para
a `900-18`, que é quem torna o gate bloqueante.

**Cuidado com o guard de `argv` ao reusar o gerador.** `scripts/generate-schema-snapshot.ts` termina
com `if (process.argv[1]?.includes("generate-schema-snapshot")) main()`, e `main()` **exige**
`SUPABASE_MANAGEMENT_PAT` e aborta sem ele. Importar a função de emissão desse arquivo é seguro —
mas o script do check de sincronia **não pode** ter um nome cujo caminho contenha
`generate-schema-snapshot`, senão o guard dispara e o check de CI passa a pedir credencial de
produção, contrariando o próprio AC5. Nome sugerido: `scripts/check-org-scoped-tables-sync.ts`.

**Sobre os deploys presos.** Depois que este fix estiver em `main` e a Vercel confirmar um build
de produção `READY`, os commits que ficaram atrás (900-11, 900-14, `75-366`, o fix de mídia do
WhatsApp) sobem juntos no próximo deploy — não é necessário nenhum passo extra de código para
"reenviá-los". Se algum re-trigger manual for necessário, é operação de `@devops`, fora do escopo
desta story. **Mas o incidente só fecha com um deployment de _produção_ `READY`** — o AC7 pede o
preview porque é o que o PR pode provar antes do merge; confirmar a produção depois do merge é
handoff explícito para `@devops`, não AC desta story.

---

## File List (esperada — caminhos conferidos pelo @po em 2026-08-24)

| Arquivo | Estado | Papel |
|---|---|---|
| `scripts/generate-schema-snapshot.ts` | existe, **modificar** | passa a emitir também o módulo gerado (T1) |
| `packages/web/src/lib/supabase/org-scoped-tables.generated.ts` | **novo, commitado** | o módulo que a Vercel enxerga. Não está coberto por nenhum padrão do `.gitignore` — conferido; se não for commitado, o build quebra do mesmo jeito |
| `packages/web/src/lib/supabase/org-scoped-admin.ts` | existe, **modificar** | linha 33: trocar o import do JSON pelo módulo gerado (T2) |
| `scripts/check-org-scoped-tables-sync.ts` | **novo** | check de sincronia sem banco (T3) |
| `package.json` (raiz) | existe, **modificar** | novo script ao lado de `gate:tenancy:snapshot` (T3) |
| `.github/workflows/ci.yml` | existe, **modificar** | passo novo no job `static` (linhas 27-90), não no `tenancy-gate` (T3) |
| `packages/web/eslint.config.mjs` | existe, **modificar** | regra de import em `error`; **não** mexer no `warn` da linha 26 (T4) |
| `packages/web/src/lib/supabase/org-scoped-admin.test.ts` | existe, **não alterar expectativas** | os 17 casos são a rede de segurança do AC3 |
| `scripts/gate-tenancy.ts` | existe, **intocado** | AC4 |
| `docs/audits/schema-snapshot.json` | existe (194 KB, 120 tabelas), **intocado** | fonte da verdade do check de sincronia |

## Dev Agent Record

_A preencher pelo @dev. Obrigatórios para fechar a story: o diff de paridade do AC3 (com a contagem
92/120), a evidência do AC7 (`dpl_…`, `readyState`, SHA = HEAD do PR, nº do PR) e a prova do AC6
(arquivo temporário sinalizado como `error`, depois `pnpm lint` limpo)._

### Agent Model Used
`claude-opus-5[1m]` — @dev (Dex), `*develop` em modo YOLO, 2026-08-24.

### Corte de escopo — AC5 e AC6 retirados (2026-08-24)

**Decisão do usuário, não falha técnica.** A story foi reduzida ao mínimo necessário para destravar
o build da Vercel. AC5 (check de sincronia no CI) e AC6 (regra de lint contra import fora da árvore
buildável) **saíram do escopo**; T3 e T4 saíram com eles.

O que **fica** — e é o fix de verdade:

| Arquivo | Papel |
|---|---|
| `packages/web/src/lib/supabase/org-scoped-tables.generated.ts` | módulo com os 92 nomes, dentro da árvore que a Vercel envia |
| `packages/web/src/lib/supabase/org-scoped-admin.ts` | importa o módulo em vez do JSON de `docs/` |
| `scripts/generate-schema-snapshot.ts` | emite o módulo junto com o JSON, da mesma captura |

O que foi **revertido do working tree** (implementado antes do corte, hoje inexistente):

| Artefato | Estado |
|---|---|
| `.github/workflows/ci.yml` | revertido — não há passo de CI |
| `packages/web/eslint.config.mjs` | revertido — não há regra `no-restricted-imports` |
| `package.json` (raiz) | revertido — não há script `check:org-scoped-tables-sync` |
| `scripts/check-org-scoped-tables-sync.ts` | apagado |
| `scripts/org-scoped-tables-emissao.test.ts` | apagado (7 casos) |

**Consequência assumida, e escrita no código:** não existe check automático garantindo que
`org-scoped-tables.generated.ts` esteja em sincronia com `docs/audits/schema-snapshot.json`. O que
os mantém alinhados é o gerador — `main()` grava os dois a partir da **mesma** captura, numa única
execução de `pnpm gate:tenancy:snapshot`. Quem regenerar o snapshot atualiza os dois artefatos
juntos porque saem da mesma foto; quem editar o `.generated.ts` à mão desalinha em silêncio.
Também não existe mais barreira de lint impedindo um import novo de `packages/web/src` para fora
da árvore buildável — o defeito desta story pode voltar a ser introduzido.

**Comentários corrigidos no mesmo corte.** Os cabeçalhos e docblocks citavam
`pnpm check:org-scoped-tables-sync` como verificação bloqueante do CI, que não existe mais — um
comentário que promete garantia inexistente é pior que nenhum comentário. Reescritos em
`org-scoped-admin.ts`, no template dentro de `generate-schema-snapshot.ts` e no
`org-scoped-tables.generated.ts` para declarar a limitação como limitação. `grep` por
`check-org-scoped-tables-sync` no repo agora só encontra este arquivo de story.

**Prova de que o template e o arquivo gerado continuam equivalentes.** O cabeçalho do
`.generated.ts` é emitido pelo template dentro de `renderOrgScopedTablesModule()`; regerar de
verdade exigiria `SUPABASE_MANAGEMENT_PAT`. A mudança foi aplicada nos dois e a equivalência
medida alimentando `renderOrgScopedTablesModule()` com o snapshot **já commitado** (a mesma captura
de onde o arquivo saiu) e comparando com os bytes do arquivo commitado:

```
template renderizado : 3321 bytes
arquivo commitado    : 3321 bytes
byte-idênticos       : SIM
determinístico       : SIM   (renderizar duas vezes → mesmos bytes)
snapshot hasOrgId    : 92 de 120
nomes no módulo      : 92
```

O script da prova é descartável e ficou **fora do repo**
(`…/scratchpad/prove-equivalencia.ts`), porque nada nesta story pede um artefato novo — e um
script sem check de CI para rodá-lo seria mais um comentário prometendo garantia.

### Resumo da implementação

`scripts/generate-schema-snapshot.ts` ganhou **uma** função de emissão pura,
`renderOrgScopedTablesModule(schema) → string`, e um invólucro `writeOrgScopedTablesModule()`. O
`main()` do gerador chama esse invólucro com **o mesmo objeto `schema`** que acabou de virar o JSON —
os dois artefatos saem obrigatoriamente da mesma captura, e é isso (e só isso, depois do corte de
escopo) que os mantém alinhados. A função é pura e determinística, então qualquer coisa com a forma
de `SchemaParaEmissao` — inclusive o JSON já commitado — reproduz o mesmo arquivo byte a byte.

`org-scoped-admin.ts` passou a importar `./org-scoped-tables.generated`. O corpo da função e o
comportamento de `select`/`insert`/`update`/`delete` não mudaram uma linha — só a origem da lista.

### AC3 — prova de paridade item a item (92 de 120)

Comparação entre o conjunto derivado do JSON pela expressão **antiga** (`tables.filter(t =>
t.hasOrgId).map(t => t.name)`, exatamente o código removido) e o conjunto exportado pelo módulo
gerado:

```
total de tabelas no snapshot        : 120
com org_id via JSON (antes)         : 92
com org_id via módulo (depois)      : 92
JSON \ módulo (faltando no módulo)  : []
módulo \ JSON (sobrando no módulo)  : []
diff vazio nos dois sentidos        : true
igualdade de conjuntos ordenados    : true
```

Snapshot usado: `capturedAt 2026-08-23T12:39:14.292Z`, `source: management-api`, projeto
`dsopqkqjkmhytudaaolv` — **intocado** por esta story (`git diff docs/audits/schema-snapshot.json` =
0 linhas).

Os 17 casos de `org-scoped-admin.test.ts` passam **sem alteração de expectativa**
(`git diff` do arquivo de teste = 0 linhas): 17 passed, incluindo o `it.each` de 4 casos. Como o @po
apontou, esses testes não provam o conteúdo da lista — a prova é o diff acima. Para que a paridade
deixe de depender de alguém rodar esse diff à mão, o invariante virou teste automatizado:
`scripts/org-scoped-tables-emissao.test.ts` afirma
`módulo commitado ≡ render(schema-snapshot.json commitado)`, então **`pnpm test` também fica
vermelho** se os dois divergirem.

### AC5 — HISTÓRICO (cortado do escopo; o check medido abaixo não existe mais no repo)

_Registro do que foi implementado e depois revertido. Medições feitas em 2026-08-24, todas sem
`SUPABASE_MANAGEMENT_PAT`, via `env -u`, quando `scripts/check-org-scoped-tables-sync.ts` ainda
existia. Preservado porque descreve com precisão o que teria de ser refeito se o AC voltar._

| Cenário | Saída | Exit |
|---|---|---|
| Módulo em sincronia | `✅ … (92 de 120 tabelas com org_id)` | 0 |
| Tabela removida do módulo (`leads`) | `snapshot: 92 · módulo: 91` + `no snapshot e não no módulo: leads` | **1** |
| Tabela fantasma acrescentada | `snapshot: 92 · módulo: 93` + `no módulo e não no snapshot: tabela_fantasma` | **1** |
| Só o cabeçalho editado (mesma lista) | aponta que a divergência é de cabeçalho/formatação | **1** |
| Módulo ausente | explica que ele é commitado de propósito | **1** |
| `--write` e recheck | reemite e volta a 0 — arquivo **byte-idêntico** (`cmp` = SIM) | 0 |

Nenhum cenário pediu credencial nem tocou o banco. O guard de `argv` de
`generate-schema-snapshot.ts` **não** dispara: o caminho do script de check não contém
`generate-schema-snapshot` (nem o do arquivo de teste — mesmo cuidado, senão o worker do vitest
morreria em `process.exit()`). O script de check roda `main()` sem guard de `argv`, de propósito e
comentado no arquivo: um guard que não casasse faria o passo de CI terminar em 0 sem verificar nada.

Wiring: passo `sincronia do org-scoped-tables.generated.ts` (id `syncgen`) no job **`static`**
(bloqueante) do `.github/workflows/ci.yml`, com `if: always()` no mesmo padrão dos vizinhos **e
somado à barreira `Resultado`** — sem isso o `if: always()` deixaria o job verde com passo vermelho.
O job `tenancy-gate` não foi tocado.

### AC6 — HISTÓRICO (cortado do escopo; a regra de lint abaixo não existe mais no repo)

_Registro do que foi implementado e depois revertido em 2026-08-24. `packages/web/eslint.config.mjs`
está de volta ao estado anterior à story._

Regra escolhida: `no-restricted-imports` **built-in**, em `error`, com um `patterns[].regex` —
preferido a uma regra `aios` nova, como manda o Dev Notes. O regex é
`^\.\./(?:[^/]+/)*(?:docs|scripts|bin|\.aios-core|\.claude|\.github|\.codex|\.cursor|\.gemini|\.antigravity|\.turbo)(?:/|$)`,
montado a partir da lista `DIRS_FORA_DO_BUILD_DA_VERCEL` no próprio config. Ele exige **duas**
coisas: sair do diretório atual **e** aterrissar num diretório que o `.vercelignore` da raiz exclui.
Portanto mira o **destino**, nunca a profundidade dos `../`. Escopo: `files: ["src/**/*.{ts,tsx,…}"]`.

Antes de escolher, as três formulações candidatas foram medidas com o ESLint instalado
(`Linter.verify`) contra 6 amostras — glob `**/d/**`, glob `../**/d/**` e o regex. As três acertaram
os dois casos ruins e passaram limpo nos quatro legítimos; o regex ficou por ser o mais explícito e
o único que não pode casar um `./docs/...` interno.

Prova exigida pelo AC, executada:

```
$ npx eslint src/lib/supabase/__probe-fora-da-arvore.ts     # arquivo temporário
  1:1  error  '../../../../../docs/audits/schema-snapshot.json' import is restricted … no-restricted-imports
✖ 1 problem (1 error, 0 warnings)                                                     exit=1

$ npx eslint src/app/api/cron/followup/notify-alert.test.ts  # import relativo profundo LEGÍTIMO
                                                                                      exit=0

$ rm src/lib/supabase/__probe-fora-da-arvore.ts && pnpm lint
✖ 30 problems (0 errors, 30 warnings)                                                 exit=0
```

Os 30 warnings são pré-existentes (unused vars, `<img>`, diretivas `eslint-disable` órfãs) e
**0 errors**. `aios/no-unscoped-admin-client` **continua `warn`** — conferido na linha 62 do config;
a promoção dela segue sendo da `900-15`.

### Prova local da condição da Vercel (não substitui o AC7, mas reproduz o defeito)

O CI e o `pnpm build` local nunca pegariam isto, porque ambos têm `docs/` no disco. Então `docs/` foi
temporariamente movido para fora da árvore e o type-check do `packages/web` rodou nas duas versões:

```
# contraprova — arquivo com o import ANTIGO, docs/ ausente
src/lib/supabase/__contraprova-docs.ts(1,15): error TS2307: Cannot find module
  '../../../../../docs/audits/schema-snapshot.json' or its corresponding type declarations.

# prova — árvore desta story, docs/ ausente
tsc --noEmit → exit=0
```

`TS2307 Cannot find module` é a mesma classe de erro do log do `dpl_98TWKtMVwocWNdim1aAyhTM1VWe7`.
`docs/` foi restaurado ao fim (conferido por `git status`).

### AC7 — FECHADO pelo @devops em 2026-08-24

Fechado pelo `@devops` em 2026-08-24, depois do push. **PR #493.**

**Evidência exigida pelo AC (`GET /v13/deployments/dpl_CnrxHUUK454pMLomtY4CQ2NCtv2k`):**
```json
{ "uid": "dpl_CnrxHUUK454pMLomtY4CQ2NCtv2k", "readyState": "READY", "target": null,
  "url": "trifold-js3vlsnqs-trifold-s-projects.vercel.app",
  "sha": "3add9cf73ff7daf482747e60f55ca02b14dd5835",
  "ref": "fix/900-14b-snapshot-fora-do-deploy",
  "createdAt": "2026-08-24T13:32:09.258Z", "ready": "2026-08-24T13:33:58.704Z" }
```

| item do AC | valor |
|---|---|
| (a) `uid` | `dpl_CpQaifik2s2H8yjQhA2FdrJ5i5ZK` |
| (b) `readyState` lido da API | **`READY`** (`ready` em 2026-08-24T13:40:16.617Z, ~1m45s de build) |
| (c) SHA do build | `3fb58cd73c2d3b677dc39a4b3ddeba6234c8a7f5` — **igual ao `headRefOid` do PR #493** lido por `gh pr view 493 --json headRefOid` |
| (d) nº do PR | **#493** |

**Todos os commits desta branch buildaram verde** — não é um preview isolado:

| commit | conteúdo | preview | estado |
|---|---|---|---|
| `3add9cf7` | fix + `docs(memory)` | `dpl_CnrxHUUK454pMLomtY4CQ2NCtv2k` | **READY** (13:33:58Z) |
| `3fb58cd7` | `docs(story)` — este registro | `dpl_CpQaifik2s2H8yjQhA2FdrJ5i5ZK` | **READY** (13:40:16Z) ← SHA = HEAD do PR |

O `dpl_Cnrx…` foi o primeiro verde do projeto desde 23/08 e já continha o fix; o `dpl_CpQa…` é o que
satisfaz a letra do AC, porque o SHA dele é o HEAD do PR. Registrar isto no arquivo move o HEAD de
novo e gera um terceiro preview — a regressão é do método de registro, não do fix. Esse terceiro
preview fica publicado como **comentário no PR #493**, que é o lugar onde anotá-lo não move o HEAD.

**`org-scoped-tables.generated.ts` chegou ao build (B1 do gate).** A Vercel *clona* o repo — não há
árvore de arquivos enviada para inspecionar (`GET /v7/deployments/…/files` responde
`not_found: File tree not found`), então a prova é a cadeia de custódia, não um nome de arquivo no
log:

1. o log abre com `Cloning github.com/nicoletrifold-droid/trifold-crm (Branch:
   fix/900-14b-snapshot-fora-do-deploy, Commit: 3add9cf)` — o build saiu exatamente deste commit;
2. `GET /repos/…/contents/packages/web/src/lib/supabase/org-scoped-tables.generated.ts?ref=3add9cf7…`
   devolve `size: 3321`, blob `76e438eb1f7a013ef6afde83e0f4a1a6047cfd2b` — o arquivo **está** nesse
   commit, com os mesmos 3321 bytes do local;
3. `org-scoped-admin.ts` importa `./org-scoped-tables.generated` e o `next build` type-checa com
   `ignoreBuildErrors: false` → `✓ Compiled successfully in 19.9s`, `Build Completed in
   /vercel/output [1m]`. Ausente o arquivo, o build teria reprovado com o mesmo `TS2307` do
   incidente. Ocorrências de `Cannot find module` e `TS2307` nas 691 linhas de log: **zero**.

**Contraprova extra, não pedida pelo AC e forte:** os três previews do PR #492
(`dpl_83QUfHAQGEP11UqMbuPJzwx7rU8q`, `dpl_4ha9CAJWb4VJgGLpkK6RPe7M9qWD`,
`dpl_6RSkEsvwHqkEVykT42iD7aEn4up4`, SHAs `9e985396b`/`5b36df4f8`/`0c52e4b7b`) estão **todos em
ERROR** — aquela branch parte de `main` e carrega o import defeituoso. Mesmo projeto, mesma API,
mesmo dia: o único preview verde é o desta branch. É a demonstração direta de que o PR #492 depende
deste, e de que separar as branches era necessário.

**O que ainda NÃO está fechado:** o incidente. Preview `READY` é condição necessária, não
suficiente — falta um deployment `target=production` em `readyState=READY` depois do merge, e o
merge é decisão do Marcos.

O que já estava medido antes do push, lido da mesma API (mesmo canal exigido pelo AC):

**Contraprova (`GET /v13/deployments/dpl_98TWKtMVwocWNdim1aAyhTM1VWe7`):**
```json
{ "uid": "dpl_98TWKtMVwocWNdim1aAyhTM1VWe7", "readyState": "ERROR", "target": "production",
  "sha": "7cc4f0ab68eebcd30aafea2b2562c2ce4728d5f9", "ref": "main",
  "createdAt": "2026-08-24T01:40:49.651Z" }
```

**Os três ERROR consecutivos, e o último verde antes deles** (`GET /v6/deployments?target=production`):

| uid | state | SHA | criado (UTC) |
|---|---|---|---|
| `dpl_98TWKtMVwocWNdim1aAyhTM1VWe7` | ERROR | `7cc4f0ab6` | 2026-08-24T01:40:49Z |
| `dpl_H72tPepdxgeBVzU1c9bZ5H9Rg8Mb` | ERROR | `b6ba7d4c9` | 2026-08-23T21:55:28Z |
| `dpl_GLRmjZ3LFxwHxy5Da2Ng5hXCwe5M` | ERROR | `bb7f240ef` | 2026-08-23T18:00:02Z ← PR da `900-14` |
| `dpl_5AtbXWNUYan2Hc7Bw1Dt7znatcTn` | READY | `a5517c56d` | 2026-08-23T15:46:33Z ← último verde |

Confirma o diagnóstico da story: a série de ERROR começa exatamente no deploy do PR da `900-14`, e
produção está parada desde `a5517c56d` (15:46 UTC = 12:46 BRT de 23/08).

~~**Falta preencher, depois do push (@devops):** (a) `uid` do preview (`dpl_…`); (b) `readyState:
READY` lido da API; (c) SHA do build **igual ao HEAD do PR**; (d) nº do PR.~~ — preenchido acima.
Segue faltando, e é o que encerra o incidente: um deployment de **produção** `READY` depois do
merge.

### ⚠️ Dois avisos para o @devops antes de commitar

1. **O working tree NÃO está em `main`.** O branch atual é
   `fix/75-367-relatorio-semanal-duplicado` (o do PR #492, em revisão, escopo `75-367`), e as
   mudanças deste hotfix estão **por cima dele**, sem commit. Commitar como está mistura o hotfix
   dentro do PR #492 e faz o preview dele deixar de servir de evidência para esta story. O hotfix
   precisa de branch própria a partir de `main` (`7cc4f0ab`). Não mexi em branch nem em stash de
   propósito: o tree também carrega mudanças alheias a esta story
   (`.claude/agent-memory/aios-po|aios-sm`, `docs/backlog.md`), que são do @po/@sm, e um
   stash/checkout às cegas as arrastaria junto.
2. **`org-scoped-tables.generated.ts` PRECISA entrar no commit.** `git check-ignore` retorna 1 (não
   é ignorado) e ele aparece como `??` — mas se ficar fora do commit o build da Vercel quebra
   exatamente do mesmo jeito, porque a Vercel importa o arquivo e não roda codegen.

### Decisões autônomas (YOLO)

- **[AUTO-DECISION]** T5 pedia `pnpm gate:tenancy:snapshot` para gerar o módulo inicial → usei
  `pnpm check:org-scoped-tables-sync --write`. Motivo: o gerador exige
  `SUPABASE_MANAGEMENT_PAT` e **regravaria `docs/audits/schema-snapshot.json`**, que o Scope manda
  deixar intocado. Como os dois caminhos passam pela mesma
  `renderOrgScopedTablesModule()`, o resultado é byte-idêntico ao que o gerador produziria a partir
  deste snapshot — e o teste novo afirma essa igualdade a cada `pnpm test`.
  **Nota do corte de 2026-08-24:** o script `--write` foi apagado e o teste também. O módulo
  commitado é o que ele produziu, e a equivalência com o template do gerador foi remedida à mão
  (byte-idêntica, 3321 bytes) — ver "Corte de escopo". Daqui para frente o único caminho de
  regeneração é `pnpm gate:tenancy:snapshot`, que exige `SUPABASE_MANAGEMENT_PAT` e reescreve
  também o JSON.
- **[AUTO-DECISION]** Regra de lint: built-in `no-restricted-imports` com `regex`, não uma regra
  `aios` nova (Dev Notes: "prefira a ferramenta que já existe"). Decidido depois de medir as três
  formulações candidatas contra 6 amostras, não por preferência.
- **[AUTO-DECISION]** Acrescentei `scripts/org-scoped-tables-emissao.test.ts`, que não estava na
  File List. Motivo: nada mais no repo garantia o determinismo da emissão nem a igualdade
  módulo↔snapshot dentro de `pnpm test` — e o AC3 exige uma paridade que os testes existentes
  reconhecidamente não cobrem. O nome evita `generate-schema-snapshot` pelo mesmo motivo do script
  de check.
- **[AUTO-DECISION]** `node_modules` e `.git` ficaram fora da lista de diretórios da regra de lint,
  apesar de estarem no `.vercelignore`: a Vercel instala as próprias dependências, e import relativo
  para `.git` não existe. Incluí-los só geraria ruído.
- **[AUTO-DECISION]** Não commitei, não criei branch e não abri PR — restrição do `@dev` e instrução
  explícita desta execução.
- **[AUTO-DECISION]** No corte de escopo, mantive as seções de evidência de AC5 e AC6 no Dev Agent
  Record em vez de apagá-las, retituladas como **HISTÓRICO** e com aviso de que o artefato medido
  não existe mais. Motivo: apagar esconderia que o trabalho foi feito e depois retirado por decisão,
  e quem reabrir o AC precisa saber exatamente o que já foi medido. Também não editei o texto de
  AC5/AC6 nem a File List prevista do @po/@sm — só marquei os checkboxes como fora de escopo e
  apontei para o registro do corte; reescrever seção alheia apagaria o que foi planejado.
- **[AUTO-DECISION]** A prova de equivalência template ↔ `.generated.ts` rodou de um script
  descartável **fora do repo**, não de um teste novo. Motivo: com AC5/AC6 fora, um teste novo
  reintroduziria pela porta dos fundos parte do que o usuário cortou — e a story não pede artefato
  novo. A prova está registrada aqui, reproduzível a qualquer momento a partir do snapshot commitado.

### Validações

Revalidado após o corte de escopo (2026-08-24):

| Comando | Resultado |
|---|---|
| `pnpm type-check` | ✅ 8/8 tasks |
| `pnpm lint` | ✅ 0 errors · 30 warnings (todos pré-existentes) |
| `pnpm test` | ✅ **245 arquivos · 2982 passed · 6 expected fail** |
| `npx vitest run …/org-scoped-admin.test.ts` | ✅ 17 passed, expectativas intocadas (`git diff` = 0 linhas) |
| `pnpm build` | ✅ 5/5 tasks |
| template ↔ `.generated.ts` | ✅ byte-idênticos (3321 bytes), determinístico, 92 de 120 |
| `tsc --noEmit` com `docs/` ausente | ✅ **exit 0** — e `TS2307 Cannot find module` com o import antigo (contraprova) |

**Contagem de testes.** A suíte voltou a 245 arquivos / 2982 passed, exatamente o número de antes da
story: os 7 casos de `scripts/org-scoped-tables-emissao.test.ts` saíram com o arquivo no corte de
escopo (era 246 / 2989). Os 6 `expected fail` são pré-existentes.

### File List (real)

| Arquivo | Estado |
|---|---|
Estado final, **depois do corte de escopo** de 2026-08-24.

| Arquivo | Estado |
|---|---|
| `packages/web/src/lib/supabase/org-scoped-tables.generated.ts` | **novo, precisa ser commitado** — 92 nomes, cabeçalho de arquivo gerado (declara a ausência de check como limitação) |
| `packages/web/src/lib/supabase/org-scoped-admin.ts` | modificado — importa `./org-scoped-tables.generated`; docblock explica o porquê e a limitação. Lógica intocada |
| `scripts/generate-schema-snapshot.ts` | modificado — `renderOrgScopedTablesModule()`, `writeOrgScopedTablesModule()`, `ORG_SCOPED_TABLES_MODULE`, `SchemaParaEmissao`; `main()` emite o módulo junto com o JSON |
| `docs/stories/900-14b-snapshot-fora-do-deploy.story.md` | modificado — corte de escopo, checkboxes, Dev Agent Record, Change Log |

Revertido/apagado no corte (implementado antes, **não** faz parte da entrega):

| Arquivo | Estado |
|---|---|
| `.github/workflows/ci.yml` | **revertido** — sem diff |
| `packages/web/eslint.config.mjs` | **revertido** — sem diff |
| `package.json` (raiz) | **revertido** — sem diff |
| `scripts/check-org-scoped-tables-sync.ts` | **apagado** |
| `scripts/org-scoped-tables-emissao.test.ts` | **apagado** (7 casos) |

Intocados, conferidos por `git diff` = 0 linhas:

| Arquivo | Por quê |
|---|---|
| `scripts/gate-tenancy.ts` | AC4 |
| `docs/audits/schema-snapshot.json` | Scope OUT |
| `packages/web/src/lib/supabase/org-scoped-admin.test.ts` | AC3 — 17 casos, expectativas intocadas |

Arquivos temporários usados nas provas e já removidos:
`packages/web/src/lib/supabase/__probe-fora-da-arvore.ts`,
`packages/web/src/lib/supabase/__contraprova-docs.ts`, `scratch-parity.ts`,
`packages/web/__eslint-probe.mjs`. A prova de equivalência template ↔ `.generated.ts` rodou de um
script descartável **fora do repo** (scratchpad da sessão).

## QA Results

### Review Date: 2026-08-24

### Reviewed By: Quinn (Test Architect) — `*qa-gate`, round 1

### Veredito: **PASS** — liberado para push. Nenhum item volta para o @dev.

**AC1-AC4 fechados**, verificados contra o código e contra execução própria, não contra o que o Dev
Agent Record afirma. **AC5 e AC6 estão fora de escopo por decisão do usuário** e foram registrados
como **risco aceito** (RA1, RA2 no gate file) — não como pendência, e sem recomendação de
reintroduzi-los como bloqueio. **AC7 é do @devops por desenho**: o preview só existe depois do push.

---

#### O que eu refiz de forma independente (e por que valeu refazer)

**1. A reprodução da condição da Vercel — com contraprova, que é o que dá valor à prova.**
Movi `docs/` para fora da árvore e rodei `tsc --noEmit` em `packages/web`: **exit 0**. No mesmo
cenário, com um arquivo sonda trazendo de volta o import antigo: **exit 2, `TS2307 Cannot find
module '../../../../../docs/audits/schema-snapshot.json'`** — a mesma classe de erro do log do
`dpl_98TWKtMVwocWNdim1aAyhTM1VWe7`. Sem a contraprova, um `exit 0` poderia significar apenas que o
type-check não rodou. `docs/` restaurado ao fim: `git status` idêntico ao inicial, nenhum resíduo,
`git diff docs/audits/schema-snapshot.json` = 0 linhas (sha256 `745f6b7b3…` conferido).

**Antes disso eu confirmei que essa é a camada certa**, porque a pergunta óbvia é como o build
quebrava se nenhuma rota importa `createOrgScopedAdminClient()` ainda (os únicos consumidores hoje
são o próprio arquivo e seu teste — as 129 rotas são da `900-15`). Resposta:
`packages/web/next.config.ts` traz `typescript: { ignoreBuildErrors: false }` **explícito** e o
`tsconfig.json` inclui `**/*.ts`, então o `next build` type-checa o projeto inteiro, alcançável ou
não. O defeito vivia no type-check do build, e é exatamente ali que a minha prova roda.

**2. A paridade da lista, contra a expressão que foi removida.** Não conferi o número do Dev Agent
Record; alimentei `renderOrgScopedTablesModule()` com o JSON commitado e comparei conjuntos contra
`tables.filter(t => t.hasOrgId).map(t => t.name)` — literalmente o código apagado:

```
total de tabelas no snapshot      : 120
com org_id via JSON (expr antiga) : 92   (92 distintos)
nomes exportados pelo módulo      : 92   (92 distintos)
JSON \ módulo (faltando)          : []
módulo \ JSON (sobrando)          : []
diff vazio nos dois sentidos      : true
módulo está ordenado              : true
Set(JSON) ≡ Set(módulo)           : true   ← a forma em que o código realmente consome
```

O último item é além do que o AC3 pede, e é o que importa na prática: `org-scoped-admin.ts` usa
`new Set(...)`, e é o `Set` que decide se o client escopa ou não. Os 17 casos de
`org-scoped-admin.test.ts` passam com `git diff` = **0 linhas** (numstat vazio). Como o @po
registrou, esses 17 não provam o conteúdo da lista — 3 asserts cobrem `leads`, `organizations` e uma
tabela inexistente, e um array manual com dois nomes passaria igual. A prova é o diff acima.

**3. A equivalência template ↔ arquivo gerado — a que mais importava, e fecha por sha256.**
Se os dois divergissem, o arquivo commitado deixaria de ser o que o gerador produz, e a próxima
regeneração legítima viraria um diff fantasma. Importei `renderOrgScopedTablesModule()` direto do
gerador (o guard de `argv` não dispara: meu script não se chama `generate-schema-snapshot`) e
comparei bytes:

```
bytes renderizado : 3321
bytes commitado   : 3321
sha256 (ambos)    : b2a45532432e08bc5e20f716877f05843186fcbae42668d7d3268c44523f57f6
BYTE-IDÊNTICOS    : SIM
determinismo (2x) : SIM
estável à reordenação da entrada  : SIM
```

Os dois últimos não estavam pedidos e são o que sustenta a garantia no tempo: como
`renderOrgScopedTablesModule()` faz `[...new Set(...)].sort()`, embaralhar `schema.tables` produz os
mesmos bytes — a ordem em que o Postgres devolve tabelas não gera diff espúrio a cada regeneração.
O script da prova ficou **fora do repo** (scratchpad da sessão): nenhum artefato novo adicionado.

---

#### Os 7 checks pedidos

| # | Check | Resultado |
|---|---|---|
| 1 | Fix resolve a causa-raiz; nenhum import de `packages/web/src` para `docs/` | **PASS** — `org-scoped-admin.ts` tem 2 imports, ambos irmãos (`./admin`, `./org-scoped-tables.generated`). Varredura de `packages/`: zero imports aterrissando em `docs/`. Único import de 4+ níveis é `notify-alert.test.ts:25 → "../../../../lib/broker/notify-stalled-lead"`, legítimo (aterrissa dentro de `src/lib`). `docs/` ausente → `tsc` exit 0; com o import antigo → exit 2 / TS2307 |
| 2 | Paridade da lista: 92/120, diff vazio nos dois sentidos, 17 testes intocados | **PASS** — diff refeito (tabela acima), `Set(JSON) ≡ Set(módulo)`, `git diff` do teste = 0 linhas, `vitest run` → 17 passed |
| 3 | Template ↔ arquivo gerado byte-idênticos | **PASS** — 3321 = 3321 bytes, sha256 idêntico, determinístico e estável à reordenação |
| 4 | Nenhum comentário mente | **PASS** — zero ocorrências **em código** de `check-org-scoped-tables-sync` / `check:org-scoped-tables-sync`. A limitação está declarada **como limitação** nos 3 lugares certos: cabeçalho do `.generated.ts`, docblock de `org-scoped-admin.ts` e cabeçalho de `generate-schema-snapshot.ts` — os três dizem a mesma coisa e nenhum inventa garantia substituta. Ver a nota abaixo sobre a única ocorrência textual restante |
| 5 | Nada reintroduzido | **PASS** — `git diff --numstat` **vazio** em `.github/workflows/ci.yml`, `packages/web/eslint.config.mjs` e `package.json` (raiz). `scripts/check-org-scoped-tables-sync.ts` e `scripts/org-scoped-tables-emissao.test.ts` **não existem**. Conferido por leitura também: sem `no-restricted-imports` no config, e `aios/no-unscoped-admin-client` segue em **`warn`** (linha 26) |
| 6 | Nada fora de escopo tocado | **PASS** — `git diff --numstat` vazio em `scripts/gate-tenancy.ts`, `docs/audits/schema-snapshot.json` e `org-scoped-admin.test.ts`. Nenhum arquivo de `analytics-report` no `git status`. O diff de código são 3 arquivos, e em `org-scoped-admin.ts` só a origem da lista muda — `select`/`insert`/`update`/`delete` intocados |
| 7 | `org-scoped-tables.generated.ts` é commitável | **PASS** — `git check-ignore` → exit 1 (não ignorado), status `??`, sem padrão `*.generated.ts` no `.gitignore`. **Mas ver B1 abaixo**: commitável não é commitado |

**Sobre o check 4, com precisão.** O `grep` fora de `docs/` devolve **uma** ocorrência textual:
`.claude/agent-memory/aios-dev/feedback_corte_de_escopo_comentarios.md:14`. É a memória do próprio
@dev descrevendo o incidente no passado ("ficaram comentários citando… script que havia sido
apagado"), como lição aprendida — não é código, não é comentário de código e não promete garantia
nenhuma. É o registro de por que a limpeza foi feita. Informativo, não achado.

---

#### Validações executadas por mim

| Comando | Resultado |
|---|---|
| `pnpm test` | ✅ **245 arquivos · 2982 passed · 6 expected fail (2988) · 21,47s** — exatamente o esperado |
| `npx turbo lint --force` (sem cache) | ✅ **0 errors** · 30 warnings, todas pré-existentes, nenhuma nos arquivos da story |
| `npx tsc --noEmit` em `packages/web` | ✅ exit 0 (rodado direto, 2x) |
| `npx turbo build --force` | ✅ **5/5 successful, 0 cached, 1m47s** — build real, não replay de cache |
| `npx vitest run org-scoped-admin.test.ts` | ✅ 17 passed, 332ms, expectativas intocadas |
| `tsc --noEmit` com `docs/` ausente | ✅ exit 0 · contraprova exit 2 (TS2307) |

`pnpm type-check` deu FULL TURBO (8/8 cache hit), então **não me apoiei nele** — cache hit é replay,
não execução. Rodei `tsc --noEmit` direto. Mesmo motivo para forçar lint e build com `--force`.

**A contagem de testes fecha e isso é relevante:** 245/2982 é o número de antes da story,
confirmando que a queda de 246/2989 foi só o arquivo de 7 casos que saiu no corte de escopo, e não
regressão.

**Efeito colateral declarado, verificado no artefato de build:** os 194 KB de JSON de auditoria
saíram do bundle. Marcadores exclusivos do snapshot em `.next/server/**/*.js`: `capturedAt` 0,
`hasOrgId` 0, `management-api` 0 arquivos. (`dsopqkqjkmhytudaaolv` aparece em 341, mas é a URL do
Supabase inlinada por env var — conferido para não virar falso positivo.) `schema-snapshot` só
sobrevive em `.next/cache/.tsbuildinfo`, que é metadado, não bundle.

---

#### Riscos aceitos (AC5/AC6 — corte do usuário, não falha técnica)

**RA1 — sem check automático de sincronia `.generated.ts` ↔ `schema-snapshot.json` · severidade
residual LOW.** Medi a superfície antes de classificar, e ela é menor do que parece:
`generate-schema-snapshot.ts` é o **único** escritor do JSON em todo o repo (`gate-tenancy.ts`
apenas lê, via `SNAPSHOT_PATH` na linha 152), e o `main()` agora grava os dois artefatos da mesma
captura, numa execução. **Não existe caminho automatizado que atualize o JSON sem atualizar o
módulo** — a divergência exige edição manual de um dos dois, contra um cabeçalho que abre com
"ARQUIVO GERADO — NÃO EDITE À MÃO". O que o corte remove não é proteção do fluxo normal; é a rede
contra o desvio deliberado.

**RA2 — sem barreira de lint contra novo import fora da árvore buildável · severidade residual
MEDIUM.** É o mais severo dos dois, por um motivo específico: a classe de defeito que esta story
conserta é **invisível em todos os sinais que o time olha** — build local passa, CI passa, testes
passam, type-check passa; só o deploy reprova, e depois do merge. Foi assim que a `900-14` parou
produção por 3 deploys e ~37 horas. O repo fica em zero ocorrências; o que não fica é o impedimento
de voltar a um.

Nenhum dos dois volta para o @dev e nenhum é recomendado como bloqueio. Ambos para backlog — RA1
naturalmente ganha severidade quando a `900-15` migrar as 129 rotas, porque a lista sai de 1
consumidor para 129 em produção.

---

#### Concerns (LOW, nenhum bloqueia, nenhum pede volta ao @dev)

**C1 — `writeOrgScopedTablesModule(schema, process.cwd())` resolve o destino por `cwd`.** Rodado de
um subdiretório, grava no lugar errado em silêncio. **Não é defeito novo e não peço mudança:** a
gravação do JSON, na linha logo acima, já usava `join(process.cwd(), "docs", "audits", …)` desde a
`900-2a` — o código novo seguiu a convenção local, que é a decisão certa num hotfix. Registro só
que `gate-tenancy.ts` faz melhor (`REPO_ROOT` calculado) e que a inconsistência entre os dois
escritores é convite a erro futuro. `pnpm gate:tenancy:snapshot` sempre roda da raiz.

**C2 — nada em `pnpm test` afirma `módulo ≡ render(snapshot)`.** Consequência direta do corte (era
um dos 7 casos apagados), coberta por RA1. O registro que importa: a igualdade byte-a-byte que eu
medi vale para o commit de hoje, não é invariante que a suíte reafirma amanhã.

---

#### Condições de release — para o @devops, não para o @dev

**B1 (HIGH) — `org-scoped-tables.generated.ts` está untracked (`??`) e PRECISA entrar no commit.**
Não é defeito de código, é condição de release — e é o modo de falha mais irônico desta story: se
ficar fora do commit, a Vercel quebra **exatamente igual**, com o mesmo `Cannot find module`, porque
ela importa o módulo e não roda codegen. `git check-ignore` retorna 1, então nada impede o `git
add` — só o esquecimento.

**B2 (HIGH) — o hotfix está por cima da branch do PR #492, sem commit.** Commitar como está mistura
o hotfix dentro do PR #492 e faz o preview dele deixar de servir de evidência para o AC7. O tree
também carrega `.claude/agent-memory/aios-dev|aios-po|aios-sm` e `docs/backlog.md`, de @dev/@po/@sm.
Precisa de branch própria a partir de `main` (`7cc4f0ab`). Não toquei em git — nem branch, nem
stash, nem commit — por restrição de papel e porque a avaliação do código não depende disso.

**AC7 e o fechamento do incidente.** O AC7 pede preview `READY` com SHA igual ao HEAD do PR, e é do
@devops. Não bloqueia este gate. Mas registro explicitamente: **preview verde é condição necessária,
não suficiente.** Produção está parada desde `dpl_5AtbXWNUYan2Hc7Bw1Dt7znatcTn` (SHA `a5517c56d`,
2026-08-23T15:46:33Z). O incidente só fecha com um deployment `target=production` e
`readyState=READY` **depois do merge em `main`** — e vale conferir no log desse build que o
`.generated.ts` foi enviado, porque se B1 falhar o defeito reaparece idêntico.

---

### Gate Status

Gate: **PASS** → `docs/qa/gates/900-14b-snapshot-fora-do-deploy.yml`

**Nada exige volta ao @dev.** Próximo passo: `@devops` — branch própria a partir de `main`, com
`org-scoped-tables.generated.ts` incluído no commit (B1 + B2), depois preview `READY` (AC7) e
produção `READY` pós-merge para fechar o incidente.

— Quinn, guardião da qualidade 🛡️

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-08-24 | @sm (River) | Draft inicial como `900-15` |
| 2026-08-24 | @po (Pax) | Validação `*validate-story-draft`: **GO 9/10**, Status → Ready. **ID renumerado `900-15` → `900-14b`** (colisão com a story de migração das 129 rotas, referenciada no epic §9.3, no R1, na allowlist, no QA doc, na `900-14` e no comentário de `eslint.config.mjs`). Correções: `~20 tabelas` → **92 de 120** (medido); AC3 ganhou prova de paridade item a item (os 17 testes existentes **não** cobrem o conteúdo da lista, só 3 nomes); AC5 fixado no job **bloqueante** `static` (o `tenancy-gate` é `continue-on-error`) + exigência de uma única função de emissão + limite explícito (consistência ≠ frescor); AC6 com evidência de ocorrência única, alvo = destino do import (não profundidade de `../`) e guarda de que `aios/no-unscoped-admin-client` **continua `warn`**; AC7 com evidência não-falsificável (`dpl_`, `readyState`, SHA = HEAD); Scope OUT + Dev Notes com a lacuna de frescor JSON↔banco (pré-existente → backlog) e o guard de `argv` do gerador; adicionadas File List, Dev Agent Record, QA Results e Change Log |
| 2026-08-24 | @dev (Dex) | `*develop` (YOLO): codegen implementado — `renderOrgScopedTablesModule()` única, usada pelo gerador e pelo check; import de `docs/` removido de `org-scoped-admin.ts`; `check:org-scoped-tables-sync` (sem banco, com `--write`) plugado no job **bloqueante** `static`; `no-restricted-imports` em `error` mirando o destino do import; `scripts/org-scoped-tables-emissao.test.ts` novo (7 casos) fixando determinismo e a igualdade módulo↔snapshot. **AC1-AC6 fechados** com as provas exigidas (paridade 92/120, diff vazio nos dois sentidos; regra de lint em `error` + `pnpm lint` limpo; 5 cenários de falha do check medidos sem PAT). type-check · lint (0 errors) · 2989 testes · build todos verdes; reproduzida localmente a condição da Vercel (`docs/` ausente → `TS2307` com o import antigo, verde sem ele). **AC7 pendente por desenho** — preview só existe após push (@devops). Status → Ready for Review |
| 2026-08-24 | @dev (Dex) | **Corte de escopo pedido pelo usuário — decisão do usuário, não falha técnica.** A story foi reduzida ao mínimo que destrava o build da Vercel. **AC5 (check de sincronia no CI) e AC6 (regra de lint) saíram do escopo**, junto com T3/T4: `.github/workflows/ci.yml`, `packages/web/eslint.config.mjs` e `package.json` **revertidos**; `scripts/check-org-scoped-tables-sync.ts` e `scripts/org-scoped-tables-emissao.test.ts` **apagados**. Ficou o fix: `org-scoped-tables.generated.ts` (92 nomes) + `org-scoped-admin.ts` importando o módulo + `generate-schema-snapshot.ts` emitindo os dois artefatos da mesma captura. Comentários e cabeçalho do arquivo gerado **reescritos**: citavam `pnpm check:org-scoped-tables-sync` como verificação bloqueante do CI, que não existe mais — agora declaram a ausência de check como **limitação conhecida**. Template e arquivo gerado provados **byte-idênticos** (3321 bytes, 92 de 120). Revalidado: type-check 8/8 · lint 0 errors/30 warnings · **245 arquivos / 2982 passed / 6 expected fail** (caiu 7 casos com o teste apagado) · build 5/5 · `org-scoped-admin.test.ts` 17 passed sem alteração · `tsc --noEmit` com `docs/` ausente **exit 0** (e `TS2307` com o import antigo). Evidência do AC5/AC6 preservada no Dev Agent Record marcada como HISTÓRICO. Status segue Ready for Review; **AC7 pendente** (@devops) |
| 2026-08-24 | @devops (Gage) | `*push`. **Branch separada do PR #492 antes de qualquer commit** (B2 do gate): o hotfix estava sem commit por cima de `fix/75-367-relatorio-semanal-duplicado`. Nova branch `fix/900-14b-snapshot-fora-do-deploy` criada de `origin/main` (`7cc4f0ab`) e o delta uncommitted transplantado por patch 3-way — os 3 `MEMORY.md` que o 75-367 também tocou foram resolvidos linha a linha para **não** arrastar entradas alheias. Resultado conferido: 2 commits, 0 commits do 75-367, `git diff origin/main..HEAD` = as mesmas 131 inserções/6 remoções do tree original. **B1 conferido por `git show`:** `org-scoped-tables.generated.ts` está no commit `eacfd94a`, sha256 `b2a45532432e08bc5e20f716877f05843186fcbae42668d7d3268c44523f57f6` — idêntico ao medido pelo @qa. Pre-push sem cache do turbo: `turbo lint --force` 8/8 0 cached (0 errors / 30 warnings pré-existentes) · `turbo type-check --force` 8/8 **0 cached** · `tsc --noEmit` exit 0 · `vitest run` 244 arquivos / **2975 passed** / 6 expected fail · `turbo build --force` **5/5 0 cached** 1m38s · zero imports de `packages/web/src` para `docs/` · scan de segredos limpo. A diferença de 245/2982 (gate do @qa) para 244/2975 é a separação de branch, não regressão: `analytics-report/route.test.ts` (7 casos) não existe em `main`. Commits `eacfd94a` (fix) e `3add9cf7` (`docs(memory)` + P1 no backlog). **PR #493** aberto, com o corte de escopo declarado no corpo e a dependência do #492. **AC7 FECHADO:** previews `dpl_CnrxHUUK454pMLomtY4CQ2NCtv2k` (commit `3add9cf7`) e `dpl_CpQaifik2s2H8yjQhA2FdrJ5i5ZK` (commit `3fb58cd7`, SHA = `headRefOid` do PR) ambos `readyState: READY` — primeiros builds verdes do projeto desde 23/08. Status Ready for Review → **InReview**; vira Done com o PR mergeado + produção `READY` — o merge é decisão do Marcos, nada foi mergeado. |
| 2026-08-24 | @devops (Gage) | **Merge autorizado pelo Marcos e executado; incidente ENCERRADO.** PR #493 mergeado por **squash** (`8a2e76d0`, convenção do repo — todo commit da `main` tem 1 parent e sufixo `(#N)`), com corpo curado em vez de concatenação de commits. **Produção READY:** `dpl_B3AF4nJBRTd6oyQUuigFHgyyGE2u`, `target: production`, `readyState: READY`, SHA `8a2e76d093eabdc84cfc23fa10ebc2404fc839b1`, `ref: main`, criado 14:06:25Z → ready 14:08:16Z, aliases incluindo `crm.trifold.eng.br` (HTTP 307, o redirect de auth esperado). Fim de ~37h de parada e de 4 deploys de produção em ERROR. **Contraprova definitiva, em produção, dois minutos antes:** o merge do PR #494 (`8dbc6000`, escopo alheio, landing do Vind) buildou às 14:04 e falhou com `Type error: Cannot find module '../../../../../docs/audits/schema-snapshot.json'` — mesma pipeline, mesmo projeto, sem `Build Completed`. Às 14:06, com o fix, o log tem `Compiled successfully in 21.7s` + `Build Completed`, e zero ocorrências de `Cannot find module`/`TS2307` nas 763 linhas. **B1 fechado em produção:** `org-scoped-tables.generated.ts` está em `main` no SHA buildado (blob `76e438eb…`, 3321 bytes) — se não estivesse, o build teria reprovado com o mesmo `TS2307` apontando agora para `./org-scoped-tables.generated`. Previews da branch: 5 commits, 5 READY, nenhum ERROR. **PR #492 NÃO foi mergeado** — decisão separada do Marcos, e ele ainda recebe um commit. Status InReview → **Done**. |

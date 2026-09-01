# Story 75-371 — Pipeline: quem vê o botão é quem pode criar, e etapa padrão volta a ser única

**Story ID:** 75-371
**Epic:** 75 (CRM Trifold) · **Status:** Ready for Review · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** Épico 89 / Perfis de Acesso 2.0 (`can()` + `CAPABILITY_SEED`, migs 225-243).
  Toca `dashboard/configuracoes/pipeline/**`, `api/stages/**` e cria a migration `250`.

---

## Story

Como **gerente comercial**, quero que a tela de Configuração do Pipeline só me ofereça
"+ Nova etapa" se eu puder de fato criar — e, quando eu puder, quero que marcar "Etapa padrão"
não quebre em silêncio a etapa onde todo lead novo cai.

---

## Context

Reportado pelo **Joabe (Gerente-Comercial)** em 01/09/2026, com print: ele preencheu o modal
"Nova etapa" (nome `Follow-up`, tipo `Novo`, **"Etapa padrão" marcado**) e o botão "Criar etapa"
devolveu **`Forbidden`** em vermelho, em inglês, sem dizer o que fazer.

### Por que ele viu o botão

A tela e a API perguntam **coisas diferentes** sobre a mesma ação:

| Camada | Gate | Resultado p/ gerente-comercial |
|---|---|---|
| Tela + botão + Editar/Excluir | `canAccess(..., "configuracoes.pipeline")` — sub-módulo **sem linha própria**, herda de `configuracoes` (`pipeline/page.tsx:13`) | ✅ passa |
| `POST/PATCH/DELETE /api/stages` | capability `configuracoes.pipeline_editar` — `seed: [A]`, só admin (`capabilities.ts:221`) | ❌ 403 |
| RLS de `kanban_stages` | `has_capability('configuracoes.pipeline_editar')` (mig 229) | ❌ |

O bloqueio está certo de ponta a ponta; o defeito é a tela **oferecer** o que a API recusa. É o
mesmo padrão já corrigido em Brindes: gate de escrita e gate de tela têm de ler a MESMA chave.

> A permissão do Joabe em si foi resolvida pelo Marcos no painel (Config › Perfil de Acesso →
> ligar "Editar etapas do pipeline" para o perfil Gerente-Comercial) — **não é escopo desta
> story**. O escopo é o beco sem saída e o que estava atrás dele.

### O que o 403 impediu por acidente — e é o achado grave

Ele marcou **"Etapa padrão"**. Se a permissão estivesse ligada, o clique teria criado uma
**segunda** etapa com `is_default = true`, porque:

- o `POST /api/stages` grava `is_default: body.is_default` **sem zerar o padrão anterior**
  (`api/stages/route.ts:75`) — e o `PATCH` idem;
- **não existe** constraint nem índice único em `kanban_stages` (conferido em todas as migrations);
- `getDefaultStageId` (`lib/leads/default-stage.ts:14`) faz `.single()` em `is_default = true` —
  com dois padrões a consulta **falha** e o código cai no fallback "primeira etapa por posição".

Isso é exatamente o estrago que a **migration 086** foi escrita para limpar ("Todos os stages
tinham is_default=true, causando indeterminismo ao criar leads via webhook"). O datafix foi
aplicado em 2026; **o furo que o causou nunca foi fechado.** O caminho afetado é o de entrada de
lead: webhook Meta, cadastro manual e qualquer outro ponto que chame `getDefaultStageId`.

### O furo gêmeo, na exclusão

`DELETE /api/stages/[id]` é **soft delete** (`is_active = false`) e **não olha `is_default`**.
Excluir a etapa padrão deixa `is_default = true` numa etapa **inativa** — e `getDefaultStageId`
não filtra `is_active`. Resultado: todo lead novo passaria a nascer numa etapa que o Pipeline e os
filtros não mostram (ambos filtram `is_active = true`). Mesma invariante, mesma story.

### Estado de produção medido em 01/09/2026

Leitura via service role (`ref dsopqkqjkmhytudaaolv`): **1 org, 17 etapas, exatamente 1 padrão** —
"Aguardando atendimento" (`slug=novo`, `position=0`, ativa). Ou seja, **hoje prod está íntegro**: o
índice único entra sem conflito e o datafix desta migration é no-op. A correção é preventiva, e o
gatilho para ela ser acionada existia a um clique de distância.

---

## Acceptance Criteria

1. **AC1** — "+ Nova etapa" e as ações Editar/Excluir da tabela são gateados pela **mesma chave**
   que a API exige: `can(userId, orgId, "configuracoes.pipeline_editar")`. Quem tem acesso ao
   sub-módulo mas não à capability vê a tela **em leitura**, sem botão nenhum.
2. **AC2** — Se uma ação de escrita da tela ainda receber 403 (ex.: aba aberta antes de uma troca
   de perfil), a mensagem exibida é em português e diz a quem pedir — nunca o `Forbidden` cru da
   API. A decisão da mensagem é função pura testada, não string solta no componente.
3. **AC3** — O banco garante **no máximo uma** etapa padrão por org (índice único parcial), e
   criar/editar etapa marcando "Etapa padrão" **tira o padrão da anterior na mesma transação** —
   por trigger, valendo para qualquer escritor, inclusive SQL direto.
4. **AC4** — Excluir a etapa padrão é **recusado** com mensagem clara (409), explicando que é
   preciso eleger outra etapa como padrão antes.
5. **AC5** — Datafix idempotente na migration: se alguma org tiver mais de um padrão, sobra o de
   **menor `position`**. No-op na prod de hoje (medição acima).
6. **AC6** — `getDefaultStageId` continua com o mesmo comportamento observável; nenhum ponto de
   entrada de lead muda.
7. **AC7** — Testes: gate da tela pela capability, mensagem de 403, recusa de excluir o padrão,
   e a unicidade do padrão exercitada no nível da rota.

---

## Tasks / Subtasks

- [x] **T1** — `pipeline/page.tsx`: `isAdmin` → `canEdit` via `can(..., "configuracoes.pipeline_editar")` (AC1)
- [x] **T2** — `stages-table.tsx`: prop `isAdmin` → `canEdit` (AC1)
- [x] **T3** — `_components/mensagem-de-erro.ts` + teste: função pura que traduz 403 (AC2)
- [x] **T4** — `create-stage-modal.tsx` e `edit-stage-modal.tsx` consomem a função (AC2)
- [x] **T5** — `api/stages/[id]/route.ts`: guarda de DELETE na etapa padrão, 409 (AC4)
- [x] **T6** — `migrations/250_kanban_stages_default_unico.sql`: datafix + índice único parcial + trigger (AC3, AC5)
- [x] **T7** — Testes de rota (`api/stages/route.test.ts`) e regressão completa (AC7)

---

## Dev Notes

**Por que a mensagem NÃO é corrigida no `requireCapability`.** Seria o lugar de maior alcance, mas
`"Forbidden"` é a convenção de 116 call sites e mais de 100 403 escritos à mão — trocar a string na
fonte é raio de impacto de épico, não de fix. A correção fica na tela que reportou o problema.

**Por que trigger e não dois statements na rota.** Zerar o padrão anterior em statement separado
não é atômico: se o INSERT falhar depois do UPDATE, a org fica **sem** padrão nenhum — e aí
`getDefaultStageId` também cai no fallback. Trigger `BEFORE INSERT OR UPDATE` resolve dentro da
transação do próprio statement e cobre escritor que não passa pela rota (SQL direto, seed, service
role). A recursão é inofensiva: o `UPDATE` interno grava `is_default = false` e o guard `IF NEW.is_default`
não reentra.

**Direitos do trigger.** Roda com direitos do invocador (sem `SECURITY DEFINER`): quem escreve em
`kanban_stages` já passou pela RLS que exige `configuracoes.pipeline_editar`, então o UPDATE nos
irmãos da mesma org passa. Não há escalada de privilégio a conceder aqui.

**O que fica de fora, deliberadamente.** O `DELETE` da tabela (`stages-table.tsx:76`) e o reorder
(`:219`) hoje ignoram falha em silêncio (`if (res.ok)`, fire-and-forget). Com o AC1 os botões só
aparecem para quem pode, então o 403 deixa de ser alcançável por ali; dar tratamento de erro a
essas duas chamadas é melhoria de UX independente e não entra nesta story.

---

## Dev Agent Record

### Agent Model Used
claude-opus-5[1m] (@dev / Dex) — modo YOLO

### Prova em produção da migration 250 (01/09/2026, transação REVERTIDA)

O risco da 250 não era a sintaxe, era o comportamento: com o índice único e **sem** o trigger,
marcar "Etapa padrão" deixaria de ser bug silencioso e viraria **erro 500 na cara do usuário** —
troca de um defeito por outro. Provado em prod dentro de `BEGIN … ROLLBACK`
(`scripts/lib/management-api.ts`, mesmo padrão da Story 75-280), em três atos: aplicar a
migration → repetir o clique do Joabe (`INSERT` de etapa nova com `is_default = true`) → contar.

| Verificação | Resultado |
|---|---|
| Migration aplica em prod (datafix + índice + trigger) | **ok** |
| INSERT de segunda etapa padrão | **aceito** (sem 500) |
| `count(*) where is_default` depois do INSERT | **1** |
| Quem ficou padrão | `PROVA Follow-up` — a antiga cedeu o posto |
| Estado de prod depois do ROLLBACK | 17 etapas, 1 padrão, "Aguardando atendimento" (pos 0) — **intacto** |

### Debug Log References
- `npx vitest run packages/web/src/app/api/stages packages/web/src/app/dashboard/configuracoes/pipeline`
  → 2 arquivos, **9 testes**, exit 0
- `npx vitest run` (suíte completa) → **299 arquivos, 3.930 passed + 6 expected fail**, exit 0
- `npx tsc --noEmit -p packages/web/tsconfig.json` → **exit 0**
- `npm run lint` (turbo, 8 tasks) → **exit 0**, 0 errors, 30 warnings — todas pré-existentes

### File List
- `docs/stories/75-371-pipeline-gate-etapa-e-default-unico.story.md` (novo)
- `supabase/migrations/250_kanban_stages_default_unico.sql` (novo)
- `packages/web/src/app/dashboard/configuracoes/pipeline/page.tsx` (gate pela capability)
- `packages/web/src/app/dashboard/configuracoes/pipeline/_components/stages-table.tsx` (prop `canEdit`)
- `packages/web/src/app/dashboard/configuracoes/pipeline/_components/mensagem-de-erro.ts` (novo)
- `packages/web/src/app/dashboard/configuracoes/pipeline/_components/mensagem-de-erro.test.ts` (novo)
- `packages/web/src/app/dashboard/configuracoes/pipeline/_components/create-stage-modal.tsx`
- `packages/web/src/app/dashboard/configuracoes/pipeline/_components/edit-stage-modal.tsx`
- `packages/web/src/app/api/stages/[id]/route.ts` (guarda de DELETE)
- `packages/web/src/app/api/stages/[id]/route.test.ts` (novo)

### IDS (search → decide → log)
- **REUSE** `can()` / `CapabilityKey` de `lib/permissions.ts` + `lib/capabilities.ts` — a chave já
  existia e é a MESMA que a RLS lê; nada de constante nova ([[feedback-consultar-fonte-nao-duplicar-constante]]).
- **REUSE** o padrão de mock de `properties/route.test.ts` (decisão de permissão vinda do
  `CAPABILITY_SEED`, não de valor mockado).
- **REUSE** `softDelete` de `lib/api-utils.ts` — a guarda entra ANTES dele, sem tocar no helper.
- **CREATE** `mensagem-de-erro.ts`: o projeto não tem teste de componente ([[feedback-projeto-sem-teste-de-componente]]),
  então a DECISÃO da mensagem saiu do `.tsx` para função pura testável.
- **REJEITADO** corrigir a string no `requireCapability`: 116 call sites, raio de impacto de épico.

### Pendências para @devops
- A migration **250 não foi aplicada** em nenhum banco (só provada e revertida). Aplicar em
  produção pelo runbook: `TRIFOLD_ENV=producao TRIFOLD_ALLOW_PROD=1 pnpm db:apply`.
- Não há `.env.teste` nesta máquina, então o ambiente de teste não foi exercitado.

---

## QA Results

**Gate: CONCERNS** · @qa (Quinn) · 01/09/2026 · árvore não commitada de `fix/75-371-pipeline-etapa-gate-e-default-unico`
Arquivo do gate: `docs/qa/gates/75.371-pipeline-gate-etapa-e-default-unico.yml`

### Rodado por mim (não presumido)
| Comando | Resultado |
|---|---|
| `npx vitest run` (suíte inteira) | 299 arquivos · 3.930 passed + 6 expected fail · exit 0 |
| `npx vitest run` (só os 2 arquivos novos) | 9 testes verdes |
| `npx tsc --noEmit -p packages/web/tsconfig.json` | exit 0 |
| `npm run lint` | 0 errors · 30 warnings, todas pré-existentes |
| `psql` / `docker` | **ausentes nesta máquina** — os achados de banco são analíticos, não medidos |

### Mutações
| # | Mutação | Medido |
|---|---|---|
| M1 | apagar a guarda de DELETE | **2 failed** \| 2 passed — mata |
| M2 | 403 volta a mostrar o corpo cru | **2 failed** \| 3 passed — mata |
| M3 | **reverter o conserto principal** (`page.tsx` → gate antigo) | **3.930 VERDES** — ninguém percebe |
| M4 | remover o ramo do 409 em `mensagem-de-erro.ts:26` | 5 passed — ramo redundante |

Todas desfeitas e conferidas com `diff` contra backup.

### O que está certo
O gate da tela agora é *literalmente* a mesma chamada da API — `can(user.id, user.orgId, "configuracoes.pipeline_editar")` contra `requireCapability` que é `can()` por dentro (`api-auth.ts:76`). Divergência tela↔API deixou de ser possível por construção. **Não há regressão de permissão**: quem perdeu o botão é exatamente quem a API já recusava (seed idêntico em 225/226/227/241/243; RLS 229 lê a mesma chave; admin passa pela herança do pai). Reorder não dispara o trigger (`buildUpdatePayload` só inclui campo presente). 404 vs 409 preservado. AC6 intacta. Convenção da 250 OK (número livre, rollback comentado, re-executável).

### Achados (ordenados)
1. **`high` · QA-75-371-1 — AC1/AC7 · `pipeline/page.tsx:15`** — o conserto principal **não tem teste**. M3 provou: reverter o gate para `canAccess(..., "configuracoes.pipeline")` deixa a suíte inteira verde. A AC7 pede "gate da tela pela capability" e o T7 está `[x]`. Fecha com teste de contrato de fonte, padrão `configuracoes-gate.contract.test.ts` (que a própria story cita).
2. **`high` · QA-75-371-2 — AC3 · `250_*.sql:47-56` × `provision_org` (246:220)** — trigger BEFORE INSERT dispara **antes** da arbitragem do `ON CONFLICT`, e seu efeito **não** é desfeito no `DO NOTHING`. `provision_org()` é declaradamente idempotente e `POST /api/platform/orgs` não tem guarda de "já existe": na 2ª chamada, a linha `('Novo', is_default=true)` faz o trigger zerar o padrão da org e o INSERT é descartado pelo conflito de `(org_id, slug)`. **A org fica com ZERO padrões** — o estado que o comentário da própria migration diz impedir. Reprodução no BEGIN…ROLLBACK está no gate. Trocar para AFTER **não** resolve (índice único parcial não pode ser DEFERRABLE).
3. **`medium` · QA-75-371-3 — AC5 · `250_*.sql:18-30`** — o datafix ordena por `position` sem olhar `is_active`: org com padrão numa etapa **inativa** na posição 0 e outro numa ativa mais adiante mantém a **inativa** — a exata patologia que a story existe para matar. Correção: `ORDER BY k2.is_active DESC, k2.position ASC, …`.
4. **`medium` · QA-75-371-4 — AC4 · `stages-table.tsx:74-82`** — o 409 existe na API e **nunca chega à tela**: `if (res.ok)` engole a recusa; clicar "Excluir" na etapa padrão não mostra nada. O ramo de 409 da função pura é código morto (M4). O argumento de escopo das Dev Notes vale para o 403, não para o 409 — que esta story acabou de criar e só quem PODE editar alcança.
5. **`low` · QA-75-371-5 · `edit-stage-modal.tsx:57`** — desmarcar "Etapa padrão" no modal deixa a org sem padrão, sem qualquer guarda. Mesma invariante do DELETE, dois pesos.
6. **`low` · QA-75-371-6 · `api/stages/[id]/route.ts:70-78`** — a guarda **falha aberta**: o `error` da leitura é descartado e `alvo?.is_default` num `null` deixa passar. Guarda de invariante deveria falhar fechada.
7. **`low` · QA-75-371-7 · `250_*.sql:58-60`** — lacuna de evidência: a prova em prod foi por **service role** (RLS ignorada); o trigger nunca rodou como usuário `authenticated`. Risco analisado como baixo (a mesma policy que autorizou o INSERT autoriza o UPDATE nos irmãos), mas é raciocínio, não medição. Smoke test logado depois de aplicar a 250 fecha.

### Antes do @devops
QA-75-371-1, -2, -3 e -4. Os itens 5 e 6 podem virar story própria; o 7 é smoke test pós-deploy.

---

## Resposta ao QA gate (@dev, 01/09/2026)

Veredito recebido: **CONCERNS**, 4 bloqueios. Todos endereçados; os 2 `low` também, porque são a
mesma invariante e sairiam caros de reabrir depois. Gate original em
`docs/qa/gates/75.371-pipeline-gate-etapa-e-default-unico.yml`.

| Achado | O que foi feito |
|---|---|
| **QA-1** `high` — conserto principal sem teste (reverter o gate deixava a suíte verde) | Novo `pipeline-gate.contract.test.ts`: extrai a capability da FONTE da tela e a da FONTE das duas rotas e **compara**. Divergência tela↔API reprova. Mutação M3 refeita: **3 testes falham**. |
| **QA-2** `high` — `ON CONFLICT DO NOTHING` do `provision_org` × trigger BEFORE INSERT | Guarda no trigger: `IF TG_OP = 'INSERT' AND EXISTS (mesmo org_id+slug) THEN RETURN NEW`. Legítima porque existe `kanban_stages_org_id_slug_key` (UNIQUE (org_id, slug), conferido em prod) — se a linha já existe, o INSERT não pode virar inserção e não há posto a ceder. `ON CONFLICT DO UPDATE`, se algum dia usado, entra pelo ramo de UPDATE do mesmo trigger. |
| **QA-3** `medium` — datafix podia eleger etapa INATIVA | `ORDER BY k2.is_active DESC, position, created_at, id`. |
| **QA-4** `medium` — 409 nunca chegava à tela (`if (res.ok)` mudo) | `stages-table.tsx` passou a ler o corpo, traduzir pela função pura e renderizar o erro na célula de ações. O ramo de 409 deixou de ser código morto. |
| **QA-5** `low` — desmarcar o padrão deixava a org sem padrão | Guarda no `PATCH`: 409 dizendo que o caminho é marcar OUTRA etapa (o trigger transfere o posto). |
| **QA-6** `low` — guarda de DELETE falhava ABERTA | Falha FECHADA: erro de leitura devolve 500 e não exclui. |
| **QA-7** `low` — prova por service role, trigger nunca rodou como `authenticated` | Continua válido como **smoke test pós-deploy**, não foi fechado aqui. Registrado nas pendências. |

### Prova em produção, refeita com o cenário do @qa (transação REVERTIDA)

| Cenário | `count(is_default)` | Quem é o padrão |
|---|---|---|
| **A** — `provision_org` reexecutado numa org existente (slug `novo` conflita e é descartado) | **1** | "Aguardando atendimento" — intacto |
| **B** — clique do Joabe: etapa nova marcada como padrão | **1** | "PROVA Follow-up" — a antiga cedeu |
| **C** — datafix reexecutado | **1** | inalterado (idempotente) |
| **Mutação: A com a guarda REMOVIDA** | **0** | — o furo do QA-2 era real, e medido |

Estado de prod após o ROLLBACK: 17 etapas, 1 padrão, "Aguardando atendimento" (pos 0) — conferido.

### Mutações refeitas (todas matam)

| # | Mutação | Resultado |
|---|---|---|
| M3 | reverter `page.tsx` para o gate antigo | **3 failed** \| 8 passed |
| M5 | apagar a guarda de desmarcar padrão | **1 failed** \| 8 passed |
| M6 | guarda de DELETE volta a falhar aberta | **1 failed** \| 8 passed |
| — | árvore restaurada byte a byte (`diff -q`) | **idêntica** |

### Regressão final
- `npx vitest run` → **300 arquivos, 3.941 passed + 6 expected fail**, exit 0 (era 299/3.930)
- `npx tsc --noEmit -p packages/web/tsconfig.json` → **exit 0**
- `npm run lint` → **exit 0**, 0 errors, 30 warnings (mesmo número de antes, nenhuma nos arquivos tocados)

### Arquivos acrescentados nesta rodada
- `packages/web/src/app/dashboard/configuracoes/pipeline/pipeline-gate.contract.test.ts` (novo)
- `packages/web/src/app/api/stages/[id]/route.test.ts` (4 casos novos de PATCH + falha fechada)
- `packages/web/src/app/dashboard/configuracoes/pipeline/_components/stages-table.tsx` (erro na tela)

### Pendências para @devops
- ~~Migration 250 não aplicada~~ → **APLICADA EM PRODUÇÃO em 01/09/2026 14:02:44Z**, junto com a
  **249** (que estava pendente desde 31/08 e conserta as 8 policies de `storage.objects` que
  negavam tudo a todos — o chamado da Samara). Decisão do Marcos; `db:apply` não tem filtro por
  arquivo, então era as duas ou nenhuma. Ledger registrado via `apply`, `db:status` limpo, 273
  aplicadas. Conferido no banco: índice ✓ trigger ✓ guarda do QA-2 viva no corpo da função ✓
  `prosecdef = 0` ✓ 1 padrão ✓ 0 padrões em etapa inativa ✓ 0 orgs sem padrão ✓ e
  **0 de 8 policies de obra ainda quebradas**.
- ⚠️ **Registro honesto de processo:** a migration foi aplicada com o gate ainda em CONCERNS —
  violação da REGRA ZERO ("deploy sem quality gate @qa"). Foi decisão explícita do Marcos, com o
  risco declarado antes. O re-gate posterior deu **PASS** e confirmou por sha256 e pelo corpo da
  função viva que o que está em prod é a versão corrigida.
- **Smoke test que continua em aberto (@qa R5):** logado como admin real (não service role),
  marcar OUTRA etapa como padrão **com o checkbox marcado** e conferir que o posto transferiu. O
  ramo de transferência do trigger nunca rodou sob RLS de `authenticated` — as duas etapas criadas
  em prod hoje nasceram `is_default = false`.
- **Resíduo de produção (@qa R6), decisão do dono:** ficaram ativas e visíveis no Kanban as etapas
  **"Follow-up"** (pos 18) e **"Joabe"** (pos 19), criadas hoje depois de a capability ser ligada
  para o perfil Gerente-Comercial. "Follow-up" era o objetivo declarado do Joabe; "Joabe" tem cara
  de teste. Excluir é pela tela — e agora, se a API recusar, a tela mostra o motivo.
- Sem `.env.teste` nesta máquina: o ambiente de teste não foi exercitado.

---

## Rodada 3 — resíduos do re-gate PASS (@dev, 01/09/2026)

O @qa fechou em **PASS** e deixou 3 resíduos acionáveis; os 3 foram corrigidos, cada um com
mutação que mata.

| Resíduo | Correção | Mutação |
|---|---|---|
| **R3** `low` — depois de transferir o padrão, a tabela mostrava DUAS linhas "Padrão: Sim" (sintoma NOVO desta story: antes as duas eram verdade) | Decisão extraída para `aplicar-atualizacao-de-etapa.ts` (função pura, 4 testes) — o `.tsx` só chama | remover a transferência → **2 failed** |
| **R1** `low` — o contract test não pegava alargamento por lista de perfis em variável (bypass B6 do @qa) | asserção `.includes(role)` em qualquer forma | reintroduzir o B6 → **2 failed** |
| **R2** `low` — a régua do QA-4 media a CHAMADA da tradução, não a RENDERIZAÇÃO | asserção do `{erro && (…)}` renderizado | remover o render mantendo `setErro` → **1 failed** |

Regressão da rodada 3: **301 arquivos, 3.945 passed + 6 expected fail**, tsc exit 0, lint 0 errors
(30 warnings, mesmo número).

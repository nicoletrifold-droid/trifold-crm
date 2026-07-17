# Story 81-1 — Agenda: coluna `team` + conflito por equipe + Nicole house-only

## Metadata
- **Status:** InReview
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-1-agenda-team-conflito-equipe

## Context
Primeira story do Epic 81. Hoje a regra de conflito da agenda é global à org:

- `isConflict()` (`packages/web/src/lib/appointments/governance.ts:42`) — usada pelo POST
  (`/api/appointments`) e PUT (`/api/appointments/[id]`): conflita se sobrepõe no tempo E
  (mesmo local OU o existente é do Calendly).
- `isSlotFree()` (`packages/ai/src/flows/visit-slot.ts:255`) — Nicole: conflita por TEMPO
  apenas (qualquer appointment ativo bloqueia, independente de local).

O negócio tem duas equipes independentes (HOUSE e IMOB — ver épico). Um compromisso de uma
equipe NÃO pode bloquear o horário da outra — **nem no mesmo decorado** (decisão explícita
do diretor, 2026-07-17).

**Semântica intra-equipe NÃO muda:** dentro da mesma equipe vale a regra atual
(sobreposição + mesmo local, ou Calendly que bloqueia por horário). A mudança é adicionar
a condição "mesma equipe" como pré-requisito de qualquer conflito.

**Stamping do team na criação (POST `/api/appointments`):**
- `appUser.role === "imob"` (Daiana) → `team = 'imob'` (forçado).
- admin/supervisor → podem enviar `body.team` (`'house'|'imob'`, validado); default `'house'`.
- Demais perfis (corretor, gerente-comercial) → `'house'` (forçado, ignora body).
- Nicole (insert direto em `packages/ai/src/chat/pipeline.ts` ~929) → `'house'` explícito.
- Compromissos do Calendly (cron `calendly-sync`) → `'house'` (default cobre).

## Acceptance Criteria
- [x] AC1: Migration adiciona `appointments.team text NOT NULL DEFAULT 'house'` com
  `CHECK (team IN ('house','imob'))`, idempotente (`ADD COLUMN IF NOT EXISTS` +
  `DROP CONSTRAINT IF EXISTS` antes do CHECK). Linhas existentes ficam `'house'` via default.
- [x] AC2: Numeração da migration reconfirmada imediatamente antes da criação
  (`ls supabase/migrations/ | sort -V | tail -3` + checar branches remotas — repositório tem
  sessões concorrentes criando migrations).
- [x] AC3: `isConflict()` recebe `team` no candidato e no existente e retorna `false` sempre
  que `candidate.team !== existing.team`, ANTES de qualquer outra checagem. Intra-equipe:
  comportamento idêntico ao atual (mesmo local OU calendly).
- [x] AC4: POST `/api/appointments` faz o stamping do team conforme regra do Context (role
  imob forçado, admin/supervisor com `body.team` validado, resto forçado house) e grava a
  coluna no insert; o SELECT de conflitos passa `team` ao `isConflict()`.
- [x] AC5: PUT `/api/appointments/[id]` compara conflito usando o team do compromisso
  existente (team NÃO é editável nesta story — quem cria define a equipe).
- [x] AC6: `isSlotFree()` e `checkSlotAvailability()` (Nicole) consideram SOMENTE
  `team = 'house'`: um compromisso IMOB no horário NÃO bloqueia a Nicole.
- [x] AC7: Insert da visita da Nicole (`pipeline.ts`) grava `team: 'house'` explícito.
- [x] AC8: Testes: `governance.test.ts` cobre a matriz (mesma equipe + mesmo local = conflita;
  mesma equipe + local diferente = não; equipes diferentes + MESMO local + mesmo horário = NÃO
  conflita; calendly só bloqueia house). Teste de visit-slot: slot com appointment imob →
  livre para a Nicole.
- [x] AC9: `npm run lint` + `npm run typecheck` passam; migration aplicada em DEV antes de PROD
  (convenção do projeto).

## Out of Scope
- Badge/cores e seletor de equipe no modal — Story 81-2 (o seletor de admin/supervisor da 81-2
  usará o `body.team` que o AC4 já aceita).
- Governança de edição/cancelamento por equipe — Story 81-3.
- Link público, token de imobiliária, desligar Google/Calendly — Story 81-4.
- Tornar `team` editável no PUT — não há caso de uso; reavaliar se surgir.

## Dependencies
- Nenhuma bloqueante. Base para 81-2, 81-3 e 81-4.

## Complexity
- **T-shirt:** M (migration P + mudanças cirúrgicas em 2 libs puras e 2 rotas + testes).

## Business Value
Destrava a regra central do épico: as duas equipes deixam de disputar horário. Sem esta story,
nenhuma das seguintes existe.

## Risks
- **Nicole:** afrouxar o `isSlotFree` (ignorar imob) muda disponibilidade dela — risco de
  double-booking house↔imob é o COMPORTAMENTO DESEJADO; cobrir com teste para não "consertar"
  no futuro por engano.
- Migration aditiva com default constante — sem rewrite perigoso em PG17, baixo risco.
- Numeração de migration em repo com sessões concorrentes (AC2 cobre).

## Definition of Done
- ACs atendidos, testes novos passando, lint/typecheck OK, migration em dev+prod, QA gate PASS,
  push via @devops.

## File List
- `docs/stories/81-1-agenda-team-conflito-por-equipe.story.md` (this file)
- `supabase/migrations/175_appointments_team_house_imob.sql`
- `packages/web/src/lib/appointments/governance.ts`
- `packages/web/src/lib/appointments/governance.test.ts`
- `packages/web/src/app/api/appointments/route.ts`
- `packages/web/src/app/api/appointments/[id]/route.ts`
- `packages/ai/src/flows/visit-slot.ts` (+ teste)
- `packages/ai/src/chat/pipeline.ts`

## Dev Notes (@dev / Dex)
- **AC2 na prática:** nenhuma branch remota reservou 175+ (checado via `git ls-tree` em todas
  as remotas após `git fetch`). Migration = **175**.
- Migration aplicada via Supabase Management API (PAT do `.env.local`) — **DEV primeiro**
  (`xnxvygyfyyyzwhiuoehz`, `ACTIVE_HEALTHY`), depois **PROD** (`dsopqkqjkmhytudaaolv`).
  Verificação pós-aplicação nos 2 ambientes: coluna `team` (text, NOT NULL, default `'house'`),
  constraint `appointments_team_check` presente; em prod, 30/30 appointments = `house`.
- `checkSlotAvailability` roteia TUDO por `isSlotFree` (slot pedido E alternativas) — 1 mudança
  cobre o AC6 inteiro; teste com fake do query-builder exercita o comportamento real.
- `resolveTeam()` no POST decide equipe NO SERVIDOR (role imob forçado; `body.team` só vale
  para admin/supervisor) — corretor não consegue se passar por imob via payload.
- Leitores de `team` fazem fallback `?? "house"` (defensivo para SELECTs antigos em cache).
- **Lint:** `eslint` limpo nos 7 arquivos da story; `npm run lint` do monorepo falha em arquivos
  PRÉ-EXISTENTES não relacionados (weather-widget, informe, kanban-board, distributor.test,
  encoderWorker.min.js) — já quebrado na main antes desta story. `type-check` do monorepo: 8/8 OK.
- Testes: 14/14 governance, 31/31 visit-slot; suíte completa 1040/1040.

## QA Results (@qa / Quinn)
**Veredito: PASS**

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Mudança cirúrgica: guard de equipe como 1ª condição do `isConflict`; `resolveTeam` server-side; fallback `?? "house"` defensivo nos leitores |
| 2. Testes | ✅ 14/14 governance (matriz por equipe incl. cruzado+mesmo local = NÃO conflita), 31/31 visit-slot (fake do query-builder exercita comportamento real), suíte 1040/1040 |
| 3. ACs | ✅ AC1-AC9 verificados; AC1 com teste independente: INSERT `team='invalido'` em DEV → bloqueado pelo CHECK (0 linhas inválidas) |
| 4. Regressões | ✅ Intra-equipe preservado por testes originais (atualizados só com o campo novo); Calendly upsert omite `team` → default cobre e on-conflict não sobrescreve; único outro insert (Nicole) carimbado explícito |
| 5. Performance | ✅ `.eq("team",...)` em tabela de ~30 linhas; sem índice novo necessário |
| 6. Segurança | ✅ Stamping FORÇADO no servidor por role; `body.team` só admin/supervisor; PUT não permite editar `team` (allowlist verificada) |
| 7. Documentação | ✅ Story + épico + comentários no código e na migration |

**Observação (não bloqueante):** o GET `/api/appointments` não retorna `team` no select — a Story 81-2 (badges) DEVE adicioná-lo. Registrado no épico/backlog da 81-2.

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir do Epic 81 (primeira de 4).
- @po (Pax): validação checklist 10 pontos → **GO (10/10)**. Referências de código verificadas contra o repo (anti-alucinação). Status Draft → Ready.
- @dev (Dex): migration 175 criada e aplicada em dev+prod; isConflict/isSlotFree por equipe; stamping server-side no POST; testes novos passando. Status Ready → InReview.
- @qa (Quinn): QA gate **PASS** (7/7), CHECK verificado com insert real em DEV, todos os caminhos de insert auditados. Nota p/ 81-2: GET precisa expor `team`.

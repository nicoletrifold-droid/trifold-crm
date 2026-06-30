# Story 75-75 — Hotfix: mudança de etapa quebrada (FK user_id no trigger de stage_change)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** fix/75-75-stage-change-trigger-user-fk · **Complexidade:** S (1-2 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [teste de banco com JWT humano, typecheck, lint]
- **Prioridade:** 🔴 URGENTE — produção: nenhum usuário consegue mover card no kanban.

## Story
**As a** corretor/gerente/admin, **I want** mover um lead de etapa no kanban (incl. → Perdido, Aguardando atendimento → Atendimento),
**so that** o pipeline volte a funcionar — hoje toda mudança é revertida.

## Contexto (bug confirmado e reproduzido em prod, 2026-06-30)
Reclamações de Fernanda Abreu (gerente-comercial) e Valeria Costa (broker): ao mudar a etapa, o card "volta".

**Causa-raiz:** a migration **124 / Story 75-72** criou o trigger `trg_log_lead_stage_change`, cuja função
`log_lead_stage_change()` insere `activities.user_id = auth.uid()`. Mas `auth.uid()` devolve o ID de `auth.users`
(claim `sub`), enquanto `activities.user_id` tem **FK → `public.users(id)`**, e em `public.users` o `id` ≠ `auth_id`.
Resultado: o INSERT viola `activities_user_id_fkey`, o trigger AFTER UPDATE estoura e o UPDATE de `leads.stage_id`
é **revertido inteiro**. Atinge TODOS os perfis (não é RLS, não é permissão).

**Por que passou no QA da 75-72:** o teste de banco rodou via Management API (role `postgres`), onde `auth.uid()`
é NULL → a FK nunca foi exercitada. Em prod, com JWT de humano, `auth.uid()` = `auth_id` → FK viola.
Confirmado: `0` eventos `stage_change` reais em `activities` desde o deploy. Ver [[project-stage-change-log-quebrado]].

## Escopo
**IN:**
- **Migration 125** (`125_fix_stage_change_trigger_user_fk.sql`): `CREATE OR REPLACE FUNCTION log_lead_stage_change()`
  trocando `auth.uid()` por **`public_user_id()`** (mapeia `auth.uid()` → `public.users.id`; devolve NULL em
  contexto service-role, preservando cron/admin). Demais comportamento idêntico à 124.

**OUT:**
- Não altera o trigger em si (só a função), nem a RLS, nem `activities`. Sem backfill.

## Acceptance Criteria
1. **Given** um usuário logado (broker/gerente/admin) movendo um lead no kanban, **then** o `leads.stage_id`
   persiste E é criada 1 linha `activities` com `type='stage_change'` e `user_id` = `public.users.id` correto.
2. **Given** uma ação via service-role (cron/automação, `auth.uid()` NULL), **then** o evento é gravado com
   `user_id = NULL` sem erro (idêntico à 124).
3. **Given** o teste de banco, **then** ele é executado **sob JWT de humano** (`request.jwt.claims.sub`), não só
   como `postgres` — fechando o furo que deixou a 75-72 passar.
4. typecheck/lint limpos (sem mudança de TS — só migration).

## Dev Notes
- `public_user_id()` já existe: `STABLE SECURITY DEFINER`, `SELECT id FROM users WHERE auth_id = auth.uid()`.
- A migration 124 fica no histórico; a 125 a corrige forward (CREATE OR REPLACE, idempotente, sem alterar dados).

## File List
- `supabase/migrations/125_fix_stage_change_trigger_user_fk.sql` — CREATE OR REPLACE da função.

## QA Results
- **Verdict:** PASS. Testes de banco em prod (transação com ROLLBACK, função da migration 125):
  - **QA-A (JWT humano — Valeria, broker):** UPDATE → `Atendimento` **persistiu**; gerou 1 `stage_change` com
    `user_id = 08b15977…` (= `public.users.id` da Valeria) e `to_stage_id` correto. Antes da correção (função 124):
    `ERROR 23503 activities_user_id_fkey` → UPDATE revertido. Reproduzido também com Fernanda (gerente-comercial).
  - **QA-B (service-role, `auth.uid()` NULL):** `user_id = NULL`, sem erro — comportamento da 124 preservado.
  - **typecheck/lint:** sem mudança de TS, não afetados.
- AC1-4 atendidos. Furo da 75-72 fechado: o teste agora roda sob `request.jwt.claims.sub` (humano), não só `postgres`.

## Change Log
- 2026-06-30 — @sm — Story criada (hotfix do bug introduzido pela 75-72/migration 124). Causa-raiz confirmada e
  reproduzida em prod com JWT de Valeria e Fernanda (FK `activities_user_id_fkey`). Ver [[project-stage-change-log-quebrado]].
- 2026-06-30 — @po — Validada 10/10. GO. Status Draft → Ready.
- 2026-06-30 — @dev — Migration 125 (CREATE OR REPLACE `log_lead_stage_change` usando `public_user_id()`).
  Sem mudança de TS → typecheck/lint não afetados. Branch `fix/75-75-...` criado. Status → InReview.
- 2026-06-30 — @qa — Gate PASS. Reproduzido o bug e validada a correção sob JWT humano (Valeria/Fernanda) +
  service-role, em prod com rollback. Pronto para @devops (push + aplicar migration 125 em prod).
- 2026-06-30 — @devops — Branch pushado, PR #63 (squash merge na main). Migration 125 aplicada em prod via Management API. Verificado live (JWT Valeria → Atendimento OK). Status → Done. **LIVE.**

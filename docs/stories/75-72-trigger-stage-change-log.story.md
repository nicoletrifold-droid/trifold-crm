# Story 75-72 — Trigger no banco para logar mudança de etapa (stage_change)

## Metadata
- **Status:** InReview · **Epic:** 75 · **Branch:** feature/75-72-trigger-stage-change-log · **Complexidade:** M (3-5 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste de banco]

## Story
**As a** gestão/produto, **I want** que TODA mudança de etapa do lead seja registrada em `activities`,
**so that** a timeline do lead e as métricas de movimentação (ex.: visitas por etapa) voltem a funcionar.

## Contexto (bug confirmado em prod, 2026-06-29)
`0` eventos `stage_change` em 30 dias (activities e audit_logs). Causa-raiz: `activities.org_id` é **NOT NULL** +
RLS `INSERT WITH CHECK (org_id = user_org_id())`, mas o insert do **kanban** (`kanban-board.tsx`) não passava
`org_id`/`user_id` **e não checava erro** → falha silenciosa. Ver [[project-stage-change-log-quebrado]].

Decisão (usuário, 2026-06-29): corrigir com **trigger no banco** (não fix client-side) — captura todos os
caminhos (kanban, API, bulk, SQL), fonte única, formato de metadata unificado.

## Escopo
**IN:**
- **Migration 124** (`124_stage_change_activity_trigger.sql`): função `log_lead_stage_change()` (SECURITY DEFINER,
  `search_path=public,pg_temp`) + trigger `trg_log_lead_stage_change` AFTER UPDATE OF stage_id ON leads, com
  `WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)`. Insere em `activities` com `org_id=NEW.org_id`,
  `user_id=auth.uid()`, `type='stage_change'`, descrição e metadata com AMBOS os formatos (`from_stage/to_stage`
  objetos + `from_stage_id/to_stage_id`).
- Remover o insert manual de `activities` (agora redundante e duplicado) em:
  - `components/pipeline/kanban-board.tsx`
  - `app/api/leads/[id]/stage/route.ts` (mantém audit_logs + automations).

**OUT:**
- Não faz backfill dos eventos perdidos (não há como recuperar; fix é forward-looking).
- Não mexe em `audit_logs` (tabela distinta) nem na RLS de `activities`.

## Acceptance Criteria
1. **Given** qualquer alteração de `leads.stage_id` (kanban do dashboard, kanban do corretor, endpoint admin, bulk),
   **then** é criada 1 linha em `activities` com `type='stage_change'`, `org_id` correto e metadata com from/to.
2. **Given** uma alteração que NÃO muda a etapa (UPDATE em outras colunas), **then** nenhum evento é gerado.
3. **Given** o endpoint admin e o kanban, **then** NÃO há mais insert manual de `activities` (sem duplicação).
4. **Given** o trigger, **then** uma mudança de etapa NUNCA falha por causa do log (insert robusto: org_id sempre
   presente, user_id nullable, nomes via COALESCE).
5. typecheck/lint limpos. Validação em banco (dev ou tx com rollback) confirma 1 evento por movimentação.

## Dev Notes
- Owner do trigger (postgres) contorna RLS no insert (SECURITY DEFINER). `auth.uid()` é null em ações via
  service-role — aceitável (user_id nullable em activities).
- Leitura: o relatório (75-71) e a timeline já entendem `to_stage_id` e `to_stage.id` — por isso a metadata traz os
  dois formatos.
- **Risco:** trigger AFTER que dá erro aborta o UPDATE do lead → testar antes de prod (dev ou BEGIN/ROLLBACK).

## File List
- `supabase/migrations/124_stage_change_activity_trigger.sql` — função + trigger.
- `packages/web/src/components/pipeline/kanban-board.tsx` — remove insert manual.
- `packages/web/src/app/api/leads/[id]/stage/route.ts` — remove insert manual (mantém audit_logs/automations).

## QA Results
- **Verdict:** PASS. tsc 0 / lint 0 (só warning pré-existente de `<img>` no kanban-board).
- **Teste em banco (prod, transação com rollback):** UPDATE de etapa num lead real dentro de `BEGIN…RAISE EXCEPTION` → trigger gerou **exatamente 1** evento `stage_change` (`n=1`), metadata correta (`from_stage`/`to_stage` objetos + `*_id`). Rollback confirmado: lead voltou à etapa original, função/trigger/activity não persistiram (`func_existe=false`, `sc_count=0`).
- **Aplicação em prod:** migration 124 aplicada via Supabase Management API; `to_regprocedure('log_lead_stage_change()')` ok e `pg_trigger.trg_log_lead_stage_change` enabled (`tgenabled='O'`). **LIVE.**
- AC1-5 atendidos. Backfill não aplicável (eventos passados não existem).

## Change Log
- 2026-06-29 — @dev — Trigger de banco para logar stage_change (migration 124) + remoção dos 2 inserts manuais
  redundantes. tsc/lint 0. Causa-raiz: RLS/NOT NULL + insert do kanban sem org_id. Pendente: validação em banco e
  aplicação (dev → prod). Ver [[project-stage-change-log-quebrado]].

# Story 75-80 — Bolsão: estado + cron de rebalanceamento (unassign 15 min)

## Metadata
- **Status:** Done (dormente — bolsao_enabled OFF) · **Epic:** 64 · **Branch:** feat/75-80-bolsao-backend-rebalance · **Complexidade:** M (3-5 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do cron (dry-run), teste em banco]

## Story
**As a** gestão, **I want** que um lead distribuído e não atendido em 15 min (horário comercial) saia
automaticamente do corretor e vá pro bolsão (sem dono), **so that** qualquer corretor possa puxá-lo e o lead
seja atendido rápido.

## Escopo
**IN:**
1. **Migration:** coluna `leads.bolsao_em timestamptz null` (quando entrou no bolsão; null = não está no bolsão).
   Flag de config `roleta_config.bolsao_enabled boolean default false` (kill-switch, igual ao SLA).
2. **Cron** `api/cron/bolsao-rebalance` (ou estende `sla-alerts`): a cada ~3-5 min, para cada lead com
   `assigned_broker_id` não-nulo, em etapa "Aguardando atendimento" (slug `novo`), **não atendido**
   (`primeiro_atendimento_em` null) e cuja **última distribuição** (`lead_distribution_log`) tem **≥15 min de
   horário comercial** → mover pro bolsão: `assigned_broker_id = null`, `bolsao_em = now()`.
3. Reusar **business-time** (mesma agenda `roleta_schedule`/relógio do SLA — relógio pausa fora do expediente).
4. **Idempotente** + **dry-run** (`?dry=1`) + gated por `bolsao_enabled` (OFF até validar).
5. Registrar a saída em `activities` (type `bolsao_in`) p/ timeline/auditoria.

**OUT:**
- Não notifica (Story 75-82). Não faz a UI/puxar (Story 75-81). Não mexe na roleta inicial.
- Não reescreve o relógio do SLA (apenas LÊ a distribuição, como o SLA já faz).

## Acceptance Criteria
1. **Given** lead distribuído há ≥15 min comerciais, ainda em "Aguardando atendimento", não atendido,
   **then** o cron seta `assigned_broker_id=null` e `bolsao_em=now()` (sai da base do corretor).
2. **Given** lead já atendido (mudou de etapa / `primeiro_atendimento_em` setado) **then** NÃO vai pro bolsão.
3. **Given** fora do horário comercial, **then** o relógio pausa (15 min só contam dentro do expediente).
4. **Given** `bolsao_enabled=false`, **then** o cron não move nada (dry-run só loga `would`).
5. **Given** lead já no bolsão (`bolsao_em` setado, `assigned_broker_id` null), **then** o cron não o reprocessa.
6. typecheck/lint limpos; teste do handler (dry-run, business-time) + validação em banco com rollback.

## Dev Notes
- Reusar helpers de business-time do SLA (`sla-alerts/route.ts` + lib business-time). Última distribuição:
  `lead_distribution_log` (status distributed, broker do lead, mais recente).
- "Não atendido" = `primeiro_atendimento_em IS NULL` E ainda em stage `novo` (trigger `stamp_primeiro_atendimento`
  carimba ao sair de `novo`). RLS: cron usa service-role (admin client).
- `bolsao_em` serve à Story 75-82 (contar 15 min no bolsão) e à 75-81 (listar o pool).

## File List
- `supabase/migrations/NNN_bolsao_estado.sql` — coluna `bolsao_em` + flag `bolsao_enabled`.
- `packages/web/src/app/api/cron/bolsao-rebalance/route.ts` — cron (ou extensão do sla-alerts).
- `packages/web/src/app/api/cron/bolsao-rebalance/route.test.ts`.

## QA Results
- **Verdict: PASS (dormente).** Migration 127 testada em txn rollback (colunas `bolsao_em`/`bolsao_enabled` criadas).
  Cron: 5 testes (auth 401, move ≥15min com activity, não move <15min, gate OFF, dry-run). type-check 0, lint 0.
  Real: 0 candidatos hoje → seguro. Cron dedicado `*/5` no vercel.json, isolado do sla-alerts (sem regressão).
- ⚠️ **Não ligar `bolsao_enabled` até a Story 75-82** (a escalada de 60min do SLA precisa passar a considerar leads
  sem dono no bolsão; hoje ela filtra `assigned_broker_id is not null`). Por isso nasce gated OFF.

## Change Log
- 2026-06-30 — @sm — Story criada (Epic 64). Backend do bolsão: unassign 15 min em horário comercial, gated.

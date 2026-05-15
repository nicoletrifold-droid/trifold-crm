---
name: Story 30.8 — COUNT FILTER scan único pattern (system-events RPC)
description: Pattern para refator de N COUNT queries em 1 RPC com COUNT(*) FILTER sobre scan único. Diferente do pattern multi-CTE (Story 30.1 analytics).
type: project
---

# Story 30.8 PASS — system-events RPC

**Fact:** `get_system_events_summary(p_org_id, p_window_hours)` agrega 13 counts/AVG em 1 scan único de `system_events WHERE org_id = p_org_id` usando `COUNT(*) FILTER (WHERE ...)`. Diferente do pattern multi-CTE da Story 30.1.

**Why:** Quando todas as agregações são sobre a MESMA tabela com MESMO filtro base (org_id), o pattern ótimo é 1 scan + N `COUNT(*) FILTER (WHERE condition)`. Planner consolida em 1 Aggregate node — custo O(N), não O(N*queries). Multi-CTE (Story 30.1) é melhor quando há JOINs ou tabelas diferentes.

**How to apply:**
- Se todas as queries são `COUNT/AVG` na mesma tabela com mesmo filtro tenant → use `COUNT(*) FILTER` pattern (Story 30.8)
- Se há JOINs ou tabelas diferentes → use multi-CTE pattern (Story 30.1)
- Sempre `LANGUAGE sql STABLE` (não plpgsql) para preservar inlining
- Sempre `SECURITY INVOKER` + `p_org_id` derivado server-side
- `GRANT EXECUTE TO authenticated, service_role`
- Append em 037_dashboard_rpcs_remote_only.sql (idempotente via `CREATE OR REPLACE`)
- Tracking via Mgmt API: `UPDATE schema_migrations` com dollar-quoted strings

**Performance evidence:**
- 13 RTTs sequenciais (~600ms-1s TTFB) → 2 RTTs (1 query rows + 1 RPC, ~150ms)
- EXPLAIN ANALYZE: 14.86ms agregação (697 rows, Seq Scan ótimo no volume atual)
- Índices Epic 29 dormentes mas funcionais para crescimento (>10k rows → planner alterna automaticamente)

**TypeScript pattern recap:**
- Type alias local `SystemEventsSummary` com `number | string` para bigints
- Helper `num()` para cast bigint-as-string → number (PostgREST quirk)
- Helper `status(errors, warns)` para health derivation em TS
- `emptySummary` fallback se RPC falhar (graceful degradation, response não quebra)
- `rag_fallback_rate` em TS com divisão protegida (`total > 0 ? ... : 0`)
- NEVER `as any`; always tipo explícito

**Date closed:** 2026-05-14

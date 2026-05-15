---
name: Story 30.8 FASE 1 entregue
description: RPC get_system_events_summary aplicada via Mgmt API; tracking 037 4->6 statements; EXPLAIN 14.86ms (alvo <100ms)
type: project
---

Story 30.8 (Epic 30 Wave 2) FASE 1 entregue 2026-05-14:

- Append em `supabase/migrations/037_dashboard_rpcs_remote_only.sql` da função `get_system_events_summary(p_org_id uuid, p_window_hours int DEFAULT 24)` — `LANGUAGE sql STABLE SECURITY INVOKER`, retorna jsonb com 13 chaves (errors_24h, messages_24h, avg_claude_response_ms, rag_total_24h, rag_fallbacks_24h + 8 health counters bot/ai/webhook/cron x errors/warns 30m).
- Apply via Mgmt API: 2 statements (CREATE OR REPLACE + GRANT) — `[]` retorno (DDL success).
- Tracking schema_migrations version 037: `statements::text[]` apendado de 4 -> 6 entries via dollar-quoted strings ($MIG_A$/$MIG_B$) — padrão reusado das Stories 30.5/30.1.
- EXPLAIN ANALYZE: agregação interna 14.858ms (Seq Scan em ~890 rows, planner choice ótimo no volume baixo), chamada RPC 2.628ms total. Alvo <100ms cumprido com folga ~5x.
- Build `pnpm --filter @trifold/web build` PASS (sem mudanças TS).

Why: substitui 14 round-trips de COUNT/SELECT do `/api/system-events/route.ts` por 1 RTT, removendo ~600ms+ de latência no dashboard sistema (polling 30s).

How to apply: FASE 2 pendente @dev — refator de `packages/web/src/app/api/system-events/route.ts` substituindo queries 2-14 por `supabase.rpc('get_system_events_summary', { p_org_id, p_window_hours: 24 })` + manter query 1 (lista de eventos) separada. Shape do response `{ data, metrics, health }` deve ser preservado para evitar churn no consumer `/dashboard/sistema/page.tsx`.

Detalhes técnicos:
- Volume atual da org de teste (`00000000-0000-0000-0000-000000000001`): 697 rows; total da tabela ~890 rows.
- Índices Epic 29 (`idx_system_events_org_level_created`, `idx_system_events_org_category_created`) confirmados presentes — ficam dormentes no volume atual mas serão escolhidos automaticamente quando tabela crescer (>10K rows).
- `messages_24h` filtra `category='bot' AND level='info'` — fidelidade 1:1 ao route.ts; data real só tem categorias `ai/webhook/cron`, então retorna 0 hoje (consistente com comportamento atual).
- `avg_claude_response_ms` preserva semântica de "AVG sobre últimos 100 eventos `event_type=CLAUDE_RESPONSE` na janela" via subselect com LIMIT.
- Janela 30min para health é hardcoded na RPC (espelha route.ts); apenas janela 24h para métricas é parâmetro `p_window_hours`.

Próximo: FASE 2 @dev (refator route.ts ~1h + smoke humano em /dashboard/sistema).

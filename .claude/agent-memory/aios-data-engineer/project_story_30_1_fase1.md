---
name: Story 30.1 FASE 1 entregue (RPC get_analytics_summary)
description: FASE 1 da Story 30.1 entregue 2026-05-14 — RPC mestre `get_analytics_summary(uuid, timestamptz)` aplicada via Mgmt API com EXPLAIN ANALYZE 3.8ms; append em 037 (2→4 statements); FASE 2 (@dev page.tsx + 4 rotas API) pendente
type: project
---

Story 30.1 FASE 1 (Wave 2 do Epic 30 — over-fetch killers) entregue em 2026-05-14.

**Entregue:**
- `public.get_analytics_summary(p_org_id uuid, p_since timestamptz)` criada (LANGUAGE sql, STABLE, SECURITY INVOKER)
- Retorna `jsonb` com shape: funnel[], by_property[], by_broker[], source_counts{}, lost_reasons{}, total_leads, new_leads
- Append em `supabase/migrations/037_dashboard_rpcs_remote_only.sql` (compartilhado com Story 30.5)
- Aplicado via Supabase Management API (pattern dollar-quote-safe: heredoc 'EOF' + curl --data-binary)
- Tracking `schema_migrations` v037: 2 → 4 statements
- GRANT EXECUTE: authenticated + service_role

**EXPLAIN ANALYZE (169 leads, 1 org):**
- Execution Time: 3.803 ms / Planning: 13.669 ms / Buffers: shared hit=95
- Índices: idx_leads_assigned_broker (Epic 29), idx_leads_stage, idx_leads_property_interest, idx_properties_org, kanban_stages_org_id_slug_key
- Seq Scan apenas em source_agg e totals (esperado em tabela pequena)
- Alvo era <50ms — atingido com folga (~13x abaixo)

**Achados do spike que divergiram da story:**
- FK broker é `assigned_broker_id` (story exemplo usava `assigned_to`) — RPC corrigida
- `leads.source` é enum USER-DEFINED → cast `::text` necessário em `jsonb_object_agg`
- `kanban_stages` tem `org_id` próprio — filtro multi-tenant explícito adicionado

**Why:** É a tela MAIS LENTA do CRM (~800ms-2s TTFB com ~190KB de payload de UUIDs inúteis). RPC server-side com agregação JSON enxuto deve cair para <300ms TTFB e <5KB payload.

**How to apply:** Próxima fase é @dev (FASE 2) — refatorar `page.tsx` (3 queries), `/api/analytics/route.ts` (5 queries) e fixar over-fetch médio/leve em `/api/analytics/campaigns/route.ts` e `/api/analytics/sources/route.ts`. Status story permanece `Ready` até FASE 2 completar.

**Coordenação:** Story 30.5 já aplicou `get_dashboard_stage_counts` (Story 30.5 FASE 1, 2026-05-14). Story 30.8 (próxima a usar 037) deve fazer append idempotente igual.

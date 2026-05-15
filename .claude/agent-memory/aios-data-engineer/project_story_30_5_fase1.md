---
name: Story 30.5 FASE 1 entregue
description: RPC get_dashboard_stage_counts criada via Management API 2026-05-14; planner usa Seq Scan no dataset atual (correto); FASE 2 pendente @dev
type: project
---

**Story 30.5 (Epic 30 — Over-fetch & N+1 Killers, Wave 1) — FASE 1 entregue 2026-05-14.**

Arquivo `supabase/migrations/037_dashboard_rpcs_remote_only.sql` criado (compartilhado com 30.1 e 30.8 — quem rodar primeiro cria; demais fazem append via CREATE OR REPLACE).

Função `public.get_dashboard_stage_counts(p_org_id uuid) RETURNS TABLE(stage_id uuid, total bigint) LANGUAGE sql STABLE SECURITY INVOKER` aplicada via Management API. GRANT EXECUTE para `authenticated, service_role`. Tracking 037 inserido em `supabase_migrations.schema_migrations`.

**EXPLAIN ANALYZE (dataset 169 rows):**
- Default planner: Seq Scan + HashAggregate, 0.445ms — escolha correta para tabela pequena (12 buffers)
- Com `enable_seqscan=off`: Index Scan em `idx_leads_stage` (não no composite `idx_leads_org_stage_active`), 2.938ms
- Composite `idx_leads_org_stage_active` disponível (mig 032) — planner alternará conforme volume crescer

**Why:** N+1 atual em `/dashboard/page.tsx` (linhas 31-41) faz 6+ RTTs Supabase (1 count por stage). RPC substitui por 1 RTT.

**How to apply:** FASE 2 do @dev: atualizar `packages/web/src/app/dashboard/page.tsx` para chamar `supabase.rpc('get_dashboard_stage_counts', { p_org_id: orgId })` e mapear via `Object.fromEntries` para `Record<string, number>`. Story file documenta padrão exato. Status: Ready (FASE 1 não muda status — story completa só com FASE 2 entregue).

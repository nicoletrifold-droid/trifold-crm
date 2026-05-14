-- =============================================================================
-- Migration 037: Dashboard RPCs (remoto apenas — sem supabase db push)
-- Applied via Supabase Management API at 2026-05-14
-- Kept as local stub to match remote migration history
-- =============================================================================
--
-- Epic: 30 — Over-fetch & N+1 Killers (Wave 1)
-- Arquivo compartilhado por Stories 30.1, 30.5 e 30.8
-- Quem rodar primeiro cria; demais fazem append com CREATE OR REPLACE FUNCTION
-- Tracking: version '037' em supabase_migrations.schema_migrations
--
-- Reason: substituir padrões N+1 / over-fetch em queries de dashboard por
-- RPCs Postgres agregadas. Cada RPC capitaliza índices existentes do Epic 29
-- (composite, partial, hot indexes) para entregar resultados em 1 RTT.
--
-- Idempotente: todas as funções usam CREATE OR REPLACE FUNCTION.

-- =============================================================================
-- Story 30.5: get_dashboard_stage_counts
-- Elimina N+1 no /dashboard/page.tsx (stages.map → 1 RPC com GROUP BY)
-- Capitaliza idx_leads_org_stage_active (Epic 29, Story 29.3 — migration 032)
-- =============================================================================
--
-- Propósito: retornar contagem agregada de leads ativos por stage para um org.
-- Parâmetros:
--   p_org_id (uuid) — Id do org (multi-tenant filter)
-- Retorno: TABLE(stage_id uuid, total bigint)
--   - stage_id: UUID do kanban_stages
--   - total:    quantidade de leads ativos naquele stage
-- Exemplo: SELECT * FROM get_dashboard_stage_counts('00000000-0000-0000-0000-000000000001');
-- Segurança: SECURITY INVOKER — herda RLS do caller autenticado.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stage_counts(p_org_id uuid)
RETURNS TABLE (stage_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT stage_id, COUNT(*)::bigint AS total
  FROM leads
  WHERE org_id = p_org_id
    AND is_active = true
  GROUP BY stage_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stage_counts(uuid) TO authenticated, service_role;

-- =============================================================================
-- ROLLBACK PLAN
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.get_dashboard_stage_counts(uuid);

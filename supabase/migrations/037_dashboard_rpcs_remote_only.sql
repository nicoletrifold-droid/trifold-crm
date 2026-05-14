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
-- Story 30.1: get_analytics_summary
-- Elimina over-fetch de ~9.500 UUIDs em /dashboard/analytics e /api/analytics/*
-- Substitui 3 queries de joins `leads(id)` + 2 queries de `.limit(10000)` por 1 RTT.
-- Capitaliza idx_leads_org_active_updated e idx_leads_org_stage_active
-- (Epic 29, Story 29.3 — migration 032).
-- =============================================================================
--
-- Propósito: agregar tudo que /dashboard/analytics e /api/analytics consomem
-- (funil por stage, contagem por property, contagem + avg_score por broker,
-- source_counts e lost_reasons por período, total_leads, new_leads) num único
-- jsonb enxuto (~5KB ao invés de ~190KB).
--
-- Parâmetros:
--   p_org_id (uuid)       — Id do org (multi-tenant filter)
--   p_since  (timestamptz) — Início do período para new_leads e source_counts
--                            (default: date_trunc('month', now()))
-- Retorno: jsonb
--   {
--     "funnel": [{stage_id,name,slug,color,position,count}],
--     "by_property": [{property_id,name,count}],
--     "by_broker": [{user_id,name,count,avg_score}],
--     "source_counts": {<source>: <count>},
--     "lost_reasons": {<reason>: <count>},
--     "total_leads": <int>,
--     "new_leads": <int>
--   }
-- Segurança: SECURITY INVOKER — herda RLS do caller autenticado.
-- Nota: FK broker é `assigned_broker_id` (confirmado via spike 2026-05-14).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_analytics_summary(
  p_org_id uuid,
  p_since  timestamptz DEFAULT (date_trunc('month', now()))
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH
  -- Funil: count de leads ativos por stage (todos os períodos)
  funnel AS (
    SELECT
      ks.id          AS stage_id,
      ks.name,
      ks.slug,
      ks.color,
      ks.position,
      COUNT(l.id)::int AS count
    FROM kanban_stages ks
    LEFT JOIN leads l
      ON l.stage_id = ks.id
     AND l.org_id = p_org_id
     AND l.is_active = true
    WHERE ks.org_id = p_org_id
      AND ks.is_active = true
    GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position
    ORDER BY ks.position
  ),
  -- Por empreendimento: count de leads ativos
  by_property AS (
    SELECT
      p.id          AS property_id,
      p.name,
      COUNT(l.id)::int AS count
    FROM properties p
    LEFT JOIN leads l
      ON l.property_interest_id = p.id
     AND l.org_id = p_org_id
     AND l.is_active = true
    WHERE p.org_id = p_org_id
      AND p.is_active = true
    GROUP BY p.id, p.name
  ),
  -- Por corretor: count + avg qualification_score (FK = assigned_broker_id)
  by_broker AS (
    SELECT
      u.id            AS user_id,
      u.name,
      COUNT(l.id)::int                                      AS count,
      COALESCE(ROUND(AVG(l.qualification_score))::int, 0)   AS avg_score
    FROM users u
    LEFT JOIN leads l
      ON l.assigned_broker_id = u.id
     AND l.org_id = p_org_id
     AND l.is_active = true
    WHERE u.org_id = p_org_id
      AND u.role::text = 'broker'
      AND u.is_active = true
    GROUP BY u.id, u.name
  ),
  -- Sources filtrados por período (p_since) — leads ativos criados desde p_since
  source_agg AS (
    SELECT source::text AS source, COUNT(*)::int AS cnt
    FROM leads
    WHERE org_id = p_org_id
      AND is_active = true
      AND created_at >= p_since
      AND source IS NOT NULL
    GROUP BY source
  ),
  -- Lost reasons: leads ativos com motivo de perda (mesmo padrão do código atual,
  -- sem filtro de período — alinhado com `/api/analytics/route.ts` linhas 68-70)
  lost_agg AS (
    SELECT lost_reason, COUNT(*)::int AS cnt
    FROM leads
    WHERE org_id = p_org_id
      AND is_active = true
      AND lost_reason IS NOT NULL
    GROUP BY lost_reason
  ),
  -- Contagens totais e novos no período
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE is_active = true)::int                          AS total_leads,
      COUNT(*) FILTER (WHERE is_active = true AND created_at >= p_since)::int AS new_leads
    FROM leads
    WHERE org_id = p_org_id
  )
  SELECT jsonb_build_object(
    'funnel',        COALESCE((SELECT jsonb_agg(f) FROM funnel f),          '[]'::jsonb),
    'by_property',   COALESCE((SELECT jsonb_agg(bp) FROM by_property bp),   '[]'::jsonb),
    'by_broker',     COALESCE((SELECT jsonb_agg(bb) FROM by_broker bb),     '[]'::jsonb),
    'source_counts', COALESCE((SELECT jsonb_object_agg(source, cnt) FROM source_agg),         '{}'::jsonb),
    'lost_reasons',  COALESCE((SELECT jsonb_object_agg(lost_reason, cnt) FROM lost_agg),      '{}'::jsonb),
    'total_leads',   (SELECT total_leads FROM totals),
    'new_leads',     (SELECT new_leads FROM totals)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_summary(uuid, timestamptz) TO authenticated, service_role;

-- =============================================================================
-- Story 30.8: get_system_events_summary
-- Elimina 14 queries sequenciais em /api/system-events/route.ts (1 RPC com FILTER)
-- Capitaliza idx_system_events_org_level_created e idx_system_events_org_category_created
-- (Epic 29, Story 29.3 — migration 032)
-- =============================================================================
--
-- Propósito: retornar todas as métricas agregadas do dashboard de sistema
--            em 1 RTT, substituindo 14 COUNT queries individuais.
--            (A query de listagem de eventos recentes — com filtros opcionais
--            de level/category e limit — permanece como SELECT separado no
--            route.ts, pois retorna rows, não counts.)
--
-- Parâmetros:
--   p_org_id       (uuid) — Id do org (multi-tenant filter)
--   p_window_hours (int)  — Janela em horas para métricas 24h (default: 24)
--                           (A janela de health é hardcoded em 30 minutos,
--                            espelhando comportamento atual do route.ts.)
--
-- Retorno: jsonb com 14 chaves:
--   {
--     "errors_24h":                 bigint,
--     "messages_24h":               bigint,
--     "avg_claude_response_ms":     numeric | null,
--     "rag_total_24h":              bigint,
--     "rag_fallbacks_24h":          bigint,
--     "health_bot_errors_30m":      bigint,
--     "health_bot_warns_30m":       bigint,
--     "health_ai_errors_30m":       bigint,
--     "health_ai_warns_30m":        bigint,
--     "health_webhook_errors_30m":  bigint,
--     "health_webhook_warns_30m":   bigint,
--     "health_cron_errors_30m":     bigint,
--     "health_cron_warns_30m":      bigint
--   }
--
-- Notas de design:
--   - LANGUAGE sql STABLE para permitir inlining do planner.
--   - Todos os COUNT(*) FILTER avaliam contra a mesma scan de system_events
--     (WHERE org_id = p_org_id), o planner consolida em 1 leitura.
--   - avg_claude_response_ms usa subselect com LIMIT 100 (espelha código atual
--     em route.ts linhas 79-93). NULLIF guard implícito via filtro
--     `metadata->>'response_time_ms' IS NOT NULL`.
--   - rag_fallback_rate é derivada em TS (não vai para SQL — economiza overhead).
--
-- Exemplo:
--   SELECT get_system_events_summary('00000000-0000-0000-0000-000000000001', 24);
--
-- Segurança: SECURITY INVOKER — herda RLS do caller autenticado.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_system_events_summary(
  p_org_id       uuid,
  p_window_hours int DEFAULT 24
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    -- Métricas janela 24h (configurável via p_window_hours)
    'errors_24h',
      COUNT(*) FILTER (WHERE level = 'error'
                         AND created_at >= NOW() - (p_window_hours || ' hours')::interval),
    'messages_24h',
      COUNT(*) FILTER (WHERE category = 'bot'
                         AND level = 'info'
                         AND created_at >= NOW() - (p_window_hours || ' hours')::interval),
    -- Média de resposta Claude: AVG dos últimos 100 eventos CLAUDE_RESPONSE na janela
    'avg_claude_response_ms',
      (SELECT AVG((se2.metadata->>'response_time_ms')::numeric)
         FROM (
           SELECT metadata
             FROM system_events
            WHERE org_id = p_org_id
              AND event_type = 'CLAUDE_RESPONSE'
              AND created_at >= NOW() - (p_window_hours || ' hours')::interval
              AND metadata->>'response_time_ms' IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 100
         ) se2),
    -- RAG metrics na janela
    'rag_total_24h',
      COUNT(*) FILTER (WHERE event_type IN ('RAG_FALLBACK', 'RAG_SUCCESS')
                         AND created_at >= NOW() - (p_window_hours || ' hours')::interval),
    'rag_fallbacks_24h',
      COUNT(*) FILTER (WHERE event_type = 'RAG_FALLBACK'
                         AND created_at >= NOW() - (p_window_hours || ' hours')::interval),
    -- Health por categoria (janela 30 min hardcoded, espelha route.ts)
    'health_bot_errors_30m',
      COUNT(*) FILTER (WHERE category = 'bot' AND level = 'error'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_bot_warns_30m',
      COUNT(*) FILTER (WHERE category = 'bot' AND level = 'warn'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_ai_errors_30m',
      COUNT(*) FILTER (WHERE category = 'ai' AND level = 'error'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_ai_warns_30m',
      COUNT(*) FILTER (WHERE category = 'ai' AND level = 'warn'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_webhook_errors_30m',
      COUNT(*) FILTER (WHERE category = 'webhook' AND level = 'error'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_webhook_warns_30m',
      COUNT(*) FILTER (WHERE category = 'webhook' AND level = 'warn'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_cron_errors_30m',
      COUNT(*) FILTER (WHERE category = 'cron' AND level = 'error'
                         AND created_at >= NOW() - INTERVAL '30 minutes'),
    'health_cron_warns_30m',
      COUNT(*) FILTER (WHERE category = 'cron' AND level = 'warn'
                         AND created_at >= NOW() - INTERVAL '30 minutes')
  )
  FROM system_events
  WHERE org_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_events_summary(uuid, int) TO authenticated, service_role;

-- =============================================================================
-- ROLLBACK PLAN
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.get_dashboard_stage_counts(uuid);
-- DROP FUNCTION IF EXISTS public.get_analytics_summary(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.get_system_events_summary(uuid, int);

-- 081_fix_analytics_summary_lost_reason
-- Adiciona AND lost_reason IS NULL em todos os CTEs de get_analytics_summary
-- para seguir fielmente o pipeline (mesmo critério do dashboard e pipeline view).
-- Exceção: lost_agg permanece sem o filtro — ela conta especificamente leads perdidos.

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
     AND l.lost_reason IS NULL
    WHERE ks.org_id = p_org_id
      AND ks.is_active = true
    GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position
    ORDER BY ks.position
  ),
  by_property AS (
    SELECT
      p.id   AS property_id,
      p.name,
      COUNT(l.id)::int AS count
    FROM properties p
    LEFT JOIN leads l
      ON l.property_interest_id = p.id
     AND l.org_id = p_org_id
     AND l.is_active = true
     AND l.lost_reason IS NULL
    WHERE p.org_id = p_org_id
      AND p.is_active = true
    GROUP BY p.id, p.name
  ),
  by_broker AS (
    SELECT
      u.id   AS user_id,
      u.name,
      COUNT(l.id)::int                                      AS count,
      COALESCE(ROUND(AVG(l.qualification_score))::int, 0)   AS avg_score
    FROM users u
    LEFT JOIN leads l
      ON l.assigned_broker_id = u.id
     AND l.org_id = p_org_id
     AND l.is_active = true
     AND l.lost_reason IS NULL
    WHERE u.org_id = p_org_id
      AND u.role::text = 'broker'
      AND u.is_active = true
    GROUP BY u.id, u.name
  ),
  source_agg AS (
    SELECT source::text AS source, COUNT(*)::int AS cnt
    FROM leads
    WHERE org_id = p_org_id
      AND is_active = true
      AND lost_reason IS NULL
      AND created_at >= p_since
      AND source IS NOT NULL
    GROUP BY source
  ),
  lost_agg AS (
    SELECT lost_reason, COUNT(*)::int AS cnt
    FROM leads
    WHERE org_id = p_org_id
      AND is_active = true
      AND lost_reason IS NOT NULL
    GROUP BY lost_reason
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE is_active = true AND lost_reason IS NULL)::int                          AS total_leads,
      COUNT(*) FILTER (WHERE is_active = true AND lost_reason IS NULL AND created_at >= p_since)::int AS new_leads
    FROM leads
    WHERE org_id = p_org_id
  )
  SELECT jsonb_build_object(
    'funnel',        COALESCE((SELECT jsonb_agg(f)  FROM funnel f),         '[]'::jsonb),
    'by_property',   COALESCE((SELECT jsonb_agg(bp) FROM by_property bp),   '[]'::jsonb),
    'by_broker',     COALESCE((SELECT jsonb_agg(bb) FROM by_broker bb),     '[]'::jsonb),
    'source_counts', COALESCE((SELECT jsonb_object_agg(source, cnt) FROM source_agg),        '{}'::jsonb),
    'lost_reasons',  COALESCE((SELECT jsonb_object_agg(lost_reason, cnt) FROM lost_agg),     '{}'::jsonb),
    'total_leads',   (SELECT total_leads FROM totals),
    'new_leads',     (SELECT new_leads  FROM totals)
  );
$$;

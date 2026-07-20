-- Story 75-179 — Analytics: `total_leads` passa a contar TODAS as entradas do período.
--
-- Antes (mig 109/136), `total_leads` era IDÊNTICO a `new_leads` (ambos filtravam
-- is_active=true AND lost_reason IS NULL). Ficava impossível mostrar "Entradas"
-- (todas) separado de "Ativos" (subconjunto). Agora:
--   - total_leads = todos os leads criados na janela (segmento principal)      → ENTRADAS
--   - new_leads   = criados na janela, is_active=true e não-perdidos           → ATIVOS
--   - lost_agg    = perdidos da janela SEM filtro is_active (subconjunto real das entradas)
-- Demais CTEs (funnel, by_property, by_broker, source_agg) seguem base ativos (funil).

CREATE OR REPLACE FUNCTION public.get_analytics_summary_ranged(
  p_org_id uuid,
  p_since timestamp with time zone DEFAULT date_trunc('month'::text, now()),
  p_until timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  WITH
  funnel AS (
    SELECT ks.id AS stage_id, ks.name, ks.slug, ks.color, ks.position, COUNT(l.id)::int AS count
    FROM kanban_stages ks
    LEFT JOIN leads l ON l.stage_id = ks.id AND l.org_id = p_org_id AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL AND l.created_at >= p_since AND l.created_at < p_until
    WHERE ks.org_id = p_org_id AND ks.is_active = true
    GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position ORDER BY ks.position
  ),
  by_property AS (
    SELECT p.id AS property_id, p.name, COUNT(l.id)::int AS count
    FROM properties p
    LEFT JOIN leads l ON l.property_interest_id = p.id AND l.org_id = p_org_id AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL AND l.created_at >= p_since AND l.created_at < p_until
    WHERE p.org_id = p_org_id AND p.is_active = true GROUP BY p.id, p.name
  ),
  by_broker AS (
    SELECT u.id AS user_id, u.name, COUNT(l.id)::int AS count, COALESCE(ROUND(AVG(l.qualification_score))::int, 0) AS avg_score
    FROM users u
    LEFT JOIN leads l ON l.assigned_broker_id = u.id AND l.org_id = p_org_id AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL AND l.created_at >= p_since AND l.created_at < p_until
    WHERE u.org_id = p_org_id AND u.role::text = 'broker' AND u.is_active = true GROUP BY u.id, u.name
  ),
  source_agg AS (
    SELECT source::text AS source, COUNT(*)::int AS cnt FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND is_active = true AND lost_reason IS NULL
      AND created_at >= p_since AND created_at < p_until AND source IS NOT NULL GROUP BY source
  ),
  lost_agg AS (
    -- Story 75-179: sem filtro is_active — perdidos = subconjunto real das entradas.
    SELECT lost_reason, COUNT(*)::int AS cnt FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND lost_reason IS NOT NULL
      AND created_at >= p_since AND created_at < p_until GROUP BY lost_reason
  ),
  totals AS (
    -- Story 75-179: total_leads = TODAS as entradas; new_leads = ativos não-perdidos.
    SELECT COUNT(*) FILTER (WHERE created_at >= p_since AND created_at < p_until)::int AS total_leads,
           COUNT(*) FILTER (WHERE is_active = true AND lost_reason IS NULL AND created_at >= p_since AND created_at < p_until)::int AS new_leads
    FROM leads WHERE org_id = p_org_id AND segmento = 'principal'
  )
  SELECT jsonb_build_object(
    'funnel', COALESCE((SELECT jsonb_agg(f) FROM funnel f),'[]'::jsonb),
    'by_property', COALESCE((SELECT jsonb_agg(bp) FROM by_property bp),'[]'::jsonb),
    'by_broker', COALESCE((SELECT jsonb_agg(bb) FROM by_broker bb),'[]'::jsonb),
    'source_counts', COALESCE((SELECT jsonb_object_agg(source, cnt) FROM source_agg),'{}'::jsonb),
    'lost_reasons', COALESCE((SELECT jsonb_object_agg(lost_reason, cnt) FROM lost_agg),'{}'::jsonb),
    'total_leads', (SELECT total_leads FROM totals),
    'new_leads', (SELECT new_leads FROM totals)
  );
$function$

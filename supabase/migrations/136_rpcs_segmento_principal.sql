-- 136_rpcs_segmento_principal.sql
-- Story 75-98 (Fase 1b) — as RPCs de agregação do mundo principal passam a excluir o
-- segmento IMOB (leads.segmento='imob'). "IMOB não contabiliza nada" (decisão do diretor).
-- Lógica idêntica às versões atuais; só adiciona AND segmento='principal' em cada leitura de leads.
-- NO-OP no dado atual (todos os leads são 'principal').

-- 1) get_dashboard_stage_counts --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stage_counts(p_org_id uuid)
 RETURNS TABLE(stage_id uuid, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT stage_id, COUNT(*)::bigint AS total
  FROM leads
  WHERE org_id = p_org_id
    AND segmento = 'principal'
    AND is_active = true
    AND lost_reason IS NULL
  GROUP BY stage_id;
$function$;

-- 2) get_broker_funnel_stats -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_broker_funnel_stats(p_org_id uuid, p_broker_id uuid)
 RETURNS TABLE(stage_id uuid, stage_name text, stage_slug text, stage_color text, stage_position integer, total_leads integer, leads_atrasadas integer, leads_para_hoje integer, leads_futuras integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_today_start timestamptz; v_tomorrow_start timestamptz;
BEGIN
  v_today_start := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';
  RETURN QUERY
  -- ks.name/slug/color são varchar → cast p/ text (a RETURNS TABLE declara text).
  -- Corrige bug pré-existente "structure of query does not match function result type".
  SELECT ks.id, ks.name::text, ks.slug::text, ks.color::text, ks.position,
    COUNT(DISTINCT l.id)::integer,
    COUNT(DISTINCT CASE WHEN lt.completed_at IS NULL AND lt.due_at < v_today_start THEN l.id END)::integer,
    COUNT(DISTINCT CASE WHEN lt.completed_at IS NULL AND lt.due_at >= v_today_start AND lt.due_at < v_tomorrow_start THEN l.id END)::integer,
    COUNT(DISTINCT CASE WHEN lt.completed_at IS NULL AND lt.due_at >= v_tomorrow_start THEN l.id END)::integer
  FROM kanban_stages ks
  LEFT JOIN leads l ON l.stage_id = ks.id AND l.org_id = p_org_id
    AND l.segmento = 'principal'
    AND l.is_active = true AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
  LEFT JOIN lead_tasks lt ON lt.lead_id = l.id
  WHERE ks.is_active = true
  GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position
  ORDER BY ks.position;
END;
$function$;

-- 3) get_broker_dashboard_counts -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_broker_dashboard_counts(p_org_id uuid, p_broker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_aguardando_stage_id uuid := '00000000-0000-0000-0001-000000000001';
  v_today_start timestamptz; v_tomorrow_start timestamptz;
  v_total integer; v_novos integer; v_sem_tarefas integer; v_atrasadas integer; v_para_hoje integer; v_futuras integer;
BEGIN
  v_today_start := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';
  SELECT COUNT(*)::integer INTO v_total FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);
  SELECT COUNT(*)::integer INTO v_novos FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id = v_aguardando_stage_id AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);
  SELECT COUNT(*)::integer INTO v_sem_tarefas FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND NOT EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = l.id AND lt.completed_at IS NULL);
  SELECT COUNT(DISTINCT l.id)::integer INTO v_atrasadas FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at < v_today_start;
  SELECT COUNT(DISTINCT l.id)::integer INTO v_para_hoje FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at >= v_today_start AND lt.due_at < v_tomorrow_start;
  SELECT COUNT(DISTINCT l.id)::integer INTO v_futuras FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at >= v_tomorrow_start;
  RETURN jsonb_build_object('total', v_total, 'novos', v_novos, 'trabalhados', v_total - v_novos,
    'sem_tarefas', v_sem_tarefas, 'atrasadas', v_atrasadas, 'para_hoje', v_para_hoje, 'futuras', v_futuras);
END;
$function$;

-- 4) get_analytics_summary_ranged ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_summary_ranged(p_org_id uuid, p_since timestamp with time zone DEFAULT date_trunc('month'::text, now()), p_until timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  funnel AS (
    SELECT ks.id AS stage_id, ks.name, ks.slug, ks.color, ks.position, COUNT(l.id)::int AS count
    FROM kanban_stages ks
    LEFT JOIN leads l ON l.stage_id = ks.id AND l.org_id = p_org_id
      AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL
      AND l.created_at >= p_since AND l.created_at < p_until
    WHERE ks.org_id = p_org_id AND ks.is_active = true
    GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position ORDER BY ks.position
  ),
  by_property AS (
    SELECT p.id AS property_id, p.name, COUNT(l.id)::int AS count
    FROM properties p
    LEFT JOIN leads l ON l.property_interest_id = p.id AND l.org_id = p_org_id
      AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL
      AND l.created_at >= p_since AND l.created_at < p_until
    WHERE p.org_id = p_org_id AND p.is_active = true
    GROUP BY p.id, p.name
  ),
  by_broker AS (
    SELECT u.id AS user_id, u.name, COUNT(l.id)::int AS count,
      COALESCE(ROUND(AVG(l.qualification_score))::int, 0) AS avg_score
    FROM users u
    LEFT JOIN leads l ON l.assigned_broker_id = u.id AND l.org_id = p_org_id
      AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL
      AND l.created_at >= p_since AND l.created_at < p_until
    WHERE u.org_id = p_org_id AND u.role::text = 'broker' AND u.is_active = true
    GROUP BY u.id, u.name
  ),
  source_agg AS (
    SELECT source::text AS source, COUNT(*)::int AS cnt
    FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND is_active = true AND lost_reason IS NULL
      AND created_at >= p_since AND created_at < p_until AND source IS NOT NULL
    GROUP BY source
  ),
  lost_agg AS (
    SELECT lost_reason, COUNT(*)::int AS cnt
    FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND is_active = true AND lost_reason IS NOT NULL
      AND created_at >= p_since AND created_at < p_until
    GROUP BY lost_reason
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE is_active = true AND lost_reason IS NULL
        AND created_at >= p_since AND created_at < p_until)::int AS total_leads,
      COUNT(*) FILTER (WHERE is_active = true AND lost_reason IS NULL
        AND created_at >= p_since AND created_at < p_until)::int AS new_leads
    FROM leads WHERE org_id = p_org_id AND segmento = 'principal'
  )
  SELECT jsonb_build_object(
    'funnel',        COALESCE((SELECT jsonb_agg(f)  FROM funnel f),       '[]'::jsonb),
    'by_property',   COALESCE((SELECT jsonb_agg(bp) FROM by_property bp), '[]'::jsonb),
    'by_broker',     COALESCE((SELECT jsonb_agg(bb) FROM by_broker bb),   '[]'::jsonb),
    'source_counts', COALESCE((SELECT jsonb_object_agg(source, cnt) FROM source_agg),    '{}'::jsonb),
    'lost_reasons',  COALESCE((SELECT jsonb_object_agg(lost_reason, cnt) FROM lost_agg), '{}'::jsonb),
    'total_leads',   (SELECT total_leads FROM totals),
    'new_leads',     (SELECT new_leads  FROM totals)
  );
$function$;

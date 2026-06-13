-- Migration 090: RPCs para Dashboard do Corretor / Gerente-Comercial
-- Story 54-1

-- ─── RPC 1: Contadores gerais ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_broker_dashboard_counts(
  p_org_id   uuid,
  p_broker_id uuid  -- NULL = todos os corretores (gerente-comercial)
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today_start    timestamptz;
  v_tomorrow_start timestamptz;
  v_total          integer;
  v_novos          integer;
  v_sem_tarefas    integer;
  v_atrasadas      integer;
  v_para_hoje      integer;
  v_futuras        integer;
BEGIN
  v_today_start    := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
                        AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';

  SELECT COUNT(*)::integer INTO v_total
  FROM leads l
  WHERE l.org_id = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);

  -- Novos: nunca tiveram conversa
  SELECT COUNT(*)::integer INTO v_novos
  FROM leads l
  WHERE l.org_id = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
    AND NOT EXISTS (
      SELECT 1 FROM conversations c WHERE c.lead_id = l.id
    );

  -- Sem tarefas pendentes
  SELECT COUNT(*)::integer INTO v_sem_tarefas
  FROM leads l
  WHERE l.org_id = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
    AND NOT EXISTS (
      SELECT 1 FROM lead_tasks lt
      WHERE lt.lead_id = l.id AND lt.completed_at IS NULL
    );

  SELECT COUNT(DISTINCT l.id)::integer INTO v_atrasadas
  FROM leads l
  JOIN lead_tasks lt ON lt.lead_id = l.id
  WHERE l.org_id = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
    AND lt.completed_at IS NULL
    AND lt.due_at < v_today_start;

  SELECT COUNT(DISTINCT l.id)::integer INTO v_para_hoje
  FROM leads l
  JOIN lead_tasks lt ON lt.lead_id = l.id
  WHERE l.org_id = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
    AND lt.completed_at IS NULL
    AND lt.due_at >= v_today_start
    AND lt.due_at < v_tomorrow_start;

  SELECT COUNT(DISTINCT l.id)::integer INTO v_futuras
  FROM leads l
  JOIN lead_tasks lt ON lt.lead_id = l.id
  WHERE l.org_id = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
    AND lt.completed_at IS NULL
    AND lt.due_at >= v_tomorrow_start;

  RETURN jsonb_build_object(
    'total',       v_total,
    'novos',       v_novos,
    'trabalhados', v_total - v_novos,
    'sem_tarefas', v_sem_tarefas,
    'atrasadas',   v_atrasadas,
    'para_hoje',   v_para_hoje,
    'futuras',     v_futuras
  );
END;
$$;

-- ─── RPC 2: Funil por etapa com breakdown de tarefas ─────────────────────────
CREATE OR REPLACE FUNCTION get_broker_funnel_stats(
  p_org_id    uuid,
  p_broker_id uuid  -- NULL = todos os corretores
) RETURNS TABLE(
  stage_id        uuid,
  stage_name      text,
  stage_slug      text,
  stage_color     text,
  stage_position  integer,
  total_leads     integer,
  leads_atrasadas integer,
  leads_para_hoje integer,
  leads_futuras   integer
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today_start    timestamptz;
  v_tomorrow_start timestamptz;
BEGIN
  v_today_start    := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
                        AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';

  RETURN QUERY
  SELECT
    ks.id,
    ks.name,
    ks.slug,
    ks.color,
    ks.position,
    COUNT(DISTINCT l.id)::integer,
    COUNT(DISTINCT CASE
      WHEN lt.completed_at IS NULL AND lt.due_at < v_today_start
      THEN l.id END)::integer,
    COUNT(DISTINCT CASE
      WHEN lt.completed_at IS NULL
       AND lt.due_at >= v_today_start
       AND lt.due_at < v_tomorrow_start
      THEN l.id END)::integer,
    COUNT(DISTINCT CASE
      WHEN lt.completed_at IS NULL AND lt.due_at >= v_tomorrow_start
      THEN l.id END)::integer
  FROM kanban_stages ks
  LEFT JOIN leads l
    ON  l.stage_id  = ks.id
    AND l.org_id    = p_org_id
    AND l.is_active = true
    AND l.lost_reason IS NULL
    AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
  LEFT JOIN lead_tasks lt ON lt.lead_id = l.id
  WHERE ks.is_active = true
  GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position
  ORDER BY ks.position;
END;
$$;

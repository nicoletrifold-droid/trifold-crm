-- 080_fix_dashboard_stage_counts_lost_reason
-- Sincroniza get_dashboard_stage_counts com o filtro do Pipeline.
-- O Pipeline exclui leads com lost_reason IS NOT NULL (safeguard de leads perdidos).
-- A RPC anterior não tinha esse filtro, causando contagens maiores no Dashboard.
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
    AND lost_reason IS NULL
  GROUP BY stage_id;
$$;

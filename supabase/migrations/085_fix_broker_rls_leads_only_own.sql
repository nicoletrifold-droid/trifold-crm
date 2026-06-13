-- 085_fix_broker_rls_leads_only_own
-- CRÍTICO: Corretores estavam vendo leads de outros corretores e
-- leads sem corretor atribuído (assigned_broker_id IS NULL).
-- Regra correta: corretor vê APENAS leads atribuídos a ele.
-- Admin/supervisor/gerente-comercial continuam vendo tudo (is_admin_or_supervisor).

-- Recriar policy SELECT
DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (
    org_id = user_org_id()
    AND (
      is_admin_or_supervisor()
      OR assigned_broker_id = (
        SELECT brokers.user_id FROM brokers
        WHERE brokers.id = user_broker_id()
      )
    )
  );

-- Recriar policy UPDATE (mesma lógica)
DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (
    org_id = user_org_id()
    AND (
      is_admin_or_supervisor()
      OR assigned_broker_id = (
        SELECT brokers.user_id FROM brokers
        WHERE brokers.id = user_broker_id()
      )
    )
  );

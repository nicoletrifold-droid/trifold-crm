-- Permite gerente-comercial gerenciar corretores (INSERT/UPDATE/DELETE na tabela brokers)
DROP POLICY IF EXISTS "brokers_manage" ON brokers;

CREATE POLICY "brokers_manage" ON brokers
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'gerente-comercial')
  );

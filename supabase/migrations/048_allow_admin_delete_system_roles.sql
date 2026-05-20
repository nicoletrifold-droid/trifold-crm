-- Migration 048: permite que admins excluam roles do sistema (para testes)
-- Remove a restrição AND is_system = false da política DELETE em roles

DROP POLICY IF EXISTS "admins_delete_roles" ON roles;

CREATE POLICY "admins_delete_roles" ON roles
  FOR DELETE TO authenticated
  USING (public.is_admin() AND org_id = public.user_org_id());

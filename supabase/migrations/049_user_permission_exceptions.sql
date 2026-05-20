-- Migration 049: tabela user_permission_exceptions
-- Exceções de permissão individuais por usuário, sobrescrevem o perfil base.

CREATE TABLE IF NOT EXISTS user_permission_exceptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_access boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT user_permission_exceptions_user_module_unique UNIQUE (user_id, module)
);

ALTER TABLE user_permission_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_exceptions" ON user_permission_exceptions
  FOR SELECT TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "admins_manage_exceptions" ON user_permission_exceptions
  FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.user_org_id())
  WITH CHECK (public.is_admin() AND org_id = public.user_org_id());

-- Migration 047: Roles e permissions dinâmicos por organização
-- Story 35.1 — Epic 35 (Permissões editáveis pela UI)
--
-- Cria a fundação de dados para mover as permissões hardcoded por role
-- (admin / supervisor / broker / obras) para o banco de dados, permitindo
-- edição via interface sem necessidade de deploy.
--
-- Tabelas criadas:
--   - roles            : roles por org (4 system roles + customizados futuros)
--   - role_permissions : permissão por (role, módulo) — booleana
--
-- Padrão canônico (041_clientes_crm.sql):
--   - public.user_org_id() para isolamento por org
--   - public.is_admin() (criada nesta migration) para gate de escrita
--   - update_updated_at() (de 001_base_schema.sql) para trigger
--   - CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING (idempotente)
--
-- Nota sobre `broker` (Corretor): os módulos `pipeline` e `leads` têm acesso
-- restrito ao próprio (scoped) — `can_access = true` aqui; a lógica de
-- escopo permanece na camada de aplicação, não no banco.

-- ============================================
-- FUNÇÃO HELPER: public.is_admin()
-- ============================================
-- Verifica se o usuário autenticado tem role='admin'.
-- Não existe ainda no schema (apenas is_admin_or_supervisor em 004_rls_policies.sql
-- e 030_role_obras.sql); criamos aqui para uso pelas policies de roles/role_permissions.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
      AND role = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- TABELA: roles
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,                         -- identificador interno (ex: "admin")
  label       text NOT NULL,                         -- display (ex: "Administrador")
  color       text NOT NULL DEFAULT 'gray',          -- ex: "purple", "blue", "green", "yellow"
  is_system   boolean NOT NULL DEFAULT false,        -- roles do sistema não podem ser deletados
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- ============================================
-- TABELA: role_permissions
-- ============================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module      text NOT NULL,                         -- ex: "dashboard", "pipeline", etc.
  can_access  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, module)
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS roles_org_id_idx
  ON roles(org_id);

CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx
  ON role_permissions(role_id);

CREATE INDEX IF NOT EXISTS role_permissions_lookup_idx
  ON role_permissions(role_id, module);

-- ============================================
-- TRIGGER updated_at — roles
-- Reusa função update_updated_at() definida em 001_base_schema.sql
-- ============================================
DROP TRIGGER IF EXISTS set_roles_updated_at ON roles;
CREATE TRIGGER set_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS — roles
-- SELECT: qualquer membro da org pode ler
-- INSERT/UPDATE: somente admin da org
-- DELETE: somente admin da org E role não-system (proteção contra remoção acidental)
-- ============================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_select_policy ON roles;
CREATE POLICY roles_select_policy ON roles
  FOR SELECT
  USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS roles_insert_policy ON roles;
CREATE POLICY roles_insert_policy ON roles
  FOR INSERT
  WITH CHECK (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS roles_update_policy ON roles;
CREATE POLICY roles_update_policy ON roles
  FOR UPDATE
  USING (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS roles_delete_policy ON roles;
CREATE POLICY roles_delete_policy ON roles
  FOR DELETE
  USING (org_id = public.user_org_id() AND public.is_admin() AND is_system = false);

-- ============================================
-- RLS — role_permissions
-- SELECT: qualquer membro da org
-- INSERT/UPDATE/DELETE: somente admin da org
-- ============================================
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permissions_select_policy ON role_permissions;
CREATE POLICY role_permissions_select_policy ON role_permissions
  FOR SELECT
  USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS role_permissions_insert_policy ON role_permissions;
CREATE POLICY role_permissions_insert_policy ON role_permissions
  FOR INSERT
  WITH CHECK (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS role_permissions_update_policy ON role_permissions;
CREATE POLICY role_permissions_update_policy ON role_permissions
  FOR UPDATE
  USING (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS role_permissions_delete_policy ON role_permissions;
CREATE POLICY role_permissions_delete_policy ON role_permissions
  FOR DELETE
  USING (org_id = public.user_org_id() AND public.is_admin());

-- ============================================
-- FUNÇÃO: seed_system_roles(p_org_id UUID)
-- Idempotente — pode ser chamada múltiplas vezes (ON CONFLICT DO NOTHING).
-- Insere os 4 roles do sistema + matriz de permissões dos 17 módulos
-- para a organização informada.
--
-- Uso futuro: chamar em um trigger AFTER INSERT em organizations para
-- bootstrap automático de novas orgs (fora do escopo desta migration).
-- ============================================
CREATE OR REPLACE FUNCTION public.seed_system_roles(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id      uuid;
  v_supervisor_id uuid;
  v_broker_id     uuid;
  v_obras_id      uuid;
BEGIN
  -- ----------------------------------------
  -- 1. Inserir os 4 system roles
  -- ----------------------------------------
  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'admin', 'Administrador', 'purple', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'supervisor', 'Supervisor', 'blue', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'broker', 'Corretor', 'green', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'obras', 'Obras', 'yellow', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- ----------------------------------------
  -- 2. Buscar os IDs dos roles recém-criados (ou já existentes)
  -- ----------------------------------------
  SELECT id INTO v_admin_id      FROM roles WHERE org_id = p_org_id AND name = 'admin';
  SELECT id INTO v_supervisor_id FROM roles WHERE org_id = p_org_id AND name = 'supervisor';
  SELECT id INTO v_broker_id     FROM roles WHERE org_id = p_org_id AND name = 'broker';
  SELECT id INTO v_obras_id      FROM roles WHERE org_id = p_org_id AND name = 'obras';

  -- ----------------------------------------
  -- 3. Inserir matriz de permissões (17 módulos × 4 roles = 68 linhas por org)
  --    INSERT ... ON CONFLICT (role_id, module) DO NOTHING → idempotente
  -- ----------------------------------------
  -- admin: acesso total (todos os 17 módulos)
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_admin_id, 'dashboard',     true),
    (p_org_id, v_admin_id, 'pipeline',      true),
    (p_org_id, v_admin_id, 'leads',         true),
    (p_org_id, v_admin_id, 'imoveis',       true),
    (p_org_id, v_admin_id, 'corretores',    true),
    (p_org_id, v_admin_id, 'conversas',     true),
    (p_org_id, v_admin_id, 'agenda',        true),
    (p_org_id, v_admin_id, 'alertas',       true),
    (p_org_id, v_admin_id, 'atividades',    true),
    (p_org_id, v_admin_id, 'analytics',     true),
    (p_org_id, v_admin_id, 'campanhas',     true),
    (p_org_id, v_admin_id, 'treinamento',   true),
    (p_org_id, v_admin_id, 'obras',         true),
    (p_org_id, v_admin_id, 'brindes',       true),
    (p_org_id, v_admin_id, 'mensagens',     true),
    (p_org_id, v_admin_id, 'configuracoes', true),
    (p_org_id, v_admin_id, 'sistema',       true)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- supervisor: tudo exceto configuracoes e sistema
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_supervisor_id, 'dashboard',     true),
    (p_org_id, v_supervisor_id, 'pipeline',      true),
    (p_org_id, v_supervisor_id, 'leads',         true),
    (p_org_id, v_supervisor_id, 'imoveis',       true),
    (p_org_id, v_supervisor_id, 'corretores',    true),
    (p_org_id, v_supervisor_id, 'conversas',     true),
    (p_org_id, v_supervisor_id, 'agenda',        true),
    (p_org_id, v_supervisor_id, 'alertas',       true),
    (p_org_id, v_supervisor_id, 'atividades',    true),
    (p_org_id, v_supervisor_id, 'analytics',     true),
    (p_org_id, v_supervisor_id, 'campanhas',     true),
    (p_org_id, v_supervisor_id, 'treinamento',   true),
    (p_org_id, v_supervisor_id, 'obras',         true),
    (p_org_id, v_supervisor_id, 'brindes',       true),
    (p_org_id, v_supervisor_id, 'mensagens',     true),
    (p_org_id, v_supervisor_id, 'configuracoes', false),
    (p_org_id, v_supervisor_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- broker (Corretor): operação no dia-a-dia, sem analytics/campanhas/corretores/obras
  -- Para pipeline e leads → can_access=true (scope aplicado em camada de aplicação)
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_broker_id, 'dashboard',     false),
    (p_org_id, v_broker_id, 'pipeline',      true),
    (p_org_id, v_broker_id, 'leads',         true),
    (p_org_id, v_broker_id, 'imoveis',       true),
    (p_org_id, v_broker_id, 'corretores',    false),
    (p_org_id, v_broker_id, 'conversas',     true),
    (p_org_id, v_broker_id, 'agenda',        true),
    (p_org_id, v_broker_id, 'alertas',       true),
    (p_org_id, v_broker_id, 'atividades',    true),
    (p_org_id, v_broker_id, 'analytics',     false),
    (p_org_id, v_broker_id, 'campanhas',     false),
    (p_org_id, v_broker_id, 'treinamento',   true),
    (p_org_id, v_broker_id, 'obras',         false),
    (p_org_id, v_broker_id, 'brindes',       false),
    (p_org_id, v_broker_id, 'mensagens',     false),
    (p_org_id, v_broker_id, 'configuracoes', false),
    (p_org_id, v_broker_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- obras: acesso restrito apenas a obras e brindes
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_obras_id, 'dashboard',     false),
    (p_org_id, v_obras_id, 'pipeline',      false),
    (p_org_id, v_obras_id, 'leads',         false),
    (p_org_id, v_obras_id, 'imoveis',       false),
    (p_org_id, v_obras_id, 'corretores',    false),
    (p_org_id, v_obras_id, 'conversas',     false),
    (p_org_id, v_obras_id, 'agenda',        false),
    (p_org_id, v_obras_id, 'alertas',       false),
    (p_org_id, v_obras_id, 'atividades',    false),
    (p_org_id, v_obras_id, 'analytics',     false),
    (p_org_id, v_obras_id, 'campanhas',     false),
    (p_org_id, v_obras_id, 'treinamento',   false),
    (p_org_id, v_obras_id, 'obras',         true),
    (p_org_id, v_obras_id, 'brindes',       true),
    (p_org_id, v_obras_id, 'mensagens',     false),
    (p_org_id, v_obras_id, 'configuracoes', false),
    (p_org_id, v_obras_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;
END;
$$;

-- ============================================
-- SEED — executar seed_system_roles para todas as orgs existentes
-- Idempotente (todos os INSERTs internos usam ON CONFLICT DO NOTHING).
-- ============================================
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    PERFORM public.seed_system_roles(v_org_id);
  END LOOP;
END;
$$;

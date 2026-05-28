-- 070_seed_roleta_permissions.sql
-- Adiciona módulo 'roleta' à matriz de permissões de todas as orgs existentes.
-- Padrão: admin=true, supervisor=true, broker=false, obras=false.
-- ON CONFLICT garante idempotência (safe to re-run).

INSERT INTO public.role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'roleta',
  CASE r.name
    WHEN 'admin'       THEN true
    WHEN 'supervisor'  THEN true
    ELSE false
  END
FROM public.roles r
WHERE r.name IN ('admin', 'supervisor', 'broker', 'obras', 'gerente-comercial')
ON CONFLICT (role_id, module) DO NOTHING;

-- =============================================================================
-- Atualiza seed_system_roles() para incluir 'roleta' em novas orgs futuras
-- =============================================================================
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
  -- 1. Inserir os 4 system roles
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

  -- 2. Buscar IDs dos roles
  SELECT id INTO v_admin_id      FROM roles WHERE org_id = p_org_id AND name = 'admin';
  SELECT id INTO v_supervisor_id FROM roles WHERE org_id = p_org_id AND name = 'supervisor';
  SELECT id INTO v_broker_id     FROM roles WHERE org_id = p_org_id AND name = 'broker';
  SELECT id INTO v_obras_id      FROM roles WHERE org_id = p_org_id AND name = 'obras';

  -- 3. Matriz de permissões (18 módulos × 4 roles)
  -- admin: acesso total
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_admin_id, 'dashboard',     true),
    (p_org_id, v_admin_id, 'pipeline',      true),
    (p_org_id, v_admin_id, 'leads',         true),
    (p_org_id, v_admin_id, 'imoveis',       true),
    (p_org_id, v_admin_id, 'corretores',    true),
    (p_org_id, v_admin_id, 'roleta',        true),
    (p_org_id, v_admin_id, 'conversas',     true),
    (p_org_id, v_admin_id, 'agenda',        true),
    (p_org_id, v_admin_id, 'alertas',       true),
    (p_org_id, v_admin_id, 'atividades',    true),
    (p_org_id, v_admin_id, 'analytics',     true),
    (p_org_id, v_admin_id, 'campanhas',     true),
    (p_org_id, v_admin_id, 'chamados',      true),
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
    (p_org_id, v_supervisor_id, 'roleta',        true),
    (p_org_id, v_supervisor_id, 'conversas',     true),
    (p_org_id, v_supervisor_id, 'agenda',        true),
    (p_org_id, v_supervisor_id, 'alertas',       true),
    (p_org_id, v_supervisor_id, 'atividades',    true),
    (p_org_id, v_supervisor_id, 'analytics',     true),
    (p_org_id, v_supervisor_id, 'campanhas',     true),
    (p_org_id, v_supervisor_id, 'chamados',      true),
    (p_org_id, v_supervisor_id, 'treinamento',   true),
    (p_org_id, v_supervisor_id, 'obras',         true),
    (p_org_id, v_supervisor_id, 'brindes',       true),
    (p_org_id, v_supervisor_id, 'mensagens',     true),
    (p_org_id, v_supervisor_id, 'configuracoes', false),
    (p_org_id, v_supervisor_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- broker: operação no dia-a-dia
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_broker_id, 'dashboard',     false),
    (p_org_id, v_broker_id, 'pipeline',      true),
    (p_org_id, v_broker_id, 'leads',         true),
    (p_org_id, v_broker_id, 'imoveis',       true),
    (p_org_id, v_broker_id, 'corretores',    false),
    (p_org_id, v_broker_id, 'roleta',        false),
    (p_org_id, v_broker_id, 'conversas',     true),
    (p_org_id, v_broker_id, 'agenda',        true),
    (p_org_id, v_broker_id, 'alertas',       true),
    (p_org_id, v_broker_id, 'atividades',    true),
    (p_org_id, v_broker_id, 'analytics',     false),
    (p_org_id, v_broker_id, 'campanhas',     false),
    (p_org_id, v_broker_id, 'chamados',      true),
    (p_org_id, v_broker_id, 'treinamento',   true),
    (p_org_id, v_broker_id, 'obras',         false),
    (p_org_id, v_broker_id, 'brindes',       false),
    (p_org_id, v_broker_id, 'mensagens',     false),
    (p_org_id, v_broker_id, 'configuracoes', false),
    (p_org_id, v_broker_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- obras: acesso restrito a obras e brindes
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_obras_id, 'dashboard',     false),
    (p_org_id, v_obras_id, 'pipeline',      false),
    (p_org_id, v_obras_id, 'leads',         false),
    (p_org_id, v_obras_id, 'imoveis',       false),
    (p_org_id, v_obras_id, 'corretores',    false),
    (p_org_id, v_obras_id, 'roleta',        false),
    (p_org_id, v_obras_id, 'conversas',     false),
    (p_org_id, v_obras_id, 'agenda',        false),
    (p_org_id, v_obras_id, 'alertas',       false),
    (p_org_id, v_obras_id, 'atividades',    false),
    (p_org_id, v_obras_id, 'analytics',     false),
    (p_org_id, v_obras_id, 'campanhas',     false),
    (p_org_id, v_obras_id, 'chamados',      false),
    (p_org_id, v_obras_id, 'treinamento',   false),
    (p_org_id, v_obras_id, 'obras',         true),
    (p_org_id, v_obras_id, 'brindes',       true),
    (p_org_id, v_obras_id, 'mensagens',     false),
    (p_org_id, v_obras_id, 'configuracoes', false),
    (p_org_id, v_obras_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;
END;
$$;

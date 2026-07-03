-- Story 75-117 — Módulo "Central de Materiais" (link para materiais de marketing)
--
-- Registra o módulo `materiais` na matriz de Perfil de Acesso para todos os roles
-- de todas as orgs, espelhando o acesso pedido:
--   admin, supervisor, gerente-comercial, consultoria, broker (corretor) = true
--   demais roles = false
--
-- Idempotente: ON CONFLICT (role_id, module) DO NOTHING preserva overrides já
-- ajustados manualmente na matriz. Só cria linha para roles que existem na org.
-- A URL do link fica em organizations.settings.materiais_url (jsonb já existente,
-- sem migration de schema). Ver Story 75-93 (migration 132) para o mesmo padrão.

INSERT INTO role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id,
       r.id,
       'materiais',
       r.name IN ('admin', 'supervisor', 'gerente-comercial', 'consultoria', 'broker')
FROM roles r
ON CONFLICT (role_id, module) DO NOTHING;

-- 144_seed_module_lancamentos.sql
-- Story Lançamentos-01 — Fundação do módulo "Lançamentos".
-- Semeia role_permissions para o novo módulo. Acesso = admin + supervisor + obras
-- (mesmos perfis que hoje mexem com Obras). Padrão da 132_seed_modules_imob_bolsao_fluxo.
-- ON CONFLICT DO NOTHING → idempotente e não sobrescreve ajustes feitos na matriz de Perfil.

INSERT INTO role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'lancamentos',
       r.name IN ('admin', 'supervisor', 'obras')
  FROM roles r
ON CONFLICT (role_id, module) DO NOTHING;

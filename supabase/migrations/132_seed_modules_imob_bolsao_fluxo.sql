-- 132_seed_modules_imob_bolsao_fluxo.sql
-- Story 75-93 — Registra os módulos IMOB / Bolsão / Fluxo na matriz de Perfil de Acesso.
--
-- Antes, esses 3 eram travados por NOME de role fixo no código (dashboard/layout.tsx) e
-- nunca entraram em role_permissions. Este seed cria as linhas espelhando EXATAMENTE o
-- acesso atual (nada muda de comportamento até alguém editar a matriz):
--   imob   → admin, supervisor
--   bolsao → admin, supervisor, gerente-comercial
--   fluxo  → admin, gerente-comercial
-- Demais roles (broker, obras, gerente-relacionamento, custom, etc.) → false.
--
-- Idempotente: ON CONFLICT (role_id, module) DO NOTHING. Roda p/ todas as orgs.

INSERT INTO role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, m.module,
       CASE m.module
         WHEN 'imob'   THEN r.name IN ('admin', 'supervisor')
         WHEN 'bolsao' THEN r.name IN ('admin', 'supervisor', 'gerente-comercial')
         WHEN 'fluxo'  THEN r.name IN ('admin', 'gerente-comercial')
       END
  FROM roles r
  CROSS JOIN (VALUES ('imob'), ('bolsao'), ('fluxo')) AS m(module)
ON CONFLICT (role_id, module) DO NOTHING;

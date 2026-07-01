-- 138_role_dashboard_imob_consultoria.sql
-- Story 75-102 — Libera o botão "Dashboard" para os perfis do mundo IMOB.
--
-- O item "Dashboard" do menu é gated por role_permissions.dashboard. Os perfis imob e
-- consultoria tinham dashboard=false (só viam Imóveis/Agenda/IMOB). Agora recebem
-- dashboard=true → o dashboard (segment-aware, Story 75-102) vira a tela inicial deles,
-- espelhando o funil IMOB. Idempotente, todas as orgs.

INSERT INTO role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'dashboard', true
  FROM roles r
 WHERE r.name IN ('imob', 'consultoria')
ON CONFLICT (role_id, module) DO UPDATE SET can_access = true;

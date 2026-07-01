-- 141_pastas_roles.sql
-- Story 75-105 — Libera o módulo "pastas" também para gerente-comercial e imob
-- (além de admin/supervisor). Esses perfis gerenciam interessados do pré-lançamento.
-- Idempotente (upsert), todas as orgs.

insert into role_permissions (org_id, role_id, module, can_access)
select r.org_id, r.id, 'pastas', true
  from roles r
 where r.name in ('gerente-comercial', 'imob')
on conflict (role_id, module) do update set can_access = true;

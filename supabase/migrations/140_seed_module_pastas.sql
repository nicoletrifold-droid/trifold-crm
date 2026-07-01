-- 140_seed_module_pastas.sql
-- Story 75-104 — Registra o módulo "pastas" na matriz de Perfil de Acesso.
-- Por ora só admin/supervisor gerenciam (criar pasta/gerar link/ver uploads). O perfil
-- REVISOR dedicado ("Deferido") é decisão futura — ver [[project-pastas-documentos]].
-- Idempotente, todas as orgs.

insert into role_permissions (org_id, role_id, module, can_access)
select r.org_id, r.id, 'pastas', r.name in ('admin', 'supervisor')
  from roles r
on conflict (role_id, module) do nothing;

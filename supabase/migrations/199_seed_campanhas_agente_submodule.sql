-- 199_seed_campanhas_agente_submodule.sql
-- Story 75-229 — Semeia o sub-módulo "campanhas.agente" (matriz de permissões)
-- para todo role já existente em toda org: true para admin/supervisor (mantém
-- o acesso atual, hoje gateado por role hardcoded na Story 75-219), false para
-- os demais. Necessário ANTES de trocar os gates hardcoded por canAccess() —
-- sem linha explícita, canAccess herda do módulo pai "campanhas" (true pra
-- maioria dos roles operacionais), o que abriria acesso indevido ao Agente.
--
-- Rollback: DELETE FROM public.role_permissions WHERE module = 'campanhas.agente';

INSERT INTO public.role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'campanhas.agente', (r.name IN ('admin', 'supervisor'))
FROM public.roles r
ON CONFLICT (role_id, module) DO NOTHING;

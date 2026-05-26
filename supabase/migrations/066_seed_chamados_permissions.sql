-- =============================================================================
-- Migration 066: Seed permissão 'chamados' para todos os roles internos
-- Story 43.1 — corrige visibilidade do item na sidebar para role 'obras' e demais
-- =============================================================================

-- Adiciona can_access=true para 'chamados' em todos os roles internos de todas as orgs.
-- ON CONFLICT garante idempotência (safe to re-run).
INSERT INTO public.role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'chamados', true
FROM public.roles r
WHERE r.name IN ('admin', 'supervisor', 'obras', 'broker', 'gerente-comercial')
ON CONFLICT (role_id, module) DO UPDATE SET can_access = true;

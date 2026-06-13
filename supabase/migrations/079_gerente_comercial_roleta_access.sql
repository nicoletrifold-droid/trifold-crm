-- 079_gerente_comercial_roleta_access.sql
-- Concede acesso ao módulo 'roleta' para o role gerente-comercial.
-- Migration 070 inseriu can_access=false para esse role (cláusula ELSE false).
-- API endpoints de fila e config também foram atualizados para incluir o role.

UPDATE public.role_permissions rp
SET can_access = true
FROM public.roles r
WHERE rp.role_id = r.id
  AND r.name     = 'gerente-comercial'
  AND rp.module  = 'roleta';

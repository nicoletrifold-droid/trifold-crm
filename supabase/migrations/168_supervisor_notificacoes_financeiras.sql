-- Story 75-150-b — Concede o sub-módulo `sistema.notificacoes-financeiras` ao
-- role supervisor: ele passa a ver o módulo Sistema, mas apenas o card de
-- Notificações Financeiras (padrão de sub-módulo por role, resolvido no canAccess).
-- Idempotente. Só se aplica se existir role 'supervisor' na org.

INSERT INTO public.role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'sistema.notificacoes-financeiras', true
FROM public.roles r
WHERE r.name = 'supervisor'
ON CONFLICT (role_id, module) DO UPDATE SET can_access = EXCLUDED.can_access;

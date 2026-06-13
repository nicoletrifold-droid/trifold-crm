-- ============================================================================
-- Migration: 096_harden_rls_agent_prompts_admin_only.sql
-- Story: 53-2 — RLS Hardening de agent_config e agent_prompts (admin-only WRITE)
-- ============================================================================
--
-- SLOT ESCOLHIDO: 096
--   Motivo: a Story/PO estimou 095, mas a verificação obrigatória mostrou que
--   095 JÁ ESTÁ OCUPADO. O arquivo `095_knowledge_base_null_empreendimento_global.sql`
--   existe em `origin/main` (commit e3ca5bc). Verificações realizadas:
--     - `git log --all --name-only | grep 'migrations/0'` → maior slot = 095 (ocupado)
--     - `git log --all --name-only | grep -E 'migrations/09[6-9]'` → nenhum 096+ existe
--   Portanto o próximo slot livre real é 096.
--
-- OBJETIVO:
--   Endurecer o RLS para que apenas usuários com role `admin` possam ESCREVER
--   (INSERT/UPDATE/DELETE) em `agent_config` e `agent_prompts`. As policies de
--   SELECT NÃO são alteradas — supervisores continuam podendo LER.
--   Antes: `public.is_admin_or_supervisor()` (criada em 004_rls_policies.sql).
--   Depois: `public.is_admin()` (criada em 047_roles_permissions.sql).
--
-- SEGURANÇA:
--   - Idempotente: usa DROP POLICY IF EXISTS antes de recriar.
--   - Não-destrutivo: não altera dados, apenas substitui policies de WRITE.
--   - `public.is_admin()` já existe no remote (047_roles_permissions.sql).
--
-- APLICAÇÃO:
--   NÃO aplicada automaticamente. Este projeto aplica migrations MANUALMENTE
--   via Management API (não `supabase db push`, por causa de colisões de
--   numeração entre branches). Aguardar autorização explícita do usuário.
-- ============================================================================

-- Drop das policies permissivas atuais (is_admin_or_supervisor)
DROP POLICY IF EXISTS "agent_config_manage" ON agent_config;
DROP POLICY IF EXISTS "agent_prompts_manage" ON agent_prompts;

-- Recriação com WRITE restrito a admin
CREATE POLICY "agent_config_manage" ON agent_config
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin());

CREATE POLICY "agent_prompts_manage" ON agent_prompts
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin());

-- NOTA: as policies de SELECT (agent_config_select, agent_prompts_select)
-- definidas em 004_rls_policies.sql NÃO são tocadas. Supervisores continuam
-- com leitura via `org_id = public.user_org_id()`.

-- ============================================================================
-- ROLLBACK (executar manualmente se a restrição admin-only causar problema)
-- ============================================================================
-- DROP POLICY IF EXISTS "agent_config_manage" ON agent_config;
-- DROP POLICY IF EXISTS "agent_prompts_manage" ON agent_prompts;
--
-- CREATE POLICY "agent_config_manage" ON agent_config
--   FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());
--
-- CREATE POLICY "agent_prompts_manage" ON agent_prompts
--   FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());
-- ============================================================================

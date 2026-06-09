-- =============================================================================
-- 088_rls_perf_optimization.sql
-- =============================================================================
-- Transacional (sem CONCURRENTLY) — aplicável via `supabase db push`.
-- Date authored: 2026-06-08 (banco em crash loop OOM — NÃO aplicado ainda)
-- Authored by: @data-engineer (Dara)
-- Origem: Auditoria de performance /tmp/trifold-prod-audit-db-report.md (Achado #2)
--
-- PROPÓSITO: reduzir o custo das funções helper SECURITY DEFINER e simplificar as
-- policies de `leads`, sem alterar a semântica de segurança (RLS). Três mudanças:
--
--   1. SET search_path = public, pg_temp nas 5 helper functions SECURITY DEFINER.
--      - Segurança: blinda contra hijack de search_path em funções SECURITY DEFINER.
--      - Estabilidade de plano: evita reresolução de nomes por sessão.
--
--   2. Reescrever user_broker_id() para usar public.public_user_id() em vez do
--      JOIN brokers x users. Semântica idêntica (mesmo broker_id retornado), porém
--      um único lookup por igualdade em brokers(user_id) — coberto pela UNIQUE
--      constraint existente (002_property_schema.sql: user_id ... UNIQUE).
--
--   3. Simplificar leads_select / leads_update (085): trocar a subquery
--      (SELECT brokers.user_id FROM brokers WHERE brokers.id = user_broker_id())
--      por public.public_user_id().
--      CONFIRMADO seguro: leads.assigned_broker_id é
--        `assigned_broker_id uuid REFERENCES users(id)` (001_base_schema.sql:134)
--      — ou seja, aponta para users(id), NÃO brokers(id). A subquery antiga ia de
--      broker_id -> brokers.user_id (= users.id do corretor logado), que é
--      exatamente o que public_user_id() retorna. Semântica preservada, e remove
--      um acesso a `brokers` por avaliação de policy.
--
-- -----------------------------------------------------------------------------
-- NOTA DE IMPLEMENTAÇÃO (correção do erro 42P13):
--   A primeira tentativa usava CREATE OR REPLACE em TODAS as helpers. Isso falhou:
--     ERROR 42P13: cannot change return type of existing function
--     HINT: Use DROP FUNCTION user_role() first.
--   Causa: user_role() retorna o ENUM `user_role`. Sob CREATE OR REPLACE, a
--   resolução do tipo de retorno (sem schema-qualify) é tratada pelo Postgres como
--   "mudança de return type" e dispara 42P13. DROP FUNCTION é perigoso (policies e
--   funções dependem dela).
--
--   FERRAMENTA CORRETA POR CASO:
--   - Funções com LÓGICA INALTERADA (só querem search_path): user_org_id,
--     user_role, public_user_id, is_admin_or_supervisor → usa-se
--     `ALTER FUNCTION ... SET search_path = public, pg_temp`. ALTER NÃO toca o
--     return type → não dispara 42P13, e NÃO recria o corpo (zero risco de
--     regredir a definição existente — ex.: os 4 roles de is_admin_or_supervisor).
--   - user_broker_id(): MUDA a lógica (JOIN -> public_user_id()) e retorna `uuid`
--     (sem enum, sem conflito de tipo) → mantém-se CREATE OR REPLACE com o
--     SET search_path embutido.
--
-- IMPORTANTE: is_admin_or_supervisor() NO BANCO JÁ tem os 4 roles da 084
--   ('admin','supervisor','obras','gerente-comercial'). Como a lógica NÃO muda,
--   apenas ALTER ... SET search_path — NÃO recriamos o corpo (evita risco de
--   regredir os roles).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper functions com LÓGICA INALTERADA — só ganham search_path.
--    ALTER FUNCTION não toca o return type → não dispara 42P13 (enum user_role)
--    e não recria o corpo (preserva a definição corrente no banco).
-- -----------------------------------------------------------------------------

-- user_org_id(): RETURNS uuid — inalterada na lógica
ALTER FUNCTION public.user_org_id() SET search_path = public, pg_temp;

-- user_role(): RETURNS user_role (ENUM) — inalterada na lógica.
-- ALTER evita o erro 42P13 que o CREATE OR REPLACE causava.
ALTER FUNCTION public.user_role() SET search_path = public, pg_temp;

-- public_user_id(): RETURNS uuid — inalterada na lógica
ALTER FUNCTION public.public_user_id() SET search_path = public, pg_temp;

-- is_admin_or_supervisor(): RETURNS boolean — inalterada na lógica.
-- PRESERVA os 4 roles da 084 (NÃO recriado): 'admin','supervisor','obras',
-- 'gerente-comercial'. ALTER só anexa search_path ao corpo existente.
ALTER FUNCTION public.is_admin_or_supervisor() SET search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 2. user_broker_id(): REESCRITA — usa public_user_id() em vez de JOIN brokers x
--    users. Mesmo resultado (brokers.id do usuário logado), 1 lookup por igualdade
--    em brokers(user_id) (UNIQUE -> índice implícito). RETURNS uuid (igual ao
--    atual: sem conflito de tipo, sem 42P13) → CREATE OR REPLACE é seguro aqui.
--    Ganha search_path no mesmo statement.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_broker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.brokers WHERE user_id = public.public_user_id()
$$;

-- -----------------------------------------------------------------------------
-- 3. Simplificar policies leads_select / leads_update (substitui a 085)
--    Semântica idêntica: corretor vê/edita APENAS leads atribuídos a ele;
--    admin/supervisor/obras/gerente-comercial veem tudo (is_admin_or_supervisor).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (
    org_id = user_org_id()
    AND (
      is_admin_or_supervisor()
      OR assigned_broker_id = public.public_user_id()
    )
  );

DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (
    org_id = user_org_id()
    AND (
      is_admin_or_supervisor()
      OR assigned_broker_id = public.public_user_id()
    )
  );

COMMIT;

-- =============================================================================
-- VALIDAÇÃO PÓS-APLICAÇÃO (obrigatória — RLS deve ser revalidada):
--   1. Confirmar search_path nas 5 helpers:
--        SELECT p.proname, p.proconfig
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname = 'public'
--          AND p.proname IN ('user_org_id','user_role','public_user_id',
--                            'user_broker_id','is_admin_or_supervisor');
--        Esperado: proconfig contém 'search_path=public, pg_temp' nas 5.
--   2. Confirmar que is_admin_or_supervisor() preserva os 4 roles:
--        SELECT pg_get_functiondef('public.is_admin_or_supervisor()'::regprocedure);
--        Esperado: role IN ('admin','supervisor','obras','gerente-comercial').
--   3. Teste de impersonação por role broker (db-impersonate): confirmar que o
--      corretor continua vendo APENAS seus leads (assigned_broker_id = seu users.id)
--      e NÃO vê leads de outros nem com assigned_broker_id NULL.
--   4. EXPLAIN (ANALYZE, BUFFERS) na listagem de leads para broker: confirmar que
--      o acesso extra a `brokers` na policy sumiu.
--   5. Confirmar que admin/supervisor/obras/gerente-comercial seguem vendo tudo.
-- =============================================================================

-- =============================================================================
-- ROLLBACK PLAN (restaura o estado pré-088: funções da 004/084 + policies da 085).
-- Executar dentro de uma transação.
--
-- Observação: o search_path foi adicionado via ALTER FUNCTION (helpers inalteradas)
-- e via CREATE OR REPLACE (user_broker_id). Para reverter o search_path das helpers
-- inalteradas usa-se RESET (sem tocar o corpo); user_broker_id volta ao JOIN 004.
--
-- BEGIN;
--
-- -- Reverter search_path das helpers inalteradas (corpo intacto):
-- ALTER FUNCTION public.user_org_id() RESET search_path;
-- ALTER FUNCTION public.user_role() RESET search_path;
-- ALTER FUNCTION public.public_user_id() RESET search_path;
-- ALTER FUNCTION public.is_admin_or_supervisor() RESET search_path;
--
-- -- user_broker_id() original (004): JOIN brokers x users, sem search_path
-- CREATE OR REPLACE FUNCTION public.user_broker_id()
-- RETURNS uuid AS $$
--   SELECT b.id FROM public.brokers b
--   JOIN public.users u ON u.id = b.user_id
--   WHERE u.auth_id = auth.uid()
-- $$ LANGUAGE sql SECURITY DEFINER STABLE;
--
-- -- Restaurar policies da 085 (com a subquery original):
-- DROP POLICY IF EXISTS "leads_select" ON leads;
-- CREATE POLICY "leads_select" ON leads
--   FOR SELECT USING (
--     org_id = user_org_id()
--     AND (
--       is_admin_or_supervisor()
--       OR assigned_broker_id = (
--         SELECT brokers.user_id FROM brokers
--         WHERE brokers.id = user_broker_id()
--       )
--     )
--   );
--
-- DROP POLICY IF EXISTS "leads_update" ON leads;
-- CREATE POLICY "leads_update" ON leads
--   FOR UPDATE USING (
--     org_id = user_org_id()
--     AND (
--       is_admin_or_supervisor()
--       OR assigned_broker_id = (
--         SELECT brokers.user_id FROM brokers
--         WHERE brokers.id = user_broker_id()
--       )
--     )
--   );
--
-- COMMIT;
-- =============================================================================

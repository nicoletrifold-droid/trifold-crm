-- 210_hotfix_revoke_authenticated_roleta.sql
-- HOTFIX DE SEGURANÇA — follow-up #1 do PR #308 (lote 0 da auditoria RLS).
-- Spec: docs/audits/rls-multi-tenant-audit.md
--
-- ⚠️ APLICAR SOMENTE DEPOIS DA 209. A ordem é obrigatória: a 209 concede
-- EXECUTE a `authenticated` nas duas funções (linhas 664-665), então rodar
-- esta migration ANTES dela seria silenciosamente desfeito. O bloco de guarda
-- abaixo aborta se a 209 ainda não tiver sido aplicada.
--
-- O ACHADO
-- Duas funções SECURITY DEFINER ficam com EXECUTE para `authenticated` sem que
-- nenhum client de usuário as chame:
--
--   • public.roleta_pick_and_advance(uuid, uuid, uuid, integer)
--     Única função de ESCRITA do lote. Chamada em exatamente um lugar —
--     packages/web/src/lib/roleta/distributor.ts:237 e :259 — sempre via
--     createAdminClient(), que usa SUPABASE_SERVICE_ROLE_KEY. Nunca por
--     client de usuário.
--
--   • public.seed_system_roles(uuid)
--     ZERO callers no código da aplicação (varredura em packages/**/*.ts{,x}).
--
-- Por que não foi corrigido dentro da 209: mexer em ACL depois do gate PASS do
-- @qa (docs/qa/gates/hotfix-rls-org-scope-lote0.yml) invalidaria a validação.
-- Registrado lá como follow-up PRIORITÁRIO, resolvido aqui.
--
-- MEDIDO EM PRODUÇÃO em 2026-08-03, com a 209 ainda NÃO aplicada
-- (select p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = ...):
--
--   roleta_pick_and_advance: postgres=X | anon=X | authenticated=X | service_role=X
--   seed_system_roles:       =X        | postgres=X | anon=X | authenticated=X | service_role=X
--
-- Duas leituras importantes desse ACL:
--
--   (a) `anon=X` está presente nas DUAS. A 195_sdr_na_roleta.sql fez
--       `REVOKE ALL ... FROM PUBLIC`, o que removeu a entrada de PUBLIC de
--       roleta_pick_and_advance (por isso ela não tem `=X`) — mas NÃO removeu o
--       grant EXPLÍCITO de `anon`, que é independente de PUBLIC. Ou seja: até a
--       209 ser aplicada, `anon` pode executar uma função de ESCRITA. Isso é
--       fechado pela 209 (linha 653), não por esta migration. É mais um motivo
--       para a 209 não esperar.
--   (b) `seed_system_roles` ainda tem `=X`, o grant DEFAULT para PUBLIC que o
--       Postgres dá a toda função nova e que nunca foi revogado. Também fechado
--       pela 209 (linha 654).
--
-- Esta migration cuida do que sobra depois da 209: o `authenticated`.
--
-- Idempotente: REVOKE de grant inexistente é no-op silencioso no Postgres.
-- PUBLIC e anon entram no REVOKE por defesa — se a 209 já os removeu, no-op.

-- ---------------------------------------------------------------------------
-- GUARDA DE ORDEM — aborta se a 209 não foi aplicada
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'assert_org_scope'
  ) THEN
    RAISE EXCEPTION
      'A migration 209_hotfix_rls_org_scope.sql nao foi aplicada (public.assert_org_scope nao existe). Aplique a 209 primeiro: ela concede EXECUTE a authenticated nestas mesmas funcoes e desfaria esta migration.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- REVOKE
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.seed_system_roles(uuid)
  FROM PUBLIC, anon, authenticated;

-- service_role permanece: é o único chamador real (createAdminClient).
GRANT EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_system_roles(uuid)                            TO service_role;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. Esperado: ZERO linhas.
-- Controle positivo: ANTES de aplicar (e depois da 209) retorna 4 linhas
-- (2 funções × 2 roles), provando que as asserções estão vivas.
-- ---------------------------------------------------------------------------
-- SELECT f.fn, r.rolname AS role_com_execute
-- FROM (VALUES
--         ('public.roleta_pick_and_advance(uuid,uuid,uuid,integer)'),
--         ('public.seed_system_roles(uuid)')
--      ) AS f(fn)
-- CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')) AS r
-- WHERE has_function_privilege(r.rolname, f.fn, 'EXECUTE');
--
-- E a contraprova de que o service_role NÃO foi afetado — esperado: 2 linhas.
-- SELECT f.fn
-- FROM (VALUES
--         ('public.roleta_pick_and_advance(uuid,uuid,uuid,integer)'),
--         ('public.seed_system_roles(uuid)')
--      ) AS f(fn)
-- WHERE has_function_privilege('service_role', f.fn, 'EXECUTE');

-- ---------------------------------------------------------------------------
-- ROLLBACK — restaura o estado que a 209 deixa.
-- Só é necessário se algum caminho não mapeado chamar estas funções com JWT de
-- usuário. Nesse caso o sintoma é ERRCODE 42501 (permission denied for function)
-- nos logs da Vercel, e a correção DEFINITIVA é migrar aquele caminho para
-- service-role — não reabrir o grant em definitivo.
--
--   GRANT EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.seed_system_roles(uuid)                            TO authenticated;
--
-- NUNCA re-conceder a PUBLIC nem a anon: era o vetor anônimo fechado pela 209.
-- ---------------------------------------------------------------------------

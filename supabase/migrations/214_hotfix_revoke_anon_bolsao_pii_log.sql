-- 214_hotfix_revoke_anon_bolsao_pii_log.sql
-- HOTFIX DE SEGURANÇA — sobra da auditoria RLS (lote 0), encontrada em 2026-08-04
-- ao re-rodar os probes em produção depois que a 209 e a 210 já estavam aplicadas.
-- Spec: docs/audits/rls-multi-tenant-audit.md
--
-- CONTEXTO: por que isto não veio na 209/210
-- A auditoria original varreu as funções que RECEBEM p_org_id (o vetor de
-- cross-tenant) e a 210 varreu o que a 209 reabria para `authenticated`. Nenhuma
-- das duas varreduras cobria "toda função SECURITY DEFINER executável por anon"
-- — e é aí que estas duas estavam. A varredura que as achou foi:
--
--   SELECT p.proname, p.prosecdef, pg_get_function_result(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND has_function_privilege('anon', p.oid, 'EXECUTE')
--      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
--      AND p.prosecdef
--      AND pg_get_function_result(p.oid) <> 'trigger';
--
-- Resultado em prod (2026-08-04): 15 funções. 13 são inócuas — predicados de
-- auth (`is_admin`, `user_org_id`, `user_role`, `is_cliente`, `is_imob_profile`,
-- `has_module_access`, `public_user_id`, `user_broker_id`, `cliente_obra_ids`,
-- `cliente_obra_link_ids`) que derivam de `auth.uid()` e retornam NULL/false para
-- anon; `normalize_phone_br` (função pura de texto); e `rls_auto_enable`
-- (event_trigger, não chamável). As DUAS que sobram são as tratadas aqui.
--
-- ⚠️ As funções que DEVOLVEM dado de negócio e são executáveis por anon
-- (`get_analytics_summary`, `get_admin_mensagens_paginated`,
-- `search_conversation_messages`, `get_dashboard_stage_counts`…) são
-- SECURITY **INVOKER** — a RLS se aplica e anon não lê nada. Conferido, não
-- mexido: revogar ali não agrega e arrisca quebrar caminho legítimo.
--
-- ── ACHADO 1 (o que importa): public.pegar_lead_bolsao(uuid, uuid) ──────────
-- SECURITY DEFINER **e de ESCRITA**: puxa um lead do bolsão e o atribui a um
-- corretor (UPDATE em leads + log). DEFINER ignora RLS por construção.
--
-- ACL medido em prod 2026-08-04:
--   {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
--
-- Ou seja: `=X` (PUBLIC, o grant default do Postgres para toda função nova) MAIS
-- os grants explícitos de `anon` e `authenticated` (default do Supabase no schema
-- public). As migrations que definem a função — 128, 164 e 185 — nunca revogaram
-- nada. Efeito prático: um chamador **sem login**, com dois UUIDs válidos,
-- atribui lead a corretor arbitrário. Não exercitei o vetor: mutaria produção.
--
-- Único caller real: packages/web/src/app/api/bolsao/[id]/pegar/route.ts:29, via
-- `admin.rpc(...)` (createAdminClient → service_role). Varredura em
-- packages/**/*.ts{,x}: nenhum client de usuário chama esta RPC. Logo, remover
-- PUBLIC/anon/authenticated não tira nada de ninguém.
--
-- É exatamente a mesma família que a 210 fechou para `roleta_pick_and_advance`
-- (DEFINER + escrita + único caller via service_role) — esta passou batido lá.
--
-- ── ACHADO 2 (menor): public.log_pii_access(uuid, uuid, text, jsonb, text) ──
-- DEFINER e de escrita, mas escreve no LOG de acesso a PII, não em dado de
-- negócio. Exposta a anon, permite POLUIR a trilha de auditoria (inserir
-- registros de acesso que nunca ocorreram) — corrompe a prova, não vaza dado.
-- Severidade menor, mesma origem, então vai junto.
--
-- 🔑 DIFERENÇA CRÍTICA ENTRE OS DOIS: `log_pii_access` **É** chamado com client
-- de USUÁRIO — `fetchLeadDrill`/`fetchLeadList` em
-- packages/web/src/lib/agent/context-builder.ts:1083, e o `supabase` que chega
-- ali vem de `requireAuth()` em app/api/agent/chat/route.ts:88-90. Portanto
-- `authenticated` PRECISA manter EXECUTE: revogar quebraria o fail-closed do
-- agente (a função retorna true antes de ler PII; sem permissão o agente para de
-- responder drill de leads). Aqui só PUBLIC e anon saem.
--
-- ⚠️ LEMBRETE DE ACL (lição registrada na 210): `REVOKE ... FROM PUBLIC` NÃO
-- alcança grant EXPLÍCITO de role. Os três precisam ser nomeados.
--
-- Idempotente: REVOKE de grant inexistente é no-op silencioso no Postgres.
-- Nenhuma mudança de código acompanha esta migration — é só ACL, então não há
-- assimetria código-antes-do-banco para respeitar.

-- ---------------------------------------------------------------------------
-- GUARDA — as assinaturas têm de ser EXATAMENTE estas.
-- Se um dia a função mudar de assinatura, o REVOKE abaixo erraria o alvo em
-- silêncio (o Postgres resolveria outra sobrecarga ou falharia); melhor abortar
-- com mensagem clara do que aplicar e achar que fechou.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'pegar_lead_bolsao'
       AND pg_get_function_identity_arguments(p.oid) = 'p_lead_id uuid, p_broker_user_id uuid'
  ) THEN
    RAISE EXCEPTION
      'public.pegar_lead_bolsao(p_lead_id uuid, p_broker_user_id uuid) nao encontrada com esta assinatura. A funcao mudou: reveja o alvo do REVOKE antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'log_pii_access'
       AND pg_get_function_identity_arguments(p.oid) = 'p_org_id uuid, p_session_id uuid, p_data_type text, p_scope jsonb, p_view_or_source text'
  ) THEN
    RAISE EXCEPTION
      'public.log_pii_access(...) nao encontrada com esta assinatura. A funcao mudou: reveja o alvo do REVOKE antes de aplicar.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- REVOKE
-- ---------------------------------------------------------------------------

-- Achado 1 — escrita em dado de negócio. Só service_role deve executar.
REVOKE EXECUTE ON FUNCTION public.pegar_lead_bolsao(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pegar_lead_bolsao(uuid, uuid) TO service_role;

-- Achado 2 — trilha de auditoria de PII. `authenticated` PERMANECE (o agente
-- chama com o client do usuário — ver comentário no cabeçalho); fora anônimo.
REVOKE EXECUTE ON FUNCTION public.log_pii_access(uuid, uuid, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_pii_access(uuid, uuid, text, jsonb, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. Esperado: ZERO linhas.
-- Controle positivo: ANTES de aplicar retorna 3 linhas (bolsão × anon,
-- bolsão × authenticated, log_pii × anon), provando que as asserções estão vivas.
-- ---------------------------------------------------------------------------
-- SELECT f.fn, f.role
--   FROM (VALUES
--           ('public.pegar_lead_bolsao(uuid,uuid)', 'anon'),
--           ('public.pegar_lead_bolsao(uuid,uuid)', 'authenticated'),
--           ('public.log_pii_access(uuid,uuid,text,jsonb,text)', 'anon')
--        ) AS f(fn, role)
--  WHERE has_function_privilege(f.role, f.fn, 'EXECUTE');
--
-- Contraprova de que quem PRECISA continua podendo — esperado: 3 linhas.
-- SELECT f.fn, f.role
--   FROM (VALUES
--           ('public.pegar_lead_bolsao(uuid,uuid)', 'service_role'),
--           ('public.log_pii_access(uuid,uuid,text,jsonb,text)', 'service_role'),
--           ('public.log_pii_access(uuid,uuid,text,jsonb,text)', 'authenticated')
--        ) AS f(fn, role)
--  WHERE has_function_privilege(f.role, f.fn, 'EXECUTE');

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- Só necessário se algum caminho não mapeado chamar `pegar_lead_bolsao` com JWT
-- de usuário. Sintoma: ERRCODE 42501 (permission denied for function) nos logs da
-- Vercel ao puxar lead do bolsão. A correção DEFINITIVA nesse caso é migrar
-- aquele caminho para service-role, não reabrir o grant em definitivo.
--
--   GRANT EXECUTE ON FUNCTION public.pegar_lead_bolsao(uuid, uuid) TO authenticated;
--
-- NUNCA re-conceder a PUBLIC nem a anon em nenhuma das duas.
--
-- ⚠️ ARMADILHA FUTURA: `CREATE OR REPLACE FUNCTION` PRESERVA o ACL, mas
-- `DROP` + `CREATE` o RESETA para o default (PUBLIC + anon + authenticated).
-- Se alguma migration futura recriar estas funções via DROP/CREATE, este REVOKE
-- é desfeito em silêncio. Regra: ao recriar função DEFINER de escrita, repetir o
-- REVOKE na mesma migration.
-- ---------------------------------------------------------------------------

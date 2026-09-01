-- 250_pausar_retomar_empresa.sql
-- Story 900-60 (Epic 900, Frente 2 "Console") — pausar / retomar o processamento automático de
-- uma empresa. A PRIMEIRA mutação nova do console fora de integrações.
--
-- ============================================================================
-- POR QUE ISTO É UMA RPC, E NÃO UM `.update()` NA ROTA NEXT
-- ============================================================================
-- Três razões medidas, nesta ordem:
--
-- 1. **`orgs_ativas_depois` (AC10) só é verdade se for lido na MESMA transação do `UPDATE`.**
--    Ler a contagem pela rota, depois do `UPDATE`, é duas viagens: entre elas outra pausa pode
--    entrar, e a trilha registraria um número que nunca existiu. Aqui o `count(*)` roda depois
--    do `UPDATE` e antes do `COMMIT` — ele é o estado que aquela ação produziu, por construção.
--
-- 2. **A contagem exata não é alcançável pelo caminho sancionado do console.** `platformQuery()`
--    recusa qualquer `(` no `columns` desde a 900-42a (embedding vazava PII de lead), agregado
--    é `HTTP 400 PGRST123` neste Supabase, e `Prefer: count=exact` não passa pela assinatura de
--    um argumento de `platformQuery()`. Contar linhas em memória sofreria o corte de 1000 do
--    PostgREST — e o número que explica o roteamento não pode ser aproximado.
--
-- 3. **`app/api/platform/**` não pode conter `.from(<literal>)`.** É a segunda rede da 900-22b
--    (`platform-query-scan.ts`), aplicada por teste. Escrita de plataforma ali é `db.rpc(...)`
--    — exatamente o desenho das 4 RPCs `*_as_platform` da migration 248.
--
-- ============================================================================
-- O QUE `organizations.is_active` REALMENTE CONTROLA (medido, Story 900-60)
-- ============================================================================
-- Esta migration não muda o efeito da coluna; ela só o torna operável e auditável. Para quem
-- ler isto depois, o efeito medido em `packages/web/src` era:
--
--   • `forEachActiveOrg()` (`lib/tenancy/for-each-org.ts:135`) — os crons pulam a empresa.
--   • `resolveSoleOrg()` (`lib/tenancy/webhook-org.ts:244-248`) — lê a coluna como CONTAGEM de
--     empresas ativas (`.eq("is_active", true).limit(2)`), e só resolve quando existe
--     EXATAMENTE UMA. Ou seja: pausar a empresa A muda o denominador que roteia os leads de
--     landing-page e Telegram da empresa B. É por isso que `orgs_ativas_depois` existe.
--   • O gate de sessão (`lib/supabase/middleware.ts`, `lib/api-auth.ts`) NÃO lê esta coluna —
--     ele lê `users.is_active`, que é outra tabela e outra granularidade. Pausar uma empresa
--     **não impede ninguém dela de logar**.
--
-- ============================================================================
-- CÓDIGOS DE ERRO — o contrato que a rota traduz
-- ============================================================================
--   P0021  motivo vazio (ou só espaços) não é um motivo
--   P0022  organização inexistente
--   P0023  UPDATE afetou ≠ 1 linha
--
-- ============================================================================

-- ============================================================================
-- organization_set_active_as_platform — o único ponto de escrita de `is_active`
-- ============================================================================
-- `SECURITY DEFINER` pela mesma razão das RPCs da 248: quem autoriza é a rota
-- (`getPlatformAdmin()`), e a função é inalcançável por `anon`/`authenticated` (REVOKE abaixo).
-- O `platform_audit()` chamado aqui dentro roda como o definer, então a REVOKE dele continua
-- valendo para todo mundo — a trilha não ganha uma porta nova.
--
-- ⚠️ A chamada a `platform_audit()` NÃO é opcional e não pode virar `IF ... THEN`: ela está na
-- mesma transação do `UPDATE`. Se a trilha falhar, a pausa não acontece. O contrário — pausar
-- sem registrar — é exatamente o estado que esta story existe para acabar.
CREATE OR REPLACE FUNCTION organization_set_active_as_platform(
  p_org_id        uuid,
  p_is_active     boolean,
  p_reason        text,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_motivo    text;
  v_anterior  boolean;
  v_afetadas  int;
  v_ativas    int;
  v_action    text;
BEGIN
  -- O `trim` é do banco, não só da rota: a rota é UMA das superfícies possíveis, e um motivo
  -- de três espaços é indistinguível de motivo nenhum na hora de reconstruir o histórico.
  -- Sem mínimo de caracteres inventado — a regra é "não vazio", e só.
  v_motivo := btrim(COALESCE(p_reason, ''));
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'motivo obrigatório para pausar ou retomar uma empresa'
      USING ERRCODE = 'P0021';
  END IF;

  -- `FOR UPDATE` trava a linha até o COMMIT. Sem ele, duas pausas simultâneas leriam o mesmo
  -- `is_active_anterior` e a trilha diria duas vezes a mesma transição.
  SELECT o.is_active INTO v_anterior
    FROM organizations o WHERE o.id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organização % não existe', p_org_id USING ERRCODE = 'P0022';
  END IF;

  UPDATE organizations SET is_active = p_is_active WHERE id = p_org_id;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  IF v_afetadas <> 1 THEN
    RAISE EXCEPTION 'UPDATE em organizations afetou % linhas, esperado 1', v_afetadas
      USING ERRCODE = 'P0023';
  END IF;

  -- AC10 — a contagem DEPOIS, na mesma transação. É o número que explica, meses depois, por que
  -- o roteamento de landing-page/telegram mudou de comportamento naquele dia.
  SELECT count(*) INTO v_ativas FROM organizations WHERE is_active;

  v_action := CASE WHEN p_is_active THEN 'organization.activated'
                   ELSE 'organization.deactivated' END;

  PERFORM platform_audit(
    p_actor_user_id, 'platform_admin', p_org_id, v_action,
    'organizations', p_org_id,
    jsonb_build_object(
      'reason', v_motivo,
      'is_active_anterior', v_anterior,
      'orgs_ativas_depois', v_ativas
    )
  );

  RETURN jsonb_build_object(
    'is_active', p_is_active,
    'is_active_anterior', v_anterior,
    'orgs_ativas_depois', v_ativas,
    'action', v_action
  );
END; $$;

REVOKE ALL ON FUNCTION organization_set_active_as_platform(uuid, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION organization_set_active_as_platform(uuid, boolean, text, uuid)
  TO service_role;

-- ============================================================================
-- ROLLBACK (NFR-8)
-- ============================================================================
-- DROP FUNCTION IF EXISTS organization_set_active_as_platform(uuid, boolean, text, uuid);
-- -- A trilha JÁ ESCRITA por esta função permanece: `platform_audit_log` é append-only por
-- -- atributo de nascimento (migration 248) e apagá-la é a operação que aquela migration
-- -- existe para impedir.

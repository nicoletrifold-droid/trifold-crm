-- 253_diagnostico_integracao.sql
-- Story 900-61 (Epic 900, Frente 2 "Console") — `org_integrations` passa a guardar DESDE QUANDO e
-- POR QUÊ uma integração está em erro.
--
-- ============================================================================
-- O QUE ESTA MIGRATION RESOLVE
-- ============================================================================
-- Hoje a tela diz "Com erro" e nada mais. A informação do motivo JÁ EXISTE — `p_codigo` chega em
-- `_org_integration_mark_error` e vai para o `metadata` da trilha (`platform_audit_log`) — mas não
-- fica na própria linha, então quem olha o painel precisa cruzar a trilha à mão para descobrir o
-- que aconteceu, e a pergunta que evita a ligação para o cliente ("há quanto tempo isso está
-- quebrado?") não tem resposta em lugar nenhum.
--
-- ============================================================================
-- POR QUE AS COLUNAS NASCEM `NULL`, SEM DEFAULT E SEM BACKFILL
-- ============================================================================
-- Nenhuma integração de hoje tem uma "última checagem" real. Um `DEFAULT now()` carimbaria TODA
-- linha existente com o instante da migration, e a tela passaria a afirmar "verificado em
-- <data do deploy>" sobre integrações que ninguém verificou. Dado falso com cara de medida é
-- pior do que a ausência que a coluna veio corrigir — o consumidor (`diagnostico.ts`) trata
-- `NULL` como "não sei" e não desenha linha nenhuma.
--
-- ============================================================================
-- `last_error` GUARDA O CÓDIGO, E O BANCO NÃO GARANTE ISSO — medido pelo @po
-- ============================================================================
-- `_org_integration_mark_error(..., p_codigo text)` recebe `text` PURO: sem `CHECK`, sem enum, sem
-- validação nenhuma dentro da função (migration 248, linha 395 em diante). "É sempre um dos 6
-- códigos de `lib/integrations/painel/erros.ts`" é disciplina do CHAMADOR, não uma garantia deste
-- schema — e por isso o render NUNCA indexa a tabela de mensagens sem fallback
-- (`formatarDiagnostico` em `lib/integrations/painel/diagnostico.ts` tem um caso de teste só para
-- o código desconhecido).
--
-- ⚠️ FOLLOW-UP DELIBERADAMENTE FORA DESTA STORY: endurecer `p_codigo` com um `CHECK`/enum é a
-- correção de raiz, mas mexe no contrato de uma função `SECURITY DEFINER` de segurança e nas 2
-- rotas que a chamam. Fica registrado aqui, não feito aqui.

ALTER TABLE org_integrations
  ADD COLUMN last_error text,
  ADD COLUMN last_check_at timestamptz;

COMMENT ON COLUMN org_integrations.last_error IS
  'Story 900-61 — o CÓDIGO do último erro (contrato de 6 códigos de lib/integrations/painel/erros.ts), nunca o texto cru do provider. `text` sem CHECK: quem lê traduz COM fallback, porque o banco não garante o domínio. NULL = nunca falhou, ou já reconectou.';

COMMENT ON COLUMN org_integrations.last_check_at IS
  'Story 900-61 — instante da última tentativa de verificação (mark_error ou mark_connected). NULL = nunca verificado; nenhum backfill inventou data para as linhas antigas.';

-- ============================================================================
-- `_org_integration_mark_connected` — agora LIMPA o erro anterior
-- ============================================================================
-- Sem o `last_error = NULL` daqui, uma integração corrigida continuaria exibindo a mensagem e a
-- data do erro antigo — pior do que não ter a coluna, porque afirmaria um estado falso com mais
-- confiança visual (uma data e um motivo específicos de um problema que já não existe).
--
-- O corpo é o da migration 248 com UMA linha alterada (o `UPDATE`). O `GET DIAGNOSTICS` e a
-- checagem de `P0016` continuam valendo: acrescentar colunas ao `SET` não muda `ROW_COUNT`.
CREATE OR REPLACE FUNCTION _org_integration_mark_connected(
  p_org_id uuid, p_provider text, p_actor_user_id uuid, p_actor_type text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_row_id uuid; v_secret_ref text; v_rows_affected int;
BEGIN
  SELECT id, secret_ref INTO v_row_id, v_secret_ref
    FROM org_integrations WHERE org_id = p_org_id AND provider = p_provider FOR UPDATE;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'org_integration_mark_connected: nenhuma linha para org_id=%, provider=%', p_org_id, p_provider
      USING ERRCODE = 'P0014';
  END IF;

  -- O guard estrutural do R4, e o LIMITE dele, escrito onde alguém decide se a régua basta:
  -- isto garante 100% em SQL "não marca connected sem um segredo gravado" (e, com P0017, sem um
  -- segredo VAZIO). NÃO garante "a credencial foi testada com sucesso" — essa prova é uma
  -- chamada HTTP e só existe em application code. Nenhuma RPC reproduz isso sem reimplementar
  -- os clientes de 5 APIs externas dentro do Postgres.
  IF v_secret_ref IS NULL THEN
    RAISE EXCEPTION 'org_integration_mark_connected: sem secret_ref — não marca connected sem um segredo gravado'
      USING ERRCODE = 'P0015';
  END IF;

  UPDATE org_integrations
     SET status = 'connected', updated_at = now(), last_error = NULL, last_check_at = now()
   WHERE id = v_row_id;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected <> 1 THEN
    RAISE EXCEPTION 'org_integration_mark_connected: UPDATE afetou % linhas (esperava 1)', v_rows_affected
      USING ERRCODE = 'P0016';
  END IF;

  PERFORM platform_audit(p_actor_user_id, p_actor_type, p_org_id,
    'org_integration.marked_connected', 'org_integrations', v_row_id,
    jsonb_build_object('provider', p_provider));
END; $$;

REVOKE ALL ON FUNCTION _org_integration_mark_connected(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- `_org_integration_mark_error` — grava o motivo e o instante NA LINHA
-- ============================================================================
-- `p_codigo` já era recebido e já ia para a trilha; aqui ele passa a ficar também onde a tela lê
-- direto. A linha da trilha continua idêntica — nada foi movido de lugar, foi ACRESCENTADO.
CREATE OR REPLACE FUNCTION _org_integration_mark_error(
  p_org_id uuid, p_provider text, p_actor_user_id uuid, p_actor_type text, p_codigo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_row_id uuid; v_rows_affected int;
BEGIN
  SELECT id INTO v_row_id
    FROM org_integrations WHERE org_id = p_org_id AND provider = p_provider FOR UPDATE;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'org_integration_mark_error: nenhuma linha para org_id=%, provider=%', p_org_id, p_provider
      USING ERRCODE = 'P0014';
  END IF;

  UPDATE org_integrations
     SET status = 'error', updated_at = now(), last_error = p_codigo, last_check_at = now()
   WHERE id = v_row_id;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected <> 1 THEN
    RAISE EXCEPTION 'org_integration_mark_error: UPDATE afetou % linhas (esperava 1)', v_rows_affected
      USING ERRCODE = 'P0016';
  END IF;

  PERFORM platform_audit(p_actor_user_id, p_actor_type, p_org_id,
    'org_integration.marked_error', 'org_integrations', v_row_id,
    jsonb_build_object('provider', p_provider, 'codigo', p_codigo));
END; $$;

REVOKE ALL ON FUNCTION _org_integration_mark_error(uuid, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- `_org_integration_write_secret` NÃO É TOCADA — e a ausência é a decisão
-- ============================================================================
-- Aquela função já declara "NUNCA promove status", e o mesmo princípio vale para estas duas
-- colunas: gravar um segredo novo não é prova de que a integração está saudável (a prova é a
-- chamada HTTP feita em application code). Se `write_secret` carimbasse `last_check_at`, o painel
-- passaria a dizer "verificado em <agora>" para uma credencial que ninguém testou.
-- `last_error`/`last_check_at` só mudam por `mark_error`/`mark_connected`.

-- ============================================================================
-- ROLLBACK (NFR-8)
-- ============================================================================
-- ALTER TABLE org_integrations DROP COLUMN last_error, DROP COLUMN last_check_at;
-- -- E reaplicar os corpos das 2 funções da migration 248 (sem as colunas no `SET`). Derrubar as
-- -- colunas sem reaplicar as funções deixa as duas RPCs quebradas no primeiro `mark_error`.

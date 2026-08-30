-- 248_painel_integracoes_self_service.sql
-- Story 900-51 (Epic 900, antecipação da Onda 7) — painel self-service de integrações por
-- empresa, com trilha de auditoria que nasce append-only.
--
-- ============================================================================
-- POR QUE TUDO ISTO MORA NO BANCO, E NÃO NA ROTA NEXT
-- ============================================================================
-- As duas primeiras revisões desta story foram reprovadas pelo mesmo defeito, escrito de quatro
-- jeitos: as propriedades anunciadas ("trilha append-only", "nunca grava sem testar", "google
-- fora do escopo de escrita", "salvo com sucesso") estavam enforced na rota Next — e a
-- superfície que o cliente realmente alcança é a FUNÇÃO, exposta por PostgREST com
-- `GRANT EXECUTE ... TO authenticated`. Uma propriedade que só a rota garante é uma propriedade
-- que a RPC não tem.
--
-- Esta migration é onde as propriedades passam a existir. Cada guard abaixo tem a medição do
-- `@po` que o motivou anotada ao lado — nenhum deles é precaução genérica.
--
-- ============================================================================
-- CÓDIGOS DE ERRO — o contrato que as rotas traduzem para pt-BR
-- ============================================================================
--   P0010  whatsapp não escreve em org_integrations (ver whatsapp_config)
--   P0011  provider fora da allowlist positiva
--   P0012  write_secret: nenhuma linha para (org, provider)
--   P0013  write_secret: UPDATE afetou ≠ 1 linha
--   P0014  mark_connected/mark_error/reveal: nenhuma linha para (org, provider)
--   P0015  mark_connected/reveal: sem secret_ref
--   P0016  mark_connected/mark_error: UPDATE afetou ≠ 1 linha
--   P0017  segredo vazio (ou só espaços) não é uma credencial
--   P0018  page_id de meta_ads fora do formato numérico
--   P0019  DELIBERADAMENTE NÃO ALOCADO. Era o código do fecho sugerido pelo `@po` na Rodada 3
--          ("page_id só gravável por platform_admin"). O dono do produto RECUSOU esse fecho em
--          2026-08-30: o cliente também grava o page_id, com auditoria. O risco cross-tenant é
--          aceito conscientemente, e a contrapartida é DETECÇÃO (ver seção 7), não prevenção.
--          O código fica vago para que ninguém o reuse achando que a decisão foi outra.
--   P0020  platform_audit_log é append-only (UPDATE/DELETE/TRUNCATE)
--   P0021  _as_org: chamador sem sessão, sem linha em users, ou sem a capability
--
-- ROLLBACK: bloco no fim do arquivo (NFR-8).

-- ============================================================================
-- 1. platform_audit_log — a trilha, com append-only como ATRIBUTO DE NASCIMENTO
-- ============================================================================
--
-- R7 do parecer (Rodada 1): as duas FKs são `ON DELETE SET NULL`, não `NO ACTION`. Com
-- `NO ACTION`, apagar uma organização passaria a exigir apagar a trilha dela — o oposto exato de
-- append-only — e apagar um usuário que já agiu ficaria bloqueado para sempre. A identidade do
-- ator fica CONGELADA em `metadata->>'actor_label'` (mesmo raciocínio que já justificava
-- `actor_type` ser coluna própria em vez de JOIN): a trilha sobrevive à org e ao usuário que a
-- originou.
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_type     text NOT NULL CHECK (actor_type IN ('platform_admin', 'org_admin')),
  org_id         uuid REFERENCES organizations(id) ON DELETE SET NULL,
  action         text NOT NULL,
  target_table   text NOT NULL,
  target_id      uuid,
  metadata       jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_org_criado
  ON platform_audit_log (org_id, created_at DESC);

-- Índice da detecção de reatribuição cross-org (AC11, seção 7): sem ele, cada escrita de
-- `meta_ads` varreria a trilha inteira.
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_page_id
  ON platform_audit_log ((metadata->>'page_id'))
  WHERE metadata ? 'page_id';

ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura: a plataforma vê tudo; o cliente vê a trilha DA PRÓPRIA ORG, e só quem administra
-- integrações. Mesma capability que governa a escrita em `org_integrations` (migration 246).
DROP POLICY IF EXISTS "platform_audit_log_select_plataforma" ON platform_audit_log;
CREATE POLICY "platform_audit_log_select_plataforma" ON platform_audit_log
  FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_audit_log_select_org" ON platform_audit_log;
CREATE POLICY "platform_audit_log_select_org" ON platform_audit_log
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND public.has_capability('configuracoes.integracoes_gerenciar')
  );

-- ----------------------------------------------------------------------------
-- 1a. Privilégio — R1/N1, o eixo que RLS não alcança
-- ----------------------------------------------------------------------------
-- Medido pelo `@po` contra o `trifold-crm-dev`: `service_role.rolbypassrls = true`. Ausência de
-- policy de UPDATE/DELETE não faz NADA contra um role que pula RLS por definição — e as rotas
-- de `/platform` desta story falam com o banco justamente como `service_role`. O ator que a
-- trilha existe para responsabilizar era o único capaz de reescrevê-la.
--
-- `BYPASSRLS` pula RLS, **não** pula `GRANT`. Medido, em transação com ROLLBACK:
--     antes:  sr_ins=true  sr_upd=true   sr_del=true   sr_trunc=true
--     depois: sr_ins=true  sr_upd=false  sr_del=false  sr_trunc=false
--
-- `TRUNCATE` na lista não é zelo: o `GRANT ALL` que o Supabase aplica a tabela nova INCLUI
-- TRUNCATE, e a Rodada 2 mediu 2 linhas → um TRUNCATE → 0 linhas, sem exceção nenhuma, com o
-- REVOKE de só UPDATE/DELETE no lugar. Apagar tudo é pior que forjar uma linha.
REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_log FROM service_role, authenticated, anon, PUBLIC;

-- ----------------------------------------------------------------------------
-- 1b. Trigger — segunda camada, porque o DONO da tabela passa pelo REVOKE
-- ----------------------------------------------------------------------------
--
-- ACHADO DA CAMADA B (@dev, 2026-08-30) — os dois consertos de R7 e de R1 COLIDIAM, e nenhuma
-- leitura do código revelava isso. Medido:
--
--     DELETE FROM users WHERE id = <ator que já agiu>;
--     → ERROR: P0020: platform_audit_log é append-only — UPDATE não é permitido
--       CONTEXT: SQL statement "UPDATE ONLY public.platform_audit_log SET actor_user_id = NULL …"
--
-- `ON DELETE SET NULL` é implementado pelo Postgres como um **UPDATE interno** na tabela
-- referenciante. Um trigger `BEFORE UPDATE` incondicional o intercepta — então a FK que existia
-- para a trilha SOBREVIVER à org e ao usuário (R7) ficava inerte, e apagar uma org voltava a ser
-- bloqueado, agora com um erro OPACO (`P0020`) em vez de um `23503` legível. Pior para a 900-25:
-- o teardown dela deriva as FKs bloqueantes de `pg_constraint` filtrando `confdeltype NOT IN
-- ('c','n')` — ou seja, ele EXCLUI as `SET NULL`, e nunca saberia que precisava tratar esta.
--
-- Conserto: a exceção é CIRÚRGICA e nomeada — a única mutação permitida é a que só NULIFICA as
-- duas colunas de atribuição, deixando todo o resto idêntico. É exatamente a forma da ação
-- referencial, e nada mais.
--
-- **O que isto enfraquece, dito sem suavizar:** o DONO da tabela passa a poder apagar a
-- atribuição (`actor_user_id`/`org_id` → NULL) de uma linha, embora continue sem poder alterar
-- `action`, `target_*`, `metadata`, `actor_type` ou `created_at`. Para os outros roles isso
-- continua impossível pelo `REVOKE UPDATE` acima, que vale inclusive contra `BYPASSRLS`. E a
-- identidade do ator sobrevive de qualquer jeito em `metadata->>'actor_label'`, congelada no
-- momento do ato — que é precisamente a razão pela qual o R7 pediu o rótulo congelado.
CREATE OR REPLACE FUNCTION platform_audit_log_immutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id           IS NOT DISTINCT FROM OLD.id
     AND NEW.actor_type   IS NOT DISTINCT FROM OLD.actor_type
     AND NEW.action       IS NOT DISTINCT FROM OLD.action
     AND NEW.target_table IS NOT DISTINCT FROM OLD.target_table
     AND NEW.target_id    IS NOT DISTINCT FROM OLD.target_id
     AND NEW.metadata     IS NOT DISTINCT FROM OLD.metadata
     AND NEW.created_at   IS NOT DISTINCT FROM OLD.created_at
     -- cada coluna de atribuição só pode ficar como está OU virar NULL: nunca apontar para outro
     AND (NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id OR NEW.actor_user_id IS NULL)
     AND (NEW.org_id        IS NOT DISTINCT FROM OLD.org_id        OR NEW.org_id IS NULL)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'platform_audit_log é append-only — % não é permitido', TG_OP
    USING ERRCODE = 'P0020';
END; $$;

DROP TRIGGER IF EXISTS platform_audit_log_sem_update ON platform_audit_log;
CREATE TRIGGER platform_audit_log_sem_update BEFORE UPDATE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION platform_audit_log_immutavel();

DROP TRIGGER IF EXISTS platform_audit_log_sem_delete ON platform_audit_log;
CREATE TRIGGER platform_audit_log_sem_delete BEFORE DELETE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION platform_audit_log_immutavel();

-- N1 — `FOR EACH STATEMENT` é OBRIGATÓRIO aqui, não estilo: TRUNCATE não dispara trigger por
-- linha (não há linha para o trigger enxergar), e `BEFORE TRUNCATE` só aceita `FOR EACH
-- STATEMENT`. Este é o trigger que faltava quando o `@po` apagou a tabela inteira sem exceção.
DROP TRIGGER IF EXISTS platform_audit_log_sem_truncate ON platform_audit_log;
CREATE TRIGGER platform_audit_log_sem_truncate BEFORE TRUNCATE ON platform_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_log_immutavel();

COMMENT ON TABLE platform_audit_log IS
  'Story 900-51 — trilha append-only de atos de configuração de integração. Append-only é atributo de NASCIMENTO, garantido em dois eixos independentes: REVOKE UPDATE/DELETE/TRUNCATE (vale contra BYPASSRLS) e três triggers que recusam até para o dono da tabela (P0020).';

-- ============================================================================
-- 2. platform_audit() — a única porta de escrita da trilha
-- ============================================================================
-- `actor_label` congelado no momento do ato: é o que sobrevive ao `ON DELETE SET NULL` de
-- `actor_user_id` (R7). Sem ele, apagar o usuário apagaria a resposta a "quem fez isto".
CREATE OR REPLACE FUNCTION platform_audit(
  p_actor_user_id uuid,
  p_actor_type    text,
  p_org_id        uuid,
  p_action        text,
  p_target_table  text,
  p_target_id     uuid,
  p_metadata      jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_label text;
  v_id          uuid;
BEGIN
  SELECT COALESCE(u.name, u.email) INTO v_actor_label
    FROM users u WHERE u.id = p_actor_user_id;

  INSERT INTO platform_audit_log (
    actor_user_id, actor_type, org_id, action, target_table, target_id, metadata
  ) VALUES (
    p_actor_user_id, p_actor_type, p_org_id, p_action, p_target_table, p_target_id,
    jsonb_build_object('actor_label', v_actor_label) || COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION platform_audit(uuid, text, uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. _org_integration_write_secret — escreve config+secret_ref. NUNCA promove status.
-- ============================================================================
CREATE OR REPLACE FUNCTION _org_integration_write_secret(
  p_org_id        uuid,
  p_provider      text,
  p_secret        text,
  p_config        jsonb,
  p_actor_user_id uuid,
  p_actor_type    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row_id         uuid;
  v_secret_ref     text;
  v_had_secret     boolean;
  v_rows_affected  int;
  v_secret_name    text;
  v_page_id        text;
  v_org_anterior   uuid;
  v_action         text;
  v_metadata       jsonb;
BEGIN
  -- R3 — allowlist POSITIVA. A versão negativa da v0.2 só recusava `whatsapp`, e o `@po` mediu
  -- que `google` (linha que EXISTE e é gravável em org_integrations) entrava pela RPC direta,
  -- recriando a segunda gaveta que o Context inteiro argumenta contra. Lista negativa envelhece
  -- a cada provider novo; positiva falha fechado por omissão.
  IF p_provider NOT IN ('meta_ads', 'meta_capi', 'sienge', 'telegram') THEN
    IF p_provider = 'whatsapp' THEN
      RAISE EXCEPTION 'whatsapp não escreve em org_integrations — ver whatsapp_config'
        USING ERRCODE = 'P0010';
    END IF;
    RAISE EXCEPTION 'org_integration_write: provider "%" fora da allowlist (meta_ads, meta_capi, sienge, telegram)', p_provider
      USING ERRCODE = 'P0011';
  END IF;

  -- N2(a) — o guard estrutural de `mark_connected` pergunta "existe secret_ref?", e uma
  -- referência para string vazia É uma referência. Medido pelo `@po`: write('') + mark_connected
  -- produzia `status='connected'` com `length(decrypted_secret)=0`, e `right('',4)=''` — o badge
  -- dizia "Conectado" enquanto o "Revelar últimos 4" mostrava nada, na mesma tela.
  -- `btrim` (e não `= ''`) porque a variante só-espaços passa por igualdade pura.
  IF p_secret IS NULL OR btrim(p_secret) = '' THEN
    RAISE EXCEPTION 'org_integration_write: segredo vazio não é uma credencial'
      USING ERRCODE = 'P0017';
  END IF;

  -- N2(b) — HIGIENE DE DADO, e a prosa aqui é a corrigida na Rodada 3, não a que prometia mais
  -- do que entrega: este guard barra o EXEMPLO malformado do `@po`
  -- ("PAGINA-DE-OUTRA-EMPRESA-999"), e NÃO barra a CLASSE do ataque. Medido: o page_id real da
  -- Trifold ("132027046650861") passa por aqui tão facilmente quanto o de qualquer outra
  -- empresa, porque todo page_id verdadeiro É numérico. A redução de superfície de SEQUESTRO é
  -- zero; o valor é impedir lixo na chave de roteamento. A resposta real ao risco cross-tenant é
  -- a decisão do dono do produto (aceitar) + a detecção da seção 7.
  IF p_provider = 'meta_ads' AND p_config ? 'page_id' AND p_config->>'page_id' IS NOT NULL THEN
    IF p_config->>'page_id' !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'org_integration_write: page_id precisa ser numérico (identificador de Página da Meta), recebido "%"', p_config->>'page_id'
        USING ERRCODE = 'P0018';
    END IF;
    v_page_id := p_config->>'page_id';
  END IF;

  -- R2/m2 — UMA consulta só, e a checagem explícita é o que fecha o 14º instrumento cego.
  -- `SELECT ... INTO` NÃO levanta quando não casa (só `INTO STRICT` levanta): sem o `IF` abaixo,
  -- `v_row_id` ficava NULL, `vault.create_secret` JÁ tinha rodado (segredo órfão),
  -- `UPDATE ... WHERE id = NULL` afetava 0 linhas sem erro, a trilha gravava SUCESSO e a rota
  -- devolvia 200 — o painel dizia "salvo com sucesso" e "Não conectado" na mesma sessão.
  -- `FOR UPDATE` trava a linha contra escrita concorrente entre este SELECT e o UPDATE.
  SELECT id, secret_ref INTO v_row_id, v_secret_ref
    FROM org_integrations
   WHERE org_id = p_org_id AND provider = p_provider
     FOR UPDATE;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'org_integration_write: nenhuma linha para org_id=%, provider=% — não existe "sucesso" sobre uma linha que não existe', p_org_id, p_provider
      USING ERRCODE = 'P0012';
  END IF;

  v_had_secret := v_secret_ref IS NOT NULL;

  -- AC11/seção 7 — detecção de reatribuição cross-org. Roda ANTES da escrita, lendo a própria
  -- trilha: se este page_id já foi gravado por OUTRA org, esta escrita é o sintoma exato do
  -- sequestro que o dono do produto aceitou correr. Não bloqueia — nomeia.
  IF v_page_id IS NOT NULL THEN
    SELECT pal.org_id INTO v_org_anterior
      FROM platform_audit_log pal
     WHERE pal.metadata->>'page_id' = v_page_id
       AND pal.org_id IS NOT NULL
       AND pal.org_id <> p_org_id
     ORDER BY pal.created_at DESC
     LIMIT 1;
  END IF;

  -- R6 — nonce no nome. `vault.secrets.name` é UNIQUE (medido: `secrets_name_idx`,
  -- indisunique=true). Sem nonce, um secret órfão com o nome `provider:org_id` de uma tentativa
  -- anterior tornaria TODA escrita futura daquele (org, provider) um `23505` opaco, para sempre,
  -- só destravável por intervenção manual no Vault.
  IF v_secret_ref IS NULL THEN
    v_secret_name := p_provider || ':' || v_row_id::text || ':' || gen_random_uuid()::text;
    v_secret_ref := vault.create_secret(p_secret, v_secret_name)::text;
  ELSE
    PERFORM vault.update_secret(v_secret_ref::uuid, p_secret);
  END IF;

  -- R4 — SÓ config+secret_ref. `status` fica exatamente como estava. Promover status é
  -- operação separada (`_org_integration_mark_connected`), chamada pela rota só DEPOIS da
  -- chamada de teste contra o provider ter sucesso.
  UPDATE org_integrations
     SET config = p_config, secret_ref = v_secret_ref, updated_at = now()
   WHERE id = v_row_id;

  -- Defesa em profundidade contra a linha desaparecer entre o SELECT e o UPDATE. Redundante
  -- com o `FOR UPDATE` de propósito: o `IF` acima pega a linha ausente, este pega a corrida que
  -- o `FOR UPDATE` não tivesse segurado.
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected <> 1 THEN
    RAISE EXCEPTION 'org_integration_write: UPDATE afetou % linhas (esperava 1), org_id=%, provider=%', v_rows_affected, p_org_id, p_provider
      USING ERRCODE = 'P0013';
  END IF;

  v_metadata := jsonb_build_object('provider', p_provider, 'had_existing_secret', v_had_secret);
  IF v_page_id IS NOT NULL THEN
    -- AC11, pré-requisito estrutural: sem `page_id` em `metadata`, nenhum dos dois alertas tem o
    -- que ler.
    v_metadata := v_metadata || jsonb_build_object('page_id', v_page_id);
  END IF;

  IF v_org_anterior IS NOT NULL THEN
    v_action := 'org_integration.page_id_reassigned_cross_org';
    v_metadata := v_metadata || jsonb_build_object('org_id_anterior', v_org_anterior);
  ELSE
    v_action := 'org_integration.secret_write';
  END IF;

  PERFORM platform_audit(p_actor_user_id, p_actor_type, p_org_id,
    v_action, 'org_integrations', v_row_id, v_metadata);
END; $$;

REVOKE ALL ON FUNCTION _org_integration_write_secret(uuid, text, text, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. _org_integration_mark_connected — promove status. Recusa sem secret_ref.
-- ============================================================================
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

  UPDATE org_integrations SET status = 'connected', updated_at = now() WHERE id = v_row_id;
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
-- 5. _org_integration_mark_error — só status. Nunca toca config/secret_ref.
-- ============================================================================
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

  UPDATE org_integrations SET status = 'error', updated_at = now() WHERE id = v_row_id;
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
-- 6. _org_integration_reveal_last4 — audita ANTES de devolver
-- ============================================================================
-- O segredo NUNCA volta ao navegador. Esta é a única leitura que atravessa o Vault, ela devolve
-- 4 caracteres, e a linha de auditoria é gravada antes do RETURN — não depois, para que uma
-- falha na resposta não apague o registro de que alguém pediu.
CREATE OR REPLACE FUNCTION _org_integration_reveal_last4(
  p_org_id uuid, p_provider text, p_actor_user_id uuid, p_actor_type text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_row_id uuid; v_secret_ref text; v_secret text;
BEGIN
  SELECT id, secret_ref INTO v_row_id, v_secret_ref
    FROM org_integrations WHERE org_id = p_org_id AND provider = p_provider;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'org_integration_reveal_last4: nenhuma linha para org_id=%, provider=%', p_org_id, p_provider
      USING ERRCODE = 'P0014';
  END IF;
  IF v_secret_ref IS NULL THEN
    RAISE EXCEPTION 'org_integration_reveal_last4: sem secret_ref — não há segredo para revelar'
      USING ERRCODE = 'P0015';
  END IF;

  SELECT ds.decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets ds WHERE ds.id = v_secret_ref::uuid;

  PERFORM platform_audit(p_actor_user_id, p_actor_type, p_org_id,
    'org_integration.secret_last4_revealed', 'org_integrations', v_row_id,
    jsonb_build_object('provider', p_provider));

  RETURN right(COALESCE(v_secret, ''), 4);
END; $$;

REVOKE ALL ON FUNCTION _org_integration_reveal_last4(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7. Pontos de entrada públicos — 8 funções, pares _as_platform/_as_org
-- ============================================================================
--
-- `_as_platform`: confia em `p_actor_user_id`. Só é chamada por `service_role`, já atrás de
--   `requirePlatformAdmin()`/`getPlatformAdmin()` no Next — mesmo modelo de confiança de
--   `admin-invite.ts`. `REVOKE ... FROM authenticated`: PostgREST não a expõe ao navegador.
--
-- `_as_org`: **não aceita `p_org_id` nem `p_actor_*` de jeito nenhum.** A leitura mais forte de
--   "nunca confia em parâmetro do client" não é re-checar o parâmetro: é não ter o parâmetro.
--   A org vem de `user_org_id()`, o ator de `auth.uid()`, e `actor_type` é a constante
--   `'org_admin'` — que é exatamente o que torna o `actor_type` da AC11 confiável como
--   discriminante de alerta. `GRANT EXECUTE TO authenticated`.

CREATE OR REPLACE FUNCTION _org_integration_ator_org()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_user_id uuid;
BEGIN
  SELECT u.id INTO v_user_id FROM users u WHERE u.auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'org_integration: sem sessão de usuário desta plataforma'
      USING ERRCODE = 'P0021';
  END IF;
  IF public.user_org_id() IS NULL THEN
    RAISE EXCEPTION 'org_integration: usuário sem organização'
      USING ERRCODE = 'P0021';
  END IF;
  IF NOT public.has_capability('configuracoes.integracoes_gerenciar') THEN
    RAISE EXCEPTION 'org_integration: sem a capability configuracoes.integracoes_gerenciar'
      USING ERRCODE = 'P0021';
  END IF;
  RETURN v_user_id;
END; $$;

REVOKE ALL ON FUNCTION _org_integration_ator_org() FROM PUBLIC, anon, authenticated;

-- ---- write_secret -----------------------------------------------------------
CREATE OR REPLACE FUNCTION org_integration_write_secret_as_platform(
  p_org_id uuid, p_provider text, p_secret text, p_config jsonb, p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM _org_integration_write_secret(
    p_org_id, p_provider, p_secret, p_config, p_actor_user_id, 'platform_admin');
END; $$;

CREATE OR REPLACE FUNCTION org_integration_write_secret_as_org(
  p_provider text, p_secret text, p_config jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM _org_integration_write_secret(
    public.user_org_id(), p_provider, p_secret, p_config,
    _org_integration_ator_org(), 'org_admin');
END; $$;

-- ---- mark_connected ---------------------------------------------------------
CREATE OR REPLACE FUNCTION org_integration_mark_connected_as_platform(
  p_org_id uuid, p_provider text, p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM _org_integration_mark_connected(p_org_id, p_provider, p_actor_user_id, 'platform_admin');
END; $$;

CREATE OR REPLACE FUNCTION org_integration_mark_connected_as_org(p_provider text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM _org_integration_mark_connected(
    public.user_org_id(), p_provider, _org_integration_ator_org(), 'org_admin');
END; $$;

-- ---- mark_error -------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_integration_mark_error_as_platform(
  p_org_id uuid, p_provider text, p_actor_user_id uuid, p_codigo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM _org_integration_mark_error(p_org_id, p_provider, p_actor_user_id, 'platform_admin', p_codigo);
END; $$;

CREATE OR REPLACE FUNCTION org_integration_mark_error_as_org(p_provider text, p_codigo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM _org_integration_mark_error(
    public.user_org_id(), p_provider, _org_integration_ator_org(), 'org_admin', p_codigo);
END; $$;

-- ---- reveal_last4 -----------------------------------------------------------
CREATE OR REPLACE FUNCTION org_integration_reveal_last4_as_platform(
  p_org_id uuid, p_provider text, p_actor_user_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN _org_integration_reveal_last4(p_org_id, p_provider, p_actor_user_id, 'platform_admin');
END; $$;

CREATE OR REPLACE FUNCTION org_integration_reveal_last4_as_org(p_provider text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN _org_integration_reveal_last4(
    public.user_org_id(), p_provider, _org_integration_ator_org(), 'org_admin');
END; $$;

-- ---- privilégios dos 8 pontos de entrada ------------------------------------
REVOKE ALL ON FUNCTION org_integration_write_secret_as_platform(uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_integration_mark_connected_as_platform(uuid, text, uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_integration_mark_error_as_platform(uuid, text, uuid, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_integration_reveal_last4_as_platform(uuid, text, uuid)              FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_integration_write_secret_as_platform(uuid, text, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION org_integration_mark_connected_as_platform(uuid, text, uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION org_integration_mark_error_as_platform(uuid, text, uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION org_integration_reveal_last4_as_platform(uuid, text, uuid)              TO service_role;

REVOKE ALL ON FUNCTION org_integration_write_secret_as_org(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION org_integration_mark_connected_as_org(text)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION org_integration_mark_error_as_org(text, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION org_integration_reveal_last4_as_org(text)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION org_integration_write_secret_as_org(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION org_integration_mark_connected_as_org(text)           TO authenticated;
GRANT EXECUTE ON FUNCTION org_integration_mark_error_as_org(text, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION org_integration_reveal_last4_as_org(text)             TO authenticated;

-- ============================================================================
-- ROLLBACK (NFR-8)
-- ============================================================================
-- DROP FUNCTION IF EXISTS org_integration_write_secret_as_platform(uuid, text, text, jsonb, uuid);
-- DROP FUNCTION IF EXISTS org_integration_write_secret_as_org(text, text, jsonb);
-- DROP FUNCTION IF EXISTS org_integration_mark_connected_as_platform(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS org_integration_mark_connected_as_org(text);
-- DROP FUNCTION IF EXISTS org_integration_mark_error_as_platform(uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS org_integration_mark_error_as_org(text, text);
-- DROP FUNCTION IF EXISTS org_integration_reveal_last4_as_platform(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS org_integration_reveal_last4_as_org(text);
-- DROP FUNCTION IF EXISTS _org_integration_ator_org();
-- DROP FUNCTION IF EXISTS _org_integration_reveal_last4(uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS _org_integration_mark_error(uuid, text, uuid, text, text);
-- DROP FUNCTION IF EXISTS _org_integration_mark_connected(uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS _org_integration_write_secret(uuid, text, text, jsonb, uuid, text);
-- DROP FUNCTION IF EXISTS platform_audit(uuid, text, uuid, text, text, uuid, jsonb);
-- -- Os 3 triggers caem junto com a tabela. Apagar a trilha É a operação que esta migration
-- -- existe para impedir: só faça isto num rollback de schema consciente, nunca em manutenção.
-- DROP TABLE IF EXISTS platform_audit_log;
-- DROP FUNCTION IF EXISTS platform_audit_log_immutavel();
-- -- Os segredos criados no Vault por _org_integration_write_secret NÃO são apagados por este
-- -- rollback: eles sobrevivem como órfãos se org_integrations.secret_ref for limpo à mão.

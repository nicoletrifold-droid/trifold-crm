-- 252_editar_dados_da_empresa.sql
-- Story 900-62 (Epic 900, Frente 2 "Console") — editar nome, identificador, contato responsável
-- e dados fiscais de uma empresa já cadastrada, com trava otimista e trilha de auditoria.
--
-- ============================================================================
-- POR QUE ISTO É UMA RPC, E NÃO UM `.update()` NA ROTA NEXT
-- ============================================================================
-- Duas razões medidas:
--
-- 1. **`app/api/platform/**` não pode conter `.from(<literal>)`** — é a segunda rede da 900-22b
--    (`platform-query-scan.ts`), aplicada por teste, e ela não distingue leitura de escrita nem
--    isenta `createAdminClient()`. Escrita de plataforma ali é `db.rpc(...)`, exatamente o
--    desenho das 4 RPCs `*_as_platform` da migration 248 e da 251.
-- 2. **A trava otimista, o no-op e a linha de trilha precisam da MESMA transação do `UPDATE`.**
--    Lida em duas viagens, a trava não trava: entre o `SELECT` e o `UPDATE` cabe a edição do
--    outro operador — que é exatamente o desfecho que a AC3 existe para impedir.
--
-- ============================================================================
-- A FORMA DA ESCRITA EM `settings` — `||`, NUNCA `jsonb_set`
-- ============================================================================
-- O rascunho v0.2 desta story prescrevia `jsonb_set` encadeado por chave. O @po mediu a forma e
-- ela está defeituosa em DUAS frentes, as duas silenciosas — as duas medições estão reproduzidas
-- aqui porque quem for "simplificar" este bloco depois vai reencontrá-las:
--
--   1. **`jsonb_set` é STRICT.** `jsonb_set('{"materiais_url":"x"}'::jsonb, '{contato,nome}',
--      to_jsonb(NULL::text), true)` devolve **SQL `NULL`** — a coluna `settings` INTEIRA vira
--      `NULL` e as chaves de outras features somem de uma vez. E o caminho para o `NULL` é o
--      caminho NORMAL desta story: `normalizeCpfCnpj('')` devolve `null` no TypeScript, ou seja
--      "salvar com o campo CNPJ em branco" seria o gesto que apaga `city`, `state`,
--      `materiais_url` e `relatorio_diario_destinatarios` — as quatro chaves que existem em
--      produção hoje, todas com consumidor real (`dashboard/layout.tsx:270`,
--      `broker/layout.tsx:70`, `lib/reports/recipients.ts`).
--   2. **`jsonb_set` com `create_missing = true` NÃO cria o objeto-PAI.**
--      `jsonb_set('{"materiais_url":"x"}'::jsonb, '{contato,nome}', to_jsonb(''::text), true)`
--      devolve `{"materiais_url":"x"}` — a escrita é DESCARTADA em silêncio. Como `contato` e
--      `fiscal` são chaves NOVAS (zero orgs têm qualquer uma das duas), as seis escritas cairiam
--      no vazio em 100% dos casos, com `200` na tela e a trilha afirmando a mudança.
--
-- A forma abaixo — `coalesce(settings, '{}'::jsonb) || jsonb_build_object(...)` — preserva os
-- irmãos (merge raso), CRIA os dois objetos-pai do zero, e não é strict: `jsonb_build_object`
-- transforma um `NULL` de parâmetro em JSON `null`, não anula o objeto.
--
-- O `coalesce` do lado esquerdo não é enfeite: `settings jsonb DEFAULT '{}'` em
-- `001_base_schema.sql:63` é **nullable** — sem `NOT NULL`. Numa linha com `settings IS NULL`,
-- `NULL || jsonb_build_object(...)` é `NULL`, e o defeito (1) volta por outra porta.
--
-- ============================================================================
-- A TRAVA OTIMISTA — `IS DISTINCT FROM`, e `NULL` BARRADO ANTES
-- ============================================================================
-- `now() <> NULL::timestamptz` avalia para `NULL`, e um `IF <NULL> THEN` **não entra no ramo**.
-- Escrita com `<>`, a trava com `p_expected_updated_at` nulo passaria batido e o `UPDATE`
-- aconteceria sem proteção nenhuma. Uma trava que falha ABERTA é pior que trava ausente, porque
-- a AC3 afirma para o operador que ela existe. Daí as duas coisas juntas: `P0024` para o `NULL`,
-- e `IS DISTINCT FROM` para a comparação.
--
-- O valor comparado é `organizations.updated_at`, mantido pelo trigger `set_updated_at`
-- (`001_base_schema.sql:288`) — REAPROVEITADO, não recriado. Ele dispara para QUALQUER coluna
-- alterada, inclusive `settings`.
--
-- ============================================================================
-- LGPD — POR QUE A TRILHA CARREGA SÓ O QUE MUDOU
-- ============================================================================
-- `platform_audit_log` é append-only por construção (migration 248): o trigger
-- `platform_audit_log_immutavel()` compara `metadata` com `IS NOT DISTINCT FROM`, então a coluna
-- é IMUTÁVEL — um pedido de eliminação/retificação (LGPD Art. 18, III/VI) sobre nome/e-mail/
-- telefone gravados ali **não tem como ser atendido** pelo mecanismo que existe hoje.
--
-- O contato NÃO é mascarado (diferente do `access_token` da 900-51): o uso legítimo do dado é
-- justamente lê-lo depois. Mas `antes`/`depois` carregam SOMENTE as chaves de
-- `campos_alterados` — corrigir uma letra do `name` não pode gravar uma cópia permanente e
-- ineliminável do bloco inteiro de contato. Não é mascarar; é não multiplicar o irreversível.
--
-- ============================================================================
-- CÓDIGOS DE ERRO — o contrato que a rota traduz
-- ============================================================================
--   P0024  `p_expected_updated_at` nulo — a trava otimista não existe sem ele
--
-- Os outros dois desfechos anormais NÃO são exceção, e isso é deliberado: `conflito` e
-- `slug_em_uso` voltam como COLUNAS do resultado, com os valores atuais junto. Uma exceção
-- perderia o estado que a UI precisa mostrar ("isto foi alterado por outra pessoa").
-- ============================================================================

-- ============================================================================
-- 1. _org_details_update — o núcleo privado. Trava, decide, escreve. Não audita.
-- ============================================================================
-- `SECURITY DEFINER` pela mesma razão das RPCs da 248/251: quem autoriza é a rota
-- (`getPlatformAdmin()`), e a função é inalcançável por `anon`/`authenticated` (REVOKE no fim).
--
-- Três desvios ANTES do `UPDATE`, nesta ordem, e a ordem importa:
--   (a) linha não existe        → ZERO linhas de retorno (a rota decide `404`)
--   (b) `updated_at` divergiu   → 1 linha, `conflito = true`, valores ATUAIS, sem `UPDATE`
--   (c) nada mudou (AC4)        → 1 linha, tudo `false`, sem `UPDATE` e sem trilha
--
-- `#variable_conflict use_column` está aqui porque os parâmetros de saída de um `RETURNS TABLE`
-- viram variáveis com os nomes `id`/`name`/`slug`/`settings`/`updated_at` — exatamente os nomes
-- das colunas que este corpo manipula. Sem a diretiva, um identificador nu numa cláusula futura
-- vira `ERROR: column reference is ambiguous` em tempo de execução, não de criação.
CREATE OR REPLACE FUNCTION _org_details_update(
  p_org_id              uuid,
  p_name                text,
  p_slug                text,
  p_contato_nome        text,
  p_contato_email       text,
  p_contato_telefone    text,
  p_fiscal_cnpj         text,
  p_fiscal_razao_social text,
  p_fiscal_endereco     text,
  p_expected_updated_at timestamptz
) RETURNS TABLE (
  id          uuid,
  name        varchar,
  slug        varchar,
  settings    jsonb,
  updated_at  timestamptz,
  conflito    boolean,
  slug_em_uso boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_atual organizations%ROWTYPE;
  v_novo  organizations%ROWTYPE;
  v_name  text := btrim(COALESCE(p_name, ''));
  v_slug  text := btrim(COALESCE(p_slug, ''));
BEGIN
  -- A recusa do `NULL` vem ANTES de qualquer leitura: sem ela, `IS DISTINCT FROM` devolveria
  -- `true` para toda linha e a resposta seria `conflito` — plausível, e errado. O erro certo é
  -- "o cliente não mandou a trava", que é defeito de chamada, não corrida de operadores.
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'expectedUpdatedAt é obrigatório — sem ele não existe trava otimista'
      USING ERRCODE = 'P0024';
  END IF;

  -- `FOR UPDATE` trava a linha até o COMMIT. É o que faz a trava otimista ser de fato uma trava:
  -- entre a comparação de `updated_at` e o `UPDATE` não cabe mais nada.
  SELECT * INTO v_atual FROM organizations o WHERE o.id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN; -- zero linhas — a rota responde 404, e não confunde isso com conflito
  END IF;

  IF v_atual.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT v_atual.id, v_atual.name, v_atual.slug, v_atual.settings,
                        v_atual.updated_at, true, false;
    RETURN;
  END IF;

  -- AC4 — "Salvar" sem mudança nenhuma não escreve e não deixa rastro.
  --
  -- Os `coalesce(..., '')` dos dois lados não são cosméticos: `settings->'contato'->>'nome'`
  -- devolve SQL `NULL` quando a chave não existe, e `NULL = ''` é `NULL`, não `false`. Sem eles,
  -- no dia 1 (quando NENHUMA org tem as chaves) o no-op nunca seria detectado e todo "Salvar"
  -- gravaria uma linha de trilha — o ruído que esta AC existe para evitar.
  IF v_atual.name = v_name
     AND v_atual.slug = v_slug
     AND COALESCE(v_atual.settings->'contato'->>'nome', '')        IS NOT DISTINCT FROM COALESCE(p_contato_nome, '')
     AND COALESCE(v_atual.settings->'contato'->>'email', '')       IS NOT DISTINCT FROM COALESCE(p_contato_email, '')
     AND COALESCE(v_atual.settings->'contato'->>'telefone', '')    IS NOT DISTINCT FROM COALESCE(p_contato_telefone, '')
     AND COALESCE(v_atual.settings->'fiscal'->>'cnpj', '')         IS NOT DISTINCT FROM COALESCE(p_fiscal_cnpj, '')
     AND COALESCE(v_atual.settings->'fiscal'->>'razao_social', '') IS NOT DISTINCT FROM COALESCE(p_fiscal_razao_social, '')
     AND COALESCE(v_atual.settings->'fiscal'->>'endereco', '')     IS NOT DISTINCT FROM COALESCE(p_fiscal_endereco, '')
  THEN
    RETURN QUERY SELECT v_atual.id, v_atual.name, v_atual.slug, v_atual.settings,
                        v_atual.updated_at, false, false;
    RETURN;
  END IF;

  BEGIN
    UPDATE organizations o
       SET name = v_name,
           slug = v_slug,
           -- Ver o bloco "A FORMA DA ESCRITA" no topo. Não trocar por `jsonb_set`.
           settings = COALESCE(o.settings, '{}'::jsonb) || jsonb_build_object(
             'contato', jsonb_build_object(
               'nome',     p_contato_nome,
               'email',    p_contato_email,
               'telefone', p_contato_telefone
             ),
             'fiscal', jsonb_build_object(
               'cnpj',         p_fiscal_cnpj,
               'razao_social', p_fiscal_razao_social,
               'endereco',     p_fiscal_endereco
             )
           )
     WHERE o.id = p_org_id
    RETURNING o.* INTO v_novo;
  EXCEPTION WHEN unique_violation THEN
    -- A `UNIQUE` de `organizations.slug` (migration 001). Capturada AQUI para a rota poder dizer
    -- "esse identificador já está em uso" em vez de vazar um `23505` cru para a tela.
    RETURN QUERY SELECT v_atual.id, v_atual.name, v_atual.slug, v_atual.settings,
                        v_atual.updated_at, false, true;
    RETURN;
  END;

  -- `v_novo` vem do `RETURNING` — inclusive o `updated_at` já bombado pelo trigger. É o estado
  -- que de fato ficou gravado, e é ele que a trilha registra como `depois`.
  RETURN QUERY SELECT v_novo.id, v_novo.name, v_novo.slug, v_novo.settings,
                      v_novo.updated_at, false, false;
END; $$;

REVOKE ALL ON FUNCTION _org_details_update(uuid, text, text, text, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. org_details_update_as_platform — o wrapper que audita
-- ============================================================================
-- Mesmo trâmite de `org_integration_write_secret_as_platform` (migration 248): o núcleo privado
-- decide e escreve; o wrapper é quem sabe QUEM agiu e registra na trilha.
--
-- `p_actor_type` é `'platform_admin'` sempre, e não um parâmetro: esta função só é alcançável
-- por quem passou pelo `getPlatformAdmin()` da rota (`GRANT EXECUTE … TO service_role`, e a
-- `service_role` só está no servidor). Um parâmetro aqui seria uma alegação do chamador.
CREATE OR REPLACE FUNCTION org_details_update_as_platform(
  p_org_id              uuid,
  p_actor_user_id       uuid,
  p_name                text,
  p_slug                text,
  p_contato_nome        text,
  p_contato_email       text,
  p_contato_telefone    text,
  p_fiscal_cnpj         text,
  p_fiscal_razao_social text,
  p_fiscal_endereco     text,
  p_expected_updated_at timestamptz,
  p_reason              text DEFAULT NULL
) RETURNS TABLE (
  id          uuid,
  name        varchar,
  slug        varchar,
  settings    jsonb,
  updated_at  timestamptz,
  conflito    boolean,
  slug_em_uso boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_antes_linha organizations%ROWTYPE;
  v_res         record;
  v_campos      text[] := ARRAY[]::text[];
  v_antes       jsonb  := '{}'::jsonb;
  v_depois      jsonb  := '{}'::jsonb;
  v_campo       text;
  v_val_antes   text;
  v_val_depois  text;
BEGIN
  -- O estado ANTES é lido COM `FOR UPDATE`, e não por um `SELECT` solto. Sem o lock aqui, outra
  -- transação poderia commitar entre esta leitura e o `FOR UPDATE` de dentro do núcleo — e a
  -- trilha registraria um `antes` que nunca foi o estado de partida do `UPDATE`. O núcleo
  -- retrava a MESMA linha na MESMA transação, o que é um no-op.
  SELECT * INTO v_antes_linha FROM organizations o WHERE o.id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN; -- zero linhas — a rota responde 404
  END IF;

  SELECT * INTO v_res FROM _org_details_update(
    p_org_id, p_name, p_slug,
    p_contato_nome, p_contato_email, p_contato_telefone,
    p_fiscal_cnpj, p_fiscal_razao_social, p_fiscal_endereco,
    p_expected_updated_at
  );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Conflito e slug em uso NÃO são atos: nada foi escrito, então nada vai para a trilha. Uma
  -- linha de auditoria para uma escrita que não aconteceu é pior que nenhuma.
  IF v_res.conflito OR v_res.slug_em_uso THEN
    RETURN QUERY SELECT v_res.id, v_res.name, v_res.slug, v_res.settings,
                        v_res.updated_at, v_res.conflito, v_res.slug_em_uso;
    RETURN;
  END IF;

  -- Os OITO campos, comparados um a um. `antes`/`depois` são montados INCREMENTALMENTE, só com
  -- o que de fato mudou — é a minimização de LGPD, ver o bloco no topo. O lado `depois` sai do
  -- resultado do `UPDATE` (`v_res`), nunca dos parâmetros de entrada: se a escrita não pegar, a
  -- trilha tem que mostrar que não pegou.
  FOR v_campo, v_val_antes, v_val_depois IN
    SELECT * FROM (VALUES
      ('name', v_antes_linha.name::text, v_res.name::text),
      ('slug', v_antes_linha.slug::text, v_res.slug::text),
      ('contato_nome',
        COALESCE(v_antes_linha.settings->'contato'->>'nome', ''),
        COALESCE(v_res.settings->'contato'->>'nome', '')),
      ('contato_email',
        COALESCE(v_antes_linha.settings->'contato'->>'email', ''),
        COALESCE(v_res.settings->'contato'->>'email', '')),
      ('contato_telefone',
        COALESCE(v_antes_linha.settings->'contato'->>'telefone', ''),
        COALESCE(v_res.settings->'contato'->>'telefone', '')),
      ('fiscal_cnpj',
        COALESCE(v_antes_linha.settings->'fiscal'->>'cnpj', ''),
        COALESCE(v_res.settings->'fiscal'->>'cnpj', '')),
      ('fiscal_razao_social',
        COALESCE(v_antes_linha.settings->'fiscal'->>'razao_social', ''),
        COALESCE(v_res.settings->'fiscal'->>'razao_social', '')),
      ('fiscal_endereco',
        COALESCE(v_antes_linha.settings->'fiscal'->>'endereco', ''),
        COALESCE(v_res.settings->'fiscal'->>'endereco', ''))
    ) t(campo, val_antes, val_depois)
  LOOP
    IF v_val_antes IS DISTINCT FROM v_val_depois THEN
      v_campos := v_campos || v_campo;
      v_antes  := v_antes  || jsonb_build_object(v_campo, v_val_antes);
      v_depois := v_depois || jsonb_build_object(v_campo, v_val_depois);
    END IF;
  END LOOP;

  -- AC4/AC5 — sem campo alterado, sem linha de trilha. Cobre também o caso em que o núcleo já
  -- decidiu no-op (mesmo desfecho por dois caminhos independentes, de propósito).
  IF array_length(v_campos, 1) IS NOT NULL THEN
    PERFORM platform_audit(
      p_actor_user_id, 'platform_admin', p_org_id, 'organization.updated',
      'organizations', p_org_id,
      jsonb_build_object(
        'campos_alterados', to_jsonb(v_campos),
        'antes',  v_antes,
        'depois', v_depois,
        'reason', p_reason
      )
    );
  END IF;

  RETURN QUERY SELECT v_res.id, v_res.name, v_res.slug, v_res.settings,
                      v_res.updated_at, v_res.conflito, v_res.slug_em_uso;
END; $$;

REVOKE ALL ON FUNCTION org_details_update_as_platform(uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_details_update_as_platform(uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text)
  TO service_role;

COMMENT ON FUNCTION org_details_update_as_platform(uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text) IS
  'Story 900-62 — único ponto de escrita de nome/slug/contato/fiscal de uma empresa pelo console de plataforma. Trava otimista por updated_at (P0024 se a trava vier nula), merge raso em settings (|| e nunca jsonb_set), e trilha em platform_audit_log com SOMENTE as chaves de campos_alterados.';

-- ============================================================================
-- ROLLBACK (NFR-8)
-- ============================================================================
-- DROP FUNCTION IF EXISTS org_details_update_as_platform(uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text);
-- DROP FUNCTION IF EXISTS _org_details_update(uuid, text, text, text, text, text, text, text, text, timestamptz);
-- -- A trilha JÁ ESCRITA permanece: `platform_audit_log` é append-only por atributo de
-- -- nascimento (migration 248), e apagá-la é a operação que aquela migration existe para impedir.
-- -- As chaves `settings.contato` / `settings.fiscal` já gravadas TAMBÉM permanecem: derrubar as
-- -- funções tira a porta de escrita, não o dado. Removê-las exigiria um UPDATE próprio, com
-- -- decisão própria.

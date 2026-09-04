-- 254_logo_da_empresa.sql
-- Story 900-63 (Epic 900, Frente 2 "Console") — METADE 1 de 2: GUARDAR o arquivo do logo de uma
-- empresa. A EXIBIÇÃO (login, cabeçalho, e-mails) é a `900-64` e NÃO está aqui.
--
-- ============================================================================
-- O QUE ESTA MIGRATION **NÃO** FAZ, E POR QUE ISSO ESTÁ ESCRITO NO SQL
-- ============================================================================
-- `organizations.logo_url` existe desde `001_base_schema.sql:62` e tem **zero consumidores** no
-- código da aplicação. Depois desta migration ela passa a ter um ESCRITOR (as duas funções
-- abaixo) e continua sem nenhum LEITOR que troque a marca mostrada ao cliente. Quem for ligar os
-- pontos é a `900-64`. Está escrito aqui porque um `COMMENT ON FUNCTION` é o único lugar que
-- acompanha a função quando alguém a encontra pelo `pg_proc` seis meses depois.
--
-- ============================================================================
-- 1. O BUCKET `org-logos` — POR QUE UM NOVO, E POR QUE O HÍFEN É LOAD-BEARING
-- ============================================================================
-- Novo, e não `marketing-brands`/`marketing-artes`/`campaign-assets`: os três já têm dono e
-- propósito próprios (kit de marcas, artes da Lídia, imagens de campanha). Nenhum é "o logo
-- institucional da empresa no console".
--
-- ⚠️ O NOME COM HÍFEN NÃO É ESTÉTICA. `packages/web/src/lib/tenancy/platform-query-scan.ts`
-- captura o nome de tabela com `[a-zA-Z_]\w*`, e `\w` **não inclui hífen**: por isso
-- `storage.from("org-logos")` dentro de `app/api/platform/**` NÃO acende a segunda rede da
-- `900-22b`. Renomear o bucket para `orglogos`/`org_logos` deixa a varredura de
-- `platform-query-scan.test.ts` acusando o arquivo da rota. O conserto, se isso acontecer, NÃO é
-- afrouxar o detector (a AC8 da `900-42a` proíbe, e a exclusão do receiver `storage` cegaria a
-- régua para `const storage = createAdminClient(); storage.from("organizations")`) — é renomear
-- o bucket de volta. Há teste de caracterização fixando isso.
--
-- Público para LEITURA, escrita só por `service_role` — mesmo padrão medido em
-- `204_marketing_artes_bucket.sql`. Nenhuma policy de INSERT/UPDATE/DELETE para
-- `anon`/`authenticated`: `service_role` bypassa RLS por desenho, e a única superfície que a usa
-- é a rota desta story, autorizada por `getPlatformAdmin()`.
--
-- Sem SVG, de propósito: SVG carrega script embutido e nenhum bucket deste projeto o aceita hoje.
-- 2 MB é cap de ENGENHARIA declarado como tal (ordens de grandeza abaixo dos 25 MB de
-- `lancamentos` e dos 10 MB de `marketing-artes`, que guardam documento e arte final, não ícone
-- de marca) — revisável se um cliente real precisar de mais.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos', 'org-logos', true,
  2097152,  -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O predicado é `bucket_id` e SÓ `bucket_id`. Nenhuma referência a `name` — a `249` documenta o
-- que aconteceu com as oito policies de obra que citaram `name` dentro de uma subquery numa
-- tabela que TEM uma coluna `name`: o identificador resolveu para o escopo mais interno, sem erro
-- nem warning, e as policies passaram meses negando tudo a todos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'org_logos_public_read'
  ) THEN
    CREATE POLICY org_logos_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'org-logos');
  END IF;
END $$;

-- ============================================================================
-- 2. _org_logo_update — o núcleo privado. Trava, decide, escreve. Não audita.
-- ============================================================================
-- Mesmo desenho das RPCs irmãs (`248`, `251`, `252`), e pelas mesmas duas razões medidas:
--   1. `app/api/platform/**` não pode conter `.from(<literal>)` — `platform-query-scan.ts`,
--      aplicado por teste, que não distingue leitura de escrita nem isenta `createAdminClient()`.
--   2. A trava otimista, o no-op e a linha de trilha precisam da MESMA transação do `UPDATE`.
--      Lida em duas viagens, a trava não trava.
--
-- ============================================================================
-- AS DUAS COMPARAÇÕES QUE, COM `=`/`<>`, FICAM DESLIGADAS EM SILÊNCIO
-- ============================================================================
-- **(a) A trava otimista.** `now() <> NULL::timestamptz` avalia para `NULL`, e um `IF <NULL>
-- THEN` **não entra no ramo**: escrita com `<>`, a trava com `p_expected_updated_at` nulo passa
-- batido e o `UPDATE` acontece sem proteção nenhuma. Trava que falha ABERTA é pior que trava
-- ausente, porque a UI afirma ao operador que ela existe. Daí as duas coisas juntas: `P0024` para
-- o `NULL`, e `IS DISTINCT FROM` para a comparação.
--
-- **(b) O no-op.** Aqui isto pesa MUITO mais que na `900-62`, e a razão é o dado: `logo_url` é
-- nulo na esmagadora maioria das empresas. Com `=`, remover o logo de uma empresa que já não tem
-- logo compara `NULL = NULL` → `NULL` → o no-op **não** é detectado → o `UPDATE` roda, o trigger
-- bomba `updated_at` e `platform_audit_log` ganha uma linha `organization.logo_removed` para uma
-- remoção que não removeu nada. `platform_audit_log` é append-only por atributo de nascimento
-- (`248`): essa linha é IRREVERSÍVEL. A comparação é `IS NOT DISTINCT FROM`.
--
-- ============================================================================
-- CÓDIGOS DE ERRO — o contrato que a rota traduz
-- ============================================================================
--   P0024  `p_expected_updated_at` nulo — a trava otimista não existe sem ele
--
-- `conflito` NÃO é exceção, e é deliberado: volta como COLUNA, com os valores atuais junto. Uma
-- exceção perderia o estado que a UI precisa mostrar ("isto foi alterado por outra pessoa").
--
-- `#variable_conflict use_column` está aqui porque os parâmetros de saída de um `RETURNS TABLE`
-- viram variáveis com os nomes `id`/`logo_url`/`updated_at` — exatamente os nomes das colunas que
-- este corpo manipula. Sem a diretiva, um identificador nu vira `column reference is ambiguous`
-- em tempo de EXECUÇÃO, não de criação.
CREATE OR REPLACE FUNCTION _org_logo_update(
  p_org_id              uuid,
  p_logo_url            text,
  p_expected_updated_at timestamptz
) RETURNS TABLE (
  id         uuid,
  logo_url   text,
  updated_at timestamptz,
  conflito   boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_atual organizations%ROWTYPE;
  v_novo  organizations%ROWTYPE;
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
    RETURN QUERY SELECT v_atual.id, v_atual.logo_url, v_atual.updated_at, true;
    RETURN;
  END IF;

  -- No-op. Ver o bloco (b) acima: `IS NOT DISTINCT FROM`, nunca `=`.
  IF v_atual.logo_url IS NOT DISTINCT FROM p_logo_url THEN
    RETURN QUERY SELECT v_atual.id, v_atual.logo_url, v_atual.updated_at, false;
    RETURN;
  END IF;

  UPDATE organizations o
     SET logo_url = p_logo_url
   WHERE o.id = p_org_id
  RETURNING o.* INTO v_novo;

  -- `v_novo` vem do `RETURNING` — inclusive o `updated_at` já bombado pelo trigger
  -- `set_updated_at` (`001_base_schema.sql:288`), REAPROVEITADO e não recriado. É o estado que de
  -- fato ficou gravado, e é ele que a trilha registra como `depois`.
  RETURN QUERY SELECT v_novo.id, v_novo.logo_url, v_novo.updated_at, false;
END; $$;

REVOKE ALL ON FUNCTION _org_logo_update(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. org_logo_update_as_platform — o wrapper que audita
-- ============================================================================
-- Mesmo trâmite de `org_details_update_as_platform` (`252`): o núcleo decide e escreve; o wrapper
-- é quem sabe QUEM agiu e registra na trilha.
--
-- **Duas ações distintas, não uma.** `organization.logo_updated` quando ficou um logo gravado;
-- `organization.logo_removed` quando ficou `NULL`. "Trocou o logo" e "removeu o logo" são eventos
-- semanticamente diferentes para quem lê a trilha depois, e colapsá-los num `organization.updated`
-- genérico obrigaria a abrir o `metadata` de toda linha para saber qual dos dois aconteceu.
--
-- **Qual valor decide a ação: o GRAVADO, nunca o pedido.** `v_res.logo_url` sai do `RETURNING` do
-- `UPDATE`; `p_logo_url` é a alegação do chamador. Se a escrita não pegar, a trilha tem que
-- mostrar que não pegou — mesma disciplina do `depois` da `252`.
--
-- `p_actor_type` é `'platform_admin'` sempre, e não um parâmetro: esta função só é alcançável por
-- quem passou pelo `getPlatformAdmin()` da rota (`GRANT EXECUTE … TO service_role`, e a
-- `service_role` só existe no servidor). Um parâmetro aqui seria alegação do chamador.
CREATE OR REPLACE FUNCTION org_logo_update_as_platform(
  p_org_id              uuid,
  p_actor_user_id       uuid,
  p_logo_url            text,
  p_expected_updated_at timestamptz,
  p_reason              text DEFAULT NULL
) RETURNS TABLE (
  id         uuid,
  logo_url   text,
  updated_at timestamptz,
  conflito   boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_antes_linha organizations%ROWTYPE;
  v_res         record;
BEGIN
  -- O estado ANTES é lido COM `FOR UPDATE`, e não por um `SELECT` solto. Sem o lock aqui, outra
  -- transação poderia commitar entre esta leitura e o `FOR UPDATE` de dentro do núcleo — e a
  -- trilha registraria um `antes` que nunca foi o estado de partida do `UPDATE`. O núcleo retrava
  -- a MESMA linha na MESMA transação, o que é um no-op.
  SELECT * INTO v_antes_linha FROM organizations o WHERE o.id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN; -- zero linhas — a rota responde 404
  END IF;

  SELECT * INTO v_res FROM _org_logo_update(p_org_id, p_logo_url, p_expected_updated_at);
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Conflito NÃO é ato: nada foi escrito, então nada vai para a trilha. Uma linha de auditoria
  -- para uma escrita que não aconteceu é pior que nenhuma.
  IF v_res.conflito THEN
    RETURN QUERY SELECT v_res.id, v_res.logo_url, v_res.updated_at, v_res.conflito;
    RETURN;
  END IF;

  -- A trilha só existe se o valor MUDOU. `IS DISTINCT FROM` e nunca `<>`: os dois lados são
  -- nulos no caso "remover o logo de uma empresa que não tem logo", e `<>` devolveria `NULL` ali
  -- — o `IF` não entraria no ramo por acidente hoje, mas inverter o teste amanhã (`IF NOT ... `)
  -- transformaria o mesmo `NULL` numa linha permanente. Este é o segundo detector do mesmo no-op,
  -- independente do que o núcleo já decidiu, de propósito.
  IF v_antes_linha.logo_url IS DISTINCT FROM v_res.logo_url THEN
    PERFORM platform_audit(
      p_actor_user_id, 'platform_admin', p_org_id,
      CASE WHEN v_res.logo_url IS NULL
           THEN 'organization.logo_removed'
           ELSE 'organization.logo_updated' END,
      'organizations', p_org_id,
      jsonb_build_object(
        'antes',  v_antes_linha.logo_url,
        'depois', v_res.logo_url,
        'reason', p_reason
      )
    );
  END IF;

  RETURN QUERY SELECT v_res.id, v_res.logo_url, v_res.updated_at, v_res.conflito;
END; $$;

REVOKE ALL ON FUNCTION org_logo_update_as_platform(uuid, uuid, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_logo_update_as_platform(uuid, uuid, text, timestamptz, text)
  TO service_role;

COMMENT ON FUNCTION org_logo_update_as_platform(uuid, uuid, text, timestamptz, text) IS
  'Story 900-63 (METADE 1 de 2 — guardar o arquivo; a exibição é a 900-64) — único ponto de escrita de organizations.logo_url pelo console de plataforma. p_logo_url NULL é a remoção. Trava otimista por updated_at (P0024 se a trava vier nula), no-op por IS NOT DISTINCT FROM (sem isso, remover o logo de uma empresa sem logo gravaria uma linha de trilha IRREVERSÍVEL para uma remoção que não removeu nada), e duas ações distintas na trilha: organization.logo_updated e organization.logo_removed. ATENÇÃO: nenhuma tela do CRM do cliente lê logo_url — esta função guarda, não exibe.';

-- ============================================================================
-- ROLLBACK (NFR-8)
-- ============================================================================
-- DROP FUNCTION IF EXISTS org_logo_update_as_platform(uuid, uuid, text, timestamptz, text);
-- DROP FUNCTION IF EXISTS _org_logo_update(uuid, text, timestamptz);
-- DROP POLICY IF EXISTS org_logos_public_read ON storage.objects;
-- -- O BUCKET e os OBJETOS já enviados NÃO são derrubados aqui de propósito: `DELETE FROM
-- -- storage.buckets` com objeto dentro falha por FK, e apagar os objetos junto seria uma perda de
-- -- dado embutida num rollback de função. Derrubar as funções tira a porta de escrita, não o
-- -- arquivo. `organizations.logo_url` já gravado TAMBÉM permanece — limpá-lo exigiria um UPDATE
-- -- próprio, com decisão própria.
-- -- A trilha JÁ ESCRITA permanece sempre: `platform_audit_log` é append-only por construção
-- -- (`248`), e apagá-la é a operação que aquela migration existe para impedir.

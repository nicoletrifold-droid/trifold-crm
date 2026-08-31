-- 249_storage_policies_name_qualificado.sql
-- Corrige as 8 policies de `storage.objects` dos buckets de obra, que negavam TUDO A TODOS.
--
-- O DEFEITO: `name` NÃO QUALIFICADO DENTRO DE UMA SUBQUERY EM `obras`
-- ------------------------------------------------------------------
-- A 238 (Story 900-11) escreveu, oito vezes, este predicado:
--
--     EXISTS (SELECT 1 FROM public.obras b
--             WHERE b.id::text = (storage.foldername(name))[2]   -- ← `name` sem qualificação
--               AND b.org_id = public.user_org_id())
--
-- A intenção era `storage.objects.name` — o PATH do arquivo. Mas `public.obras` **tem uma coluna
-- `name`** (o nome da obra), e o Postgres resolve identificador não qualificado para o escopo
-- MAIS INTERNO primeiro. O `name` virou `obras.name`, silenciosamente, sem erro nem warning.
-- Foi assim que ficou gravado em produção — medido em `pg_policies` em 2026-08-31:
--
--     storage.foldername((b.name)::text)
--
-- E aí o predicado é matematicamente incapaz de ser verdadeiro:
--
--     storage.foldername('Yarden')  →  string_to_array('Yarden','/') = {Yarden}
--                                   →  devolve _parts[1:0] = {}        (array VAZIO)
--                                   →  [2] = NULL
--                                   →  b.id::text = NULL  →  NULL  →  EXISTS falso
--
-- Nome de obra não contém `/`. Logo `[2]` é SEMPRE NULL, para toda obra, para todo objeto:
-- **a policy nunca autoriza ninguém — nem admin.** A 239 herdou o mesmo erro ao recriar
-- `org_read_obra_fotos`, e apenas somou a distinção staff × cliente sobre um predicado morto.
--
-- POR QUE SÓ APARECEU AGORA (2026-08-31, chamado da Samara)
-- --------------------------------------------------------
-- Em bucket público a policy de SELECT é irrelevante: a URL basta. Enquanto as fotos eram
-- servidas por URL pública, o predicado quebrado não tinha consequência visível. A Story 900-12a
-- passou a galeria a depender de URL ASSINADA — e assinar exige SELECT em `storage.objects`.
-- No mesmo instante, tudo que depende de assinatura parou:
--
--   • Portal do Cliente → Fotos: 404 em toda foto (rota /api/obras/fotos)
--   • Dashboard → obra → aba Fotos: idem
--   • Aprovações de upload: `signed_url: null` nas 84 da obra Yarden (medido)
--   • Documentos e anexos de chat da obra: mesma expressão, mesmo destino
--
-- Medições que fecham o diagnóstico (produção, 2026-08-31):
--   • o objeto EXISTE e o bucket ainda é público → GET /object/public/… devolve 200, 384 KB JPEG
--   • assinar com service_role (ignora RLS)      → 200
--   • assinar com sessão de usuário admin        → nega  ⇒ a causa é RLS, não o arquivo
--
-- A CORREÇÃO, E POR QUE ESTA E NÃO OUTRA
-- --------------------------------------
-- Qualificar: `storage.objects.name`. É a mudança mínima que existe — nenhum predicado muda de
-- significado, nenhuma regra de permissão é reescrita, nenhum dado é tocado. As policies passam
-- a dizer o que a 238 sempre quis dizer.
--
-- Não renomeamos o alias `b` para "evitar a colisão": trocar o alias esconderia a armadilha em
-- vez de desarmá-la. Qualquer tabela futura com coluna `name` reintroduz o bug se o identificador
-- continuar solto. Qualificação explícita é imune a isso.
--
-- As policies dos buckets `chamados-attachments`, `marketing-artes` e `marketing-brands` NÃO
-- entram aqui: elas usam `(storage.foldername(name))[1]` **sem subquery**, então nunca houve outro
-- escopo para o `name` cair. Estão corretas e permanecem intocadas.
--
-- CONFERÊNCIA APÓS APLICAR (o predicado gravado deve conter `objects.name`, nunca `b.name`):
--   SELECT policyname, coalesce(qual, with_check) FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects'
--      AND coalesce(qual, with_check) LIKE '%foldername%';

-- =============================================================================
-- obra-docs
-- =============================================================================

DROP POLICY IF EXISTS org_read_obra_docs ON storage.objects;
CREATE POLICY org_read_obra_docs ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-docs'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS admin_upload_obra_docs ON storage.objects;
CREATE POLICY admin_upload_obra_docs ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'obra-docs'
    AND public.has_capability('obras.documentos_gerenciar')
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS admin_delete_obra_docs ON storage.objects;
CREATE POLICY admin_delete_obra_docs ON storage.objects FOR DELETE
  USING (
    bucket_id = 'obra-docs'
    AND public.has_capability('obras.documentos_gerenciar')
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

-- =============================================================================
-- obra-fotos — preserva a distinção staff × cliente introduzida pela 239
-- =============================================================================

DROP POLICY IF EXISTS org_read_obra_fotos ON storage.objects;
CREATE POLICY org_read_obra_fotos ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-fotos'
    AND EXISTS (
      SELECT 1
      FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
        AND (
          -- staff: qualquer obra da própria organização
          public.user_role() <> 'cliente'
          -- cliente: apenas as obras vinculadas a ele, mesma fonte de `obras_select_cliente`
          OR b.id IN (SELECT public.cliente_obra_ids())
        )
    )
  );

DROP POLICY IF EXISTS admin_upload_obra_fotos ON storage.objects;
CREATE POLICY admin_upload_obra_fotos ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'obra-fotos'
    AND public.has_capability('obras.fotos_enviar')
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS admin_delete_obra_fotos ON storage.objects;
CREATE POLICY admin_delete_obra_fotos ON storage.objects FOR DELETE
  USING (
    bucket_id = 'obra-fotos'
    AND public.has_capability('obras.fotos_enviar')
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

-- =============================================================================
-- obra-mensagens
-- =============================================================================

DROP POLICY IF EXISTS org_read_obra_mensagens ON storage.objects;
CREATE POLICY org_read_obra_mensagens ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-mensagens'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS org_upload_obra_mensagens ON storage.objects;
CREATE POLICY org_upload_obra_mensagens ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'obra-mensagens'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

-- =============================================================================
-- ROLLBACK — volta ao predicado quebrado da 238/239.
--
-- ⚠️ Rodar este bloco RESTAURA O DEFEITO: nenhuma URL assinada de obra-docs, obra-fotos ou
-- obra-mensagens volta a ser autorizada, para nenhum usuário. Só faz sentido se a correção
-- provocar algum efeito não previsto e a prioridade for voltar ao estado conhecido.
-- =============================================================================
-- DROP POLICY IF EXISTS org_read_obra_docs ON storage.objects;
-- CREATE POLICY org_read_obra_docs ON storage.objects FOR SELECT
--   USING (bucket_id = 'obra-docs' AND EXISTS (
--     SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));
-- DROP POLICY IF EXISTS admin_upload_obra_docs ON storage.objects;
-- CREATE POLICY admin_upload_obra_docs ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'obra-docs' AND public.has_capability('obras.documentos_gerenciar')
--     AND EXISTS (SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));
-- DROP POLICY IF EXISTS admin_delete_obra_docs ON storage.objects;
-- CREATE POLICY admin_delete_obra_docs ON storage.objects FOR DELETE
--   USING (bucket_id = 'obra-docs' AND public.has_capability('obras.documentos_gerenciar')
--     AND EXISTS (SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));
-- DROP POLICY IF EXISTS org_read_obra_fotos ON storage.objects;
-- CREATE POLICY org_read_obra_fotos ON storage.objects FOR SELECT
--   USING (bucket_id = 'obra-fotos' AND EXISTS (
--     SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()
--       AND (public.user_role() <> 'cliente' OR b.id IN (SELECT public.cliente_obra_ids()))));
-- DROP POLICY IF EXISTS admin_upload_obra_fotos ON storage.objects;
-- CREATE POLICY admin_upload_obra_fotos ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'obra-fotos' AND public.has_capability('obras.fotos_enviar')
--     AND EXISTS (SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));
-- DROP POLICY IF EXISTS admin_delete_obra_fotos ON storage.objects;
-- CREATE POLICY admin_delete_obra_fotos ON storage.objects FOR DELETE
--   USING (bucket_id = 'obra-fotos' AND public.has_capability('obras.fotos_enviar')
--     AND EXISTS (SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));
-- DROP POLICY IF EXISTS org_read_obra_mensagens ON storage.objects;
-- CREATE POLICY org_read_obra_mensagens ON storage.objects FOR SELECT
--   USING (bucket_id = 'obra-mensagens' AND EXISTS (
--     SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));
-- DROP POLICY IF EXISTS org_upload_obra_mensagens ON storage.objects;
-- CREATE POLICY org_upload_obra_mensagens ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'obra-mensagens' AND EXISTS (
--     SELECT 1 FROM public.obras b
--     WHERE b.id::text = (storage.foldername(name))[2] AND b.org_id = public.user_org_id()));

-- 238_storage_policies_org_scoped.sql
-- Story 900-11 (Epic 900, Onda 1) — ancora as policies de Storage na organização.
--
-- O FURO QUE ISTO FECHA
-- ---------------------
-- As 21 policies de `storage` ancoravam apenas em `bucket_id`. Nenhuma mencionava organização:
--   select count(*) from pg_policies where schemaname='storage' and qual like '%org%';  -> 0
--
-- Efeitos que já existem HOJE, com uma só organização, e que viram vazamento no instante em que
-- a segunda for provisionada:
--   • authenticated_read_obra_docs      — qualquer autenticado lê documento de obra de qualquer empresa
--   • authenticated_read_obra_mensagens — idem, anexos de mensagens
--   • admin_delete_obra_docs/_fotos     — admin de outra empresa pode APAGAR arquivo alheio
--
-- ESCOPO: 6 BUCKETS DE 9 — e os 3 que ficam de fora não são esquecimento
-- ---------------------------------------------------------------------
-- Medição contra produção (2026-08-23), objetos com ancoragem possível:
--   chamados-attachments  10/10   path[1] = org_id
--   marketing-artes       18/18   path[1] = org_id
--   marketing-brands      38/38   path[1] = org_id
--   obra-docs           179/179   path[2] = obra_id -> obras.org_id
--   obra-fotos          115/115   path[2] = obra_id -> obras.org_id
--   obra-mensagens         2/2    path[2] = obra_id -> obras.org_id
--
--   nicole-media          12/115  ❌ NÃO TOCADO — ver abaixo
--   campaign-assets        0/8    ❌ path por slug (email-marketing/{slug}/...)
--   lancamentos            0/7    ❌ path por id de lançamento
--
-- POR QUE `nicole-media` NÃO ENTRA. Ele tem QUATRO convenções de path convivendo:
--   broker-chat/… 48 · inbound/… 39 · whatsapp-inbound/… 15 · {org_id}/… 12 · undefined/… 1
-- Exigir `path[1] = org_id` tornaria 103 de 115 arquivos INACESSÍVEIS, derrubando o histórico de
-- mídia das conversas. Trocar um furo de isolamento por uma quebra funcional não é progresso.
-- A ancoragem dele depende da migração de objetos da Story 900-13.
--
-- (Achado incidental: existe 1 objeto com path literal `undefined/…` — o caminho de ESCRITA não
--  valida o org_id. A 900-13 precisa corrigir na origem, não só migrar o que já existe.)
--
-- PRINCÍPIO APLICADO EM TODAS AS POLICIES ABAIXO
-- ----------------------------------------------
-- O escopo de organização substitui `bucket_id` como âncora — NUNCA a verificação de permissão.
-- Onde havia `has_capability(...)`, ela permanece e ganha o escopo por cima.

-- =============================================================================
-- Grupo A — buckets com org_id no primeiro segmento do path
-- =============================================================================

-- chamados-attachments -------------------------------------------------------
DROP POLICY IF EXISTS chamados_storage_select ON storage.objects;
CREATE POLICY chamados_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chamados-attachments'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );

DROP POLICY IF EXISTS chamados_storage_insert ON storage.objects;
CREATE POLICY chamados_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chamados-attachments'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );

DROP POLICY IF EXISTS chamados_storage_delete ON storage.objects;
CREATE POLICY chamados_storage_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chamados-attachments'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
    AND public.has_capability('chamados.ver_todos')
  );

-- marketing-artes ------------------------------------------------------------
DROP POLICY IF EXISTS marketing_artes_public_read ON storage.objects;
CREATE POLICY marketing_artes_org_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'marketing-artes'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );

-- marketing-brands -----------------------------------------------------------
DROP POLICY IF EXISTS marketing_brands_public_read ON storage.objects;
CREATE POLICY marketing_brands_org_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'marketing-brands'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );

-- =============================================================================
-- Grupo B — buckets de obra: a org vem do JOIN com `obras` via path[2]
-- =============================================================================

-- obra-docs ------------------------------------------------------------------
DROP POLICY IF EXISTS authenticated_read_obra_docs ON storage.objects;
CREATE POLICY org_read_obra_docs ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-docs'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(name))[2]
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
      WHERE b.id::text = (storage.foldername(name))[2]
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
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

-- obra-fotos -----------------------------------------------------------------
-- Nota: `public_read_obra_fotos` é removida, mas o bucket CONTINUA público — em bucket público a
-- policy de SELECT é irrelevante, porque a URL basta. Fechar isso de verdade é a Story 900-12.
DROP POLICY IF EXISTS public_read_obra_fotos ON storage.objects;
CREATE POLICY org_read_obra_fotos ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-fotos'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS admin_upload_obra_fotos ON storage.objects;
CREATE POLICY admin_upload_obra_fotos ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'obra-fotos'
    AND public.has_capability('obras.fotos_enviar')
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(name))[2]
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
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

-- obra-mensagens -------------------------------------------------------------
DROP POLICY IF EXISTS authenticated_read_obra_mensagens ON storage.objects;
CREATE POLICY org_read_obra_mensagens ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-mensagens'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS authenticated_upload_obra_mensagens ON storage.objects;
CREATE POLICY org_upload_obra_mensagens ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'obra-mensagens'
    AND EXISTS (
      SELECT 1 FROM public.obras b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.org_id = public.user_org_id()
    )
  );

-- =============================================================================
-- ROLLBACK (NFR-8) — restaura exatamente o estado anterior a esta migration.
-- Rodar o bloco inteiro num único POST.
-- =============================================================================
-- DROP POLICY IF EXISTS chamados_storage_select ON storage.objects;
-- CREATE POLICY chamados_storage_select ON storage.objects FOR SELECT
--   USING (bucket_id = 'chamados-attachments' AND auth.uid() IS NOT NULL);
-- DROP POLICY IF EXISTS chamados_storage_insert ON storage.objects;
-- CREATE POLICY chamados_storage_insert ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'chamados-attachments' AND auth.uid() IS NOT NULL);
-- DROP POLICY IF EXISTS chamados_storage_delete ON storage.objects;
-- CREATE POLICY chamados_storage_delete ON storage.objects FOR DELETE
--   USING (bucket_id = 'chamados-attachments' AND public.has_capability('chamados.ver_todos'));
-- DROP POLICY IF EXISTS marketing_artes_org_read ON storage.objects;
-- CREATE POLICY marketing_artes_public_read ON storage.objects FOR SELECT
--   USING (bucket_id = 'marketing-artes');
-- DROP POLICY IF EXISTS marketing_brands_org_read ON storage.objects;
-- CREATE POLICY marketing_brands_public_read ON storage.objects FOR SELECT
--   USING (bucket_id = 'marketing-brands');
-- DROP POLICY IF EXISTS org_read_obra_docs ON storage.objects;
-- CREATE POLICY authenticated_read_obra_docs ON storage.objects FOR SELECT
--   USING (bucket_id = 'obra-docs');
-- DROP POLICY IF EXISTS admin_upload_obra_docs ON storage.objects;
-- CREATE POLICY admin_upload_obra_docs ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'obra-docs' AND public.has_capability('obras.documentos_gerenciar'));
-- DROP POLICY IF EXISTS admin_delete_obra_docs ON storage.objects;
-- CREATE POLICY admin_delete_obra_docs ON storage.objects FOR DELETE
--   USING (bucket_id = 'obra-docs' AND public.has_capability('obras.documentos_gerenciar'));
-- DROP POLICY IF EXISTS org_read_obra_fotos ON storage.objects;
-- CREATE POLICY public_read_obra_fotos ON storage.objects FOR SELECT
--   USING (bucket_id = 'obra-fotos');
-- DROP POLICY IF EXISTS admin_upload_obra_fotos ON storage.objects;
-- CREATE POLICY admin_upload_obra_fotos ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'obra-fotos' AND public.has_capability('obras.fotos_enviar'));
-- DROP POLICY IF EXISTS admin_delete_obra_fotos ON storage.objects;
-- CREATE POLICY admin_delete_obra_fotos ON storage.objects FOR DELETE
--   USING (bucket_id = 'obra-fotos' AND public.has_capability('obras.fotos_enviar'));
-- DROP POLICY IF EXISTS org_read_obra_mensagens ON storage.objects;
-- CREATE POLICY authenticated_read_obra_mensagens ON storage.objects FOR SELECT
--   USING (bucket_id = 'obra-mensagens');
-- DROP POLICY IF EXISTS org_upload_obra_mensagens ON storage.objects;
-- CREATE POLICY authenticated_upload_obra_mensagens ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'obra-mensagens');

-- Migration: 022_portal_docs_mensagens_storage.sql
-- Storage policies para obra-docs e obra-mensagens
-- Depende: public.is_admin_or_supervisor() criada em 020_portal_cliente.sql

-- ── obra-docs: privado (acesso via signed URL) ─────────────────────────────

DROP POLICY IF EXISTS "admin_upload_obra_docs" ON storage.objects;
CREATE POLICY "admin_upload_obra_docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'obra-docs' AND public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "admin_delete_obra_docs" ON storage.objects;
CREATE POLICY "admin_delete_obra_docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'obra-docs' AND public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "authenticated_read_obra_docs" ON storage.objects;
CREATE POLICY "authenticated_read_obra_docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'obra-docs');

-- ── obra-mensagens: privado (acesso via signed URL) ────────────────────────

DROP POLICY IF EXISTS "authenticated_upload_obra_mensagens" ON storage.objects;
CREATE POLICY "authenticated_upload_obra_mensagens"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'obra-mensagens');

DROP POLICY IF EXISTS "authenticated_read_obra_mensagens" ON storage.objects;
CREATE POLICY "authenticated_read_obra_mensagens"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'obra-mensagens');

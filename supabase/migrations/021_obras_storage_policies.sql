-- Migration 021: Storage Policies do bucket `obra-fotos`
-- Epic 20 — Portal do Cliente (Story 20.3)
--
-- Define as policies em `storage.objects` para o bucket `obra-fotos`:
--   - public_read_obra_fotos: SELECT público (bucket público — clientes leem via URL direta)
--   - admin_upload_obra_fotos: INSERT permitido para admin/supervisor (autenticados)
--   - admin_delete_obra_fotos: DELETE permitido para admin/supervisor (autenticados)
--
-- Depende de:
--   - 020_portal_cliente.sql (bucket `obra-fotos` criado via CLI; tabela obra_fotos existe)
--   - 004_rls_policies.sql (função public.is_admin_or_supervisor())
--
-- Idempotente: usa DROP POLICY IF EXISTS antes de CREATE POLICY.

-- ============================================
-- Policy: leitura pública do bucket obra-fotos
-- ============================================

DROP POLICY IF EXISTS "public_read_obra_fotos" ON storage.objects;

CREATE POLICY "public_read_obra_fotos"
ON storage.objects FOR SELECT
USING (bucket_id = 'obra-fotos');

-- ============================================
-- Policy: admin/supervisor pode fazer upload
-- ============================================

DROP POLICY IF EXISTS "admin_upload_obra_fotos" ON storage.objects;

CREATE POLICY "admin_upload_obra_fotos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'obra-fotos'
  AND public.is_admin_or_supervisor()
);

-- ============================================
-- Policy: admin/supervisor pode deletar
-- ============================================

DROP POLICY IF EXISTS "admin_delete_obra_fotos" ON storage.objects;

CREATE POLICY "admin_delete_obra_fotos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'obra-fotos'
  AND public.is_admin_or_supervisor()
);

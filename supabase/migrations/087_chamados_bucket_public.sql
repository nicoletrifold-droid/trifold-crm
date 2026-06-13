-- Migration 087: Torna o bucket chamados-attachments público
-- Story 52-1 — Fix: imagem do ticket invisível para admin/reporter
--
-- Root cause: bucket criado com public=false na migration 065.
-- getPublicUrl() gera URL no endpoint /object/public/, que retorna 403
-- para buckets privados. Solução: tornar o bucket público.
-- As URLs já são UUIDs longos (não adivinháveis) — aceitável para screenshots de bug.

UPDATE storage.buckets
SET public = true
WHERE id = 'chamados-attachments';

-- Fix upload de documentos de obra (fluxo signed-upload).
-- Define file_size_limit = 50 MB no bucket "obra-docs" (hoje null = sem limite).
-- Com o upload indo DIRETO ao Storage via signed upload URL, o teto de 50 MB
-- precisa ser imposto pelo próprio Supabase Storage — a validação da API vê só
-- o tamanho DECLARADO pelo cliente. Mesmo padrão da migration 186 (lancamentos).
-- 52428800 = 50 * 1024 * 1024.
update storage.buckets
set file_size_limit = 52428800
where id = 'obra-docs';

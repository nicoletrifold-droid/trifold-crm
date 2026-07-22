-- Story Lançamentos-05 (fix upload de anexos).
-- Define file_size_limit = 25 MB no bucket "lancamentos" (hoje null = sem limite).
-- Isso faz o próprio Supabase Storage rejeitar arquivos acima de 25 MB no upload direto
-- (via signed upload URL), sem depender apenas da validação do cliente/API.
-- 26214400 = 25 * 1024 * 1024.
update storage.buckets
set file_size_limit = 26214400
where id = 'lancamentos';

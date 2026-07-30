-- 204_marketing_artes_bucket.sql
-- Story 75-240 — bucket público para as ARTES GERADAS pela Lídia (motor de
-- imagem Vertex/gemini-3.1-flash-image com referências do Kit de Marcas).
-- Separado do marketing-brands (insumos ≠ produto final): limpar/regenerar
-- artes nunca mexe nos arquivos das marcas.
-- Escrita só via service-role (rotas marketingGuard); leitura pública (o card
-- da fila e o Instagram pessoal de quem baixa a arte usam a URL direta).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-artes', 'marketing-artes', true,
  10485760,  -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'marketing_artes_public_read'
  ) THEN
    CREATE POLICY marketing_artes_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'marketing-artes');
  END IF;
END $$;

-- Direção de arte persistida no post: o "Refazer arte" regenera sem nova
-- chamada ao Sonnet (arte_descricao) e com as MESMAS referências (arte_arquivos
-- = file_names do Kit escolhidos na geração original).
ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS arte_descricao text,
  ADD COLUMN IF NOT EXISTS arte_arquivos jsonb;

COMMENT ON COLUMN public.marketing_posts.arte_descricao IS
  'Direção de arte gerada pelo Sonnet (composição, clima, texto NA arte) — insumo do motor de imagem e do Refazer arte. Story 75-240.';
COMMENT ON COLUMN public.marketing_posts.arte_arquivos IS
  'Array JSON de file_names do Kit usados como referência na arte. Story 75-240.';

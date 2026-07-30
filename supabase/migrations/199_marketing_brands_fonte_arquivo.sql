-- 199_marketing_brands_fonte_arquivo.sql
-- Story 75-234 — Kit de Marcas: arquivo da fonte (.ttf/.otf/.woff/.woff2).
-- A fonte deixa de ser só referência textual: cada linha de `fontes` pode
-- apontar (asset_id) para um arquivo em marketing_brand_assets com tipo='fonte'.
--
-- Idempotente: DROP IF EXISTS + ADD no CHECK, UPDATE no bucket.

-- 1) tipo do asset passa a aceitar 'fonte'
ALTER TABLE public.marketing_brand_assets
  DROP CONSTRAINT IF EXISTS marketing_brand_assets_tipo_check;

ALTER TABLE public.marketing_brand_assets
  ADD CONSTRAINT marketing_brand_assets_tipo_check
  CHECK (tipo IN ('logo', 'foto', 'elemento', 'fonte'));

-- 2) bucket aceita os mime types de fonte. GOTCHA: navegador reporta o tipo de
-- .ttf/.otf de forma inconsistente (font/ttf, application/x-font-ttf ou vazio →
-- o cliente manda application/octet-stream). A extensão é validada na rota
-- /assets/sign por tipo (imagem × fonte) — o bucket é a 2ª barreira.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
         'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
         'application/font-woff', 'application/font-sfnt',
         'application/x-font-ttf', 'application/x-font-otf',
         'application/vnd.ms-opentype',
         'application/octet-stream'
       ]
 WHERE id = 'marketing-brands';

COMMENT ON COLUMN public.marketing_brands.fontes IS
  'Array de {papel, nome, asset_id} — papel tipográfico (Título, Subtítulo, Corpo…), nome da fonte e, opcionalmente, o arquivo (marketing_brand_assets tipo=fonte). Stories 75-230/75-234.';
COMMENT ON TABLE public.marketing_brand_assets IS
  'Story 75-229/75-234: arquivos do Kit de Marcas (logo/foto/elemento/fonte) no bucket público marketing-brands. Upload via signed URL (convenção 75-208).';

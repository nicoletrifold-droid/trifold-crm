-- 200_marketing_brand_assets_icone.sql
-- Story 75-235 — Kit de Marcas: ícone como categoria própria de arquivo.
-- Pedido do Marcos (30/07): "cada marca tem seu ícone" — antes só cabia em
-- 'elemento', o que misturava símbolo da marca com grafismos soltos.
-- Idempotente (DROP IF EXISTS + ADD); mime types do bucket já cobrem imagem.

ALTER TABLE public.marketing_brand_assets
  DROP CONSTRAINT IF EXISTS marketing_brand_assets_tipo_check;

ALTER TABLE public.marketing_brand_assets
  ADD CONSTRAINT marketing_brand_assets_tipo_check
  CHECK (tipo IN ('logo', 'icone', 'foto', 'elemento', 'fonte'));

COMMENT ON TABLE public.marketing_brand_assets IS
  'Stories 75-229/234/235: arquivos do Kit de Marcas (logo/icone/foto/elemento/fonte) no bucket público marketing-brands. Upload via signed URL (convenção 75-208).';

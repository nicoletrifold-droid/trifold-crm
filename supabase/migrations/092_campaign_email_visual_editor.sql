-- Migration 092: Editor Visual de E-mail + A/B de Imagens em Campanhas
-- Story: 55-1 — Campaign Email Visual Editor & A/B Creative Performance
-- Adds: email_body_json to campaigns, campaign_email_images table,
--       campaign-assets storage bucket with public read policies.
-- Compat: campaigns existentes com email_body_json NULL continuam funcionando.

-- =============================================================================
-- 1. Coluna email_body_json na tabela campaigns (design JSON do Unlayer)
-- =============================================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS email_body_json JSONB;

-- =============================================================================
-- 2. Tabela campaign_email_images
--    Armazena cada variante de imagem inserida no editor visual de uma campanha.
--    variant_id é usado como utm_content no link de destino para tracking A/B.
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_email_images (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_id  UUID        NOT NULL DEFAULT gen_random_uuid(),
  image_url   TEXT        NOT NULL,
  link_url    TEXT,
  alt_text    TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_email_images_campaign_id_idx
  ON campaign_email_images (campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_email_images_variant_id_idx
  ON campaign_email_images (variant_id);

-- Trigger para manter updated_at sincronizado
CREATE OR REPLACE FUNCTION update_campaign_email_images_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_campaign_email_images_updated_at ON campaign_email_images;
CREATE TRIGGER set_campaign_email_images_updated_at
  BEFORE UPDATE ON campaign_email_images
  FOR EACH ROW EXECUTE FUNCTION update_campaign_email_images_updated_at();

-- =============================================================================
-- 3. RLS em campaign_email_images
--    Acesso restrito à org da campanha (via JOIN com campaigns).
--    Segue o mesmo padrão do projeto: org_id via tabela users.
-- =============================================================================

ALTER TABLE campaign_email_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_campaign_email_images" ON campaign_email_images;
CREATE POLICY "org_access_campaign_email_images"
  ON campaign_email_images
  FOR ALL
  USING (
    campaign_id IN (
      SELECT id FROM campaigns
      WHERE org_id = (SELECT org_id FROM users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns
      WHERE org_id = (SELECT org_id FROM users WHERE id = auth.uid())
    )
  );

-- =============================================================================
-- 4. Bucket campaign-assets (público para leitura, autenticado para upload)
--    Path convention: {org_id}/{campaign_id}/{variant_id}.{ext}
--    Limite: 5 MB por arquivo. MIME types: jpeg, png, webp, gif.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-assets',
  'campaign-assets',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- SELECT público (bucket é public=true; policy explícita para clareza)
DROP POLICY IF EXISTS "campaign_assets_public_select" ON storage.objects;
CREATE POLICY "campaign_assets_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-assets');

-- INSERT apenas para usuários autenticados
DROP POLICY IF EXISTS "campaign_assets_authenticated_insert" ON storage.objects;
CREATE POLICY "campaign_assets_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campaign-assets'
    AND auth.uid() IS NOT NULL
  );

-- UPDATE apenas para usuários autenticados
DROP POLICY IF EXISTS "campaign_assets_authenticated_update" ON storage.objects;
CREATE POLICY "campaign_assets_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'campaign-assets'
    AND auth.uid() IS NOT NULL
  );

-- DELETE apenas para admin/supervisor
DROP POLICY IF EXISTS "campaign_assets_admin_delete" ON storage.objects;
CREATE POLICY "campaign_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'campaign-assets'
    AND public.is_admin_or_supervisor()
  );

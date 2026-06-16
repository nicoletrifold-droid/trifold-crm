-- Migration 097: Biblioteca de Mídia da Nicole (Story 56-1)
-- Storage bucket nicole-media + tabela agent_media_assets

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nicole-media',
  'nicole-media',
  true,
  20971520,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "nicole_media_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'nicole-media');

CREATE POLICY "nicole_media_auth_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'nicole-media'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "nicole_media_auth_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'nicole-media'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "nicole_media_auth_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'nicole-media'
    AND auth.role() = 'authenticated'
  );

-- Tabela principal
CREATE TABLE IF NOT EXISTS agent_media_assets (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID        NOT NULL REFERENCES organizations(id),
  property_id   UUID        REFERENCES properties(id),
  title         VARCHAR     NOT NULL,
  category      VARCHAR     NOT NULL DEFAULT 'outro'
                  CHECK (category IN ('planta','fachada','tabela','outro')),
  file_path     TEXT        NOT NULL,
  file_url      TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  file_type     VARCHAR     NOT NULL CHECK (file_type IN ('image','pdf')),
  file_size     BIGINT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_media_assets ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado da org pode visualizar (corretores incluídos)
CREATE POLICY "ama_select" ON agent_media_assets FOR SELECT
  USING (org_id = user_org_id());

-- Apenas admin/supervisor/gerente-comercial podem inserir/editar/excluir
CREATE POLICY "ama_insert" ON agent_media_assets FOR INSERT
  WITH CHECK (
    org_id = user_org_id()
    AND is_admin_or_supervisor()
  );

CREATE POLICY "ama_update" ON agent_media_assets FOR UPDATE
  USING (org_id = user_org_id() AND is_admin_or_supervisor());

CREATE POLICY "ama_delete" ON agent_media_assets FOR DELETE
  USING (org_id = user_org_id() AND is_admin_or_supervisor());

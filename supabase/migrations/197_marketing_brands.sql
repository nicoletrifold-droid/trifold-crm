-- 197_marketing_brands.sql
-- Story 75-229 — Kit de Marcas da aba "Agente" (Campanhas): base de identidade
-- por marca (Trifold institucional + 1 por empreendimento) que o futuro
-- "Gerar arte" (modelo de imagem com referências) vai consumir.
--
-- Segurança: RLS HABILITADA SEM POLICIES (mesmo padrão de marketing_posts/193) →
-- acesso exclusivamente via rotas API gateadas marketingGuard() (admin/supervisor)
-- com service-role. org_id OBRIGATÓRIO em todo INSERT.

CREATE TABLE IF NOT EXISTS marketing_brands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  tipo         text NOT NULL DEFAULT 'empreendimento'
                 CHECK (tipo IN ('institucional', 'empreendimento')),
  property_id  uuid REFERENCES properties(id) ON DELETE SET NULL,  -- exigido no app qdo tipo='empreendimento'
  cores        jsonb NOT NULL DEFAULT '[]'::jsonb,                 -- array de hex ["#E8856A", ...]
  fontes       text,                                               -- referência textual (upload de .ttf = futuro)
  voz_da_marca text,                                               -- tom de voz (alimentado pelo briefing mestre)
  diretrizes   text,                                               -- proibições jurídicas/comerciais, o que nunca falar
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_brands_org ON marketing_brands(org_id);

CREATE TABLE IF NOT EXISTS marketing_brand_assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id   uuid NOT NULL REFERENCES marketing_brands(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('logo', 'foto', 'elemento')),
  label      text,
  file_path  text NOT NULL,   -- path no bucket marketing-brands
  file_url   text NOT NULL,   -- public URL (bucket público)
  file_name  text NOT NULL,
  file_size  integer,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_brand_assets_brand ON marketing_brand_assets(brand_id);

ALTER TABLE marketing_brands       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_brand_assets ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY de propósito — ver cabeçalho)

COMMENT ON TABLE marketing_brands IS
  'Story 75-229: Kit de Marcas da aba Agente (Campanhas). Identidade por marca (institucional + empreendimentos): cores, fontes, voz, diretrizes. RLS sem policies — acesso via admin client em rotas marketingGuard (admin/supervisor).';
COMMENT ON TABLE marketing_brand_assets IS
  'Story 75-229: arquivos do Kit de Marcas (logo/foto/elemento) no bucket público marketing-brands. Upload via signed URL (convenção 75-208).';

-- Bucket público de logos/fotos de marca. GOTCHA (migs 186/190): no fluxo de
-- signed upload a API só vê o tamanho DECLARADO — o teto real mora no bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-brands', 'marketing-brands', true,
  10485760,  -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública (imagens exibidas via <img>); escrita só via service-role
-- (rotas gateadas) — nenhuma policy de INSERT/UPDATE/DELETE para authenticated.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'marketing_brands_public_read'
  ) THEN
    CREATE POLICY marketing_brands_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'marketing-brands');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS obra_fase_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  etapa text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT obra_fase_templates_org_nome_etapa_unique UNIQUE (org_id, nome, etapa)
);

ALTER TABLE obra_fase_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read their templates"
  ON obra_fase_templates
  FOR SELECT
  USING (org_id = public.user_org_id());

-- Seed com fases da obra Yarden (ba344a5e-6bd6-4a08-8f9f-0405992b0b34)
INSERT INTO obra_fase_templates (org_id, nome, etapa, created_at)
SELECT DISTINCT
  f.org_id,
  f.name AS nome,
  f.description AS etapa,
  now() AS created_at
FROM obra_fases f
WHERE f.obra_id = 'ba344a5e-6bd6-4a08-8f9f-0405992b0b34'
  AND f.name IS NOT NULL
  AND f.description IS NOT NULL
ON CONFLICT (org_id, nome, etapa) DO NOTHING;

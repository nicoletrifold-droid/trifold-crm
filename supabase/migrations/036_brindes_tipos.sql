-- Migration 036: Catálogo de tipos de brinde
-- Adiciona tabela brindes_tipos e FK em brindes_entregas
-- Story 29.4

-- Tabela de catálogo de tipos de brinde
CREATE TABLE brindes_tipos (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  descricao   text,
  tamanho     text,
  cor         text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, nome)
);

-- FK em brindes_entregas — nullable para não impactar registros existentes
ALTER TABLE brindes_entregas
  ADD COLUMN brinde_tipo_id uuid REFERENCES brindes_tipos(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE brindes_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brindes_tipos_select" ON brindes_tipos
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "brindes_tipos_write" ON brindes_tipos
  FOR ALL USING (public.is_admin_or_supervisor());

-- Indexes
CREATE INDEX idx_brindes_tipos_org_id
  ON brindes_tipos(org_id);

CREATE INDEX idx_brindes_entregas_tipo_id
  ON brindes_entregas(brinde_tipo_id)
  WHERE brinde_tipo_id IS NOT NULL;

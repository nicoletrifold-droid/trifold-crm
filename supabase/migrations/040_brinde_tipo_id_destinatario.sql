-- Migration 040: Tipo de Brinde padrão no Destinatário
-- Adiciona FK opcional brinde_tipo_id em brindes_destinatarios
-- Story 29.7

ALTER TABLE brindes_destinatarios
  ADD COLUMN IF NOT EXISTS brinde_tipo_id uuid
    REFERENCES brindes_tipos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brindes_destinatarios_tipo_id
  ON brindes_destinatarios(brinde_tipo_id);

-- ROLLBACK PLAN:
-- DROP INDEX IF EXISTS idx_brindes_destinatarios_tipo_id;
-- ALTER TABLE brindes_destinatarios DROP COLUMN IF EXISTS brinde_tipo_id;

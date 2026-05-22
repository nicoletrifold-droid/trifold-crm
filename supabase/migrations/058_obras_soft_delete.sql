-- Soft delete para obras: permite marcar como apagada sem remover do banco
-- A obra pode ser reativada futurando zerando deleted_at

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Índice parcial para filtrar obras ativas eficientemente
CREATE INDEX IF NOT EXISTS idx_obras_deleted_at
  ON obras(deleted_at)
  WHERE deleted_at IS NULL;

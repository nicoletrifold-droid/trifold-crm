-- Coluna que registra a última vez que sincronizamos o histórico /historico do Supremo
-- para um lead. Permite ao cron alternar entre leads, mantendo todos atualizados.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS supremo_history_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_supremo_history_synced_at
  ON leads(supremo_history_synced_at NULLS FIRST)
  WHERE supremo_id IS NOT NULL;

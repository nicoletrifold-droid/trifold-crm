-- Migration 028: Meta Campaign Actions
-- Expande meta_sync_log para suportar sync_type 'campaign_action' e 'intelligence_alert'
-- e adiciona colunas executed_by e details para auditoria de ações.

-- 1. Alterar CHECK constraint do sync_type
ALTER TABLE meta_sync_log DROP CONSTRAINT IF EXISTS meta_sync_log_sync_type_check;

ALTER TABLE meta_sync_log ADD CONSTRAINT meta_sync_log_sync_type_check
  CHECK (sync_type IN ('entities', 'insights', 'backfill', 'campaign_action', 'intelligence_alert'));

-- 2. Adicionar coluna executed_by (nullable — null = sistema/cron)
ALTER TABLE meta_sync_log
  ADD COLUMN IF NOT EXISTS executed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. Adicionar coluna details para contexto de ações (nullable)
ALTER TABLE meta_sync_log
  ADD COLUMN IF NOT EXISTS details JSONB;

-- ROLLBACK PLAN (executar manualmente se necessário):
-- ALTER TABLE meta_sync_log DROP CONSTRAINT IF EXISTS meta_sync_log_sync_type_check;
-- ALTER TABLE meta_sync_log ADD CONSTRAINT meta_sync_log_sync_type_check
--   CHECK (sync_type IN ('entities', 'insights', 'backfill'));
-- ALTER TABLE meta_sync_log DROP COLUMN IF EXISTS executed_by;
-- ALTER TABLE meta_sync_log DROP COLUMN IF EXISTS details;

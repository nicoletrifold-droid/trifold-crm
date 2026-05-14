-- 034_partial_indexes_queues_remote_only.sql
-- Remote version: 034
-- Applied via Supabase Management API (CONCURRENTLY requires non-transactional context).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY
--
-- Story: 29.5 (Epic 29 — Database Performance Blitz)
-- Date applied: 2026-05-13
-- Reason: Partial indexes em queues (email_sends_queue, follow_up_log, webhook_logs).
--         Crons consomem apenas rows com status='pending' (ou processed=false);
--         rows históricos (sent/processed/failed) acumulam indefinidamente.
--         Partials reduzem footprint 10-100x quando histórico cresce.

-- Partial: queries do cron sempre filtram por pending
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_sends_queue_pending_scheduled
  ON email_sends_queue(scheduled_for) WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_pending
  ON follow_up_log(scheduled_at) WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_unprocessed
  ON webhook_logs(created_at DESC) WHERE processed = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_leadgen
  ON webhook_logs(leadgen_id) WHERE leadgen_id IS NOT NULL;

-- ROLLBACK PLAN (executar manualmente via Studio SQL Editor ou Management API se necessário):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_sends_queue_pending_scheduled;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_pending;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_logs_unprocessed;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_logs_leadgen;

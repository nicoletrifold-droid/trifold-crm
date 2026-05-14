-- 036_pg_cron_cleanup_jobs_remote_only.sql
-- Remote version: 036
-- Applied via Supabase Management API (pg_cron requires non-transactional context).
-- Each statement applied as separate POST to /database/query (single-statement per call).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.
-- See: supabase/migrations/README.md — padrão _remote_only.sql
--
-- Story: 29.7 (Epic 29 — Database Performance Blitz — ÚLTIMA STORY DO EPIC)
-- Date applied: 2026-05-14
-- Reason: Ativar pg_cron extension + 5 jobs automáticos no Postgres:
--   - 4 cleanups em tabelas insert-heavy (retention policies)
--   - 1 refresh automático da matview meta_campaign_roas (Story 29.6)
--
-- Trade-off ROAS refresh: dados até 30 min stale, dashboard 50× faster
-- (custo 62.90 → 0.15 medido na Story 29.6).
--
-- pg_cron é suportado nativamente pelo Supabase (plano Pro).
--
-- Spike confirmou (2026-05-14):
--   - pg_cron extension NÃO instalada (pg_extension vazio)
--   - schema 'cron' NÃO existe (criado automaticamente pelo CREATE EXTENSION)
--   - slot 036 livre no tracking (nenhuma row com version LIKE '036%')
--   - 4 tabelas alvo existem (system_events 798 rows, follow_up_log 36 rows, demais ~0)
--   - meta_campaign_roas relkind='m' (Story 29.6 OK)
--   - UNIQUE INDEX idx_meta_campaign_roas_pk presente (REFRESH CONCURRENTLY válido)
--   - zero jobs pré-existentes para conflitar
--
-- ROLLBACK PLAN (executar manualmente se necessário):
--   SELECT cron.unschedule('cleanup-system-events');
--   SELECT cron.unschedule('cleanup-webhook-logs');
--   SELECT cron.unschedule('cleanup-follow-up-log');
--   SELECT cron.unschedule('cleanup-email-logs');
--   SELECT cron.unschedule('refresh-meta-campaign-roas');
--   -- Se necessário remover a extension (CUIDADO: destrói TODOS os jobs cron, mesmo de outros):
--   -- DROP EXTENSION IF EXISTS pg_cron;

-- Statement 1: Ativar extension pg_cron (idempotente).
-- Cria schema 'cron' e tabelas cron.job / cron.job_run_details automaticamente.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Statement 2: Cleanup system_events — retention 30 dias (3am UTC diário).
-- system_events é insert-heavy (798 rows hoje, cresce a cada webhook/cron).
-- Migration 009_system_events.sql tinha TODO de cleanup nunca implementado.
SELECT cron.schedule(
  'cleanup-system-events',
  '0 3 * * *',
  $$ DELETE FROM system_events WHERE created_at < now() - interval '30 days' $$
);

-- Statement 3: Cleanup webhook_logs — retention 90 dias para processed=true (4am UTC diário).
-- Mantém failures (processed=false) indefinidamente para investigação.
SELECT cron.schedule(
  'cleanup-webhook-logs',
  '0 4 * * *',
  $$ DELETE FROM webhook_logs WHERE processed = true AND created_at < now() - interval '90 days' $$
);

-- Statement 4: Cleanup follow_up_log — retention 180 dias (4am UTC todo domingo).
-- Volume menor, frequência semanal suficiente.
SELECT cron.schedule(
  'cleanup-follow-up-log',
  '0 4 * * 0',
  $$ DELETE FROM follow_up_log WHERE created_at < now() - interval '180 days' $$
);

-- Statement 5: Cleanup email_logs — retention 365 dias (5am UTC todo domingo).
-- Histórico longo para auditoria de envios.
SELECT cron.schedule(
  'cleanup-email-logs',
  '0 5 * * 0',
  $$ DELETE FROM email_logs WHERE created_at < now() - interval '365 days' $$
);

-- Statement 6: Refresh matview meta_campaign_roas (a cada 30 min).
-- REFRESH CONCURRENTLY usa UNIQUE INDEX idx_meta_campaign_roas_pk (Story 29.6).
-- Sem CONCURRENTLY, refresh trava SELECTs no dashboard durante a operação.
-- Trade-off: dados até 30 min stale, em troca de dashboard 50× faster.
SELECT cron.schedule(
  'refresh-meta-campaign-roas',
  '*/30 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas $$
);

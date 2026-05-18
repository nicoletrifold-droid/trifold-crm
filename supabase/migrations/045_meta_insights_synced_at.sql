-- ============================================================
-- 045_meta_insights_synced_at.sql
-- Story 16.14 — Add synced_at column to meta_insights_daily.
--
-- Raiz: cron /api/cron/meta-sync-insights falha HTTP 500 porque
-- o codigo (route.ts linhas 170, 211, 255) escreve synced_at mas
-- a coluna nao existe no schema (migration 015 criou a tabela sem
-- essa coluna, ao contrario de meta_campaigns/meta_adsets/meta_ads
-- que ja a possuem).
--
-- Seguro: ADD COLUMN com DEFAULT now() e nao-bloqueante no Postgres 11+.
-- Nao reescreve rows existentes — apenas define o default para novas.
-- O UPDATE abaixo faz backfill defensivo para rows ja existentes.
-- Idempotente: ADD COLUMN IF NOT EXISTS garante no-op em rerun.
--
-- Padrao de referencia: meta_campaigns, meta_adsets, meta_ads ja tem synced_at
-- (ver migration 015 linhas 52/73/93).
-- ============================================================

ALTER TABLE meta_insights_daily
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: rows existentes recebem synced_at = created_at
-- (WHERE defensivo: so atualiza rows onde o DEFAULT now() foi aplicado,
--  ou seja, onde synced_at aponta para "agora" em vez de um valor semantico)
UPDATE meta_insights_daily
SET synced_at = created_at
WHERE synced_at > created_at + INTERVAL '1 second';

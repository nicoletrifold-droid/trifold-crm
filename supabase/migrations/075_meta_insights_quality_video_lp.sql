-- 075_meta_insights_quality_video_lp.sql
-- Epic A — Stories A-1, A-2, A-3
-- Adds quality rankings, video metrics, and LP metrics to meta_insights_daily.
-- Also fixes meta_sync_log constraint (adds 'intelligence', 'intelligence_skip', 'placement').

-- ── Story A-1: Ad Quality Rankings (ad-level only; NULL for campaign/adset) ──
ALTER TABLE meta_insights_daily
  ADD COLUMN IF NOT EXISTS quality_ranking          TEXT
    CHECK (quality_ranking          IN ('ABOVE_AVERAGE','AVERAGE','BELOW_AVERAGE')),
  ADD COLUMN IF NOT EXISTS engagement_rate_ranking  TEXT
    CHECK (engagement_rate_ranking  IN ('ABOVE_AVERAGE','AVERAGE','BELOW_AVERAGE')),
  ADD COLUMN IF NOT EXISTS conversion_rate_ranking  TEXT
    CHECK (conversion_rate_ranking  IN ('ABOVE_AVERAGE','AVERAGE','BELOW_AVERAGE'));

-- ── Story A-2: Video Metrics (JSONB; ad-level only; NULL for campaign/adset) ──
-- Keys: p25, p50, p75, p100, sec30, thruplay (all integer view counts)
ALTER TABLE meta_insights_daily
  ADD COLUMN IF NOT EXISTS video_metrics JSONB;

-- ── Story A-3: Landing Page Metrics (all levels) ──
ALTER TABLE meta_insights_daily
  ADD COLUMN IF NOT EXISTS outbound_clicks    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views INT NOT NULL DEFAULT 0;

-- ── Fix meta_sync_log sync_type constraint ──
-- Adds 'intelligence', 'intelligence_skip', 'placement' which were missing.
ALTER TABLE meta_sync_log DROP CONSTRAINT IF EXISTS meta_sync_log_sync_type_check;
ALTER TABLE meta_sync_log ADD CONSTRAINT meta_sync_log_sync_type_check
  CHECK (sync_type IN (
    'entities',
    'insights',
    'backfill',
    'campaign_action',
    'intelligence_alert',
    'intelligence',
    'intelligence_skip',
    'placement'
  ));

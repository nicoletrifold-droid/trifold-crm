-- 076_meta_insights_placement_daily.sql
-- Epic A — Story A-5: Placement Breakdown
-- Stores Meta Ads performance broken down by publisher_platform + platform_position.
-- Synced weekly by /api/cron/meta-sync-placement.

CREATE TABLE IF NOT EXISTS meta_insights_placement_daily (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id        TEXT        NOT NULL,   -- meta_campaign_id
  adset_id           TEXT,                   -- meta_adset_id (populated when available)
  date               DATE        NOT NULL,
  publisher_platform TEXT        NOT NULL,   -- facebook | instagram | audience_network | messenger
  platform_position  TEXT        NOT NULL,   -- feed | story | reels | instream_video | etc.
  spend              NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions        BIGINT      NOT NULL DEFAULT 0,
  clicks             INT         NOT NULL DEFAULT 0,
  leads              INT         NOT NULL DEFAULT 0,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, campaign_id, date, publisher_platform, platform_position)
);

CREATE INDEX IF NOT EXISTS idx_meta_placement_org_date
  ON meta_insights_placement_daily (org_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_placement_campaign
  ON meta_insights_placement_daily (campaign_id, date DESC);

ALTER TABLE meta_insights_placement_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON meta_insights_placement_daily
  FOR ALL USING (org_id = public.user_org_id());

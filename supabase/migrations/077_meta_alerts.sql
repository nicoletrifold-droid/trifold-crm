-- 077_meta_alerts.sql
-- Epic A — Stories A-4, A-6
-- Persistent alert table replacing Telegram for all Meta Ads intelligence alerts.
-- Dashboard (Epic B) and agent context builder (Epic C) read from here.

CREATE TABLE IF NOT EXISTS meta_alerts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Alert classification
  alert_type   TEXT        NOT NULL,
  -- Known types: cpl_spike | zero_leads_active | scale_candidate |
  --              frequency_saturation | creative_fatigue | budget_underdelivery | token_invalid
  level        TEXT        NOT NULL DEFAULT 'campaign'
               CHECK (level IN ('campaign', 'adset', 'ad', 'account')),
  entity_id    TEXT        NOT NULL,   -- meta_campaign_id | meta_adset_id | meta_ad_id | account_id
  entity_name  TEXT,

  severity     TEXT        NOT NULL DEFAULT 'warning'
               CHECK (severity IN ('info', 'warning', 'critical')),
  message      TEXT        NOT NULL,
  metadata     JSONB,                  -- extra context (old_value, new_value, ratios, etc.)

  is_read      BOOLEAN     NOT NULL DEFAULT false,
  fired_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,

  -- One alert per entity per type per day
  UNIQUE (org_id, alert_type, entity_id, fired_date)
);

CREATE INDEX IF NOT EXISTS idx_meta_alerts_org_unread
  ON meta_alerts (org_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_alerts_org_date
  ON meta_alerts (org_id, fired_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_alerts_entity
  ON meta_alerts (entity_id, alert_type, fired_date DESC);

ALTER TABLE meta_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON meta_alerts
  FOR ALL USING (org_id = public.user_org_id());

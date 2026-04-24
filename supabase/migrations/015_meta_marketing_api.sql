-- Migration 015: Meta Marketing API
-- Epic 16 — Meta Ads Integration
-- Creates: meta_ad_accounts, meta_campaigns, meta_adsets, meta_ads,
--          meta_insights_daily, meta_sync_log, webhook_logs

-- ============================================
-- 1. meta_ad_accounts
-- ============================================

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  meta_account_id  TEXT NOT NULL,  -- ex: "act_1234567890"
  name             TEXT,
  currency         TEXT,
  access_token     TEXT,           -- System User Token (plain for now — encryption in 16.3)

  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'disconnected', 'error')),

  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, meta_account_id)
);

-- ============================================
-- 2. meta_campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS meta_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,

  meta_campaign_id TEXT NOT NULL,
  name             TEXT,
  objective        TEXT,           -- OUTCOME_LEADS, OUTCOME_TRAFFIC, etc.

  status           TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED')),

  daily_budget     BIGINT,         -- centavos
  lifetime_budget  BIGINT,         -- centavos

  start_time       TIMESTAMPTZ,
  stop_time        TIMESTAMPTZ,
  meta_created_time TIMESTAMPTZ,

  synced_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, meta_campaign_id)
);

-- ============================================
-- 3. meta_adsets
-- ============================================

CREATE TABLE IF NOT EXISTS meta_adsets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id      UUID NOT NULL REFERENCES meta_campaigns(id) ON DELETE CASCADE,

  meta_adset_id    TEXT NOT NULL,
  name             TEXT,
  status           TEXT,
  optimization_goal TEXT,
  daily_budget     BIGINT,         -- centavos

  synced_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, meta_adset_id)
);

-- ============================================
-- 4. meta_ads
-- ============================================

CREATE TABLE IF NOT EXISTS meta_ads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  adset_id         UUID NOT NULL REFERENCES meta_adsets(id) ON DELETE CASCADE,

  meta_ad_id       TEXT NOT NULL,
  name             TEXT,
  status           TEXT,
  creative         JSONB,

  synced_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, meta_ad_id)
);

-- ============================================
-- 5. meta_insights_daily
-- ============================================

CREATE TABLE IF NOT EXISTS meta_insights_daily (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  level            TEXT NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  entity_id        TEXT NOT NULL,  -- meta_campaign_id | meta_adset_id | meta_ad_id
  date             DATE NOT NULL,

  spend            NUMERIC(12,2) DEFAULT 0,
  impressions      BIGINT DEFAULT 0,
  reach            BIGINT DEFAULT 0,
  clicks           BIGINT DEFAULT 0,
  ctr              NUMERIC(8,4) DEFAULT 0,
  cpc              NUMERIC(12,2) DEFAULT 0,
  cpm              NUMERIC(12,2) DEFAULT 0,
  frequency        NUMERIC(8,4) DEFAULT 0,
  leads            INT DEFAULT 0,
  messaging_conversations_started INT DEFAULT 0,
  cost_per_lead    NUMERIC(12,2) DEFAULT 0,
  actions          JSONB,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, level, entity_id, date)
);

-- ============================================
-- 6. meta_sync_log
-- ============================================

CREATE TABLE IF NOT EXISTS meta_sync_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  sync_type        TEXT NOT NULL CHECK (sync_type IN ('entities', 'insights', 'backfill')),
  status           TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'success', 'error')),

  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  records_synced   INT DEFAULT 0,
  api_calls_made   INT DEFAULT 0,
  error_message    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 7. webhook_logs
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID REFERENCES organizations(id) ON DELETE SET NULL,  -- NULLABLE

  source           TEXT NOT NULL DEFAULT 'meta_ads'
                   CHECK (source IN ('meta_ads', 'whatsapp', 'google_forms', 'other')),
  event_type       TEXT,
  payload          JSONB,
  leadgen_id       TEXT,
  signature_valid  BOOLEAN,
  processed        BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 8. Indexes
-- ============================================

-- meta_campaigns
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_org_status
  ON meta_campaigns (org_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_org_campaign_id
  ON meta_campaigns (org_id, meta_campaign_id);

-- meta_adsets
CREATE INDEX IF NOT EXISTS idx_meta_adsets_org_status
  ON meta_adsets (org_id, status);

-- meta_ads
CREATE INDEX IF NOT EXISTS idx_meta_ads_org_status
  ON meta_ads (org_id, status);

-- meta_insights_daily
CREATE INDEX IF NOT EXISTS idx_meta_insights_org_level_date
  ON meta_insights_daily (org_id, level, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_entity_date
  ON meta_insights_daily (entity_id, date DESC);

-- meta_sync_log
CREATE INDEX IF NOT EXISTS idx_meta_sync_log_org_created
  ON meta_sync_log (org_id, created_at DESC);

-- webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_org_created
  ON webhook_logs (org_id, created_at DESC);

-- ============================================
-- 9. RLS
-- ============================================

ALTER TABLE meta_ad_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_adsets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_insights_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_sync_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON meta_ad_accounts
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "org_isolation" ON meta_campaigns
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "org_isolation" ON meta_adsets
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "org_isolation" ON meta_ads
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "org_isolation" ON meta_insights_daily
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "org_isolation" ON meta_sync_log
  FOR ALL USING (org_id = public.user_org_id());

-- webhook_logs: org_id nullable — allow insert from service role, restrict selects
CREATE POLICY "org_isolation" ON webhook_logs
  FOR ALL USING (org_id IS NULL OR org_id = public.user_org_id());

-- Migration 013: Campaign Engine
-- Epic 15 — Campaign Engine + Google Forms Integration
-- Creates: campaigns, campaign_entries, campaign_events tables
-- Alters: lead_source enum, organizations table

-- 1. Extend lead_source enum
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'google_forms';

-- 2. Add Google OAuth tokens to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_oauth_tokens JSONB;

-- 3. Campaigns table
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,

  -- Period
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  -- Google Forms integration
  type TEXT NOT NULL DEFAULT 'google_forms',
  form_url TEXT,
  google_form_id TEXT,
  last_polled_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,

  -- Field mapping (question_id → target)
  field_mapping JSONB DEFAULT '{}',

  -- Auto-confirmations
  whatsapp_template_name TEXT,
  email_enabled BOOLEAN DEFAULT true,
  email_subject TEXT,
  email_body_html TEXT,

  -- Property link
  property_id UUID REFERENCES properties(id),

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, slug)
);

-- 4. Campaign entries table
CREATE TABLE campaign_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Participant data
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,

  -- Campaign-specific data (flexible)
  custom_data JSONB DEFAULT '{}',

  -- Google Forms response ID (dedup)
  google_response_id TEXT,

  -- Confirmation status
  whatsapp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (whatsapp_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_sent_at TIMESTAMPTZ,

  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'delivered', 'opened', 'bounced', 'failed')),
  email_sent_at TIMESTAMPTZ,

  -- Data validation
  is_valid_phone BOOLEAN,
  is_valid_email BOOLEAN,
  has_responded BOOLEAN DEFAULT false,

  -- Nicole outbound (future)
  nicole_outbound_at TIMESTAMPTZ,
  nicole_outbound_by UUID,
  nicole_conversation_id UUID,

  -- Raw payload from source
  raw_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 1 entry per phone per campaign
  UNIQUE(campaign_id, phone),
  -- Dedup by Google response ID
  UNIQUE(campaign_id, google_response_id)
);

-- 5. Campaign events table (engagement tracking)
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES campaign_entries(id) ON DELETE CASCADE,

  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Indexes
CREATE INDEX idx_campaign_entries_campaign ON campaign_entries(campaign_id);
CREATE INDEX idx_campaign_entries_phone ON campaign_entries(campaign_id, phone);
CREATE INDEX idx_campaign_entries_lead ON campaign_entries(lead_id);
CREATE INDEX idx_campaign_entries_valid ON campaign_entries(campaign_id, is_valid_phone, is_valid_email);
CREATE INDEX idx_campaign_events_entry ON campaign_events(entry_id);
CREATE INDEX idx_campaign_events_type ON campaign_events(campaign_id, channel, event_type);

-- 7. RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON campaigns
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
CREATE POLICY "org_access" ON campaign_entries
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
CREATE POLICY "org_access" ON campaign_events
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

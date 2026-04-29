-- Migration 018: Email Central
-- Epic 18 — Central de Email
-- Creates: email_templates, email_logs, email_sends_queue, email_automations, email_blasts

-- ============================================================
-- 1. email_templates — Template definitions with variables
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  category TEXT NOT NULL CHECK (category IN ('transacional', 'campanha', 'automacao')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- ============================================================
-- 2. email_logs — Immutable log of all sent emails
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  resend_email_id TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','opened','clicked','bounced','complained','failed')),
  error_message TEXT,
  variables_used JSONB,
  tags JSONB,
  triggered_by TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. email_sends_queue — Send queue with rate limiting
-- ============================================================
CREATE TABLE IF NOT EXISTS email_sends_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_log_id UUID NOT NULL REFERENCES email_logs(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  priority INT NOT NULL DEFAULT 5,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed','cancelled')),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. email_automations — Configurable triggers for auto-sends
-- ============================================================
CREATE TABLE IF NOT EXISTS email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL
    CHECK (trigger_event IN ('lead.created','lead.status_changed','cron.daily')),
  trigger_filter JSONB,
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  delay_minutes INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. email_blasts — Manual mass email campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS email_blasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,
  subject_override TEXT,
  segment_filter JSONB NOT NULL DEFAULT '{}',
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled')),
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_blasts ENABLE ROW LEVEL SECURITY;

-- email_templates
CREATE POLICY "email_templates_org_isolation" ON email_templates
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "email_templates_service_role" ON email_templates
  FOR ALL
  USING (auth.role() = 'service_role');

-- email_logs
CREATE POLICY "email_logs_org_isolation" ON email_logs
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "email_logs_service_role" ON email_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- email_sends_queue
CREATE POLICY "email_sends_queue_org_isolation" ON email_sends_queue
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "email_sends_queue_service_role" ON email_sends_queue
  FOR ALL
  USING (auth.role() = 'service_role');

-- email_automations
CREATE POLICY "email_automations_org_isolation" ON email_automations
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "email_automations_service_role" ON email_automations
  FOR ALL
  USING (auth.role() = 'service_role');

-- email_blasts
CREATE POLICY "email_blasts_org_isolation" ON email_blasts
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "email_blasts_service_role" ON email_blasts
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Indexes — Performance
-- ============================================================

-- email_logs: paginated listing
CREATE INDEX IF NOT EXISTS idx_email_logs_org_created
  ON email_logs(org_id, created_at DESC);

-- email_logs: webhook lookup by Resend ID
CREATE INDEX IF NOT EXISTS idx_email_logs_resend_id
  ON email_logs(resend_email_id);

-- email_logs: status filter for dashboard
CREATE INDEX IF NOT EXISTS idx_email_logs_status_org
  ON email_logs(status, org_id);

-- email_logs: rate limiting — count emails today
CREATE INDEX IF NOT EXISTS idx_email_logs_org_sent_at
  ON email_logs(org_id, sent_at DESC);

-- email_sends_queue: cron queue processing
CREATE INDEX IF NOT EXISTS idx_email_sends_queue_status_scheduled
  ON email_sends_queue(status, scheduled_for);

-- email_templates: active template listing
CREATE INDEX IF NOT EXISTS idx_email_templates_org_active
  ON email_templates(org_id, is_active);

-- email_blasts: listing by org and date
CREATE INDEX IF NOT EXISTS idx_email_blasts_org_created
  ON email_blasts(org_id, created_at DESC);

-- email_blasts: status filter
CREATE INDEX IF NOT EXISTS idx_email_blasts_status_org
  ON email_blasts(status, org_id);

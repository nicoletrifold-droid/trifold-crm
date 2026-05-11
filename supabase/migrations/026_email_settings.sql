-- Migration 026: Email Settings per org
-- Story 18.9 — Configurações de Email + Envio Rápido

CREATE TABLE IF NOT EXISTS email_settings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  sender_name             TEXT        NOT NULL DEFAULT 'Trifold',
  sender_email            TEXT        NOT NULL DEFAULT 'contato@trifold.com.br',
  reply_to                TEXT,
  daily_quota             INT         NOT NULL DEFAULT 100 CHECK (daily_quota BETWEEN 1 AND 1000),
  quota_alert_pct         INT         NOT NULL DEFAULT 95  CHECK (quota_alert_pct BETWEEN 50 AND 99),
  bounce_alert_pct        INT         NOT NULL DEFAULT 5   CHECK (bounce_alert_pct BETWEEN 1 AND 50),
  telegram_alerts_enabled BOOLEAN     NOT NULL DEFAULT true,
  unsubscribe_base_url    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by org (called on every email send)
CREATE INDEX IF NOT EXISTS email_settings_org_id_idx ON email_settings(org_id);

-- RLS
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

-- Org members can read their own settings
CREATE POLICY "email_settings_select" ON email_settings
  FOR SELECT USING (
    org_id = public.user_org_id()
  );

-- Only admins can insert/update
CREATE POLICY "email_settings_upsert" ON email_settings
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.user_role() = 'admin'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_email_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER email_settings_updated_at
  BEFORE UPDATE ON email_settings
  FOR EACH ROW EXECUTE FUNCTION update_email_settings_updated_at();

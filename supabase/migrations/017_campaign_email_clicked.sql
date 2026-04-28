-- Migration 017: Add 'clicked' to campaign_entries.email_status
-- Story 15.13 — Fix Email Tracking: suporte ao evento email.clicked do Resend

ALTER TABLE campaign_entries
  DROP CONSTRAINT IF EXISTS campaign_entries_email_status_check;

ALTER TABLE campaign_entries
  ADD CONSTRAINT campaign_entries_email_status_check
  CHECK (email_status IN ('pending', 'sent', 'delivered', 'opened', 'bounced', 'failed', 'clicked'));

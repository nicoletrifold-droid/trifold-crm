-- Migration 048: Supremo CRM sync
-- Adds supremo_id tracking to leads and creates sync log table

ALTER TABLE leads ADD COLUMN IF NOT EXISTS supremo_id integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS supremo_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_supremo_id
  ON leads(supremo_id)
  WHERE supremo_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS supremo_sync_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  mode        text NOT NULL DEFAULT 'incremental',
  leads_created  integer NOT NULL DEFAULT 0,
  leads_updated  integer NOT NULL DEFAULT 0,
  leads_skipped  integer NOT NULL DEFAULT 0,
  pages_fetched  integer NOT NULL DEFAULT 0,
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supremo_sync_log_org
  ON supremo_sync_log(org_id, created_at DESC);

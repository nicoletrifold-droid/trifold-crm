-- =============================================================================
-- 025_phone_normalization_part2_remote_only.sql
-- =============================================================================
-- Remote tracking: version='025', name='phone_normalization_part2'
-- Applied via Supabase Studio circa 2026-04 (Story 21.1)
--
-- TRACKING DRIFT (documented in Story 29.1):
-- Remote registered statements=NULL (Studio did not persist the SQL body),
-- but the registered name ('phone_normalization_part2') and the production
-- schema state (UNIQUE index idx_leads_org_phone_normalized_unique present)
-- confirm that this is the SQL that was applied.
--
-- Source of truth (identical content): supabase/migrations/021_phone_normalization_part2.sql
-- =============================================================================

-- 1) Defensive audit guard — abort migration if duplicates still exist
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT 1
    FROM leads
    WHERE phone_normalized IS NOT NULL
    GROUP BY org_id, phone_normalized
    HAVING COUNT(*) > 1
  ) AS dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot promote idx_leads_org_phone_normalized to UNIQUE: % duplicate '
      '(org_id, phone_normalized) groups still exist. Run '
      'scripts/cleanup-duplicate-leads.ts --apply first.', dup_count;
  END IF;
END $$;

-- 2) Drop the non-unique index and recreate as UNIQUE (FULL, NOT partial)
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_leads_org_phone_normalized;

CREATE UNIQUE INDEX idx_leads_org_phone_normalized_unique
  ON leads (org_id, phone_normalized);

COMMENT ON INDEX idx_leads_org_phone_normalized_unique IS
  'FULL UNIQUE constraint enforcing "1 lead per (org_id, phone_normalized)" — '
  'used as ON CONFLICT target in webhook upsert. NOT partial: ensures '
  'deterministic ON CONFLICT inference. Multiple NULLs allowed per Postgres '
  'standard UNIQUE semantics. Story 21.1.';

-- =============================================================================
-- ROLLBACK PLAN (manual, do not run automatically):
-- DROP INDEX IF EXISTS idx_leads_org_phone_normalized_unique;
-- CREATE INDEX idx_leads_org_phone_normalized
--   ON leads (org_id, phone_normalized);
-- =============================================================================

-- =============================================================================
-- NOTA DE TRACKING (Story 29.1 — reconciliação 2026-05-12):
-- Este arquivo foi aplicado ao remote Supabase com version='025'
-- (não '021' como o prefixo local sugere). O remote registrou o nome como
-- 'phone_normalization_part2'. Ver `025_phone_normalization_part2_remote_only.sql`
-- para o stub local de paridade. NÃO renomear este arquivo.
-- =============================================================================
-- Migration 021 — Part 2: promote phone_normalized index to UNIQUE
-- =============================================================================
-- Purpose: After running scripts/cleanup-duplicate-leads.ts to merge duplicate
--          leads, replace the non-unique composite index from part 1 with a
--          UNIQUE one so that the database itself enforces "1 lead per
--          (org_id, phone_normalized)" — and the webhook upsert can rely on
--          ON CONFLICT (org_id, phone_normalized) without races.
--
-- Pre-conditions (operator MUST verify before running this migration):
--   1. Migration 021_phone_normalization_part1.sql has been applied
--   2. scripts/cleanup-duplicate-leads.ts ran with `--apply` and exited 0
--   3. The audit query below returns 0 rows
--
-- Audit query (run in psql before applying this migration):
--   SELECT phone, normalize_phone_br(phone) AS normalized, COUNT(*) AS dup_count
--   FROM leads
--   WHERE phone IS NOT NULL
--   GROUP BY phone, normalize_phone_br(phone)
--   HAVING COUNT(*) > 1;
--
-- This migration includes a defensive guard that aborts if duplicates remain.
--
-- Story: 21.1 — Webhook WhatsApp Idempotente, Phone Normalization & Lead Dedup
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

-- NOTE: This is a FULL UNIQUE index (NOT partial) — intentionally no WHERE clause.
-- Reason: Postgres ON CONFLICT inference against partial UNIQUE indexes is fragile
-- and can fall back to plain INSERT, recreating the original duplication bug.
-- A full UNIQUE index guarantees the webhook upsert (onConflict: "org_id,phone_normalized")
-- always resolves to the constraint deterministically.
-- NULL semantics: Postgres allows multiple NULL values in a UNIQUE index by default
-- (NULL != NULL in unique constraints), so legacy rows with phone_normalized=NULL
-- (invalid phones) are not blocked.

COMMENT ON INDEX idx_leads_org_phone_normalized_unique IS
  'FULL UNIQUE constraint enforcing "1 lead per (org_id, phone_normalized)" — '
  'used as ON CONFLICT target in webhook upsert. NOT partial: ensures '
  'deterministic ON CONFLICT inference. Multiple NULLs allowed per Postgres '
  'standard UNIQUE semantics. Story 21.1.';

-- =============================================================================
-- Rollback (manual, do not run automatically):
-- =============================================================================
-- DROP INDEX IF EXISTS idx_leads_org_phone_normalized_unique;
-- CREATE INDEX idx_leads_org_phone_normalized
--   ON leads (org_id, phone_normalized);
-- =============================================================================

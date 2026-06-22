-- =============================================================================
-- Migration 021 — Part 1: phone_normalization
-- =============================================================================
-- Purpose: Adds the `normalize_phone_br()` PL/pgSQL function (mirrors
--          packages/shared/src/utils/phone.ts), a generated column
--          `phone_normalized` on `leads`, and a NON-UNIQUE composite index on
--          `(org_id, phone_normalized)`.
--
-- Why non-unique here? Production data already contains duplicate phones for
-- the same org (root cause of the P0 bug Story 21.1 fixes). A UNIQUE index
-- now would abort the migration. The cleanup script
-- (`scripts/cleanup-duplicate-leads.ts`) merges duplicates AFTER this
-- migration; then `021_phone_normalization_part2.sql` promotes the index
-- to UNIQUE.
--
-- Story: 21.1 — Webhook WhatsApp Idempotente, Phone Normalization & Lead Dedup
-- =============================================================================

-- 1) Function: normalize_phone_br(text) → text
-- -----------------------------------------------------------------------------
-- Mirrors the TS utility in packages/shared/src/utils/phone.ts.
-- IMMUTABLE     → safe for use in GENERATED ALWAYS AS expressions
-- STRICT        → returns NULL automatically when input is NULL (no body run)
-- SECURITY DEFINER → required for usage inside generated columns regardless
--                    of caller role
CREATE OR REPLACE FUNCTION normalize_phone_br(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  digits text;
  trimmed text;
BEGIN
  -- STRICT handles NULL automatically. Defensive whitespace check:
  trimmed := btrim(raw);
  IF length(trimmed) = 0 THEN
    RETURN NULL;
  END IF;

  -- Strip non-digit characters
  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  -- Less than 10 digits → invalid
  IF length(digits) < 10 THEN
    RETURN NULL;
  END IF;

  -- 11 digits without `55` prefix → prepend `55`
  IF length(digits) = 11 AND left(digits, 2) <> '55' THEN
    RETURN '55' || digits;
  END IF;

  -- 12 digits starting with `55` (legacy without 9th mobile digit) →
  -- insert `9` after the first 4 chars (`55DD` + `9` + last 8)
  IF length(digits) = 12 AND left(digits, 2) = '55' THEN
    RETURN left(digits, 4) || '9' || right(digits, 8);
  END IF;

  -- 13+ digits, 10 digits (local) or non-BR international → return as-is
  RETURN digits;
END;
$$;

COMMENT ON FUNCTION normalize_phone_br(text) IS
  'Normalize a Brazilian phone number to canonical E.164 format with the '
  'mandatory mobile 9th digit (Anatel res. 575/2011). Mirrors the TS utility '
  'in packages/shared/src/utils/phone.ts. Story 21.1.';

-- 2) Generated column on leads
-- -----------------------------------------------------------------------------
-- GENERATED ALWAYS AS … STORED is computed for every existing row and
-- recomputed on every UPDATE of `phone`. Because normalize_phone_br is
-- IMMUTABLE, Postgres can index this column directly.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone_normalized varchar(20)
  GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED;

COMMENT ON COLUMN leads.phone_normalized IS
  'Phone normalized to canonical BR format (5544999689446). NULL when phone is '
  'invalid or empty. Used as the deduplication key in (org_id, phone_normalized). '
  'Story 21.1.';

-- 3) NON-UNIQUE composite index
-- -----------------------------------------------------------------------------
-- Allows duplicates during the cleanup transition window. The UNIQUE index is
-- created in 021_phone_normalization_part2.sql AFTER cleanup-duplicate-leads.ts
-- merges existing duplicates.
CREATE INDEX IF NOT EXISTS idx_leads_org_phone_normalized
  ON leads (org_id, phone_normalized);

-- =============================================================================
-- Rollback (manual, do not run automatically):
-- =============================================================================
-- DROP INDEX IF EXISTS idx_leads_org_phone_normalized;
-- ALTER TABLE leads DROP COLUMN IF EXISTS phone_normalized;
-- DROP FUNCTION IF EXISTS normalize_phone_br(text);
-- =============================================================================

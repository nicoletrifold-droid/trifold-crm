-- =============================================================================
-- 024_phone_normalization_part1_remote_only.sql
-- =============================================================================
-- Remote tracking: version='024', name='phone_normalization_part1'
-- Applied via Supabase Studio circa 2026-04 (Story 21.1)
--
-- TRACKING DRIFT (documented in Story 29.1):
-- The SQL below was applied to the remote Supabase project via Studio,
-- and the CLI registered it as version='024' in supabase_migrations.schema_migrations.
-- The corresponding LOCAL file is `021_phone_normalization_part1.sql`. The
-- numeric prefix DIFFERS (local=021 vs remote=024) — both files exist intentionally
-- as a historical drift record. Neither file should be renamed (renaming would
-- break the remote tracking match by `version` field).
--
-- This file (024_*) carries the EXACT SQL that the remote registered, kept as
-- a local artifact so `supabase migration list --linked` shows parity.
--
-- Source of truth (identical content): supabase/migrations/021_phone_normalization_part1.sql
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
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone_normalized varchar(20)
  GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED;

COMMENT ON COLUMN leads.phone_normalized IS
  'Phone normalized to canonical BR format (5544999689446). NULL when phone is '
  'invalid or empty. Used as the deduplication key in (org_id, phone_normalized). '
  'Story 21.1.';

-- 3) NON-UNIQUE composite index
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_org_phone_normalized
  ON leads (org_id, phone_normalized);

-- =============================================================================
-- ROLLBACK PLAN (manual, do not run automatically):
-- DROP INDEX IF EXISTS idx_leads_org_phone_normalized;
-- ALTER TABLE leads DROP COLUMN IF EXISTS phone_normalized;
-- DROP FUNCTION IF EXISTS normalize_phone_br(text);
-- =============================================================================

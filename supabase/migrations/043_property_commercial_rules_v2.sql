-- 043_property_commercial_rules_v2.sql
-- Epic 31 Story 31.2 — Schema-only migration. Backfill de dados em 044_backfill_commercial_rules.sql (Story 31.3).
-- Adiciona DEFAULT jsonb neutro + CHECK constraint validando sub-schema de commercial_rules.
-- NENHUM dado existente é alterado por esta migration.
--
-- Espelho SQL do schema Zod em packages/shared/src/types/commercial-rules.ts (Story 31.1, commit b01470b).
-- Aplicado via Supabase Management API (não `supabase db push`) — tracking manual em
-- supabase_migrations.schema_migrations com version='043'.
--
-- DDL é idempotente onde possível (DROP CONSTRAINT IF EXISTS antes do ADD CONSTRAINT) para permitir
-- re-execução defensiva em caso de aborto a meio caminho.

-- ============================================================================
-- 1. DEFAULT jsonb com todos os novos campos (idempotente para novos registros)
-- ============================================================================
-- Antes desta migration o DEFAULT era '{}'::jsonb (sem campos). Novo DEFAULT garante shape
-- consistente para INSERTs que omitirem commercial_rules.

ALTER TABLE properties
  ALTER COLUMN commercial_rules SET DEFAULT
  jsonb_build_object(
    'requires_down_payment', false,
    'min_down_payment_pct', 0,
    'example_down_payment_brl', null,
    'down_payment_flexible', false,
    'financing_options', '[]'::jsonb,
    'mcmv_eligible', false,
    'key_selling_points', '[]'::jsonb,
    'ideal_buyer_profile', null,
    'identification_keywords', '[]'::jsonb,
    'status_label', null,
    'notes', null
  );

-- ============================================================================
-- 2. CHECK constraint — schema permissivo (Apêndice A do doc de arquitetura)
-- ============================================================================
-- Permissivo a campos extras (não rejeita campos legados como min_down_payment: 68000 do Vind).
-- Valida apenas TIPOS e RANGES dos campos conhecidos quando presentes.
-- Permite commercial_rules IS NULL.

ALTER TABLE properties DROP CONSTRAINT IF EXISTS commercial_rules_shape_check;

ALTER TABLE properties
  ADD CONSTRAINT commercial_rules_shape_check CHECK (
    commercial_rules IS NULL
    OR (
      jsonb_typeof(commercial_rules) = 'object'
      AND (NOT (commercial_rules ? 'min_down_payment_pct')
           OR (
             jsonb_typeof(commercial_rules->'min_down_payment_pct') = 'number'
             AND (commercial_rules->>'min_down_payment_pct')::numeric BETWEEN 0 AND 100
           ))
      AND (NOT (commercial_rules ? 'example_down_payment_brl')
           OR commercial_rules->'example_down_payment_brl' = 'null'::jsonb
           OR (
             jsonb_typeof(commercial_rules->'example_down_payment_brl') = 'number'
             AND (commercial_rules->>'example_down_payment_brl')::numeric >= 0
           ))
      AND (NOT (commercial_rules ? 'financing_options')
           OR jsonb_typeof(commercial_rules->'financing_options') = 'array')
      AND (NOT (commercial_rules ? 'identification_keywords')
           OR jsonb_typeof(commercial_rules->'identification_keywords') = 'array')
      AND (NOT (commercial_rules ? 'key_selling_points')
           OR jsonb_typeof(commercial_rules->'key_selling_points') = 'array')
    )
  );

-- ============================================================================
-- 3. COMMENT ON COLUMN — documentação inline para pgAdmin/DBeaver/Studio
-- ============================================================================
COMMENT ON COLUMN properties.commercial_rules IS
  'Sub-schema definido em packages/shared/src/types/commercial-rules.ts. '
  'Campos: requires_down_payment, min_down_payment_pct (0-100), '
  'example_down_payment_brl, down_payment_flexible, financing_options, '
  'mcmv_eligible, key_selling_points, ideal_buyer_profile, '
  'identification_keywords, status_label, notes.';

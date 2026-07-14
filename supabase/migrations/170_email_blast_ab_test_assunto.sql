-- Migration 170: Teste A/B de Assunto no Email Blast
-- Story 80-1 (Epic 18 — extensão): docs/stories/epics/epic-18-ab-test-assunto-email-blast.md
--
-- Adiciona suporte a teste A/B de assunto (subject line) para email_blasts:
-- duas versões de assunto (A/B), divididas 50/50 na audiência (Story 80.3).
-- Decisão de produto: sem coluna de "vencedor" — o sistema só exibe métricas
-- por variante (Story 80.4/80.5), o usuário decide olhando os números.

ALTER TABLE email_blasts
  ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subject_variant_a TEXT,
  ADD COLUMN IF NOT EXISTS subject_variant_b TEXT;

ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS variant TEXT;

ALTER TABLE email_logs
  DROP CONSTRAINT IF EXISTS email_logs_variant_check;

ALTER TABLE email_logs
  ADD CONSTRAINT email_logs_variant_check CHECK (variant IS NULL OR variant IN ('a', 'b'));

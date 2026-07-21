-- Migration 183: Teste A/B de Corpo no Email Blast
-- Story 83-1 (Epic 83 — extensão do Epic 18): docs/stories/epics/epic-83-ab-test-corpo-email-blast.md
--
-- Adiciona suporte a teste A/B de CORPO do email (via seleção de 2 templates
-- já existentes), como alternativa ao teste de assunto já existente (Epic 18).
-- Uma variável por vez: ab_test_variable indica qual está em teste no blast.
-- Decisão de produto: sem coluna de "vencedor" — mesma regra do Epic 18.

ALTER TABLE email_blasts
  ADD COLUMN IF NOT EXISTS ab_test_variable TEXT NOT NULL DEFAULT 'subject',
  ADD COLUMN IF NOT EXISTS body_variant_a_template_id UUID REFERENCES email_templates(id),
  ADD COLUMN IF NOT EXISTS body_variant_a_slug TEXT,
  ADD COLUMN IF NOT EXISTS body_variant_b_template_id UUID REFERENCES email_templates(id),
  ADD COLUMN IF NOT EXISTS body_variant_b_slug TEXT;

ALTER TABLE email_blasts
  DROP CONSTRAINT IF EXISTS email_blasts_ab_test_variable_check;

ALTER TABLE email_blasts
  ADD CONSTRAINT email_blasts_ab_test_variable_check CHECK (ab_test_variable IN ('subject', 'body'));

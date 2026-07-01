-- 134_imobiliarias_engajamento.sql
-- Story 75-97 — Engajamento da imobiliária (Alta/Média/Baixa), definido manualmente pelo gestor.
-- Null = ainda não avaliado.

ALTER TABLE imobiliarias
  ADD COLUMN IF NOT EXISTS engajamento text;

ALTER TABLE imobiliarias
  DROP CONSTRAINT IF EXISTS imobiliarias_engajamento_check;
ALTER TABLE imobiliarias
  ADD CONSTRAINT imobiliarias_engajamento_check
  CHECK (engajamento IS NULL OR engajamento IN ('alta', 'media', 'baixa'));

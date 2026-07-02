-- 151_imobiliarias_engajamento_nota.sql
-- Story 75-108 — Engajamento da imobiliária deixa de ser categórico (alta/media/baixa)
-- e vira NOTA 0–10 (com cores na UI). Null = não avaliado.
-- Mapeamento de dados existentes: alta→9, media→6, baixa→3 (preserva histórico).

ALTER TABLE imobiliarias DROP CONSTRAINT IF EXISTS imobiliarias_engajamento_check;

ALTER TABLE imobiliarias
  ALTER COLUMN engajamento TYPE integer
  USING (CASE engajamento
           WHEN 'alta'  THEN 9
           WHEN 'media' THEN 6
           WHEN 'baixa' THEN 3
           ELSE NULL
         END);

ALTER TABLE imobiliarias
  ADD CONSTRAINT imobiliarias_engajamento_check
  CHECK (engajamento IS NULL OR (engajamento >= 0 AND engajamento <= 10));

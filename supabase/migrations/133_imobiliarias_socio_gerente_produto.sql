-- 133_imobiliarias_socio_gerente_produto.sql
-- Story 75-96 — Novos campos no cadastro de imobiliárias:
--   sócio administrador/proprietário (nome/tel/email), contatos do gerente (tel/email)
--   e tipo(s) de produto que a imobiliária trabalha (múltipla escolha).

ALTER TABLE imobiliarias
  ADD COLUMN IF NOT EXISTS socio_nome       text,
  ADD COLUMN IF NOT EXISTS socio_telefone   text,
  ADD COLUMN IF NOT EXISTS socio_email      text,
  ADD COLUMN IF NOT EXISTS gerente_telefone text,
  ADD COLUMN IF NOT EXISTS gerente_email    text,
  ADD COLUMN IF NOT EXISTS tipos_produto    text[] NOT NULL DEFAULT '{}';

-- Só aceita as keys válidas de produto (subconjunto).
ALTER TABLE imobiliarias
  DROP CONSTRAINT IF EXISTS imobiliarias_tipos_produto_check;
ALTER TABLE imobiliarias
  ADD CONSTRAINT imobiliarias_tipos_produto_check
  CHECK (tipos_produto <@ ARRAY['mcmv', 'medio_padrao', 'medio_alto_padrao', 'alto_padrao']::text[]);

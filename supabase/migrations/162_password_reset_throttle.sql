-- Story 75-139 — Throttle do fluxo público de "esqueci minha senha"
-- Tabela de suporte interno para rate-limiting por e-mail normalizado (lowercase+trim).
-- Acesso EXCLUSIVAMENTE via admin client (service_role): RLS habilitada SEM policies,
-- mesmo padrão de imob_* (Story 75-88) e demais tabelas de suporte interno.
--
-- Nota de design: a coluna `identifier` é genérica (não `email`) para ser
-- forward-compatible — no futuro pode conter IP ou outro identificador de throttle
-- (defesa-em-profundidade), sem exigir nova migration. Ver PO Validation Notes (item B).

CREATE TABLE IF NOT EXISTS password_reset_throttle (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier   TEXT        NOT NULL, -- e-mail normalizado (lowercase+trim)
  requested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_throttle_identifier_time
  ON password_reset_throttle (identifier, requested_at DESC);

-- RLS habilitada, SEM policies — acesso exclusivamente via admin client (service_role).
ALTER TABLE password_reset_throttle ENABLE ROW LEVEL SECURITY;

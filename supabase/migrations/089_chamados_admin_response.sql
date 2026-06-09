-- Migration 089: Resposta do admin e timestamps de resolução
-- Story 53-1

ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS admin_response text,
  ADD COLUMN IF NOT EXISTS responded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at   timestamptz;

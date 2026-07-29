-- 196_brindes_destinatarios_cargo.sql
-- Story 75-227 — Brindes: campo "Cargo" no destinatário (ticket da Samara 28/07).
-- Cargo do colaborador presenteado, hoje improvisado no campo Observação.
-- Texto livre, opcional — o módulo não distingue colaborador × cliente e não há
-- demanda p/ isso; preenche quem faz sentido. RLS herdada (policies são FOR ALL).
--
-- Rollback: ALTER TABLE public.brindes_destinatarios DROP COLUMN IF EXISTS cargo;

ALTER TABLE public.brindes_destinatarios
  ADD COLUMN IF NOT EXISTS cargo text;

COMMENT ON COLUMN public.brindes_destinatarios.cargo IS
  'Cargo do destinatário quando colaborador (ex.: mestre de obras). Texto livre, opcional — Story 75-227.';

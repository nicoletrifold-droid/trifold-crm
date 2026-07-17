-- Story 81-1 (Epic 81) — Agenda HOUSE × IMOB: coluna `team` em appointments.
--
-- Duas equipes independentes compartilham a agenda: HOUSE (corretores/gerente
-- comercial/Nicole) e IMOB (Daiana + imobiliárias parceiras). O conflito de
-- horário passa a valer SÓ dentro da mesma equipe (regra na aplicação:
-- lib/appointments/governance.ts). Default 'house' → todo o histórico e todos
-- os caminhos de criação existentes (Calendly, Nicole, modal) continuam válidos
-- sem backfill.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT 'house';

-- CHECK idempotente (permite re-rodar a migration sem erro).
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_team_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_team_check CHECK (team IN ('house', 'imob'));

COMMENT ON COLUMN public.appointments.team IS
  'Equipe dona do compromisso: house (corretores/gerente/Nicole) ou imob (Daiana/imobiliárias parceiras). Conflito de horário só vale dentro da mesma equipe (Epic 81).';

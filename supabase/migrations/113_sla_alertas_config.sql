-- Story 75-48 — Alerta de SLA de atendimento (corretor + escalonamento p/ gestor).
-- Config no roleta_config + marcadores anti-repetição no lead.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sla_alerta_corretor_em timestamptz,
  ADD COLUMN IF NOT EXISTS sla_alerta_gestor_em   timestamptz;

ALTER TABLE public.roleta_config
  -- kill-switch: começa DESLIGADO; liga após validar o dry-run
  ADD COLUMN IF NOT EXISTS sla_alertas_enabled     boolean NOT NULL DEFAULT false,
  -- minutos (de expediente) até alertar o corretor / escalar pro gestor
  ADD COLUMN IF NOT EXISTS sla_alerta_corretor_min integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sla_alerta_gestor_min   integer NOT NULL DEFAULT 60;

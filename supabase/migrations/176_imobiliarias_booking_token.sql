-- Story 81-4 (Epic 81) — link público de agendamento POR IMOBILIÁRIA.
--
-- `imobiliarias.booking_token`: token do link público /agendar/[token]. UUID não
-- enumerável; NULL = link revogado (página pública recusa). Backfill: toda
-- imobiliária existente ganha token (o gestor pode revogar depois na UI).
--
-- `appointments.imobiliaria_id`: rastreia QUAL parceira marcou a visita (origem
-- real do compromisso do link; created_by permanece 'admin' — decisão da story:
-- não mexer no enum appointment_creator).

ALTER TABLE public.imobiliarias
  ADD COLUMN IF NOT EXISTS booking_token uuid;

UPDATE public.imobiliarias
   SET booking_token = gen_random_uuid()
 WHERE booking_token IS NULL;

-- Único quando presente (NULL = revogado, pode haver vários).
CREATE UNIQUE INDEX IF NOT EXISTS imobiliarias_booking_token_key
  ON public.imobiliarias (booking_token)
  WHERE booking_token IS NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS imobiliaria_id uuid REFERENCES public.imobiliarias(id);

CREATE INDEX IF NOT EXISTS idx_appointments_imobiliaria
  ON public.appointments (imobiliaria_id)
  WHERE imobiliaria_id IS NOT NULL;

COMMENT ON COLUMN public.imobiliarias.booking_token IS
  'Token do link público de agendamento (/agendar/[token]). NULL = link revogado (Story 81-4).';
COMMENT ON COLUMN public.appointments.imobiliaria_id IS
  'Imobiliária parceira que marcou via link público (team=imob, Story 81-4).';

-- Rastreia quando o reporter leu a resposta do admin no chamado.
-- NULL = resposta ainda não vista. Preenchido pelo client ao abrir /dashboard/chamados.
ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS reporter_seen_response_at TIMESTAMPTZ;

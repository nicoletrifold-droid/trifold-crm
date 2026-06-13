-- Rastreia quando o último lembrete foi enviado para esta aprovação pendente.
-- NULL = nunca lembrado. Atualizado pelo cron obras-approval-reminder a cada disparo.
ALTER TABLE public.obra_upload_aprovacoes
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

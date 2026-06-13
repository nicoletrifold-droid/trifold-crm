-- 082_obras_notifications_seen_at
-- Adiciona campo para rastrear quando o admin/supervisor
-- viu as notificações de obras pela última vez.
-- Badge conta só aprovações MAIS NOVAS que este timestamp.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS obras_notifications_seen_at TIMESTAMPTZ;

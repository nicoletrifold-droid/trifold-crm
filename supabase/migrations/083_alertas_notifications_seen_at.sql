-- 083_alertas_notifications_seen_at
-- Rastreia quando o usuário visitou o módulo Alertas pela última vez.
-- Badge conta apenas follow_up_log MAIS NOVOS que este timestamp.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS alertas_notifications_seen_at TIMESTAMPTZ;

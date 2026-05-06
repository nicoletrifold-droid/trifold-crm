-- Story 22.2: Push Notifications
-- Adicionar push_enabled em obra_notificacao_prefs
ALTER TABLE obra_notificacao_prefs
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false;

-- Tabela de subscriptions push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  device_info  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- RLS: cliente gerencia apenas suas próprias subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_manage_self" ON push_subscriptions
  FOR ALL USING (user_id = public.public_user_id());

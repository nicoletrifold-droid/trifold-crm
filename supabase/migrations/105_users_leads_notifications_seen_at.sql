-- Story 75-8 — "pontinho laranja" de novos leads distribuídos ao corretor.
-- Rastreia quando o corretor abriu "Meus Leads" pela última vez.
-- O badge conta lead_distribution_log (status='distributed') MAIS NOVOS que este timestamp.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS leads_notifications_seen_at TIMESTAMPTZ;

-- Semeia os corretores atuais como "já visto" para não exibir um badge enorme
-- com o histórico no primeiro acesso — passam a contar só leads novos a partir de agora.
UPDATE public.users
  SET leads_notifications_seen_at = now()
  WHERE role = 'broker' AND leads_notifications_seen_at IS NULL;

-- Story 75-150 — Notificações Financeiras: log sistêmico de disparos financeiros
-- (boleto emitido / vence hoje / atraso) ao cliente, por canal. Alimenta o extrato
-- em Sistema › Auditoria, dividido por empreendimento. Preparado para captar o
-- e-mail quando o lembrete por e-mail for ligado.

CREATE TABLE IF NOT EXISTS public.financial_notification_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id),
  user_id     uuid REFERENCES public.users(id),
  obra_id     uuid REFERENCES public.obras(id),
  tipo        text NOT NULL CHECK (tipo IN ('novo_boleto','vence_hoje','atraso_5','atraso_15')),
  canal       text NOT NULL CHECK (canal IN ('whatsapp','email','push')),
  status      text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  vencimento  date,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_notif_org_created ON public.financial_notification_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_notif_obra ON public.financial_notification_log (obra_id);

ALTER TABLE public.financial_notification_log ENABLE ROW LEVEL SECURITY;

-- Leitura: admin/supervisor (mesmo padrão das demais auditorias). Escrita é via
-- service role (admin client nos pontos de envio), que ignora RLS.
DROP POLICY IF EXISTS fin_notif_select ON public.financial_notification_log;
CREATE POLICY fin_notif_select ON public.financial_notification_log
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor());

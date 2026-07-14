-- Migration 171 — Story 78-12: resumo mensal automático + alerta de anomalia de gasto.
-- (Renumerada 170→171 no deploy: 170 foi consumida por 170_email_blast_ab_test_assunto.sql / Story 80-1 em origin/main.)
-- Epic 78 — Painel de Saúde & Billing (admin-only).
--
-- Aditiva: 2 colunas novas em platform_services + 2 tabelas novas de dedup. Nenhum ALTER em
-- service_cost_snapshots/service_billing_reminders (contratos de 78-1/78-11 intocados).
-- Idempotente por construção (IF NOT EXISTS + ON CONFLICT). Reexecutar não falha nem duplica (AC12).
--
-- RLS admin-only nas 2 tabelas novas via public.user_role() = 'admin' (mesmo padrão canônico
-- pós-062 usado na migration 164). O service_role usado pelos crons (billing-monthly-summary /
-- billing-cost-anomaly) bypassa RLS por padrão no Supabase, logo escrita/leitura automática
-- funciona sem policy adicional.

-- ============================================================================
-- 1. Config por serviço (aditiva em platform_services)
-- ============================================================================
ALTER TABLE platform_services
  ADD COLUMN IF NOT EXISTS monthly_cost_alert_threshold numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN platform_services.monthly_cost_alert_threshold IS
  'Override OPCIONAL de threshold absoluto (mesma moeda dos snapshots monetários do serviço,
   tipicamente USD) para o alerta de anomalia de gasto (Story 78-12). NULL = sem override;
   o alerta MoM (+50% default) funciona independentemente deste campo — zero cadastro
   manual obrigatório.';
COMMENT ON COLUMN platform_services.cost_alerts_enabled IS
  'Liga/desliga o alerta de anomalia de gasto (Story 78-12) por serviço. DEFAULT true —
   novos serviços já nascem monitorados sem ação do admin.';

-- ============================================================================
-- 2. Dedup de alertas de anomalia (por serviço, 0..N por mês)
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_cost_alerts_sent (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id  uuid        NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE,
  alert_type  text        NOT NULL CHECK (alert_type IN ('cost_anomaly_mom','threshold_absolute')),
  period      text        NOT NULL, -- 'YYYY-MM' (mês corrente em que o alerta disparou, America/Sao_Paulo)
  sent_at     timestamptz NOT NULL DEFAULT now(),
  details     jsonb,      -- valor atual, valor de referência, percentual (observabilidade)
  UNIQUE (service_id, alert_type, period)
);

COMMENT ON TABLE billing_cost_alerts_sent IS
  'Dedup de alertas de anomalia de gasto: no máximo 1 linha por (serviço, tipo de gatilho,
   mês). Story 78-12.';

-- ============================================================================
-- 3. Dedup do resumo mensal (evento global, 1 por mês)
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_monthly_summary_log (
  period   text        PRIMARY KEY, -- 'YYYY-MM' do mês RESUMIDO (mês anterior ao envio)
  sent_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_monthly_summary_log IS
  'Dedup do resumo mensal de gasto: no máximo 1 linha por mês resumido. Story 78-12.';

CREATE INDEX IF NOT EXISTS idx_billing_cost_alerts_sent_period
  ON billing_cost_alerts_sent (period);

-- ============================================================================
-- 4. RLS admin-only (padrão canônico pós-062 — igual à migration 164)
-- ============================================================================
ALTER TABLE billing_cost_alerts_sent    ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_monthly_summary_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only ON billing_cost_alerts_sent;
CREATE POLICY admin_only ON billing_cost_alerts_sent
  FOR ALL
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_only ON billing_monthly_summary_log;
CREATE POLICY admin_only ON billing_monthly_summary_log
  FOR ALL
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');

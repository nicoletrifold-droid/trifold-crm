-- 127_bolsao_estado.sql
-- Story 75-80 (Epic 64) — estado do Bolsão de Leads.
--
-- bolsao_em: marca quando o lead entrou no bolsão (sem dono). NULL = não está no bolsão.
-- bolsao_enabled: kill-switch do rebalanceamento (default OFF — só liga após o épico completo,
-- pois a escalada de 60min do SLA ainda precisa passar a considerar leads no bolsão (Story 75-82)).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS bolsao_em timestamptz;
COMMENT ON COLUMN leads.bolsao_em IS
  'Quando o lead entrou no bolsão (assigned_broker_id NULL, etapa "Aguardando atendimento"). NULL = não está no bolsão. Story 75-80.';

-- Índice parcial p/ listar o pool rapidamente (Story 75-81) e contar (Story 75-82).
CREATE INDEX IF NOT EXISTS idx_leads_bolsao
  ON leads (org_id, bolsao_em)
  WHERE bolsao_em IS NOT NULL;

ALTER TABLE roleta_config ADD COLUMN IF NOT EXISTS bolsao_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN roleta_config.bolsao_enabled IS
  'Kill-switch do rebalanceamento do bolsão (cron bolsao-rebalance). Default OFF. Story 75-80.';

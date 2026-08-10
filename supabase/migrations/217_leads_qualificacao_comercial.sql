-- 217_leads_qualificacao_comercial.sql
-- (Renumerada de 215 → 217 no rebase da 84-1: a main já tinha 215_meta_capi_outbox
--  e 216_clientes_cpf_normalizado quando este PR foi rebaseado.)
-- Story 84-1 (Epic 84) — Qualificação Comercial do lead: campo manual e independente
-- da Temperatura (leads.interest_level) e do qualification_status/qualification_score
-- automáticos (calculados pelo pipeline da Nicole: packages/ai/src/chat/pipeline.ts +
-- packages/ai/src/flows/haiku-enrichment.ts). Ver docs/stories/epics/epic-84-qualificacao-lead.md.

-- ============================================
-- ENUM + COLUNA (mesmo padrão estrutural de interest_level: 001_base_schema.sql)
-- ============================================
CREATE TYPE qualificacao_comercial AS ENUM ('bom', 'regular', 'ruim', 'invalido');

ALTER TABLE leads ADD COLUMN qualificacao_comercial qualificacao_comercial;

CREATE INDEX idx_leads_qualificacao_comercial ON leads(qualificacao_comercial);

-- ============================================
-- PRAZOS CONFIGURÁVEIS POR ORG (padrão roleta_config, 068_roleta_leads.sql)
-- Consumida programaticamente pela Story 84-4 (alertas); sem UI/seed nesta story —
-- mesmo padrão de roleta_config: linha lida via maybeSingle, criada via upsert
-- quando necessário (ver packages/web/src/app/api/roleta/config/route.ts).
-- ============================================
CREATE TABLE qualificacao_comercial_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  prazo_bom_horas integer NOT NULL DEFAULT 24,
  prazo_regular_dias integer NOT NULL DEFAULT 3,
  prazo_ruim_dias integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qualificacao_comercial_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qualificacao_comercial_config_org" ON qualificacao_comercial_config
  USING (org_id = user_org_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON qualificacao_comercial_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

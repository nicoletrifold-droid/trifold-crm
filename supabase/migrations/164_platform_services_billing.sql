-- Story 78-1 — Modelo de Dados & Migration do Painel de Saúde & Billing da Plataforma
-- Epic 78 — Painel de Saúde & Billing (admin-only)
--
-- Fundação de dados para o Painel de Saúde & Billing: catálogo de serviços da
-- plataforma, vencimentos/lembretes e snapshots de custo/uso.
--
-- Características desta migration:
--   * Puramente ADITIVA — cria apenas objetos novos (3 tabelas + índices + triggers +
--     seed). Nenhum ALTER TABLE sobre tabelas pré-existentes do schema (AC9).
--   * Idempotente por construção — CREATE TABLE/INDEX IF NOT EXISTS +
--     INSERT ... ON CONFLICT (slug) DO NOTHING. Reexecutar não duplica nem falha (AC1).
--
-- DECISÃO DE DESIGN — SEM `org_id`:
--   O projeto é multi-tenant (org_id na maioria das tabelas de negócio). Estas 3 tabelas
--   são exceção deliberada: descrevem custos operacionais da PRÓPRIA plataforma Trifold
--   (a conta Anthropic, o time Vercel, etc.), não dado de tenant/cliente. Não existe
--   "serviço Anthropic da org X" — é recurso único compartilhado por toda a instância.
--   Segurança apenas por role = 'admin' (NFR-2), sem isolamento de tenant. Ver Dev Notes
--   da Story 78-1.
--
-- RLS: admin-only via public.user_role() = 'admin'. IMPORTANTE — fonte de verdade do
--   user_role() é a migration 062_users_role_enum_to_text.sql: a função retorna TEXT e o
--   padrão canônico é `public.user_role() = 'admin'` SEM cast `::user_role` (o cast enum
--   do 004_rls_policies.sql está desatualizado — não usar). O service_role usado pelos
--   cron jobs coletores (Stories 78-3..78-7) bypassa RLS por padrão no Supabase, logo
--   nenhuma policy adicional é necessária para a escrita automática.

-- ============================================================================
-- 1. platform_services — catálogo dos serviços da plataforma (AC2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_services (
  id                       uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug                     text        NOT NULL UNIQUE,
  name                     text        NOT NULL,
  category                 text        NOT NULL,
  automation_tier          text        NOT NULL CHECK (automation_tier IN ('forte','media','fraca')),
  has_auto_cost_collection boolean     NOT NULL DEFAULT false,
  billing_url              text        NOT NULL,
  billing_url_confirmed    boolean     NOT NULL DEFAULT true,
  enabled                  boolean     NOT NULL DEFAULT true,
  display_order            integer     NOT NULL DEFAULT 0,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_services IS
  'Catálogo dos serviços/integrações da plataforma Trifold (custo operacional da própria plataforma, NÃO dado de tenant — por isso sem org_id). Story 78-1 / Epic 78.';
COMMENT ON COLUMN platform_services.slug IS
  'Chave estável (UNIQUE) usada pelos coletores para localizar o serviço: anthropic, openai, vercel, whatsapp, supabase, resend, meta_ads.';
COMMENT ON COLUMN platform_services.automation_tier IS
  'Camada de automação da coleta de custo: forte (Anthropic/OpenAI/Vercel), media (WhatsApp/Meta Ads), fraca (Supabase/Resend).';
COMMENT ON COLUMN platform_services.billing_url_confirmed IS
  'false = URL de melhor esforço; o slug de org/time não pôde ser confirmado nesta story (Vercel/Supabase). A UI (78-9) deve sinalizar visualmente quando false. Article IV — No Invention.';

-- ============================================================================
-- 2. service_billing_reminders — vencimentos/lembretes (AC3, AC6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS service_billing_reminders (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id        uuid          NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE,
  due_date          date          NOT NULL,
  expected_amount   numeric(12,2),
  currency          text          NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BRL')),
  billing_cycle     text          NOT NULL CHECK (billing_cycle IN ('monthly','annual','usage')),
  alert_days_before integer       NOT NULL DEFAULT 7 CHECK (alert_days_before >= 0),
  status            text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','alerted','paid','postponed','skipped')),
  paid_at           timestamptz,
  notes             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_billing_reminders IS
  'Vencimentos/lembretes de fatura por serviço. Cadastro manual (CON-1: nenhuma API expõe data de vencimento). Máquina de estados operada pela Story 78-8. Story 78-1 / Epic 78.';
COMMENT ON COLUMN service_billing_reminders.currency IS
  'Moeda de origem (USD/BRL), exibida sem conversão silenciosa (NFR-7).';
COMMENT ON COLUMN service_billing_reminders.status IS
  'pending -> alerted -> paid (ou postponed/skipped). Operada pela Story 78-8 (motor de lembretes).';

-- ============================================================================
-- 3. service_cost_snapshots — snapshots de custo/uso (AC4, AC6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS service_cost_snapshots (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id        uuid          NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE,
  snapshot_date     date          NOT NULL,
  metric            text          NOT NULL,
  value             numeric       NOT NULL,
  currency          text          CHECK (currency IN ('USD','BRL')),
  collection_status text          NOT NULL DEFAULT 'ok' CHECK (collection_status IN ('ok','manual','no_data','error')),
  collected_at      timestamptz   NOT NULL DEFAULT now(),
  raw_response      jsonb,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (service_id, snapshot_date, metric)
);

COMMENT ON TABLE service_cost_snapshots IS
  'Snapshots diários de custo/uso por serviço (granularidade diária — CON-6). Populados pelos coletores das Stories 78-3..78-7 via upsert. Story 78-1 / Epic 78.';
COMMENT ON COLUMN service_cost_snapshots.metric IS
  'Métrica livre por serviço (ex.: cost_usd, tokens_input, tokens_output, requests, egress_bytes, messages_sent). Sem CHECK/enum de propósito: travar agora quebraria os coletores 78-3..78-7 que definem suas próprias métricas.';
COMMENT ON COLUMN service_cost_snapshots.currency IS
  'Nullable — só preenchido quando a metric é monetária; métricas técnicas (requests/tokens) não têm moeda.';
COMMENT ON COLUMN service_cost_snapshots.collection_status IS
  'ok (coleta automática funcionou) / manual (valor inserido manualmente — Supabase/Resend) / no_data (API não retornou — CON-4) / error (falha na coleta — NFR-3).';

-- ============================================================================
-- 4. RLS admin-only nas 3 tabelas (AC5)
--    Padrão pós-062: public.user_role() retorna TEXT, sem cast ::user_role.
-- ============================================================================
ALTER TABLE platform_services        ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_billing_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_cost_snapshots    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only ON platform_services;
CREATE POLICY admin_only ON platform_services
  FOR ALL
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_only ON service_billing_reminders;
CREATE POLICY admin_only ON service_billing_reminders
  FOR ALL
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_only ON service_cost_snapshots;
CREATE POLICY admin_only ON service_cost_snapshots
  FOR ALL
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');

-- ============================================================================
-- 5. Índices de suporte (AC7)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_service_cost_snapshots_service_date
  ON service_cost_snapshots (service_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_service_billing_reminders_status_due
  ON service_billing_reminders (status, due_date);

CREATE INDEX IF NOT EXISTS idx_service_billing_reminders_service
  ON service_billing_reminders (service_id);

-- ============================================================================
-- 6. Triggers updated_at — reusa update_updated_at() (001_base_schema.sql L279)
--    (service_cost_snapshots não tem updated_at — snapshots são imutáveis por linha)
-- ============================================================================
DROP TRIGGER IF EXISTS set_updated_at ON platform_services;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON service_billing_reminders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_billing_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 7. Seed dos 7 serviços em escopo (AC8)
--    Deep-links conforme fornecidos no épico/story. Vercel e Supabase com
--    billing_url_confirmed=false (slug de org/time não confirmável — Article IV,
--    placeholders literais [team] / _). meta_ads com enabled=false (aguardando OQ-2).
-- ============================================================================
INSERT INTO platform_services
  (slug, name, category, automation_tier, has_auto_cost_collection, billing_url, billing_url_confirmed, enabled, display_order, notes)
VALUES
  ('anthropic', 'Anthropic (Claude)', 'ia', 'forte', true,
   'https://console.anthropic.com/settings/billing', true, true, 1,
   'Coletor automático de custo (USD diário) — Story 78-3. Requer Admin key sk-ant-admin01-.'),
  ('openai', 'OpenAI', 'ia', 'forte', true,
   'https://platform.openai.com/settings/organization/billing/overview', true, true, 2,
   'Coletor automático de custo (USD diário) — Story 78-4. Requer Admin/Org key.'),
  ('vercel', 'Vercel', 'hosting', 'forte', true,
   'https://vercel.com/[team]/~/settings/billing', false, true, 3,
   'billing_url_confirmed=false: [team] é placeholder literal, substituir pelo slug real do time Vercel antes de expor na UI (78-9). Coletor — Story 78-5.'),
  ('whatsapp', 'WhatsApp Cloud API (Meta)', 'messaging', 'media', true,
   'https://business.facebook.com/billing_hub/accounts', true, true, 4,
   'WABA cobrado direto pela Meta (OQ-1 resolvida) — custo automático via pricing_analytics. Coletor — Story 78-6.'),
  ('supabase', 'Supabase', 'database', 'fraca', false,
   'https://supabase.com/dashboard/org/_/billing', false, true, 5,
   'billing_url_confirmed=false: _ é placeholder literal, substituir pelo slug real da org Supabase antes de expor na UI (78-9). Sem endpoint de fatura (CON-3) — valor/vencimento manual (78-7).'),
  ('resend', 'Resend', 'email', 'fraca', false,
   'https://resend.com/settings/billing', true, true, 6,
   'Sem endpoint de billing (CON-3) — valor/vencimento manual + uso técnico via webhook/quota (78-7).'),
  ('meta_ads', 'Meta Ads', 'ads', 'media', false,
   'https://business.facebook.com/billing_hub/accounts', false, false, 7,
   'Placeholder desabilitado (enabled=false). Budget de mídia (insights.spend), NÃO conta a pagar (CON-8). Habilitado pela Story 78-10. Confirmar se Ads tem billing separado antes de habilitar.')
ON CONFLICT (slug) DO NOTHING;

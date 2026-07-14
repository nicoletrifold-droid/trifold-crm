-- Story 78-14 — Assinaturas Fixas (backend): modelo de dados.
-- Epic 78 — Painel de Saúde & Billing da Plataforma (admin-only).
--
-- Terceira categoria de custo do épico: ASSINATURA de valor FIXO mensal (Claude Team,
-- Vercel Pro, Supabase Pro), distinta do CUSTO DE USO variável (série temporal diária em
-- service_cost_snapshots, coletores 78-3/78-5/78-6/78-7) e do vencimento manual avulso (78-8).
--
-- DECISÃO DE MODELO (IDS ADAPT, não CREATE) — estender service_billing_reminders, NÃO criar
-- uma tabela platform_subscriptions paralela: uma assinatura fixa é, na essência, um vencimento
-- (valor + ciclo + data de renovação) — exatamente o que a tabela já modela desde a 78-1
-- (migration 164). Estender reusa de graça o motor de alertas com escalonamento (78-11) e a
-- máquina de estados (pending→alerted→paid). Ver Dev Notes da Story 78-14.
--
-- Características (mesmo padrão das migrations 164/169/171 do épico):
--   * Puramente ADITIVA sobre service_billing_reminders (ADD COLUMN IF NOT EXISTS + ALTER
--     COLUMN due_date DROP NOT NULL). Nenhum ALTER em platform_services/service_cost_snapshots
--     além do INSERT do catálogo claude_team (AC2).
--   * Idempotente por construção — reexecutar não falha nem duplica colunas/índice/seed.
--   * RLS admin-only já vigente sobre service_billing_reminders/platform_services (164) cobre
--     as linhas novas — nenhuma policy adicional necessária.

-- ============================================================================
-- 1. Extensão de service_billing_reminders — 6 colunas novas + due_date nullable (AC1)
-- ============================================================================
ALTER TABLE service_billing_reminders
  ADD COLUMN IF NOT EXISTS is_fixed_subscription           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_plan               text,
  ADD COLUMN IF NOT EXISTS subscription_seats              integer,
  ADD COLUMN IF NOT EXISTS value_source                    text
    CHECK (value_source IN ('api_price_table','manual')),
  ADD COLUMN IF NOT EXISTS seats_source                    text
    CHECK (seats_source IN ('api','manual')),
  ADD COLUMN IF NOT EXISTS excluded_from_subscription_total boolean    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_enriched_at                timestamptz;

-- due_date deixa de ser NOT NULL (era NOT NULL desde a 164): uma assinatura fixa pode existir
-- "cadastrada" (seedada) antes de o admin informar a data de renovação real (Story 78-15).
-- Já é idempotente por natureza (DROP NOT NULL sobre coluna já nullable é no-op silencioso).
ALTER TABLE service_billing_reminders
  ALTER COLUMN due_date DROP NOT NULL;

COMMENT ON COLUMN service_billing_reminders.is_fixed_subscription IS
  'true = linha representa uma ASSINATURA de valor FIXO mensal (Claude Team / Vercel Pro / Supabase Pro), distinta de um vencimento manual avulso. Story 78-14.';
COMMENT ON COLUMN service_billing_reminders.subscription_plan IS
  'Rótulo do plano/tier da assinatura (pro/team/...). Auto-preenchido via API (Supabase) ou manual. Story 78-14.';
COMMENT ON COLUMN service_billing_reminders.subscription_seats IS
  'Nº de assentos da assinatura. Origem em seats_source (api|manual). Story 78-14.';
COMMENT ON COLUMN service_billing_reminders.value_source IS
  'Origem de expected_amount: api_price_table (derivado de plano→preço) ou manual. INVARIANTE (AC9): o enriquecedor NUNCA sobrescreve expected_amount quando value_source=''manual''. Story 78-14.';
COMMENT ON COLUMN service_billing_reminders.seats_source IS
  'Origem de subscription_seats: api (contagem de membros) ou manual. INVARIANTE (AC9): o enriquecedor NUNCA sobrescreve subscription_seats quando seats_source=''manual''. Story 78-14.';
COMMENT ON COLUMN service_billing_reminders.excluded_from_subscription_total IS
  'true = a linha NÃO soma no total "Assinaturas Fixas" (AC6) — usado quando o valor já está embutido em outro total coletado automaticamente (hoje: só a Vercel, cuja mensalidade Pro pode já estar no cost_usd agregado pela 78-5 — default seguro true até prova em contrário, AC10). Story 78-14.';
COMMENT ON COLUMN service_billing_reminders.last_enriched_at IS
  'Última execução bem-sucedida do enriquecedor (cron billing-subscription-enrich). Observabilidade. Server-only: nunca aceito cru do cliente. Story 78-14.';

-- ============================================================================
-- 2. No máximo 1 linha "assinatura fixa" por serviço (AC3)
--    Índice parcial UNIQUE: (a) mecanismo de idempotência do seed (ON CONFLICT abaixo)
--    e (b) garantia de que o enriquecedor sempre atualiza no máximo 1 linha por serviço.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_billing_reminders_fixed_subscription_service
  ON service_billing_reminders (service_id)
  WHERE is_fixed_subscription = true;

-- ============================================================================
-- 3. Catálogo novo: claude_team (AC2)
--    Vercel e Supabase REUSAM o service_id já seedado pela 78-1 — nenhum catálogo duplicado.
--    Este slug é DISTINTO de 'anthropic': billing separado (claude.ai vs console.anthropic.com);
--    a Admin API de custo da 78-3 NUNCA cobre claude_team (sem API pública de billing).
--    billing_url de melhor esforço com billing_url_confirmed=false (Article IV — não verificada
--    nesta story contra documentação oficial, mesmo padrão dos placeholders vercel/supabase da 78-1).
-- ============================================================================
INSERT INTO platform_services
  (slug, name, category, automation_tier, has_auto_cost_collection, billing_url, billing_url_confirmed, enabled, display_order, notes)
VALUES
  ('claude_team', 'Claude Team (claude.ai)', 'ia', 'fraca', false,
   'https://claude.ai/settings/billing', false, true, 8,
   'DISTINTO de anthropic: billing separado (claude.ai, não console.anthropic.com). Sem API pública de billing/uso — plano/assentos/valor/data 100% manuais (Story 78-14/78-15). billing_url_confirmed=false: URL de melhor esforço, não verificada contra doc oficial (Article IV).')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 4. Seed de 3 linhas "assinatura fixa" (AC4) — valores manuais nulos até 78-15.
--    ON CONFLICT no índice parcial (service_id WHERE is_fixed_subscription) = idempotente.
--    service_id resolvido por subquery via slug (não hardcodar UUID).
--    - claude_team: plan='team', excluded=false (sem API — cadastro 100% manual em 78-15).
--    - vercel:      plan='pro',  excluded=TRUE (default seguro contra dupla contagem — a
--                   mensalidade Pro pode já estar no cost_usd agregado pela 78-5; só vira
--                   false com evidência real, AC10 / @devops no deploy).
--    - supabase:    plan=NULL (preenchido pelo enriquecedor, AC7 — não presumido no seed),
--                   excluded=false (o coletor 78-7 sempre grava currency=null, nunca há custo
--                   monetário automático do Supabase → sem risco de dupla contagem).
-- ============================================================================
INSERT INTO service_billing_reminders
  (service_id, due_date, expected_amount, currency, billing_cycle, is_fixed_subscription,
   subscription_plan, subscription_seats, value_source, seats_source, excluded_from_subscription_total)
VALUES
  ((SELECT id FROM platform_services WHERE slug = 'claude_team'),
   NULL, NULL, 'USD', 'monthly', true, 'team', NULL, NULL, NULL, false),
  ((SELECT id FROM platform_services WHERE slug = 'vercel'),
   NULL, NULL, 'USD', 'monthly', true, 'pro', NULL, NULL, NULL, true),
  ((SELECT id FROM platform_services WHERE slug = 'supabase'),
   NULL, NULL, 'USD', 'monthly', true, NULL, NULL, NULL, NULL, false)
ON CONFLICT (service_id) WHERE is_fixed_subscription = true DO NOTHING;

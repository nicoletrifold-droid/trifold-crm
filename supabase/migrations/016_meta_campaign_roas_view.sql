-- 016_meta_campaign_roas_view.sql
-- Story 16.10 — ROAS Calculator Imobiliário
--
-- Cria a view `public.meta_campaign_roas` que agrega gastos de mídia
-- (meta_insights_daily) com conversões reais no CRM (leads + unit_sales)
-- por campanha Meta Ads, expondo total_spend, leads_in_crm, sales_count,
-- total_revenue, roas e cpl_real por (org_id, meta_campaign_id).
--
-- Consumida por: GET /api/meta-ads/campaigns/[campaign_id]/route.ts (Story 16.9)
-- Plan doc: docs/approved-plans/migration-016_meta_campaign_roas_view.md
-- Depends on: 015_meta_marketing_api.sql, 007_unit_sales.sql, 001_base_schema.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HISTÓRICO DE CORREÇÕES
--
-- v1.0 (2026-04-27): implementação inicial com LEFT JOIN encadeado de 4 tabelas.
--                    REJEITADA pelo @qa — bug crítico CORR-001 (fan-out
--                    multiplicativo). Cada lead × cada dia × cada venda inflava
--                    SUM(spend), SUM(leads), SUM(sale_price) por fator (M × N × K).
--                    Em uma campanha com 30 dias, 5 leads e 2 vendas, total_spend
--                    saía 5× maior, total_revenue 30× maior, roas 6× errado.
--                    COUNT(DISTINCT) deduplicava IDs, mas SUM não tem variante
--                    equivalente nessa topologia.
--
-- v1.1 (2026-04-27): refactor para CTEs por dimensão (este arquivo).
--                    Cada CTE calcula 1 linha por campanha — agregações
--                    independentes por tabela-fonte são feitas ANTES do JOIN
--                    final. O JOIN final apenas combina totais já sumarizados,
--                    1:1 com mc.id, eliminando completamente o fan-out.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Notas de schema confirmado:
--   - unit_sales.sale_price (não sale_value) — migration 007
--   - leads.metadata NÃO existe — branch removido vs. proposta original do epic
--   - lead_source enum inclui 'meta_ads' e 'whatsapp_click_to_ad' — migration 001
--   - kanban_stages.type usa enum stage_type com valor 'fechado' — migration 001
--   - meta_insights_daily.entity_id é TEXT e contém meta_campaign_id quando level='campaign'
--
-- RLS: view simples (sem SECURITY DEFINER). RLS das tabelas base é aplicada
-- automaticamente. Cliente filtra .eq("org_id", appUser.org_id).
--
-- Idempotência: DROP IF EXISTS + CREATE OR REPLACE permite reaplicação segura.

DROP VIEW IF EXISTS public.meta_campaign_roas;

CREATE OR REPLACE VIEW public.meta_campaign_roas AS
WITH
  -- ───────────────────────────────────────────────────────────────────────────
  -- CTE 1: spend_per_campaign
  --
  -- Soma os gastos de mídia por (org_id, entity_id) usando APENAS a tabela
  -- meta_insights_daily filtrada por level='campaign'. Nenhum JOIN aqui — a
  -- agregação acontece sobre 1 única tabela, então cada (org_id, entity_id)
  -- produz EXATAMENTE 1 linha. Sem possibilidade de fan-out.
  --
  -- Campos:
  --   total_spend       — Σ spend (BRL, NUMERIC(12,2))
  --   total_leads_meta  — Σ leads reportados pela Meta (não confundir com
  --                       leads_in_crm, que vem da tabela `leads`)
  --
  -- Junção posterior: spc.entity_id = mc.meta_campaign_id AND spc.org_id = mc.org_id
  -- ───────────────────────────────────────────────────────────────────────────
  spend_per_campaign AS (
    SELECT
      org_id,
      entity_id                              AS meta_campaign_id,
      COALESCE(SUM(spend), 0)::numeric(12,2) AS total_spend,
      COALESCE(SUM(leads), 0)::bigint        AS total_leads_meta
    FROM public.meta_insights_daily
    WHERE level = 'campaign'
    GROUP BY org_id, entity_id
  ),

  -- ───────────────────────────────────────────────────────────────────────────
  -- CTE 2: leads_per_campaign
  --
  -- Conta leads CRM (DISTINCT) associados a cada campanha via UTM. O JOIN
  -- envolve apenas 2 tabelas (meta_campaigns × leads), que é uma cardinalidade
  -- 1:N — produz N linhas por campanha mas o COUNT(DISTINCT l.id) deduplica
  -- corretamente. GROUP BY mc.id garante 1 linha por campanha na saída.
  --
  -- Filtros:
  --   - mesmo org (l.org_id = mc.org_id) — performance + segurança
  --   - apenas leads de Meta (source IN ('meta_ads', 'whatsapp_click_to_ad'))
  --   - join via UTM (l.utm_campaign = mc.name) — chave principal de associação
  --
  -- LEFT JOIN garante que campanhas sem leads ainda apareçam com count=0.
  --
  -- Junção posterior: lpc.mc_id = mc.id (chave única, sem fan-out)
  -- ───────────────────────────────────────────────────────────────────────────
  leads_per_campaign AS (
    SELECT
      mc.id                        AS mc_id,
      mc.org_id,
      mc.meta_campaign_id,
      COUNT(DISTINCT l.id)::bigint AS leads_in_crm
    FROM public.meta_campaigns mc
    LEFT JOIN public.leads l
      ON l.org_id       = mc.org_id
      AND l.source       IN ('meta_ads', 'whatsapp_click_to_ad')
      AND l.utm_campaign = mc.name
    GROUP BY mc.id, mc.org_id, mc.meta_campaign_id
  ),

  -- ───────────────────────────────────────────────────────────────────────────
  -- CTE 3: sales_per_campaign
  --
  -- Soma a receita realizada e conta vendas por campanha. Usa INNER JOINs
  -- (não LEFT) porque receita só existe quando há lead → stage 'fechado' →
  -- venda. Campanhas sem vendas não aparecem nesta CTE — o LEFT JOIN do
  -- SELECT final cobre o caso (COALESCE retorna 0).
  --
  -- Pipeline: meta_campaigns → leads → kanban_stages (filtra 'fechado') → unit_sales
  --
  -- O COUNT(DISTINCT us.id) deduplica IDs em qualquer cardinalidade
  -- intermediária. SUM(us.sale_price) é seguro porque cada (us.id) aparece
  -- no máximo 1 vez por (mc.id) — um unit_sale tem exatamente 1 lead, e a
  -- cadeia leads→stages→sales não introduz duplicação de unit_sales.
  --
  -- Filtros:
  --   - ks.type = 'fechado' — apenas leads em stage final geram receita
  --   - us.org_id = mc.org_id — guard de cross-org no JOIN final
  --
  -- Junção posterior: salc.mc_id = mc.id (chave única, sem fan-out)
  -- ───────────────────────────────────────────────────────────────────────────
  sales_per_campaign AS (
    SELECT
      mc.id                                          AS mc_id,
      COUNT(DISTINCT us.id)::bigint                  AS sales_count,
      COALESCE(SUM(us.sale_price), 0)::numeric(12,2) AS total_revenue
    FROM public.meta_campaigns mc
    JOIN public.leads l
      ON l.org_id       = mc.org_id
      AND l.source       IN ('meta_ads', 'whatsapp_click_to_ad')
      AND l.utm_campaign = mc.name
    JOIN public.kanban_stages ks
      ON ks.id   = l.stage_id
      AND ks.type = 'fechado'
    JOIN public.unit_sales us
      ON us.lead_id = l.id
      AND us.org_id = mc.org_id
    GROUP BY mc.id
  )

-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT FINAL
--
-- Cada CTE produz no máximo 1 linha por campanha. Os LEFT JOINs abaixo apenas
-- combinam totais já sumarizados — não há fan-out possível, pois nenhum lado
-- do JOIN tem cardinalidade > 1 para a mesma (mc_id) ou (org_id, meta_campaign_id).
--
-- Worked example (campanha X com 30 dias × R$3.000, 5 leads, 2 vendas × R$500.000):
--   spend_per_campaign[X]: 1 linha — total_spend = R$3.000   ✓ (sem multiplicação)
--   leads_per_campaign[X]: 1 linha — leads_in_crm = 5         ✓ (DISTINCT correto)
--   sales_per_campaign[X]: 1 linha — sales_count = 2,
--                                    total_revenue = R$1.000.000 ✓ (sem multiplicação)
--   SELECT final[X]:       1 linha — roas = 333.33,
--                                    cpl_real = R$600         ✓ (matemática correta)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  mc.org_id,
  mc.meta_campaign_id,
  mc.name AS campaign_name,

  -- Gastos de mídia (sempre 0 quando não há insights)
  COALESCE(spc.total_spend, 0)::numeric(12,2)        AS total_spend,

  -- Leads reportados pela Meta API (não CRM)
  COALESCE(spc.total_leads_meta, 0)::bigint          AS total_leads_meta,

  -- Conversões reais no CRM (leads associados via UTM)
  COALESCE(lpc.leads_in_crm, 0)::bigint              AS leads_in_crm,

  -- Vendas vinculadas a leads em stage 'fechado'
  COALESCE(salc.sales_count, 0)::bigint              AS sales_count,

  -- Receita realizada (apenas leads 'fechado' contribuem — filtro está na CTE)
  COALESCE(salc.total_revenue, 0)::numeric(12,2)     AS total_revenue,

  -- ROAS: NULL quando spend = 0 (evita divisão por zero)
  CASE
    WHEN COALESCE(spc.total_spend, 0) > 0
    THEN (COALESCE(salc.total_revenue, 0) / spc.total_spend)::numeric(10,4)
    ELSE NULL
  END                                                AS roas,

  -- Custo por lead REAL: NULL quando não há leads no CRM
  CASE
    WHEN COALESCE(lpc.leads_in_crm, 0) > 0
    THEN (COALESCE(spc.total_spend, 0) / lpc.leads_in_crm)::numeric(12,2)
    ELSE NULL
  END                                                AS cpl_real

FROM public.meta_campaigns mc
LEFT JOIN spend_per_campaign spc
  ON spc.org_id           = mc.org_id
  AND spc.meta_campaign_id = mc.meta_campaign_id
LEFT JOIN leads_per_campaign lpc
  ON lpc.mc_id = mc.id
LEFT JOIN sales_per_campaign salc
  ON salc.mc_id = mc.id;

COMMENT ON VIEW public.meta_campaign_roas IS
  'ROAS imobiliário por campanha Meta Ads. Agrega meta_insights_daily (gastos), '
  'leads (conversões CRM via UTM), unit_sales (receita realizada). '
  'Story 16.10 v1.1 — refactor CTEs por dimensão (fix CORR-001 fan-out). '
  'Consumida por /api/meta-ads/campaigns/[campaign_id].';

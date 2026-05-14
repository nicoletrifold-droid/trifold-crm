-- 035_materialize_meta_campaign_roas_remote_only.sql
-- Remote version: 035
-- Applied via Supabase Management API (DROP VIEW + CREATE MATERIALIZED VIEW + CREATE UNIQUE INDEX).
-- DROP VIEW requires non-transactional context for clean execution.
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.
-- Downtime autorizado: <30s (lead Gabriel, 2026-05-14). Nicole AI online durante janela.
-- See: supabase/migrations/README.md — padrão _remote_only.sql
--
-- Story: 29.6 (Epic 29 — Database Performance Blitz)
-- Date applied: 2026-05-14
-- Reason: meta_campaign_roas era VIEW simples com 3 CTEs agregando 4 tabelas
--         (meta_campaigns, meta_insights_daily, leads, kanban_stages, unit_sales).
--         Cada hit no dashboard recomputava plan complexo de 2-5s.
--         Materializar + REFRESH CONCURRENTLY (Story 29.7 via pg_cron a cada 30 min)
--         leva latência a <500ms. Trade-off: dados até 30 min stale, mas dashboard
--         ROAS responde imediato — aceito pelo lead.
--
-- Spike confirmou (2026-05-14):
--   - relkind='v' atual (view simples)
--   - 1 consumidor único: packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts:370
--   - graceful fallback no handler (.maybeSingle() → erro vira roas_summary=null)
--   - zero views dependentes (CASCADE seguro)
--   - volume zero atual (0 campaigns, 0 insights, 0 roas rows) → refresh <1s
--   - downtime estimado: <5s

-- Statement 1: DROP VIEW existente (CASCADE seguro — zero views dependentes confirmado no spike)
DROP VIEW IF EXISTS public.meta_campaign_roas CASCADE;

-- Statement 2: CREATE MATERIALIZED VIEW (WITH DATA = popula imediatamente no CREATE)
-- SQL copiado EXATAMENTE da migration 016_meta_campaign_roas_view.sql para preservar
-- lógica idêntica (v1.1 post fix CORR-001 fan-out multiplicativo).
CREATE MATERIALIZED VIEW public.meta_campaign_roas AS
WITH
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
SELECT
  mc.org_id,
  mc.meta_campaign_id,
  mc.name AS campaign_name,
  COALESCE(spc.total_spend, 0)::numeric(12,2)        AS total_spend,
  COALESCE(spc.total_leads_meta, 0)::bigint          AS total_leads_meta,
  COALESCE(lpc.leads_in_crm, 0)::bigint              AS leads_in_crm,
  COALESCE(salc.sales_count, 0)::bigint              AS sales_count,
  COALESCE(salc.total_revenue, 0)::numeric(12,2)     AS total_revenue,
  CASE
    WHEN COALESCE(spc.total_spend, 0) > 0
    THEN (COALESCE(salc.total_revenue, 0) / spc.total_spend)::numeric(10,4)
    ELSE NULL
  END                                                AS roas,
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
  ON salc.mc_id = mc.id
WITH DATA;

-- Statement 3: UNIQUE INDEX — obrigatório para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_meta_campaign_roas_pk
  ON public.meta_campaign_roas(org_id, meta_campaign_id);

-- ROLLBACK PLAN (executar manualmente via Studio SQL Editor ou Management API se necessário):
-- DROP MATERIALIZED VIEW IF EXISTS public.meta_campaign_roas;
-- CREATE OR REPLACE VIEW public.meta_campaign_roas AS <SQL idêntico de 016_meta_campaign_roas_view.sql>;
-- COMMENT ON VIEW public.meta_campaign_roas IS 'ROAS imobiliário por campanha Meta Ads. ...';

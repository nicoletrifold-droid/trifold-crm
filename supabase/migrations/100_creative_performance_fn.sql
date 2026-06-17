-- 100_creative_performance_fn.sql
-- Story 52-6 — Contexto de Performance por Criativo no Agente de Tráfego.
--
-- Função table-valued SECURITY INVOKER: retorna performance agregada por criativo
-- (nível 'ad') para a org do caller, acessível apenas para admin/supervisor/
-- gerente-comercial (via public.is_admin_or_supervisor(), migration 084).
--
-- Join: meta_insights_daily (level='ad') JOIN meta_ads ON entity_id = meta_ad_id.
-- Janela de tempo configurável via p_days (default: 30 dias).
--
-- Diferença vs. Epic 52-1 (pipeline CRM admin-only):
--   - Acesso ampliado: is_admin_or_supervisor() em vez de user_role()='admin'.
--   - Dados agregados anônimos (spend, CTR, CPL, rankings) — sem PII de lead.
--   - Sem log_pii_access (não há PII neste fluxo).
--
-- SECURITY INVOKER garante que user_org_id() e is_admin_or_supervisor() avaliem
-- com o JWT do caller (defesa em profundidade: herda RLS das tabelas-base).
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.creative_performance(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  meta_ad_id              TEXT,
  ad_name                 TEXT,
  adset_id                UUID,
  status                  TEXT,
  creative                JSONB,
  total_spend             NUMERIC,
  total_impressions       BIGINT,
  total_clicks            BIGINT,
  avg_ctr                 NUMERIC,
  avg_cpc                 NUMERIC,
  avg_cpm                 NUMERIC,
  total_leads             BIGINT,
  avg_cost_per_lead       NUMERIC,
  quality_ranking         TEXT,
  engagement_rate_ranking TEXT,
  conversion_rate_ranking TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    a.meta_ad_id,
    a.name                              AS ad_name,
    a.adset_id,
    a.status,
    a.creative,
    SUM(i.spend)                        AS total_spend,
    SUM(i.impressions)                  AS total_impressions,
    SUM(i.clicks)                       AS total_clicks,
    AVG(i.ctr)                          AS avg_ctr,
    AVG(i.cpc)                          AS avg_cpc,
    AVG(i.cpm)                          AS avg_cpm,
    SUM(i.leads)                        AS total_leads,
    AVG(i.cost_per_lead)                AS avg_cost_per_lead,
    -- Rankings: valor mais recente do criativo no período (última data = mais
    -- relevante). Subqueries correlacionadas; aceitável para volumes típicos de
    -- criativos por org (dezenas). Otimizar com DISTINCT ON/window se necessário.
    (
      SELECT i2.quality_ranking
      FROM public.meta_insights_daily i2
      WHERE i2.entity_id = a.meta_ad_id
        AND i2.org_id    = a.org_id
        AND i2.level     = 'ad'
        AND i2.date      >= (CURRENT_DATE - p_days)
      ORDER BY i2.date DESC
      LIMIT 1
    )                                   AS quality_ranking,
    (
      SELECT i2.engagement_rate_ranking
      FROM public.meta_insights_daily i2
      WHERE i2.entity_id = a.meta_ad_id
        AND i2.org_id    = a.org_id
        AND i2.level     = 'ad'
        AND i2.date      >= (CURRENT_DATE - p_days)
      ORDER BY i2.date DESC
      LIMIT 1
    )                                   AS engagement_rate_ranking,
    (
      SELECT i2.conversion_rate_ranking
      FROM public.meta_insights_daily i2
      WHERE i2.entity_id = a.meta_ad_id
        AND i2.org_id    = a.org_id
        AND i2.level     = 'ad'
        AND i2.date      >= (CURRENT_DATE - p_days)
      ORDER BY i2.date DESC
      LIMIT 1
    )                                   AS conversion_rate_ranking
  FROM   public.meta_ads a
  JOIN   public.meta_insights_daily i
         ON  i.entity_id = a.meta_ad_id
         AND i.org_id    = a.org_id
         AND i.level     = 'ad'
         AND i.date      >= (CURRENT_DATE - p_days)
  WHERE  a.org_id = public.user_org_id()
    AND  public.is_admin_or_supervisor()
  GROUP BY
    a.meta_ad_id, a.name, a.adset_id, a.status, a.creative, a.org_id
  ORDER BY total_leads DESC NULLS LAST
$$;

-- GRANTS — apenas EXECUTE para authenticated. Sem anon, sem PUBLIC.
-- Supabase concede GRANT ALL por padrão a authenticated/anon em objetos do
-- schema public; REVOKE explícito garante que somente authenticated execute.
-- REVOKE/GRANT são idempotentes — seguro re-aplicar.
REVOKE ALL ON FUNCTION public.creative_performance(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creative_performance(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.creative_performance(INTEGER) IS
  'Epic52 52-6: performance agregada por criativo (meta_insights_daily level=ad JOIN meta_ads). Acesso admin/supervisor/gerente-comercial via is_admin_or_supervisor(). Janela p_days (default 30). SECURITY INVOKER, read-only, sem PII.';

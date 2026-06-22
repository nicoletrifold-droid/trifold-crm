-- migration: 104_agent_daterange_rpcs.sql
-- Story 52-8: overloads DATE,DATE para pipeline_funnel_by_campaign e creative_performance.
-- As assinaturas INTEGER DEFAULT 30 das migrations 096 e 101 permanecem intactas.

-- ── pipeline_funnel_by_campaign(DATE, DATE) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  org_id            UUID,
  utm_source        VARCHAR(255),
  utm_campaign      VARCHAR(255),
  utm_medium        VARCHAR(255),
  total_leads       BIGINT,
  leads_qualificado BIGINT,
  leads_agendado    BIGINT,
  leads_visitou     BIGINT,
  leads_proposta    BIGINT,
  leads_fechado     BIGINT,
  total_spend       NUMERIC,
  cpl_real_visitou  NUMERIC,
  cpl_real_fechado  NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
WITH lead_stage AS (
  SELECT
    l.org_id,
    l.utm_source,
    l.utm_campaign,
    l.utm_medium,
    l.id          AS lead_id,
    ks.position   AS stage_position,
    ks.type       AS stage_type
  FROM public.leads l
  LEFT JOIN public.kanban_stages ks ON ks.id = l.stage_id
  WHERE l.is_active = true
),
type_thresholds AS (
  SELECT org_id, type, MIN(position) AS min_position
  FROM public.kanban_stages
  GROUP BY org_id, type
),
funnel AS (
  SELECT
    ls.org_id,
    ls.utm_source,
    ls.utm_campaign,
    ls.utm_medium,
    COUNT(*)::BIGINT AS total_leads,
    COUNT(*) FILTER (WHERE ls.stage_position >= tq.min_position)::BIGINT AS leads_qualificado,
    COUNT(*) FILTER (WHERE ls.stage_position >= ta.min_position)::BIGINT AS leads_agendado,
    COUNT(*) FILTER (WHERE ls.stage_position >= tv.min_position)::BIGINT AS leads_visitou,
    COUNT(*) FILTER (WHERE ls.stage_position >= tp.min_position)::BIGINT AS leads_proposta,
    COUNT(*) FILTER (WHERE ls.stage_type = 'fechado')::BIGINT            AS leads_fechado
  FROM lead_stage ls
  LEFT JOIN type_thresholds tq ON tq.org_id = ls.org_id AND tq.type = 'qualificado'
  LEFT JOIN type_thresholds ta ON ta.org_id = ls.org_id AND ta.type = 'agendado'
  LEFT JOIN type_thresholds tv ON tv.org_id = ls.org_id AND tv.type = 'visitou'
  LEFT JOIN type_thresholds tp ON tp.org_id = ls.org_id AND tp.type = 'proposta'
  GROUP BY ls.org_id, ls.utm_source, ls.utm_campaign, ls.utm_medium
),
campaign_spend AS (
  SELECT
    mc.org_id,
    lower(trim(mc.name)) AS campaign_name_norm,
    SUM(mid.spend)::NUMERIC AS total_spend
  FROM public.meta_campaigns mc
  JOIN public.meta_insights_daily mid
    ON  mid.org_id    = mc.org_id
    AND mid.level     = 'campaign'
    AND mid.entity_id = mc.meta_campaign_id
    AND mid.date      >= p_start_date
    AND mid.date      <= p_end_date
  WHERE mc.name IS NOT NULL
  GROUP BY mc.org_id, lower(trim(mc.name))
)
SELECT
  f.org_id,
  f.utm_source,
  f.utm_campaign,
  f.utm_medium,
  f.total_leads,
  f.leads_qualificado,
  f.leads_agendado,
  f.leads_visitou,
  f.leads_proposta,
  f.leads_fechado,
  cs.total_spend,
  (cs.total_spend / NULLIF(f.leads_visitou, 0))::NUMERIC AS cpl_real_visitou,
  (cs.total_spend / NULLIF(f.leads_fechado, 0))::NUMERIC AS cpl_real_fechado
FROM funnel f
LEFT JOIN campaign_spend cs
  ON  cs.org_id = f.org_id
  AND cs.campaign_name_norm = lower(trim(f.utm_campaign))
WHERE public.user_role() = 'admin'
  AND f.org_id = public.user_org_id();
$$;

REVOKE ALL ON FUNCTION public.pipeline_funnel_by_campaign(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pipeline_funnel_by_campaign(DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.pipeline_funnel_by_campaign(DATE, DATE) IS
  'Epic52 Story 52-8: overload com intervalo absoluto. campaign_spend filtra mid.date BETWEEN p_start_date AND p_end_date. Funil de leads sem filtro de data (is_active=true).';

-- ── creative_performance(DATE, DATE) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.creative_performance(
  p_start_date DATE,
  p_end_date   DATE
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
  conversion_rate_ranking TEXT,
  crm_leads_total         BIGINT,
  crm_leads_agendado      BIGINT,
  crm_leads_visitou       BIGINT,
  crm_leads_proposta      BIGINT,
  crm_leads_fechado       BIGINT
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
    (
      SELECT i2.quality_ranking
      FROM public.meta_insights_daily i2
      WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id AND i2.level = 'ad'
        AND i2.date >= p_start_date AND i2.date <= p_end_date
      ORDER BY i2.date DESC LIMIT 1
    )                                   AS quality_ranking,
    (
      SELECT i2.engagement_rate_ranking
      FROM public.meta_insights_daily i2
      WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id AND i2.level = 'ad'
        AND i2.date >= p_start_date AND i2.date <= p_end_date
      ORDER BY i2.date DESC LIMIT 1
    )                                   AS engagement_rate_ranking,
    (
      SELECT i2.conversion_rate_ranking
      FROM public.meta_insights_daily i2
      WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id AND i2.level = 'ad'
        AND i2.date >= p_start_date AND i2.date <= p_end_date
      ORDER BY i2.date DESC LIMIT 1
    )                                   AS conversion_rate_ranking,
    COUNT(DISTINCT l.id)::BIGINT                                          AS crm_leads_total,
    COUNT(DISTINCT CASE WHEN ks.type = 'agendado' THEN l.id END)::BIGINT  AS crm_leads_agendado,
    COUNT(DISTINCT CASE WHEN ks.type = 'visitou'  THEN l.id END)::BIGINT  AS crm_leads_visitou,
    COUNT(DISTINCT CASE WHEN ks.type = 'proposta' THEN l.id END)::BIGINT  AS crm_leads_proposta,
    COUNT(DISTINCT CASE WHEN ks.type = 'fechado'  THEN l.id END)::BIGINT  AS crm_leads_fechado
  FROM   public.meta_ads a
  JOIN   public.meta_insights_daily i
         ON  i.entity_id = a.meta_ad_id
         AND i.org_id    = a.org_id
         AND i.level     = 'ad'
         AND i.date      >= p_start_date
         AND i.date      <= p_end_date
  LEFT JOIN public.leads l
         ON  (l.metadata->>'ad_id') = a.meta_ad_id AND l.org_id = a.org_id
  LEFT JOIN public.kanban_stages ks ON ks.id = l.stage_id
  WHERE  a.org_id = public.user_org_id()
    AND  public.is_admin_or_supervisor()
  GROUP BY a.meta_ad_id, a.name, a.adset_id, a.status, a.creative, a.org_id
  ORDER BY crm_leads_visitou DESC NULLS LAST, total_leads DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.creative_performance(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.creative_performance(DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.creative_performance(DATE, DATE) IS
  'Epic52 Story 52-8: overload com intervalo absoluto. Filtra meta_insights_daily.date BETWEEN p_start_date AND p_end_date.';

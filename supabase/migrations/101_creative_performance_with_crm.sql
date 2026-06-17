-- 101_creative_performance_with_crm.sql
-- Extensão da função public.creative_performance — cruza performance de mídia
-- por criativo (nível 'ad') com o funil do CRM.
--
-- Motivação: a versão da migration 100 retornava apenas métricas de Meta Ads por
-- criativo. O agente de tráfego não conseguia responder "quais criativos geraram
-- mais visitas ao imóvel" porque não havia ligação com os stages do CRM.
--
-- Ligação verificada em produção:
--   - leads.metadata->>'ad_id' = meta_ads.meta_ad_id (98 leads com ad_id no metadata)
--   - leads.stage_id -> kanban_stages.id -> kanban_stages.type
--   - kanban_stages.type: 'novo','agendado','visitou','proposta','fechado',
--     'represamento','perdido'
--
-- Mantém todas as garantias da migration 100: SECURITY INVOKER, STABLE,
-- acesso admin/supervisor/gerente-comercial via is_admin_or_supervisor(),
-- dados agregados anônimos (sem PII de lead — apenas contagens por stage),
-- sem log_pii_access. Idempotente: CREATE OR REPLACE.
--
-- Os joins com leads/kanban_stages são LEFT JOIN: criativos sem leads vinculados
-- continuam aparecendo (com contagens CRM = 0). org_id está pareado no join de
-- leads (l.org_id = a.org_id) para não vazar contagens entre orgs — defesa em
-- profundidade além da RLS herdada via SECURITY INVOKER.

-- A migration 100 criou creative_performance(integer) com menos colunas OUT.
-- CREATE OR REPLACE não pode alterar o tipo de retorno (Postgres 42P13), então
-- dropamos a versão anterior antes de recriar. IF EXISTS mantém idempotência.
DROP FUNCTION IF EXISTS public.creative_performance(INTEGER);

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
    )                                   AS conversion_rate_ranking,
    -- Funil CRM por criativo: leads vinculados via metadata->>'ad_id' e seu
    -- stage atual. COUNT(DISTINCT l.id) evita dupla contagem por causa do fan-out
    -- do JOIN com meta_insights_daily (uma linha por dia).
    COUNT(DISTINCT l.id)::BIGINT                                         AS crm_leads_total,
    COUNT(DISTINCT CASE WHEN ks.type = 'agendado' THEN l.id END)::BIGINT AS crm_leads_agendado,
    COUNT(DISTINCT CASE WHEN ks.type = 'visitou'  THEN l.id END)::BIGINT AS crm_leads_visitou,
    COUNT(DISTINCT CASE WHEN ks.type = 'proposta' THEN l.id END)::BIGINT AS crm_leads_proposta,
    COUNT(DISTINCT CASE WHEN ks.type = 'fechado'  THEN l.id END)::BIGINT AS crm_leads_fechado
  FROM   public.meta_ads a
  JOIN   public.meta_insights_daily i
         ON  i.entity_id = a.meta_ad_id
         AND i.org_id    = a.org_id
         AND i.level     = 'ad'
         AND i.date      >= (CURRENT_DATE - p_days)
  LEFT JOIN public.leads l
         ON  (l.metadata->>'ad_id') = a.meta_ad_id
         AND l.org_id = a.org_id
  LEFT JOIN public.kanban_stages ks
         ON  ks.id = l.stage_id
  WHERE  a.org_id = public.user_org_id()
    AND  public.is_admin_or_supervisor()
  GROUP BY
    a.meta_ad_id, a.name, a.adset_id, a.status, a.creative, a.org_id
  ORDER BY crm_leads_visitou DESC NULLS LAST, total_leads DESC NULLS LAST
$$;

-- GRANTS — apenas EXECUTE para authenticated. Sem anon, sem PUBLIC.
-- Supabase concede GRANT ALL por padrão a authenticated/anon em objetos do
-- schema public; REVOKE explícito garante que somente authenticated execute.
-- REVOKE/GRANT são idempotentes — seguro re-aplicar.
REVOKE ALL ON FUNCTION public.creative_performance(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creative_performance(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.creative_performance(INTEGER) IS
  'Epic52: performance agregada por criativo (meta_insights_daily level=ad JOIN meta_ads) cruzada com funil CRM (leads.metadata->>ad_id -> kanban_stages.type). Retorna contagens por stage (agendado/visitou/proposta/fechado). Acesso admin/supervisor/gerente-comercial via is_admin_or_supervisor(). Janela p_days (default 30). SECURITY INVOKER, read-only, sem PII.';

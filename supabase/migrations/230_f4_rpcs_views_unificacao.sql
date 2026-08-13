-- 230: Perfis de Acesso 2.0 — F4-3 (FINAL da F4): RPCs, views e pendências (Story 75-316).
-- Corpos regenerados de pg_get_functiondef/pg_views (não de memória).

CREATE OR REPLACE FUNCTION public.user_has_capability(p_user_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE((
    SELECT CASE
      WHEN exc.can_access IS NOT NULL THEN exc.can_access
      WHEN u.role = 'admin' THEN COALESCE(excp.can_access, true)
      WHEN rp.can_access IS NOT NULL THEN rp.can_access
      WHEN excp.can_access IS NOT NULL THEN excp.can_access
      ELSE COALESCE(rpp.can_access, false)
    END
    FROM public.users u
    LEFT JOIN public.user_permission_exceptions exc
      ON exc.user_id = u.id AND exc.module = p_key
    LEFT JOIN public.roles r ON r.name = u.role AND r.org_id = u.org_id
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.module = p_key
    LEFT JOIN public.user_permission_exceptions excp
      ON excp.user_id = u.id AND excp.module = split_part(p_key, '.', 1)
    LEFT JOIN public.role_permissions rpp
      ON rpp.role_id = r.id AND rpp.module = split_part(p_key, '.', 1)
    WHERE u.id = p_user_id
    LIMIT 1
  ), false)
$fn$;

CREATE OR REPLACE FUNCTION public.creative_performance(p_days integer DEFAULT 30)
 RETURNS TABLE(meta_ad_id text, ad_name text, adset_id uuid, status text, creative jsonb, total_spend numeric, total_impressions bigint, total_clicks bigint, avg_ctr numeric, avg_cpc numeric, avg_cpm numeric, total_leads bigint, avg_cost_per_lead numeric, quality_ranking text, engagement_rate_ranking text, conversion_rate_ranking text, crm_leads_total bigint, crm_leads_agendado bigint, crm_leads_visitou bigint, crm_leads_proposta bigint, crm_leads_fechado bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
    AND  public.has_capability('agente.contexto_criativo')
  GROUP BY
    a.meta_ad_id, a.name, a.adset_id, a.status, a.creative, a.org_id
  ORDER BY crm_leads_visitou DESC NULLS LAST, total_leads DESC NULLS LAST
$function$
;

CREATE OR REPLACE FUNCTION public.creative_performance(p_start_date date, p_end_date date)
 RETURNS TABLE(meta_ad_id text, ad_name text, adset_id uuid, status text, creative jsonb, total_spend numeric, total_impressions bigint, total_clicks bigint, avg_ctr numeric, avg_cpc numeric, avg_cpm numeric, total_leads bigint, avg_cost_per_lead numeric, quality_ranking text, engagement_rate_ranking text, conversion_rate_ranking text, crm_leads_total bigint, crm_leads_agendado bigint, crm_leads_visitou bigint, crm_leads_proposta bigint, crm_leads_fechado bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
    AND  public.has_capability('agente.contexto_criativo')
  GROUP BY a.meta_ad_id, a.name, a.adset_id, a.status, a.creative, a.org_id
  ORDER BY crm_leads_visitou DESC NULLS LAST, total_leads DESC NULLS LAST
$function$
;

CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(p_days integer DEFAULT 30)
 RETURNS TABLE(org_id uuid, utm_source character varying, utm_campaign character varying, utm_medium character varying, total_leads bigint, leads_qualificado bigint, leads_agendado bigint, leads_visitou bigint, leads_proposta bigint, leads_fechado bigint, total_spend numeric, cpl_real_visitou numeric, cpl_real_fechado numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
-- position mínima de cada stage type por org (define o "alcançou X ou posterior")
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
    COUNT(*) FILTER (
      WHERE ls.stage_position >= tq.min_position
    )::BIGINT AS leads_qualificado,
    COUNT(*) FILTER (
      WHERE ls.stage_position >= ta.min_position
    )::BIGINT AS leads_agendado,
    COUNT(*) FILTER (
      WHERE ls.stage_position >= tv.min_position
    )::BIGINT AS leads_visitou,
    COUNT(*) FILTER (
      WHERE ls.stage_position >= tp.min_position
    )::BIGINT AS leads_proposta,
    COUNT(*) FILTER (
      WHERE ls.stage_type = 'fechado'
    )::BIGINT AS leads_fechado
  FROM lead_stage ls
  LEFT JOIN type_thresholds tq
    ON tq.org_id = ls.org_id AND tq.type = 'qualificado'
  LEFT JOIN type_thresholds ta
    ON ta.org_id = ls.org_id AND ta.type = 'agendado'
  LEFT JOIN type_thresholds tv
    ON tv.org_id = ls.org_id AND tv.type = 'visitou'
  LEFT JOIN type_thresholds tp
    ON tp.org_id = ls.org_id AND tp.type = 'proposta'
  GROUP BY ls.org_id, ls.utm_source, ls.utm_campaign, ls.utm_medium
),
-- spend agregado por campanha (nome) e org, somando insights diários no nível
-- campaign DENTRO da janela de p_days (PERF-001). Nome normalizado (REL-001).
campaign_spend AS (
  SELECT
    mc.org_id,
    lower(trim(mc.name)) AS campaign_name_norm,
    SUM(mid.spend)::NUMERIC AS total_spend
  FROM public.meta_campaigns mc
  JOIN public.meta_insights_daily mid
    ON mid.org_id = mc.org_id
   AND mid.level = 'campaign'
   AND mid.entity_id = mc.meta_campaign_id
   AND mid.date >= (current_date - p_days)     -- janela configurável (PERF-001)
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
-- LEFT JOIN preserva leads mesmo sem spend correlacionado (REL-001):
-- total_spend/CPL ficam NULL = "sem dados de mídia", não zero.
LEFT JOIN campaign_spend cs
  ON cs.org_id = f.org_id
 AND cs.campaign_name_norm = lower(trim(f.utm_campaign))    -- normalização (REL-001)
-- FILTRO DE SEGURANÇA (admin-strict + isolamento org) — load-bearing AC6/AC7
WHERE public.has_capability('agente.contexto_crm')
  AND f.org_id = public.user_org_id();
$function$
;

CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(p_start_date date, p_end_date date)
 RETURNS TABLE(org_id uuid, utm_source character varying, utm_campaign character varying, utm_medium character varying, total_leads bigint, leads_qualificado bigint, leads_agendado bigint, leads_visitou bigint, leads_proposta bigint, leads_fechado bigint, total_spend numeric, cpl_real_visitou numeric, cpl_real_fechado numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
WHERE public.has_capability('agente.contexto_crm')
  AND f.org_id = public.user_org_id();
$function$
;

CREATE OR REPLACE FUNCTION public.log_pii_access(p_org_id uuid, p_session_id uuid, p_data_type text, p_scope jsonb, p_view_or_source text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_admin_user_id UUID; BEGIN IF NOT public.has_capability('agente.contexto_crm') THEN RETURN FALSE; END IF; IF p_org_id IS DISTINCT FROM public.user_org_id() THEN RETURN FALSE; END IF; v_admin_user_id := public.public_user_id(); IF v_admin_user_id IS NULL THEN RETURN FALSE; END IF; IF p_data_type NOT IN ('lead_drill', 'conversation_content', 'aggregated_metrics') THEN RETURN FALSE; END IF; INSERT INTO public.agent_pii_access_log (org_id, admin_user_id, session_id, accessed_at, data_type, scope, view_or_source) VALUES (p_org_id, v_admin_user_id, p_session_id, now(), p_data_type, p_scope, p_view_or_source); RETURN TRUE; EXCEPTION WHEN OTHERS THEN RETURN FALSE; END; $function$
;

CREATE OR REPLACE FUNCTION public.roleta_pick_and_advance(p_org_id uuid, p_lead_id uuid, p_property_id uuid DEFAULT NULL::uuid, p_max_leads_per_day integer DEFAULT NULL::integer)
 RETURNS TABLE(broker_id uuid, broker_user_id uuid, queue_id uuid, broker_name text, broker_email text, broker_phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_key  bigint;
  v_queue_id  uuid;
  v_broker_id uuid;
  v_user_id   uuid;
  v_max_pos   integer;
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  -- Advisory lock por org para serializar distribuições concorrentes
  v_lock_key := ('x' || substr(md5(p_org_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Guard: se o lead já tem dono, está no bolsão OU está em Perdido, aborta sem erro.
  -- Story 75-89: bolsao_em IS NOT NULL → bolsão é terminal p/ a roleta.
  -- Story 75-118: stage_id = Perdido → também é terminal p/ a roleta.
  IF EXISTS (
    SELECT 1 FROM leads
     WHERE id = p_lead_id
       AND (assigned_broker_id IS NOT NULL
            OR bolsao_em IS NOT NULL
            OR stage_id = '00000000-0000-0000-0001-000000000008')
  ) THEN
    RETURN;
  END IF;

  -- Escolhe o próximo corretor elegível em ordem de posição
  SELECT rf.id, b.id, b.user_id
    INTO v_queue_id, v_broker_id, v_user_id
    FROM roleta_fila rf
    JOIN brokers b ON b.id = rf.broker_id
                  AND b.is_available = true
                  AND b.org_id = p_org_id
   WHERE rf.org_id    = p_org_id
     AND rf.is_active = true
     -- Filtro de empreendimento — 75-316: capability do CANDIDATO decide o bypass
     -- de broker_assignments (antes: role 'sdr' hardcoded — Story 75-226)
     AND (p_property_id IS NULL
          OR EXISTS (
               SELECT 1 FROM broker_assignments ba
                WHERE ba.broker_id   = b.id
                  AND ba.property_id = p_property_id)
          OR public.user_has_capability(b.user_id, 'roleta.atender_todo_empreendimento'))
     -- Limite de leads ativos totais (Story 75-198: sem Perdido/Não Qualificado)
     AND public.broker_active_leads_count(p_org_id, b.user_id) < COALESCE(b.max_leads, 50)
     -- Limite de leads distribuídos hoje (configuração global da roleta)
     AND (p_max_leads_per_day IS NULL OR
          (SELECT COUNT(*)
             FROM lead_distribution_log ldl
            WHERE ldl.broker_id   = rf.broker_id
              AND ldl.status      = 'distributed'
              AND ldl.org_id      = p_org_id
              AND ldl.created_at::date = CURRENT_DATE) < p_max_leads_per_day)
   ORDER BY rf.position ASC
   LIMIT 1;

  IF v_broker_id IS NULL THEN RETURN; END IF;

  -- Avança o corretor para o final da fila (round-robin)
  SELECT COALESCE(MAX(position), 0) + 1
    INTO v_max_pos
    FROM roleta_fila
   WHERE org_id = p_org_id;

  UPDATE roleta_fila SET position = v_max_pos WHERE id = v_queue_id;

  -- Recompacta posições se > 1000 para evitar overflow
  IF v_max_pos > 1000 THEN
    UPDATE roleta_fila rf
       SET position = sub.new_pos
      FROM (SELECT id,
                   (row_number() OVER (ORDER BY position))::integer - 1 AS new_pos
              FROM roleta_fila
             WHERE org_id = p_org_id) sub
     WHERE rf.id = sub.id
       AND rf.org_id = p_org_id;
  END IF;

  -- Atribui o lead — só se ainda estiver sem corretor, fora do bolsão E fora de Perdido
  -- (guard atômico final). Story 75-106 (restaurado na 75-226): carimba distribuido_em
  -- NA MESMA transação/UPDATE que atribui o corretor.
  UPDATE leads
     SET assigned_broker_id = v_user_id,
         distribuido_em     = now()
   WHERE id = p_lead_id
     AND assigned_broker_id IS NULL
     AND bolsao_em IS NULL
     AND stage_id <> '00000000-0000-0000-0001-000000000008';

  -- Se outra transação atribuiu / mandou pro bolsão / marcou perdido entre o guard
  -- acima e agora, aborta.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v_broker_id, v_user_id, v_queue_id,
           u.name::text, u.email::text, u.phone::text
      FROM users u
     WHERE u.id = v_user_id;
END;
$function$
;

CREATE OR REPLACE VIEW public.v_lead_conversations AS
 SELECT c.org_id,
    c.lead_id,
    c.id AS conversation_id,
    c.channel,
    c.is_ai_active,
    m.id AS message_id,
    m.role,
    m.content,
    m.created_at AS message_created_at
   FROM (conversations c
     JOIN messages m ON ((m.conversation_id = c.id)))
  WHERE ((has_capability('agente.contexto_crm'::text)) AND (c.org_id = user_org_id()));
ALTER VIEW public.v_lead_conversations SET (security_invoker = on);

CREATE OR REPLACE VIEW public.v_lead_drill AS
 SELECT l.id,
    l.org_id,
    l.name,
    l.qualification_score,
    ks.type AS stage_type,
    ks."position" AS stage_position,
    l.source,
    l.utm_source,
    l.utm_campaign,
    l.utm_medium,
    l.utm_content,
    l.ai_summary,
    l.created_at
   FROM (leads l
     LEFT JOIN kanban_stages ks ON ((ks.id = l.stage_id)))
  WHERE ((l.is_active = true) AND (has_capability('agente.contexto_crm'::text)) AND (l.org_id = user_org_id()));
ALTER VIEW public.v_lead_drill SET (security_invoker = on);

CREATE OR REPLACE VIEW public.v_lead_lost_reason_grupo AS
 SELECT id,
    org_id,
    created_at,
    source,
    stage_id,
    lost_reason,
    lost_reason_grupo,
    f_lost_reason_grupo(lost_reason, lost_reason_grupo) AS grupo_final,
        CASE
            WHEN (lost_reason_grupo IS NOT NULL) THEN 'estruturado'::text
            ELSE 'heuristica'::text
        END AS fonte
   FROM leads l
  WHERE ((stage_id = ANY (ARRAY['00000000-0000-0000-0001-000000000008'::uuid, '95327bd7-3e88-4038-aa16-250a74ab085c'::uuid])) AND (has_capability('agente.contexto_crm'::text)) AND (org_id = user_org_id()));
ALTER VIEW public.v_lead_lost_reason_grupo SET (security_invoker = on);

CREATE OR REPLACE VIEW public.v_pipeline_stage_distribution AS
 WITH lead_stage AS (
         SELECT l.org_id,
            l.utm_source,
            l.utm_campaign,
            ks.type AS stage_type
           FROM (leads l
             LEFT JOIN kanban_stages ks ON ((ks.id = l.stage_id)))
          WHERE (l.is_active = true)
        ), counts AS (
         SELECT lead_stage.org_id,
            lead_stage.utm_source,
            lead_stage.utm_campaign,
            lead_stage.stage_type,
            count(*) AS lead_count
           FROM lead_stage
          GROUP BY lead_stage.org_id, lead_stage.utm_source, lead_stage.utm_campaign, lead_stage.stage_type
        ), totals AS (
         SELECT lead_stage.org_id,
            lead_stage.utm_source,
            lead_stage.utm_campaign,
            count(*) AS total
           FROM lead_stage
          GROUP BY lead_stage.org_id, lead_stage.utm_source, lead_stage.utm_campaign
        )
 SELECT c.org_id,
    c.utm_source,
    c.utm_campaign,
    c.stage_type,
    c.lead_count,
    round((((c.lead_count)::numeric / (NULLIF(t.total, 0))::numeric) * (100)::numeric), 2) AS pct_of_total
   FROM (counts c
     JOIN totals t ON (((t.org_id = c.org_id) AND (NOT ((t.utm_source)::text IS DISTINCT FROM (c.utm_source)::text)) AND (NOT ((t.utm_campaign)::text IS DISTINCT FROM (c.utm_campaign)::text)))))
  WHERE ((has_capability('agente.contexto_crm'::text)) AND (c.org_id = user_org_id()));
ALTER VIEW public.v_pipeline_stage_distribution SET (security_invoker = on);

DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users FOR UPDATE
  USING (
    (org_id = user_org_id())
    AND has_capability('usuarios.editar'::text)
    AND (
      has_capability('usuarios.trocar_perfil'::text)
      OR (EXISTS ( SELECT 1 FROM brokers b WHERE (b.user_id = users.id)))
    )
  );

-- Unificação: has_module_access → has_capability (resolução idêntica p/ módulo).
DROP POLICY IF EXISTS "leads_select_bolsao" ON public.leads;
CREATE POLICY "leads_select_bolsao" ON public.leads FOR SELECT
  USING (((org_id = user_org_id()) AND (bolsao_em IS NOT NULL) AND (has_capability('bolsao'::text) OR (EXISTS ( SELECT 1
   FROM (brokers b
     JOIN users u ON ((u.id = b.user_id)))
  WHERE ((u.auth_id = auth.uid()) AND (b.is_available IS NOT NULL)))))));

DROP POLICY IF EXISTS "broker_assign_manage" ON public.broker_assignments;
CREATE POLICY "broker_assign_manage" ON public.broker_assignments FOR ALL
  USING (((EXISTS ( SELECT 1
   FROM brokers b
  WHERE ((b.id = broker_assignments.broker_id) AND (b.org_id = user_org_id())))) AND has_capability('corretores'::text)));

DROP POLICY IF EXISTS "brindes_tipos_write" ON public.brindes_tipos;
CREATE POLICY "brindes_tipos_write" ON public.brindes_tipos FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('brindes'::text)));

DROP POLICY IF EXISTS "brindes_dest_write" ON public.brindes_destinatarios;
CREATE POLICY "brindes_dest_write" ON public.brindes_destinatarios FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('brindes'::text)));

DROP POLICY IF EXISTS "brindes_ent_write" ON public.brindes_entregas;
CREATE POLICY "brindes_ent_write" ON public.brindes_entregas FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('brindes'::text)));

DROP POLICY IF EXISTS "datas_com_write" ON public.datas_comemorativas;
CREATE POLICY "datas_com_write" ON public.datas_comemorativas FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('brindes'::text)));

DROP FUNCTION IF EXISTS public.has_module_access(text);

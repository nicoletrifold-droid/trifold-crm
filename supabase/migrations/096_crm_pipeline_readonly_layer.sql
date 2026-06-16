-- 096_crm_pipeline_readonly_layer.sql
-- Epic 52 — Story 52-1: Camada de Leitura Read-Only do Pipeline
--
-- Cria a camada de leitura READ-ONLY sobre o pipeline comercial para consumo
-- pelo agente de tráfego pago. Composta por:
--   - 1 FUNÇÃO table-valued: pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)
--     (funil + CPL com janela de tempo configurável — mudança de contrato v0.4
--      decidida pelo PO; era a view v_pipeline_funnel_by_campaign).
--   - 3 views agregadas/de drill: v_pipeline_stage_distribution, v_lead_drill,
--     v_lead_conversations.
-- Garantias de segurança (em todos os objetos):
--   - Filtro estrito de role admin embutido (public.user_role() = 'admin')
--   - Isolamento multi-tenant por org_id (public.user_org_id())
--   - SECURITY INVOKER (defesa em profundidade: herda RLS das tabelas-base)
--   - GRANT SELECT (views) / GRANT EXECUTE (função) apenas para authenticated;
--     sem INSERT/UPDATE/DELETE.
--
-- FIXES QA v0.4 (aplicados nesta migration):
--   - PERF-001: o funil virou função com janela configurável p_days; total_spend
--     soma apenas o spend dos últimos p_days (default 30), não o lifetime.
--   - REL-001: join meta_campaigns.name = leads.utm_campaign normalizado com
--     lower(trim(...)); LEFT JOIN preserva leads sem spend (total_spend NULL =
--     "sem mídia correlacionada", não zero).
--
-- ===========================================================================
-- DECISÃO DE SEGURANÇA — RLS em Views (documentada no Change Log v0.3 da story)
-- ===========================================================================
-- PostgreSQL NÃO suporta `CREATE POLICY` nem `ALTER VIEW ... ENABLE ROW LEVEL
-- SECURITY` diretamente em views. Duas abordagens foram avaliadas:
--
--   (a) security_invoker = on sozinho → herdaria a RLS das tabelas-base.
--       REJEITADA como controle único: as políticas RLS das tabelas-base
--       (004_rls_policies.sql) filtram por org_id mas NÃO por role = 'admin'
--       (leads/conversations/messages são visíveis a admin/supervisor/broker
--       conforme org). Logo, security_invoker sozinho NÃO garante o AC6
--       (non-admin → 0 rows).
--
--   (b) Filtro de role + org embutido no WHERE de cada view + security_invoker.
--       ESCOLHIDA. O predicado `public.user_role() = 'admin'` no corpo da view
--       é determinístico e independente de versão do Postgres. Garante AC6
--       (non-admin → 0 rows) e AC7 (isolamento por org). security_invoker = on
--       é aplicado como camada adicional (a RLS de org das tabelas-base também
--       filtra), mas o controle load-bearing é o WHERE da view.
--
-- DECISÃO DE ROLE — fonte da verdade: public.users.role (via public.user_role())
-- ===========================================================================
-- A story sugeria `auth.jwt() -> 'app_metadata' ->> 'role'`. CONFIRMADO no
-- código (admin-helpers.ts, middleware.ts) que app_metadata.role é populado
-- APENAS para usuários externos role='cliente'. Para usuários internos
-- (admin/supervisor/broker) o app_metadata.role é NULL — usar o JWT quebraria
-- todo acesso admin (sempre 0 rows). A fonte autoritativa e consolidada em todo
-- o projeto (004_rls_policies.sql e 95 migrations) é public.user_role(), que lê
-- public.users.role. Adotado public.user_role() = 'admin'.
--
-- DIVERGÊNCIAS DE SCHEMA vs. story (adaptadas ao schema real, documentadas)
-- ===========================================================================
--   - messages NÃO tem coluna lead_id (só conversation_id). v_lead_conversations
--     liga messages → conversations → lead_id. AC9 `idx_messages_lead_id`
--     substituído por índice em messages(conversation_id) já existente
--     (idx_messages_conversation em 001); não recriado.
--   - meta_insights_daily NÃO tem campaign_id UUID nem campaign_name. Possui
--     level/entity_id (TEXT = meta_campaign_id no nível campaign)/date/spend.
--     A correspondência leads.utm_campaign ↔ mídia é feita via meta_campaigns.name
--     (LEFT JOIN por org_id + name = utm_campaign), e o spend agregado vem de
--     meta_insights_daily filtrando level='campaign' e entity_id=meta_campaign_id.
--     Decisão documentada no Change Log v0.3.
--   - AC9 `idx_meta_insights_org_campaign(org_id, campaign_id)` substituído por
--     idx_meta_insights_org_level_entity(org_id, level, entity_id) — colunas reais.

-- ===========================================================================
-- ÍNDICES DE SUPORTE (AC9) — idempotentes
-- ===========================================================================

-- Funil/distribuição por campanha/UTM (agrega leads por org_id + utm_*)
CREATE INDEX IF NOT EXISTS idx_leads_org_utm
  ON public.leads (org_id, utm_campaign, utm_source);

-- Distribuição por stage e drill por org
CREATE INDEX IF NOT EXISTS idx_leads_org_stage
  ON public.leads (org_id, stage_id);

-- Correlação campanha → spend (entity_id = meta_campaign_id quando level='campaign')
CREATE INDEX IF NOT EXISTS idx_meta_insights_org_level_entity
  ON public.meta_insights_daily (org_id, level, entity_id);

-- NOTA: messages(conversation_id) já indexado por idx_messages_conversation (001);
-- não há messages.lead_id no schema, logo idx_messages_lead_id (AC9) não se aplica.

-- ===========================================================================
-- FUNÇÃO 1: pipeline_funnel_by_campaign(p_days) (AC2 / FR-1, FR-2, FR-3)
-- ===========================================================================
-- MUDANÇA DE CONTRATO (v0.4, decisão do PO): era a view
-- `v_pipeline_funnel_by_campaign`; agora é uma FUNÇÃO table-valued com janela
-- de tempo CONFIGURÁVEL. Views não aceitam parâmetro, e o PO decidiu que a
-- janela do CPL deve ser ajustável pelo consumidor. A Story 52-2 passa a
-- chamar via supabase.rpc('pipeline_funnel_by_campaign', { p_days: N }).
--
-- Funil por (org_id, utm_source, utm_campaign, utm_medium) com conversão
-- cumulativa por stage type e CPL real ponderado. LEFT JOIN com spend agregado
-- de meta_insights_daily via meta_campaigns.name = utm_campaign.
--
-- PERF-001 (fix QA v0.4): total_spend agora soma APENAS o spend dentro da
-- janela `date >= (current_date - p_days)` (default 30 dias), em vez do spend
-- lifetime da campanha. Isso evita CPL inflado conforme a campanha acumula
-- gasto histórico. A janela é configurável via p_days (ex.: 7, 30, 90).
--
-- REL-001 (fix QA v0.4): o join meta_campaigns.name = utm_campaign é
-- normalizado com lower(trim(...)) em AMBOS os lados, reduzindo mismatch por
-- caixa/espaço (NÃO é fuzzy matching — apenas normalização exata). O LEFT JOIN
-- preserva todos os leads mesmo sem spend correlacionado: nesses casos
-- total_spend e os CPL ficam NULL — isso é ESPERADO e significa "sem dados de
-- mídia correlacionados", NÃO zero. A 52-2 deve interpretar NULL assim.
--
-- SEGURANÇA (admin-strict + isolamento org) embutida na função (AC6/AC7):
--   public.user_role() = 'admin' AND org_id = public.user_org_id().
-- SECURITY INVOKER: a função herda a RLS de org das tabelas-base (defesa em
-- profundidade), mas o filtro de role admin é EXPLÍCITO no WHERE — controle
-- load-bearing, igual ao que estava na view. SECURITY INVOKER é suficiente
-- para o org-iso porque executa com privilégios do chamador (RLS aplicada);
-- não usamos SECURITY DEFINER aqui (não há necessidade de elevação e isso
-- evitaria a herança de RLS).
--
-- Convenção de "alcançou stage X ou posterior": baseada em kanban_stages.position.
-- Para cada lead pegamos a position do seu stage atual e comparamos com a position
-- mínima de cada stage type-alvo na mesma org. 'fechado' é exato (leads no stage
-- fechado), os demais são cumulativos (position >= position do type-alvo).

-- IMPORTANTE: a versão anterior declarou v_pipeline_funnel_by_campaign como VIEW.
-- Como agora vira função, dropar a view antes (para a migration aplicar limpo
-- caso o 096 já tenha sido aplicado em algum ambiente).
DROP VIEW IF EXISTS public.v_pipeline_funnel_by_campaign;

CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)
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
SECURITY INVOKER                    -- herda RLS de org das tabelas-base (defesa em profundidade)
STABLE
SET search_path = public            -- evita search_path injection
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
WHERE public.user_role() = 'admin'
  AND f.org_id = public.user_org_id();
$$;

-- ===========================================================================
-- VIEW 2: v_pipeline_stage_distribution (AC3 / FR-3)
-- ===========================================================================
-- Distribuição de leads por stage_type segmentada por (org_id, utm_source,
-- utm_campaign), com contagem e percentual sobre o total da campanha/UTM.

CREATE OR REPLACE VIEW public.v_pipeline_stage_distribution
WITH (security_invoker = on) AS
WITH lead_stage AS (
  SELECT
    l.org_id,
    l.utm_source,
    l.utm_campaign,
    ks.type AS stage_type
  FROM public.leads l
  LEFT JOIN public.kanban_stages ks ON ks.id = l.stage_id
  WHERE l.is_active = true
),
counts AS (
  SELECT
    org_id,
    utm_source,
    utm_campaign,
    stage_type,
    COUNT(*)::BIGINT AS lead_count
  FROM lead_stage
  GROUP BY org_id, utm_source, utm_campaign, stage_type
),
totals AS (
  SELECT org_id, utm_source, utm_campaign, COUNT(*)::BIGINT AS total
  FROM lead_stage
  GROUP BY org_id, utm_source, utm_campaign
)
SELECT
  c.org_id,
  c.utm_source,
  c.utm_campaign,
  c.stage_type,
  c.lead_count,
  ROUND((c.lead_count::NUMERIC / NULLIF(t.total, 0)) * 100, 2) AS pct_of_total
FROM counts c
JOIN totals t
  ON t.org_id = c.org_id
 AND t.utm_source IS NOT DISTINCT FROM c.utm_source
 AND t.utm_campaign IS NOT DISTINCT FROM c.utm_campaign
-- FILTRO DE SEGURANÇA (admin-strict + isolamento org)
WHERE public.user_role() = 'admin'
  AND c.org_id = public.user_org_id();

-- ===========================================================================
-- VIEW 3: v_lead_drill (AC4 / FR-4)
-- ===========================================================================
-- Drill individual de lead. PII crítica (phone, email) EXPLICITAMENTE EXCLUÍDA
-- (minimização — NFR-SEC-3). name e ai_summary incluídos (necessários ao drill).

CREATE OR REPLACE VIEW public.v_lead_drill
WITH (security_invoker = on) AS
SELECT
  l.id,
  l.org_id,
  l.name,                       -- PII de identificação (necessária ao drill)
  l.qualification_score,
  ks.type      AS stage_type,
  ks.position  AS stage_position,
  l.source,
  l.utm_source,
  l.utm_campaign,
  l.utm_medium,
  l.utm_content,
  l.ai_summary,
  l.created_at
  -- DELIBERADAMENTE OMITIDOS: l.phone, l.email (NFR-SEC-3 — minimização de PII)
FROM public.leads l
LEFT JOIN public.kanban_stages ks ON ks.id = l.stage_id
WHERE l.is_active = true
  -- FILTRO DE SEGURANÇA (admin-strict + isolamento org)
  AND public.user_role() = 'admin'
  AND l.org_id = public.user_org_id();

-- ===========================================================================
-- VIEW 4: v_lead_conversations (AC5 / FR-5)
-- ===========================================================================
-- ATENÇÃO: contém PII e conteúdo sensível (messages.content); RLS admin-only
-- abaixo. Toda leitura desta view DEVE ser auditada via log_pii_access (52-4).
-- messages NÃO tem lead_id no schema → liga via conversations.

CREATE OR REPLACE VIEW public.v_lead_conversations
WITH (security_invoker = on) AS
SELECT
  c.org_id,
  c.lead_id,
  c.id          AS conversation_id,
  c.channel,
  c.is_ai_active,
  m.id          AS message_id,
  m.role,
  m.content,                    -- PII / conteúdo sensível
  m.created_at  AS message_created_at
FROM public.conversations c
JOIN public.messages m ON m.conversation_id = c.id
-- FILTRO DE SEGURANÇA (admin-strict + isolamento org)
WHERE public.user_role() = 'admin'
  AND c.org_id = public.user_org_id();

-- ===========================================================================
-- GRANTS — somente leitura para authenticated (AC8). Sem INSERT/UPDATE/DELETE.
-- O funil agora é uma FUNÇÃO (EXECUTE, sem escrita); as demais permanecem views.
-- ===========================================================================
-- ACHADO DE RUNTIME (dev xnxvygyfyyyzwhiuoehz, v0.5): o Supabase concede por
-- padrao GRANT ALL aos roles `authenticated` E `anon` em objetos do schema
-- public. Embora views com JOIN/agregacao NAO sejam atualizaveis (writes
-- falhariam por construcao), o NFR-SEC-2 ("tecnicamente incapaz de escrever")
-- exige enforcement DETERMINISTICO, nao "non-updatable por acaso". Portanto
-- revogamos explicitamente escrita das views e EXECUTE da funcao do baseline
-- amplo, deixando apenas SELECT (views) / EXECUTE (funcao) para authenticated.
-- REVOKE/GRANT sao idempotentes — seguro re-aplicar.

-- Views: authenticated so SELECT; anon/PUBLIC sem nada.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON
  public.v_pipeline_stage_distribution, public.v_lead_drill, public.v_lead_conversations FROM authenticated;
REVOKE ALL ON public.v_pipeline_stage_distribution, public.v_lead_drill, public.v_lead_conversations FROM anon, PUBLIC;
GRANT SELECT ON public.v_pipeline_stage_distribution, public.v_lead_drill, public.v_lead_conversations TO authenticated;

-- Funcao: EXECUTE so para authenticated; anon/PUBLIC sem nada.
REVOKE ALL ON FUNCTION public.pipeline_funnel_by_campaign(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pipeline_funnel_by_campaign(integer) TO authenticated;

-- Comentários de documentação
COMMENT ON FUNCTION public.pipeline_funnel_by_campaign(INTEGER) IS
  'Epic52 52-1 (v0.4): funil por campanha/UTM + CPL real ponderado com janela de tempo configuravel (p_days, default 30). total_spend soma meta_insights_daily.spend dos ultimos p_days (PERF-001); join de nome normalizado lower(trim) (REL-001); NULL = sem midia correlacionada. Admin-only via user_role()=admin no WHERE. SECURITY INVOKER, read-only.';
COMMENT ON VIEW public.v_pipeline_stage_distribution IS
  'Epic52 52-1: distribuicao de leads por stage_type segmentada por campanha/UTM. Admin-only. Read-only.';
COMMENT ON VIEW public.v_lead_drill IS
  'Epic52 52-1: drill de lead individual SEM phone/email (minimizacao PII). Admin-only. Read-only.';
COMMENT ON VIEW public.v_lead_conversations IS
  'Epic52 52-1: conteudo de conversas (PII/sensivel). Admin-only. Read-only. Acessos auditados por log_pii_access (52-4).';

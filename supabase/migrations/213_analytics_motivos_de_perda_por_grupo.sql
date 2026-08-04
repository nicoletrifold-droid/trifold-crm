-- ===========================================================================
-- Migration 213 — Analytics agrega motivo de perda por GRUPO (não por texto)
-- Story 75-266
-- ===========================================================================
-- O QUE CRIA/ALTERA:
--   1. Função f_lost_reason_grupo(text, text) — a heurística da mig 212 sai de
--      dentro da view e vira função ÚNICA e reutilizável.
--   2. View v_lead_lost_reason_grupo recriada para usar a função (colunas e
--      comportamento IDÊNTICOS — o agente não percebe).
--   3. get_analytics_summary_ranged ganha 'lost_reason_groups' e
--      'lost_reason_estruturados' no JSONB. 'lost_reasons' (cru) PERMANECE.
--      Convertida sql→plpgsql para receber assert_org_scope (precedente 209).
--   4. RPC get_lost_reason_groups(...) — mesmo agregado com filtro opcional de
--      empreendimento, p/ o caminho da page que não usa a RPC de resumo.
--
-- POR QUÊ:
--   O card "Motivos de Perda" do analytics agrega lost_reason por STRING EXATA
--   (614 variantes em 1.042 perdidos em prod). O dado bom existe desde a 212,
--   mas só o agente lê — a view é admin-strict (user_role()='admin' no WHERE) e
--   retorna 0 linhas p/ supervisor/gerente/SDR (roles do analytics) e p/
--   service_role (crons de relatório). A função não tem gate: quem a envolve
--   impõe o próprio controle.
--
-- DECISÕES DE DESIGN:
--   - A ORDEM do CASE é PARTE DA DEFINIÇÃO (header da 212). O corpo da função é
--     o CASE da view VERBATIM — paridade medida no PR (AC3). Não reordenar.
--   - O agregado por grupo usa o MESMO universo do lost_agg atual
--     (lost_reason IS NOT NULL + janela + segmento principal): a soma dos
--     grupos ≡ KPI "Perdidos" por construção (AC2). A view continua contando
--     por ETAPA — universos distintos de propósito (card = janela; agente =
--     histórico de perdas).
--   - IMMUTABLE: pode, porque f_unaccent (mig 174) é IMMUTABLE.
--   - NÃO STRICT: NULL em lost_reason é significativo ('sem_motivo').
--
-- SEGURANÇA:
--   - assert_org_scope (mig 209) nas duas RPCs: nega cross-org de usuário
--     logado; fail-open p/ service_role (crons continuam funcionando).
--   - Funções novas: REVOKE de PUBLIC/anon, GRANT a authenticated+service_role.
--   - A view mantém o WHERE admin+org da 212, inalterado.
-- ===========================================================================

-- ── 0. Helper assert_org_scope — cópia VERBATIM da mig 209 ─────────────────
-- Por quê aqui: o DEV tem drift de schema e a 209 inteira não aplica lá
-- (financial_notification_log nem existe); sem o helper, as RPCs abaixo
-- quebrariam em runtime. No PROD (209 aplicada em 04/08) este bloco é no-op
-- (CREATE OR REPLACE com definição idêntica). Se a 209 mudar o helper, ela
-- prevalece — esta cópia existe só para ambientes atrás dela.

CREATE OR REPLACE FUNCTION public.assert_org_scope(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    -- CUIDADO: auth.uid() NULL NÃO implica service-role. A anon key deste
    -- projeto é `sb_publishable_…` (46 chars, ZERO pontos — não é JWT, não tem
    -- claim `sub`), então requisição anônima por PostgREST cai aqui também.
    --
    -- ⚠️ FAIL-OPEN DELIBERADO. A service role key também é do formato novo
    -- (`sb_secret_…`, 41 chars, não-JWT) e NÃO foi possível verificar, sem criar
    -- função de sonda em produção (DDL), o que o PostgREST põe em
    -- `request.jwt.claims` nesse formato. Se a guarda negasse por padrão e o
    -- formato não trouxesse role='service_role', `roleta_pick_and_advance`
    -- passaria a levantar exceção em TODA rodada do cron → leads param de ser
    -- distribuídos. Por isso negamos SOMENTE quando o request é positivamente
    -- identificável como anônimo; qualquer formato de claims desconhecido libera.
    --
    -- Consequência aceita: se o formato novo não popular role='anon', esta
    -- guarda é no-op para o vetor anônimo. Isso é aceitável porque **quem fecha
    -- o furo explorado é o REVOKE da seção 2**, que é o controle primário e foi
    -- verificado; esta guarda é defesa em profundidade contra cross-tenant de
    -- usuário LOGADO (esse caminho, sim, é garantido: tem auth.uid()).
    -- Bloco aninhado: o cast ::jsonb levantaria erro se o GUC não fosse JSON
    -- válido, e isso mataria a chamada de cron. Qualquer falha aqui é tratada
    -- como "formato desconhecido" → libera (coerente com o fail-open acima).
    BEGIN
      v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    EXCEPTION WHEN others THEN
      v_role := NULL;
    END;

    IF v_role = 'anon' THEN
      RAISE EXCEPTION 'org scope required' USING ERRCODE = '42501';
    END IF;

    -- service_role, pg_cron/psql/migration (sem GUC de request), ou formato de
    -- claims não reconhecido → libera.
    RETURN;
  END IF;

  IF p_org_id IS DISTINCT FROM public.user_org_id() THEN
    RAISE EXCEPTION 'org mismatch' USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_org_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_org_scope(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_org_scope(uuid) TO authenticated, service_role;

-- ── 1. A heurística vira função única ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.f_lost_reason_grupo(
  p_lost_reason text,
  p_lost_reason_grupo text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- Dado novo (estruturado) SEMPRE vence a heurística (AC7 da 75-264).
  SELECT COALESCE(
    p_lost_reason_grupo,
    CASE
      WHEN p_lost_reason IS NULL OR trim(p_lost_reason) = '' THEN 'sem_motivo'
      ELSE (
        -- Heurística sobre texto legado. r = texto normalizado.
        -- A ORDEM É PARTE DA DEFINIÇÃO — copiada VERBATIM da mig 212; ver header.
        SELECT CASE
          -- 1:1 com os 11 labels do antigo select do bulk (leads-bulk-table)
          WHEN r = 'cliente nao atende/responde mais' THEN 'nao_conseguimos_falar'
          WHEN r = 'comprou com concorrente' THEN 'foi_para_outro'
          WHEN r IN ('condicao de pagamento','cpf com restricao','preco','renda insuficiente') THEN 'nao_qualifica_preco'
          WHEN r = 'desistiu de comprar' THEN 'sem_interesse'
          WHEN r = 'lead duplicado' THEN 'duplicado_teste_corretor'
          WHEN r = 'nao interesse' THEN 'sem_interesse'
          WHEN r = 'telefone inexistente' THEN 'nao_conseguimos_falar'
          WHEN r = 'outros' THEN 'nao_classificado'
          -- Frases explícitas de "não conseguimos falar" vencem os demais grupos
          WHEN r ~ '(nao consegui falar|nao foi possivel falar|nao consegui contato|nao conseguimos falar|nao conseguimos contato)' THEN 'nao_conseguimos_falar'
          WHEN r ~ '(duplicado|duplicidade|teste|corretor|colaborador|funcionario|portal|buscando clientes|prospec)' THEN 'duplicado_teste_corretor'
          WHEN r ~ '(concorrente|comprou|compro outr|compradu|ja adquiriu|ja fechou|fechando (uma|um)|ja achou|fez aquisicao|fez proposta|investiu em outr)' THEN 'foi_para_outro'
          WHEN r ~ '(curios|sem querer|clicou (por|sem|errado)|nao lembra|nao se lembra|nunca entrou|engano|enganou|enviou errado|acessou errado|nao preencheu|nao se inscreveu|nao se cadastrou|mexeu no celular|sorteio)' THEN 'clicou_sem_intencao'
          WHEN r ~ '(perfil|regiao|cidade|mora (em|fora)|outro estado|distante|localizacao|longe|londrina|paranavai|arapongas|cianorte|praia|embora de|quer casa|preferiu casa|quer alugar|esta alugando|quer um imovel proximo)' THEN 'fora_perfil_regiao'
          WHEN r ~ '(renda|restricao|cpf|score|serasa|spc|condicoes financeiras|condicao de pagamento|poder de compra|(sem|nao tem) condic|preco|caro|valor|orcamento|entrada|financiamento|nao qualifica|menor de idade|adolescente|desempregad|emprego|busca trabalho|nome sujo|credito|baixo padrao|sem dinheiro|nao tem dinheiro|vender o|venda do|nao vendeu)' THEN 'nao_qualifica_preco'
          WHEN r ~ '(atende|respond|interacao|interag|retorn|contato|bloque|numero (errado|inexistente|invalido)|deu o numero|nao existe|inexistente|sem resposta|caixa postal|tentativas|so chama|desligou o celular|telefone)' THEN 'nao_conseguimos_falar'
          WHEN r ~ '(interess|desis|nao quer|nao tem inten|apenas pesquisando|so pesquisando|nao pretende|nao esta procurando|especulando|momento|vai aguardar|deixar (para|pro)|proximo ano|fora dos planos|mudou os planos|outras obrigacoes|nao consegue (assumir|investir|fazer)|nao vai conseguir vir|nao consegue vir)' THEN 'sem_interesse'
          ELSE 'nao_classificado'
        END
        FROM (SELECT lower(public.f_unaccent(trim(p_lost_reason))) AS r) t
      )
    END
  );
$$;

REVOKE ALL ON FUNCTION public.f_lost_reason_grupo(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.f_lost_reason_grupo(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.f_lost_reason_grupo(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.f_lost_reason_grupo(text, text) IS
  'Story 75-266: classificação de motivo de perda em grupo — fonte ÚNICA da heurística da mig 212. '
  'Dado novo (lost_reason_grupo) vence; texto legado cai no CASE heurístico (a ORDEM é parte da '
  'definição — não reordenar sem re-medir). Sem gate de role: quem a envolve (view 212, RPCs do '
  'analytics) impõe o próprio controle. Cobertura medida em prod 2026-08-04: 92,0% dos textos.';

-- ── 2. A view passa a usar a função (comportamento idêntico) ───────────────

CREATE OR REPLACE VIEW public.v_lead_lost_reason_grupo
WITH (security_invoker = on) AS
SELECT
  l.id,
  l.org_id,
  l.created_at,
  l.source,
  l.stage_id,
  l.lost_reason,
  l.lost_reason_grupo,
  public.f_lost_reason_grupo(l.lost_reason, l.lost_reason_grupo) AS grupo_final,
  CASE WHEN l.lost_reason_grupo IS NOT NULL THEN 'estruturado' ELSE 'heuristica' END AS fonte
FROM public.leads l
WHERE l.stage_id IN (
    '00000000-0000-0000-0001-000000000008',  -- Perdido
    '95327bd7-3e88-4038-aa16-250a74ab085c'   -- Não Qualificado
  )
  -- FILTRO DE SEGURANÇA (admin-strict + isolamento org — precedente mig 096)
  AND public.user_role() = 'admin'
  AND l.org_id = public.user_org_id();

GRANT SELECT ON public.v_lead_lost_reason_grupo TO authenticated;

COMMENT ON VIEW public.v_lead_lost_reason_grupo IS
  'Story 75-264 (heurística movida p/ f_lost_reason_grupo na 75-266 — comportamento idêntico): '
  'motivo de perda por grupo. Dado novo = lost_reason_grupo (fonte=estruturado); legado = heurística '
  'sobre lost_reason normalizado (fonte=heuristica). Cobertura medida em prod 2026-08-04 sobre 1.042 '
  'perdidos: 92,0% classificados; 7,6% nao_classificado; 5,5% sem_motivo. NÃO tratar a parte '
  'heurística como verdade absoluta. Admin-only + org própria embutidos no WHERE (security_invoker on).';

-- ── 3. get_analytics_summary_ranged: grupos no JSONB (base = mig 178) ──────
-- sql→plpgsql SÓ para receber PERFORM assert_org_scope (precedente 209:
-- "as que eram LANGUAGE sql foram convertidas"). Lógica das CTEs preservada.

CREATE OR REPLACE FUNCTION public.get_analytics_summary_ranged(
  p_org_id uuid,
  p_since timestamp with time zone DEFAULT date_trunc('month'::text, now()),
  p_until timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  RETURN (
  WITH
  funnel AS (
    SELECT ks.id AS stage_id, ks.name, ks.slug, ks.color, ks.position, COUNT(l.id)::int AS count
    FROM kanban_stages ks
    LEFT JOIN leads l ON l.stage_id = ks.id AND l.org_id = p_org_id AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL AND l.created_at >= p_since AND l.created_at < p_until
    WHERE ks.org_id = p_org_id AND ks.is_active = true
    GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position ORDER BY ks.position
  ),
  by_property AS (
    SELECT p.id AS property_id, p.name, COUNT(l.id)::int AS count
    FROM properties p
    LEFT JOIN leads l ON l.property_interest_id = p.id AND l.org_id = p_org_id AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL AND l.created_at >= p_since AND l.created_at < p_until
    WHERE p.org_id = p_org_id AND p.is_active = true GROUP BY p.id, p.name
  ),
  by_broker AS (
    SELECT u.id AS user_id, u.name, COUNT(l.id)::int AS count, COALESCE(ROUND(AVG(l.qualification_score))::int, 0) AS avg_score
    FROM users u
    LEFT JOIN leads l ON l.assigned_broker_id = u.id AND l.org_id = p_org_id AND l.segmento = 'principal'
      AND l.is_active = true AND l.lost_reason IS NULL AND l.created_at >= p_since AND l.created_at < p_until
    WHERE u.org_id = p_org_id AND u.role::text = 'broker' AND u.is_active = true GROUP BY u.id, u.name
  ),
  source_agg AS (
    SELECT source::text AS source, COUNT(*)::int AS cnt FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND is_active = true AND lost_reason IS NULL
      AND created_at >= p_since AND created_at < p_until AND source IS NOT NULL GROUP BY source
  ),
  lost_agg AS (
    -- Story 75-179: sem filtro is_active — perdidos = subconjunto real das entradas.
    SELECT lost_reason, COUNT(*)::int AS cnt FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND lost_reason IS NOT NULL
      AND created_at >= p_since AND created_at < p_until GROUP BY lost_reason
  ),
  lost_groups AS (
    -- Story 75-266: MESMO universo do lost_agg — soma dos grupos ≡ soma do cru (KPI Perdidos).
    SELECT public.f_lost_reason_grupo(lost_reason, lost_reason_grupo) AS grupo,
           COUNT(*)::int AS cnt,
           COUNT(*) FILTER (WHERE lost_reason_grupo IS NOT NULL)::int AS estruturados
    FROM leads
    WHERE org_id = p_org_id AND segmento = 'principal' AND lost_reason IS NOT NULL
      AND created_at >= p_since AND created_at < p_until
    GROUP BY 1
  ),
  totals AS (
    -- Story 75-179: total_leads = TODAS as entradas; new_leads = ativos não-perdidos.
    SELECT COUNT(*) FILTER (WHERE created_at >= p_since AND created_at < p_until)::int AS total_leads,
           COUNT(*) FILTER (WHERE is_active = true AND lost_reason IS NULL AND created_at >= p_since AND created_at < p_until)::int AS new_leads
    FROM leads WHERE org_id = p_org_id AND segmento = 'principal'
  )
  SELECT jsonb_build_object(
    'funnel', COALESCE((SELECT jsonb_agg(f) FROM funnel f),'[]'::jsonb),
    'by_property', COALESCE((SELECT jsonb_agg(bp) FROM by_property bp),'[]'::jsonb),
    'by_broker', COALESCE((SELECT jsonb_agg(bb) FROM by_broker bb),'[]'::jsonb),
    'source_counts', COALESCE((SELECT jsonb_object_agg(source, cnt) FROM source_agg),'{}'::jsonb),
    'lost_reasons', COALESCE((SELECT jsonb_object_agg(lost_reason, cnt) FROM lost_agg),'{}'::jsonb),
    'lost_reason_groups', COALESCE((SELECT jsonb_object_agg(grupo, cnt) FROM lost_groups),'{}'::jsonb),
    'lost_reason_estruturados', COALESCE((SELECT SUM(estruturados)::int FROM lost_groups), 0),
    'total_leads', (SELECT total_leads FROM totals),
    'new_leads', (SELECT new_leads FROM totals)
  ));
END;
$function$;

-- QA-001 (75-266): a RPC nunca esteve entre as 8 revogadas pela 209 — nascia com
-- EXECUTE p/ PUBLIC, e o assert_org_scope é fail-open p/ o vetor anônimo (por
-- design; o controle primário é o REVOKE). Fechando aqui, no mesmo padrão:
REVOKE ALL ON FUNCTION public.get_analytics_summary_ranged(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_summary_ranged(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary_ranged(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ── 4. Agregado por grupo com filtro de empreendimento (caminho B da page) ──

CREATE OR REPLACE FUNCTION public.get_lost_reason_groups(
  p_org_id uuid,
  p_since timestamp with time zone,
  p_until timestamp with time zone,
  p_property_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  RETURN (
    WITH lost_groups AS (
      -- Mesmo universo do lost_agg da RPC de resumo (+ filtro opcional de empreendimento).
      SELECT public.f_lost_reason_grupo(lost_reason, lost_reason_grupo) AS grupo,
             COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE lost_reason_grupo IS NOT NULL)::int AS estruturados
      FROM leads
      WHERE org_id = p_org_id AND segmento = 'principal' AND lost_reason IS NOT NULL
        AND created_at >= p_since AND created_at < p_until
        AND (p_property_id IS NULL OR property_interest_id = p_property_id)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'groups', COALESCE(jsonb_object_agg(grupo, cnt), '{}'::jsonb),
      'estruturados', COALESCE(SUM(estruturados)::int, 0)
    )
    FROM lost_groups
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_lost_reason_groups(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lost_reason_groups(uuid, timestamptz, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lost_reason_groups(uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_lost_reason_groups(uuid, timestamptz, timestamptz, uuid) IS
  'Story 75-266: motivos de perda por grupo (f_lost_reason_grupo) p/ o caminho do analytics com '
  'filtro de empreendimento. Universo = lost_reason IS NOT NULL + janela + segmento principal '
  '(idêntico ao lost_agg de get_analytics_summary_ranged). assert_org_scope no topo (precedente 209).';

-- ROLLBACK PLAN:
--   Reaplicar a mig 212 (restaura a view com o CASE embutido) e a mig 178
--   (restaura get_analytics_summary_ranged sem os grupos); depois:
--   DROP FUNCTION IF EXISTS public.get_lost_reason_groups(uuid, timestamptz, timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public.f_lost_reason_grupo(text, text);

-- =============================================================================
-- 209_hotfix_rls_org_scope.sql — Hotfix de segurança (Lote 0)
-- =============================================================================
-- Origem: docs/audits/rls-multi-tenant-audit.md — itens P1, P2, P3, P6 e a
-- mitigação de P4. Quatro dos achados são vazamento CONFIRMADO em produção
-- HOJE, com uma única org — P1, P2 e P3 foram explorados SEM LOGIN, com a chave
-- `anon` que está no bundle do navegador.
--
-- Estado medido em 2026-07-29 com a anon key (`sb_publishable_…`), via PostgREST:
--   GET /rest/v1/system_events?limit=1      → HTTP 206, content-range 0-0/10157
--   GET /rest/v1/meta_campaign_roas?limit=1 → HTTP 206, content-range 0-0/104
--   GET /rest/v1/v_mensagens_admin?limit=1  → HTTP 206, content-range 0-0/15
-- Ou seja: `system_events` é o PIOR item da lista — a tabela INTEIRA (10.157
-- linhas, inclusive as 63,6% sem org_id) é legível por qualquer um na internet.
-- A auditoria subestimou o P3 ao descrevê-lo como "vaza para qualquer usuário
-- logado": a policy `USING(true)` é para o role `public`, que inclui `anon`.
--
-- -----------------------------------------------------------------------------
-- APLICAÇÃO: EM TRANSAÇÃO ÚNICA (obrigatório)
-- -----------------------------------------------------------------------------
-- TODAS as instruções deste arquivo são DDL transacional em Postgres
-- (CREATE OR REPLACE FUNCTION, GRANT/REVOKE, ALTER VIEW, DROP/CREATE POLICY).
-- NÃO há `CREATE INDEX CONCURRENTLY` nem `REFRESH ... CONCURRENTLY` aqui.
-- Logo o arquivo DEVE ser aplicado dentro de um único BEGIN/COMMIT — é o que
-- `supabase db push` já faz por migration. Isso elimina a classe de falha
-- "aplicação parcial", em que um erro no meio deixaria os itens seguintes
-- (P3/P6/P4) sem aplicar enquanto o furo mais grave continua aberto.
--
-- Esta migration é IDEMPOTENTE: pode ser reaplicada sem erro (CREATE OR REPLACE,
-- DROP POLICY IF EXISTS, ALTER VIEW ... SET, e REVOKE — que é no-op quando o
-- privilégio já não existe).
--
-- -----------------------------------------------------------------------------
-- ÍNDICE
-- -----------------------------------------------------------------------------
--   0. Helper `assert_org_scope()` — guarda de org reutilizável
--   1. P1 — 8 RPCs SECURITY DEFINER que confiavam em `p_org_id`
--   2. P1 — REVOKE EXECUTE das 8 RPCs de `anon` **e de PUBLIC**
--   3. P2 — `v_mensagens_admin` (view) e `meta_campaign_roas` (MATVIEW)
--   4. P3 — DROP da policy permissiva `USING(true)` de `system_events`
--   5. P6 — `financial_notification_log`: policy ancorada em org
--   6. P4 — REVOKE das 5 tabelas de custo interno da plataforma
--   +  VERIFICAÇÃO PÓS-APLICAÇÃO e ROLLBACK (comentados, no fim do arquivo)
--
-- -----------------------------------------------------------------------------
-- NOTA CRÍTICA SOBRE O REVOKE (achado NÃO previsto pela auditoria)
-- -----------------------------------------------------------------------------
-- 5 das 8 RPCs têm EXECUTE concedido ao pseudo-role **PUBLIC** (`=X/postgres`
-- no `proacl`), não só a `anon`. `REVOKE ... FROM anon` sozinho NÃO fecharia o
-- furo: `anon` continuaria executando por herança de PUBLIC. Por isso todo
-- revoke abaixo é feito de `PUBLIC` **e** de `anon`. `authenticated` e
-- `service_role` têm grants próprios e explícitos — seguem intactos.
--
-- Funções com grant a PUBLIC: get_broker_dashboard_counts, get_broker_funnel_stats,
-- get_whatsapp_cost_summary, get_whatsapp_volume_summary, seed_system_roles.
--
-- -----------------------------------------------------------------------------
-- NOTA SOBRE A GUARDA CONDICIONAL — LEIA ANTES DE CRIAR A 9ª RPC
-- -----------------------------------------------------------------------------
-- `user_org_id()` = `SELECT org_id FROM users WHERE auth_id = auth.uid()`.
-- Em chamada de service-role (cron da roleta) ou de `postgres`/`pg_cron`
-- (provisionamento, migrations) NÃO existe usuário: `auth.uid()` é NULL e
-- `user_org_id()` também. Uma guarda incondicional
-- `p_org_id IS DISTINCT FROM user_org_id()` seria TRUE nesse caso e QUEBRARIA a
-- chamada legítima — derrubaria a distribuição de leads
-- (`roleta_pick_and_advance`, chamada por `lib/roleta/distributor.ts` com
-- `createAdminClient()`) e o provisionamento de org (`seed_system_roles`).
--
-- ⚠️ MAS `auth.uid() IS NULL` **NÃO** significa "é service-role". A anon key do
-- Supabase é `sb_publishable_…`, não é JWT e não carrega claim `sub` — logo uma
-- requisição ANÔNIMA por PostgREST também produz `auth.uid() IS NULL`
-- (verificado: `rpc/user_org_id` → null, `rpc/is_admin_or_supervisor` → false).
-- Um early-return simples em `auth.uid() IS NULL` desligaria a guarda
-- justamente para o vetor que foi explorado.
--
-- Por isso o helper distingue os dois casos pelo `request.jwt.claims`:
--   • GUC ausente/vazio  → chamada in-database (pg_cron, psql, migration) → libera
--   • claim role = 'service_role' → backend legítimo → libera
--   • qualquer outro sem auth.uid() (inclui role 'anon') → NEGA
--
-- Ainda assim, **o que fecha o furo explorado é o REVOKE da seção 2**, não a
-- guarda: a guarda protege contra cross-tenant de usuário logado. Isso importa
-- porque o Supabase tem `ALTER DEFAULT PRIVILEGES ... TO anon, authenticated` —
-- toda função NOVA nasce executável por `anon`. Quem criar a 9ª RPC com
-- `p_org_id` precisa fazer AS DUAS COISAS: chamar `assert_org_scope()` e
-- revogar de `PUBLIC, anon`.
--
-- Caso de borda coberto: usuário autenticado SEM linha em `public.users`
-- (existem 2 em auth.users hoje) → `user_org_id()` é NULL → a guarda dispara e
-- NEGA. É o comportamento desejado (nenhum org legítimo a comparar).
-- =============================================================================


-- =============================================================================
-- 0. Helper: guarda de escopo de org para RPCs SECURITY DEFINER
-- =============================================================================
-- Um único ponto de auditoria/manutenção em vez de 8 cópias da mesma condição.
-- ERRCODE 42501 (insufficient_privilege) → PostgREST responde HTTP 403, o que
-- torna a violação distinguível de erro de aplicação nos logs.
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


-- =============================================================================
-- 1. P1 — 8 RPCs SECURITY DEFINER: validação de `p_org_id`
-- =============================================================================
-- Regras seguidas em TODAS as 8:
--   • assinatura, tipo de retorno, volatilidade, SECURITY DEFINER e search_path
--     preservados exatamente como estão em produção hoje;
--   • lógica de negócio NÃO alterada — só a guarda foi acrescentada;
--   • as 4 que eram `LANGUAGE sql` foram convertidas para `plpgsql` porque SQL
--     puro não tem IF/RAISE. Alternativas em SQL (guarda dentro do WHERE / CTE)
--     dependem de o planner avaliar a expressão, o que não é garantia
--     contratual — inaceitável para um controle de segurança. A query interna é
--     byte-a-byte a mesma.
-- -----------------------------------------------------------------------------

-- 1.1 broker_active_leads_count — era LANGUAGE sql
CREATE OR REPLACE FUNCTION public.broker_active_leads_count(p_org_id uuid, p_broker_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  RETURN (
      SELECT COUNT(*)::integer
        FROM leads l
       WHERE l.org_id = p_org_id
         AND l.assigned_broker_id = p_broker_user_id
         AND l.is_active = true
         AND l.lost_reason IS NULL
         AND l.segmento = 'principal'
         AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008',  -- Perdido
                                '95327bd7-3e88-4038-aa16-250a74ab085c') -- Não Qualificado
  );
END;
$function$;

-- 1.2 get_brokers_active_lead_counts — era LANGUAGE sql
-- A checagem `public_user_id() IS NULL OR EXISTS(...)` do corpo original é
-- mantida (não altero lógica); a guarda nova é estritamente mais forte.
CREATE OR REPLACE FUNCTION public.get_brokers_active_lead_counts(p_org_id uuid)
 RETURNS TABLE(user_id uuid, active_leads integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  RETURN QUERY
  SELECT b.user_id,
         public.broker_active_leads_count(p_org_id, b.user_id)
    FROM brokers b
   WHERE b.org_id = p_org_id
     AND b.user_id IS NOT NULL
     AND (public_user_id() IS NULL
          OR EXISTS (SELECT 1 FROM users u
                      WHERE u.id = public_user_id()
                        AND u.org_id = p_org_id));
END;
$function$;

-- 1.3 get_whatsapp_cost_summary — era LANGUAGE sql
CREATE OR REPLACE FUNCTION public.get_whatsapp_cost_summary(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  WITH sends AS (
    SELECT l.category, l.created_at, COALESCE(p.price_brl, 0) AS price
    FROM public.whatsapp_send_log l
    LEFT JOIN public.whatsapp_pricing p ON p.category = l.category
    WHERE l.org_id = p_org_id
      AND l.status = 'sent'
      AND l.created_at >= now() - interval '30 days'
  )
  SELECT jsonb_build_object(
    'h24', jsonb_build_object(
      'disparos',  count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
      'custo_brl', COALESCE(round(sum(price) FILTER (WHERE created_at >= now() - interval '24 hours'), 2), 0)
    ),
    'd7', jsonb_build_object(
      'disparos',  count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
      'custo_brl', COALESCE(round(sum(price) FILTER (WHERE created_at >= now() - interval '7 days'), 2), 0)
    ),
    'd30', jsonb_build_object(
      'disparos',  count(*),
      'custo_brl', COALESCE(round(sum(price), 2), 0),
      'por_categoria', (
        SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
        FROM (SELECT category, count(*) AS cnt FROM sends GROUP BY category) z
      )
    )
  )
  INTO v_result
  FROM sends;

  RETURN v_result;
END;
$function$;

-- 1.4 get_whatsapp_volume_summary — era LANGUAGE sql
CREATE OR REPLACE FUNCTION public.get_whatsapp_volume_summary(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  WITH msgs AS (
    SELECT m.role, m.created_at
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.org_id = p_org_id
      AND c.channel = 'whatsapp'
      AND m.created_at >= now() - interval '30 days'
  )
  SELECT jsonb_build_object(
    'h24', jsonb_build_object(
      'recebidas', count(*) FILTER (WHERE role = 'user'                    AND created_at >= now() - interval '24 hours'),
      'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')   AND created_at >= now() - interval '24 hours'),
      'total',     count(*) FILTER (WHERE created_at >= now() - interval '24 hours')
    ),
    'd7', jsonb_build_object(
      'recebidas', count(*) FILTER (WHERE role = 'user'                    AND created_at >= now() - interval '7 days'),
      'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')   AND created_at >= now() - interval '7 days'),
      'total',     count(*) FILTER (WHERE created_at >= now() - interval '7 days')
    ),
    'd30', jsonb_build_object(
      'recebidas', count(*) FILTER (WHERE role = 'user'),
      'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')),
      'total',     count(*)
    )
  )
  INTO v_result
  FROM msgs;

  RETURN v_result;
END;
$function$;

-- 1.5 get_broker_dashboard_counts — já era plpgsql (sem SET search_path: preservado
-- exatamente como está em produção; adicionar search_path aqui seria mudança fora
-- do escopo deste hotfix — registrado como follow-up na auditoria).
CREATE OR REPLACE FUNCTION public.get_broker_dashboard_counts(p_org_id uuid, p_broker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_aguardando_stage_id uuid := '00000000-0000-0000-0001-000000000001';
  v_today_start timestamptz; v_tomorrow_start timestamptz;
  v_total integer; v_novos integer; v_sem_tarefas integer; v_atrasadas integer; v_para_hoje integer; v_futuras integer;
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  v_today_start := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';
  SELECT COUNT(*)::integer INTO v_total FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);
  SELECT COUNT(*)::integer INTO v_novos FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND l.stage_id = v_aguardando_stage_id AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);
  SELECT COUNT(*)::integer INTO v_sem_tarefas FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND NOT EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = l.id AND lt.completed_at IS NULL);
  SELECT COUNT(DISTINCT l.id)::integer INTO v_atrasadas FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at < v_today_start;
  SELECT COUNT(DISTINCT l.id)::integer INTO v_para_hoje FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at >= v_today_start AND lt.due_at < v_tomorrow_start;
  SELECT COUNT(DISTINCT l.id)::integer INTO v_futuras FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at >= v_tomorrow_start;
  RETURN jsonb_build_object('total', v_total, 'novos', v_novos, 'trabalhados', v_total - v_novos,
    'sem_tarefas', v_sem_tarefas, 'atrasadas', v_atrasadas, 'para_hoje', v_para_hoje, 'futuras', v_futuras);
END;
$function$;

-- 1.6 get_broker_funnel_stats — já era plpgsql (sem SET search_path: preservado)
CREATE OR REPLACE FUNCTION public.get_broker_funnel_stats(p_org_id uuid, p_broker_id uuid)
 RETURNS TABLE(stage_id uuid, stage_name text, stage_slug text, stage_color text, stage_position integer, total_leads integer, leads_atrasadas integer, leads_para_hoje integer, leads_futuras integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_today_start timestamptz; v_tomorrow_start timestamptz;
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  v_today_start := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';
  RETURN QUERY
  SELECT ks.id, ks.name::text, ks.slug::text, ks.color::text, ks.position,
    COUNT(DISTINCT l.id)::integer,
    COUNT(DISTINCT CASE WHEN lt.completed_at IS NULL AND lt.due_at < v_today_start THEN l.id END)::integer,
    COUNT(DISTINCT CASE WHEN lt.completed_at IS NULL AND lt.due_at >= v_today_start AND lt.due_at < v_tomorrow_start THEN l.id END)::integer,
    COUNT(DISTINCT CASE WHEN lt.completed_at IS NULL AND lt.due_at >= v_tomorrow_start THEN l.id END)::integer
  FROM kanban_stages ks
  LEFT JOIN leads l ON l.stage_id = ks.id AND l.org_id = p_org_id AND l.segmento = 'principal'
    AND l.is_active = true AND l.lost_reason IS NULL AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
  LEFT JOIN lead_tasks lt ON lt.lead_id = l.id
  WHERE ks.is_active = true GROUP BY ks.id, ks.name, ks.slug, ks.color, ks.position ORDER BY ks.position;
END; $function$;

-- 1.7 roleta_pick_and_advance — ESCRITA. Chamada por service-role
-- (packages/web/src/lib/roleta/distributor.ts, `createAdminClient()`), onde
-- auth.uid() é NULL → guarda não se aplica. Nenhum call site com client de
-- usuário foi encontrado. A guarda entra ANTES do advisory lock para falhar
-- rápido, sem tomar lock em nome de um chamador inválido.
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
     -- Filtro de empreendimento — Story 75-226: role 'sdr' atende qualquer
     -- empreendimento (bypass de broker_assignments)
     AND (p_property_id IS NULL
          OR EXISTS (
               SELECT 1 FROM broker_assignments ba
                WHERE ba.broker_id   = b.id
                  AND ba.property_id = p_property_id)
          OR EXISTS (
               SELECT 1 FROM users u
                WHERE u.id   = b.user_id
                  AND u.role = 'sdr'))
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
$function$;

-- 1.8 seed_system_roles — ESCRITA (provisionamento de org). ZERO call sites em
-- TS/JS no repositório: é executada por `postgres`/service-role (SQL manual ou
-- rotina de provisionamento), onde auth.uid() é NULL → guarda não se aplica.
-- (sem SET search_path: preservado como está em produção)
CREATE OR REPLACE FUNCTION public.seed_system_roles(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_admin_id      uuid;
  v_supervisor_id uuid;
  v_broker_id     uuid;
  v_obras_id      uuid;
BEGIN
  PERFORM public.assert_org_scope(p_org_id);

  -- 1. Inserir os 4 system roles
  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'admin', 'Administrador', 'purple', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'supervisor', 'Supervisor', 'blue', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'broker', 'Corretor', 'green', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO roles (org_id, name, label, color, is_system)
  VALUES (p_org_id, 'obras', 'Obras', 'yellow', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- 2. Buscar IDs dos roles
  SELECT id INTO v_admin_id      FROM roles WHERE org_id = p_org_id AND name = 'admin';
  SELECT id INTO v_supervisor_id FROM roles WHERE org_id = p_org_id AND name = 'supervisor';
  SELECT id INTO v_broker_id     FROM roles WHERE org_id = p_org_id AND name = 'broker';
  SELECT id INTO v_obras_id      FROM roles WHERE org_id = p_org_id AND name = 'obras';

  -- 3. Matriz de permissões (18 módulos × 4 roles)
  -- admin: acesso total
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_admin_id, 'dashboard',     true),
    (p_org_id, v_admin_id, 'pipeline',      true),
    (p_org_id, v_admin_id, 'leads',         true),
    (p_org_id, v_admin_id, 'imoveis',       true),
    (p_org_id, v_admin_id, 'corretores',    true),
    (p_org_id, v_admin_id, 'roleta',        true),
    (p_org_id, v_admin_id, 'conversas',     true),
    (p_org_id, v_admin_id, 'agenda',        true),
    (p_org_id, v_admin_id, 'alertas',       true),
    (p_org_id, v_admin_id, 'atividades',    true),
    (p_org_id, v_admin_id, 'analytics',     true),
    (p_org_id, v_admin_id, 'campanhas',     true),
    (p_org_id, v_admin_id, 'chamados',      true),
    (p_org_id, v_admin_id, 'treinamento',   true),
    (p_org_id, v_admin_id, 'obras',         true),
    (p_org_id, v_admin_id, 'brindes',       true),
    (p_org_id, v_admin_id, 'mensagens',     true),
    (p_org_id, v_admin_id, 'configuracoes', true),
    (p_org_id, v_admin_id, 'sistema',       true)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- supervisor: tudo exceto configuracoes e sistema
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_supervisor_id, 'dashboard',     true),
    (p_org_id, v_supervisor_id, 'pipeline',      true),
    (p_org_id, v_supervisor_id, 'leads',         true),
    (p_org_id, v_supervisor_id, 'imoveis',       true),
    (p_org_id, v_supervisor_id, 'corretores',    true),
    (p_org_id, v_supervisor_id, 'roleta',        true),
    (p_org_id, v_supervisor_id, 'conversas',     true),
    (p_org_id, v_supervisor_id, 'agenda',        true),
    (p_org_id, v_supervisor_id, 'alertas',       true),
    (p_org_id, v_supervisor_id, 'atividades',    true),
    (p_org_id, v_supervisor_id, 'analytics',     true),
    (p_org_id, v_supervisor_id, 'campanhas',     true),
    (p_org_id, v_supervisor_id, 'chamados',      true),
    (p_org_id, v_supervisor_id, 'treinamento',   true),
    (p_org_id, v_supervisor_id, 'obras',         true),
    (p_org_id, v_supervisor_id, 'brindes',       true),
    (p_org_id, v_supervisor_id, 'mensagens',     true),
    (p_org_id, v_supervisor_id, 'configuracoes', false),
    (p_org_id, v_supervisor_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- broker: operação no dia-a-dia
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_broker_id, 'dashboard',     false),
    (p_org_id, v_broker_id, 'pipeline',      true),
    (p_org_id, v_broker_id, 'leads',         true),
    (p_org_id, v_broker_id, 'imoveis',       true),
    (p_org_id, v_broker_id, 'corretores',    false),
    (p_org_id, v_broker_id, 'roleta',        false),
    (p_org_id, v_broker_id, 'conversas',     true),
    (p_org_id, v_broker_id, 'agenda',        true),
    (p_org_id, v_broker_id, 'alertas',       true),
    (p_org_id, v_broker_id, 'atividades',    true),
    (p_org_id, v_broker_id, 'analytics',     false),
    (p_org_id, v_broker_id, 'campanhas',     false),
    (p_org_id, v_broker_id, 'chamados',      true),
    (p_org_id, v_broker_id, 'treinamento',   true),
    (p_org_id, v_broker_id, 'obras',         false),
    (p_org_id, v_broker_id, 'brindes',       false),
    (p_org_id, v_broker_id, 'mensagens',     false),
    (p_org_id, v_broker_id, 'configuracoes', false),
    (p_org_id, v_broker_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;

  -- obras: acesso restrito a obras e brindes
  INSERT INTO role_permissions (org_id, role_id, module, can_access) VALUES
    (p_org_id, v_obras_id, 'dashboard',     false),
    (p_org_id, v_obras_id, 'pipeline',      false),
    (p_org_id, v_obras_id, 'leads',         false),
    (p_org_id, v_obras_id, 'imoveis',       false),
    (p_org_id, v_obras_id, 'corretores',    false),
    (p_org_id, v_obras_id, 'roleta',        false),
    (p_org_id, v_obras_id, 'conversas',     false),
    (p_org_id, v_obras_id, 'agenda',        false),
    (p_org_id, v_obras_id, 'alertas',       false),
    (p_org_id, v_obras_id, 'atividades',    false),
    (p_org_id, v_obras_id, 'analytics',     false),
    (p_org_id, v_obras_id, 'campanhas',     false),
    (p_org_id, v_obras_id, 'chamados',      false),
    (p_org_id, v_obras_id, 'treinamento',   false),
    (p_org_id, v_obras_id, 'obras',         true),
    (p_org_id, v_obras_id, 'brindes',       true),
    (p_org_id, v_obras_id, 'mensagens',     false),
    (p_org_id, v_obras_id, 'configuracoes', false),
    (p_org_id, v_obras_id, 'sistema',       false)
  ON CONFLICT (role_id, module) DO NOTHING;
END;
$function$;


-- =============================================================================
-- 2. P1 — REVOKE EXECUTE das 8 RPCs de PUBLIC e de `anon`
-- =============================================================================
-- `CREATE OR REPLACE FUNCTION` PRESERVA a ACL existente — por isso o revoke vem
-- depois, garantindo o estado final independente da ordem de reaplicação.
-- Nenhuma das 8 tem caso de uso anônimo legítimo (todos os call sites passam por
-- sessão autenticada ou service-role). `authenticated` e `service_role` mantêm
-- seus grants explícitos.

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_cost_summary(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_volume_summary(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_broker_dashboard_counts(uuid, uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_broker_funnel_stats(uuid, uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_brokers_active_lead_counts(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.broker_active_leads_count(uuid, uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_system_roles(uuid)                    FROM PUBLIC, anon;

-- Garantia explícita de que os consumidores legítimos seguem podendo executar
-- (idempotente; protege contra um revoke largo demais numa reaplicação futura).
GRANT EXECUTE ON FUNCTION public.get_whatsapp_cost_summary(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_volume_summary(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_broker_dashboard_counts(uuid, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_broker_funnel_stats(uuid, uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_brokers_active_lead_counts(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broker_active_leads_count(uuid, uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_system_roles(uuid)                    TO authenticated, service_role;


-- =============================================================================
-- 3. P2 — `v_mensagens_admin` (VIEW) e `meta_campaign_roas` (MATERIALIZED VIEW)
-- =============================================================================
-- ⚠️ OS DOIS OBJETOS SÃO DE TIPOS DIFERENTES e exigem tratamentos diferentes.
-- A auditoria os agrupou como "2 views"; só `v_mensagens_admin` é view.
--
--   v_mensagens_admin  → pg_class.relkind = 'v'  (view)
--   meta_campaign_roas → pg_class.relkind = 'm'  (MATERIALIZED VIEW)
--
-- `meta_campaign_roas` foi materializada em
-- `035_materialize_meta_campaign_roas_remote_only.sql` (Story 29.6) e é
-- atualizada por `pg_cron` (jobid=5, `0 */3 * * *`, `REFRESH MATERIALIZED VIEW
-- CONCURRENTLY`, sob o usuário `postgres`) — ver nota em
-- `036_pg_cron_cleanup_jobs_remote_only.sql:24`.
--
-- Consequências, ambas verificadas:
--
--   1. `ALTER VIEW ... SET (security_invoker = on)` sobre relkind='m' levanta
--      ERRCODE 42809 ("... is not a view"). Não existe `security_invoker` para
--      matview. Por isso NÃO há ALTER para `meta_campaign_roas` aqui.
--
--   2. RLS é INAPLICÁVEL a matview: o conteúdo é materializado no REFRESH, que
--      roda como `postgres` (`rolbypassrls = true`), então nenhuma policy de
--      tabela-base filtra a leitura. Confirmado: `relrowsecurity = false`,
--      0 policies. **O único controle de acesso possível é o GRANT.**
--      → Logo o revoke tem de incluir `authenticated`, não só `anon`. Sem isso
--        qualquer usuário logado (corretor incluso) segue lendo total_spend,
--        total_revenue, roas e cpl_real de TODAS as campanhas via PostgREST.
--        ACL antes: anon/authenticated/service_role/postgres todos `arwdDxtm`.
--
-- Call sites verificados antes de aplicar:
--
--   • v_mensagens_admin → ZERO consumidores no repositório (view órfã; o
--     /api/admin/mensagens consulta obra_mensagens direto). Risco nulo.
--     Tabelas-base (obra_mensagens, obras) têm policy `*_manage_admin` ancorada
--     em `org_id = user_org_id() AND is_admin_or_supervisor()`, então mesmo se
--     voltar a ter consumidor admin ela funciona. Revogamos só de `anon` —
--     `authenticated` continua podendo ler, agora sujeito à RLS das bases.
--     (As três `v_lead_*` já estão com invoker `on` e ACL `authenticated=rm`
--     sem anon — é o padrão correto que já funciona no projeto.)
--
--   • meta_campaign_roas → 1 consumidor:
--     app/api/meta-ads/campaigns/[campaign_id]/route.ts:390, que JÁ foi migrado
--     nesta mesma entrega para `createAdminClient()` (service-role, com
--     `.eq("org_id", …)` explícito — padrão de 131_imobiliarias.sql). O refresh
--     roda como `postgres`. Portanto revogar `authenticated` NÃO quebra nada.
--     Sem essa mudança de código, NÃO aplique o revoke abaixo.
ALTER VIEW public.v_mensagens_admin SET (security_invoker = on);

REVOKE ALL ON TABLE public.v_mensagens_admin  FROM anon;
REVOKE ALL ON TABLE public.meta_campaign_roas FROM anon, authenticated;


-- =============================================================================
-- 4. P3 — `system_events`: DROP da policy permissiva `USING(true)`
-- =============================================================================
-- ITEM MAIS GRAVE DESTE HOTFIX. A policy "Service role full access" é
-- ALL / USING(true) / CHECK(true) para o role `public` — e `public` inclui
-- `anon`, não só `authenticated`. Policies permissivas combinam com OR, então
-- ela ANULAVA a policy org-scoped que existe ao lado. Service-role ignora RLS
-- por natureza e nunca precisou dessa policy.
--
-- A auditoria classificou como "vaza para qualquer usuário logado" — está
-- SUBESTIMADO. Medido com a anon key em 2026-07-29:
--   GET /rest/v1/system_events?select=*&limit=1  →  HTTP 206
--   content-range: 0-0/10157   ← a tabela INTEIRA, sem login
--
-- Verificação feita antes de aplicar — nenhuma gravação usa client de usuário:
--   • lib/logger.ts (único writer da aplicação)      → createAdminClient()
--   • api/admin/email-stats/route.ts (read + alertas) → createAdminClient()
--   • scripts/cleanup-duplicate-leads.ts             → SUPABASE_SERVICE_ROLE_KEY
--   • ZERO funções/triggers no banco escrevem em system_events (pg_proc.prosrc)
--   • único leitor com client de usuário: api/system-events/route.ts, que é
--     admin-gated (403) e JÁ filtra `.eq("org_id", user.orgId)` → coberto pela
--     policy "Admins can read org events".
--   • get_system_events_summary NÃO é SECURITY DEFINER, mas já tem
--     `WHERE org_id = p_org_id` no corpo → resultado idêntico após o drop.
--
-- Efeito colateral aceito e desejado: as linhas com `org_id IS NULL` — 63,6% da
-- tabela, eventos de webhook/cron sem contexto de org (6.463 de 10.157 na
-- medição de 2026-07-29; a tabela é um log e cresce, então vale a proporção, não
-- o número absoluto) — deixam de ser alcançáveis por client de usuário. Nenhum
-- caminho de UI as lia: todos os leitores filtram org explicitamente.
DROP POLICY IF EXISTS "Service role full access" ON public.system_events;


-- =============================================================================
-- 5. P6 — `financial_notification_log`: policy ancorada em org
-- =============================================================================
-- A policy usava `is_admin_or_supervisor()` sem org, apesar de a tabela TER
-- org_id. Admin/supervisor de outra empresa leria notificações financeiras
-- (inadimplência, boletos, parcelas) dos clientes desta.
-- Comportamento hoje (1 org, 66 linhas, ZERO com org_id NULL): idêntico.
-- Consumidor verificado: api/sistema/notificacoes-financeiras/route.ts usa
-- createAdminClient() (service-role ignora RLS) — mudança é defesa em
-- profundidade, sem impacto funcional. O writer
-- (lib/financeiro/log-financial-notification.ts) também é service-role.
DROP POLICY IF EXISTS fin_notif_select ON public.financial_notification_log;
CREATE POLICY fin_notif_select ON public.financial_notification_log
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());


-- =============================================================================
-- 6. P4 (mitigação) — REVOKE das 5 tabelas de custo interno da plataforma
-- =============================================================================
-- Estas tabelas guardam o custo que a TRIFOLD paga (Anthropic, Vercel, Supabase…).
-- A policy `admin_only` é `user_role() = 'admin'` SEM noção de org: no instante
-- em que o primeiro cliente ganha uma conta admin — que é o próprio modelo de
-- provisionamento aprovado — esse cliente lê nosso custo e, como a cobrança é
-- custo + markup, deduz nossa margem. Dano comercial, não só técnico.
--
-- O papel `platform_admin` definitivo depende de ADR-004 (trabalho futuro).
-- Aqui vai só a mitigação: nenhum acesso por client de usuário; leitura apenas
-- via service-role em rota gated por admin (padrão de 131_imobiliarias.sql).
-- `anon` também é revogado (hoje só a RLS o bloqueava — os grants estavam lá).
--
-- Rotas migradas para createAdminClient() na MESMA entrega (sem elas o Painel
-- Saúde & Billing do Epic 78 quebra com 403/lista vazia):
--   • api/admin/billing-panel/route.ts            (GET)
--   • api/admin/billing-reminders/route.ts        (GET, POST)
--   • api/admin/billing-reminders/[id]/route.ts   (PATCH, DELETE)
-- Já eram service-role (nada a mudar): api/cron/billing-*, lib/billing-collectors/*,
-- lib/billing/subscriptions/*.
REVOKE ALL ON TABLE
  public.platform_services,
  public.service_cost_snapshots,
  public.service_billing_reminders,
  public.billing_cost_alerts_sent,
  public.billing_monthly_summary_log
FROM authenticated, anon;


-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO (read-only — rodar depois do deploy)
-- =============================================================================
-- Deve retornar ZERO linhas. Qualquer linha = item do hotfix que não pegou.
--
-- WITH esperado AS (
--   -- P1: nenhuma das 8 RPCs executável por anon, e todas validam org
--   SELECT p.proname AS obj, 'P1: ainda executavel por anon' AS falha
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('get_whatsapp_cost_summary','get_whatsapp_volume_summary',
--                        'get_broker_dashboard_counts','get_broker_funnel_stats',
--                        'get_brokers_active_lead_counts','broker_active_leads_count',
--                        'roleta_pick_and_advance','seed_system_roles')
--      AND has_function_privilege('anon', p.oid, 'EXECUTE')
--   UNION ALL
--   SELECT p.proname, 'P1: sem guarda de org no corpo'
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('get_whatsapp_cost_summary','get_whatsapp_volume_summary',
--                        'get_broker_dashboard_counts','get_broker_funnel_stats',
--                        'get_brokers_active_lead_counts','broker_active_leads_count',
--                        'roleta_pick_and_advance','seed_system_roles')
--      AND position('assert_org_scope' in pg_get_functiondef(p.oid)) = 0
--   UNION ALL
--   -- P2a: VIEW (relkind='v') → precisa de security_invoker E sem acesso anon.
--   SELECT c.relname, 'P2: view sem security_invoker ou ainda legivel por anon'
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname = 'v_mensagens_admin'
--      AND c.relkind = 'v'
--      AND (coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
--                      WHERE option_name = 'security_invoker'), 'off') NOT IN ('on','true')
--           OR has_table_privilege('anon', c.oid, 'SELECT'))
--   UNION ALL
--   -- P2b: MATERIALIZED VIEW (relkind='m') → NÃO existe security_invoker e RLS é
--   -- inaplicável (conteúdo materializado no REFRESH sob `postgres`, que tem
--   -- rolbypassrls). O único controle é o GRANT: exigimos ausência de SELECT
--   -- para anon E para authenticated. Checar security_invoker aqui acusaria
--   -- falha permanente e legítima.
--   SELECT c.relname, 'P2: matview ainda legivel por anon ou authenticated'
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname = 'meta_campaign_roas'
--      AND c.relkind = 'm'
--      AND (has_table_privilege('anon', c.oid, 'SELECT')
--           OR has_table_privilege('authenticated', c.oid, 'SELECT'))
--   UNION ALL
--   -- P2c: trava de regressão — se meta_campaign_roas voltar a ser view comum
--   -- (ou v_mensagens_admin virar matview), o tratamento acima deixa de valer.
--   SELECT c.relname, 'P2: relkind mudou — revisar o tratamento deste objeto'
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND ((c.relname = 'meta_campaign_roas' AND c.relkind <> 'm')
--        OR (c.relname = 'v_mensagens_admin'  AND c.relkind <> 'v'))
--   UNION ALL
--   -- P3: policy permissiva removida
--   SELECT tablename, 'P3: policy USING(true) ainda presente'
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'system_events'
--      AND btrim(coalesce(qual, '')) = 'true'
--   UNION ALL
--   -- P6: policy ancorada em org
--   SELECT tablename, 'P6: fin_notif_select sem org_id'
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'financial_notification_log'
--      AND policyname = 'fin_notif_select'
--      AND coalesce(qual, '') NOT LIKE '%org_id%'
--   UNION ALL
--   -- P4: tabelas de plataforma inacessíveis a authenticated/anon
--   SELECT c.relname, 'P4: tabela de custo interno ainda legivel por authenticated/anon'
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname IN ('platform_services','service_cost_snapshots',
--                        'service_billing_reminders','billing_cost_alerts_sent',
--                        'billing_monthly_summary_log')
--      AND (has_table_privilege('authenticated', c.oid, 'SELECT')
--           OR has_table_privilege('anon', c.oid, 'SELECT'))
-- )
-- SELECT * FROM esperado;


-- =============================================================================
-- ROLLBACK (comentado — para uso em incidente)
-- =============================================================================
-- Não há migration `down` no projeto e não existe story para a 209. Este bloco
-- existe para que ninguém precise extrair definição de `pg_get_functiondef()`ish
-- no meio de um incidente. Aplicar EM TRANSAÇÃO ÚNICA, igual ao caminho de ida.
--
-- ⚠️ REVERTER É REABRIR VAZAMENTO CONFIRMADO. Prefira reverter só a seção
-- suspeita. Ordem de preferência, do menos ao mais arriscado:
--   1º  P4  → `GRANT ALL ON TABLE … TO authenticated;` (restaura o painel 78)
--   2º  P2  → `GRANT SELECT ON TABLE … TO authenticated;` na matview
--   3º  P6  → recriar a policy sem o `org_id`
--   4º  P1  → restaurar os corpos (abaixo)
--   ✖  P3  → **NÃO recriar** a policy `USING(true)`. Ela expunha a tabela
--            INTEIRA de system_events a `anon` (10.157 linhas, sem login).
--            Se algum writer quebrar, a correção certa é fazer aquele writer
--            usar service-role — nunca reabrir a policy.
--
-- -----------------------------------------------------------------------------
-- P1 — as 4 funções que voltam a `LANGUAGE sql` (as únicas não triviais)
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.broker_active_leads_count(p_org_id uuid, p_broker_user_id uuid)
--  RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
--       SELECT COUNT(*)::integer
--         FROM leads l
--        WHERE l.org_id = p_org_id
--          AND l.assigned_broker_id = p_broker_user_id
--          AND l.is_active = true
--          AND l.lost_reason IS NULL
--          AND l.segmento = 'principal'
--          AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008',
--                                 '95327bd7-3e88-4038-aa16-250a74ab085c');
--     $function$;
--
-- CREATE OR REPLACE FUNCTION public.get_brokers_active_lead_counts(p_org_id uuid)
--  RETURNS TABLE(user_id uuid, active_leads integer)
--  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
--   SELECT b.user_id,
--          public.broker_active_leads_count(p_org_id, b.user_id)
--     FROM brokers b
--    WHERE b.org_id = p_org_id
--      AND b.user_id IS NOT NULL
--      AND (public_user_id() IS NULL
--           OR EXISTS (SELECT 1 FROM users u
--                       WHERE u.id = public_user_id()
--                         AND u.org_id = p_org_id));
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.get_whatsapp_cost_summary(p_org_id uuid)
--  RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
--   WITH sends AS (
--     SELECT l.category, l.created_at, COALESCE(p.price_brl, 0) AS price
--     FROM public.whatsapp_send_log l
--     LEFT JOIN public.whatsapp_pricing p ON p.category = l.category
--     WHERE l.org_id = p_org_id
--       AND l.status = 'sent'
--       AND l.created_at >= now() - interval '30 days'
--   )
--   SELECT jsonb_build_object(
--     'h24', jsonb_build_object(
--       'disparos',  count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
--       'custo_brl', COALESCE(round(sum(price) FILTER (WHERE created_at >= now() - interval '24 hours'), 2), 0)
--     ),
--     'd7', jsonb_build_object(
--       'disparos',  count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
--       'custo_brl', COALESCE(round(sum(price) FILTER (WHERE created_at >= now() - interval '7 days'), 2), 0)
--     ),
--     'd30', jsonb_build_object(
--       'disparos',  count(*),
--       'custo_brl', COALESCE(round(sum(price), 2), 0),
--       'por_categoria', (
--         SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
--         FROM (SELECT category, count(*) AS cnt FROM sends GROUP BY category) z
--       )
--     )
--   )
--   FROM sends;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.get_whatsapp_volume_summary(p_org_id uuid)
--  RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
--   WITH msgs AS (
--     SELECT m.role, m.created_at
--     FROM public.messages m
--     JOIN public.conversations c ON c.id = m.conversation_id
--     WHERE c.org_id = p_org_id
--       AND c.channel = 'whatsapp'
--       AND m.created_at >= now() - interval '30 days'
--   )
--   SELECT jsonb_build_object(
--     'h24', jsonb_build_object(
--       'recebidas', count(*) FILTER (WHERE role = 'user'                    AND created_at >= now() - interval '24 hours'),
--       'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')   AND created_at >= now() - interval '24 hours'),
--       'total',     count(*) FILTER (WHERE created_at >= now() - interval '24 hours')
--     ),
--     'd7', jsonb_build_object(
--       'recebidas', count(*) FILTER (WHERE role = 'user'                    AND created_at >= now() - interval '7 days'),
--       'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')   AND created_at >= now() - interval '7 days'),
--       'total',     count(*) FILTER (WHERE created_at >= now() - interval '7 days')
--     ),
--     'd30', jsonb_build_object(
--       'recebidas', count(*) FILTER (WHERE role = 'user'),
--       'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')),
--       'total',     count(*)
--     )
--   )
--   FROM msgs;
-- $function$;
--
-- -----------------------------------------------------------------------------
-- P1 — as outras 4 (get_broker_dashboard_counts, get_broker_funnel_stats,
-- roleta_pick_and_advance, seed_system_roles) já eram plpgsql: reverter = apenas
-- REMOVER a linha `PERFORM public.assert_org_scope(p_org_id);` logo após o
-- BEGIN. O resto do corpo neste arquivo é byte-a-byte o de produção.
-- -----------------------------------------------------------------------------
--
-- P1 — grants de volta (o estado original tinha EXECUTE para PUBLIC em 5 delas):
-- GRANT EXECUTE ON FUNCTION public.get_whatsapp_cost_summary(uuid)         TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.get_whatsapp_volume_summary(uuid)       TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.get_broker_dashboard_counts(uuid,uuid)  TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.get_broker_funnel_stats(uuid,uuid)      TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.seed_system_roles(uuid)                 TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.get_brokers_active_lead_counts(uuid)    TO anon;
-- GRANT EXECUTE ON FUNCTION public.broker_active_leads_count(uuid,uuid)    TO anon;
-- GRANT EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid,uuid,uuid,integer) TO anon;
-- DROP FUNCTION IF EXISTS public.assert_org_scope(uuid);
--
-- P2 — ACL original era `arwdDxtm` para anon e authenticated nos dois objetos:
-- ALTER VIEW public.v_mensagens_admin SET (security_invoker = off);
-- GRANT ALL ON TABLE public.v_mensagens_admin  TO anon;
-- GRANT ALL ON TABLE public.meta_campaign_roas TO anon, authenticated;
--   (NOTA: não use ALTER VIEW em meta_campaign_roas — é MATERIALIZED VIEW.)
--
-- P6 — policy original (sem escopo de org):
-- DROP POLICY IF EXISTS fin_notif_select ON public.financial_notification_log;
-- CREATE POLICY fin_notif_select ON public.financial_notification_log
--   FOR SELECT TO authenticated USING (is_admin_or_supervisor());
--
-- P4 — grants originais (Supabase default: ALL para anon e authenticated):
-- GRANT ALL ON TABLE public.platform_services, public.service_cost_snapshots,
--                    public.service_billing_reminders, public.billing_cost_alerts_sent,
--                    public.billing_monthly_summary_log
--   TO authenticated, anon;
--   (Só necessário se as rotas de billing forem revertidas para client de usuário.)

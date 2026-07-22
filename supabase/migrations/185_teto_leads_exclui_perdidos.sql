-- 185_teto_leads_exclui_perdidos.sql
-- Story 75-198 — Teto de leads ativos: excluir etapas Perdido/Não Qualificado.
--
-- BUG (reportado pelo Robson, 2026-07-22): pegar_lead_bolsao (mig 164) e
-- roleta_pick_and_advance (mig 156) contavam o teto como COUNT(*) de leads
-- is_active=true, INCLUINDO leads nas etapas Perdido/Não Qualificado. A Story
-- 75-153/mig 170 firmou "perdido = ETAPA" e corrigiu get_broker_dashboard_counts,
-- mas essas duas RPCs ficaram para trás: Robson tinha 301 "ativos" pela régua
-- antiga (>= max_leads 300 → 'teto' no bolsão + pulado pela roleta) e apenas 89
-- pela régua do dashboard do corretor.
--
-- FIX: régua única em broker_active_leads_count(), com o MESMO critério do
-- 'total' da mig 170 (org + segmento='principal' + is_active + lost_reason IS
-- NULL + etapa fora de Perdido/Não Qualificado), usada:
--   1. no guard 'teto' de pegar_lead_bolsao (resto IDÊNTICO à mig 164);
--   2. no filtro de max_leads de roleta_pick_and_advance (resto IDÊNTICO à 156);
--   3. em get_brokers_active_lead_counts(), consumida pela tela Config › Corretores
--      e pelo GET /api/brokers (que antes baixavam os leads e contavam em JS —
--      o PostgREST corta em 1000 linhas e a org tem 1400+ leads ativos, então a
--      tela mostrava 198/300 para um corretor com 301).
--
-- ACERVO (Corretores Antigos / Represamento) CONTINUA contando (decisão do
-- diretor, mig 170). stage_id IS NULL fica FORA da contagem — mesmo comportamento
-- do NOT IN da mig 170 (coerência tela × trava é o objetivo desta story).
--
-- GOTCHA dev DB: leads.segmento pode não existir no projeto dev (lição mig 184);
-- o DO block cria a variante sem o filtro de segmento nesse caso.

DO $do$
DECLARE
  v_has_segmento boolean;
  v_filtro_segmento text := '';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'segmento'
  ) INTO v_has_segmento;

  IF v_has_segmento THEN
    v_filtro_segmento := 'AND l.segmento = ''principal''';
  END IF;

  EXECUTE format($fn$
    CREATE OR REPLACE FUNCTION public.broker_active_leads_count(
      p_org_id uuid,
      p_broker_user_id uuid
    )
    RETURNS integer
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
      SELECT COUNT(*)::integer
        FROM leads l
       WHERE l.org_id = p_org_id
         AND l.assigned_broker_id = p_broker_user_id
         AND l.is_active = true
         AND l.lost_reason IS NULL
         %s
         AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008',  -- Perdido
                                '95327bd7-3e88-4038-aa16-250a74ab085c'); -- Não Qualificado
    $body$;
  $fn$, v_filtro_segmento);
END;
$do$;

REVOKE ALL ON FUNCTION public.broker_active_leads_count(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.broker_active_leads_count(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Contagem por corretor para as telas (elimina o download+reduce truncado).
-- SECURITY DEFINER para não depender do RLS de leads do chamador, com guard de
-- org: usuário autenticado só enxerga a própria org (public_user_id() → NULL em
-- service-role, que pode consultar qualquer org). Não é concedida a anon.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_brokers_active_lead_counts(p_org_id uuid)
RETURNS TABLE(user_id uuid, active_leads integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.user_id,
         public.broker_active_leads_count(p_org_id, b.user_id)
    FROM brokers b
   WHERE b.org_id = p_org_id
     AND b.user_id IS NOT NULL
     AND (public_user_id() IS NULL
          OR EXISTS (SELECT 1 FROM users u
                      WHERE u.id = public_user_id()
                        AND u.org_id = p_org_id));
$$;

REVOKE ALL ON FUNCTION public.get_brokers_active_lead_counts(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_brokers_active_lead_counts(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- pegar_lead_bolsao — IDÊNTICO à mig 164, exceto o guard 'teto' (régua única).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pegar_lead_bolsao(
  p_lead_id uuid,
  p_broker_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id       uuid;
  v_property_id  uuid;
  v_broker_id    uuid;
  v_max_leads    integer;
  v_lock_key     bigint;
  v_ex_dono      uuid;
BEGIN
  -- Serializa puxadas concorrentes DO MESMO lead (dois corretores no mesmo card).
  v_lock_key := ('x' || substr(md5(p_lead_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Lead precisa estar no bolsão (sem dono, marcado) e ativo.
  SELECT org_id, property_interest_id
    INTO v_org_id, v_property_id
    FROM leads
   WHERE id = p_lead_id
     AND is_active = true
     AND bolsao_em IS NOT NULL
     AND assigned_broker_id IS NULL;
  IF NOT FOUND THEN
    RETURN 'gone';
  END IF;

  -- Corretor disponível na org do lead.
  SELECT b.id, COALESCE(b.max_leads, 50)
    INTO v_broker_id, v_max_leads
    FROM brokers b
   WHERE b.user_id = p_broker_user_id
     AND b.org_id = v_org_id
     AND b.is_available = true;
  IF NOT FOUND THEN
    RETURN 'sem_corretor';
  END IF;

  -- Ex-dono (Story 75-149): quem deixou este lead cair no bolsão (último `bolsao_in`)
  -- não pode puxá-lo de volta. Só o ÚLTIMO dono é bloqueado; se não há `bolsao_in`
  -- (dado legado / outro caminho), v_ex_dono fica null e o guard não dispara.
  SELECT (a.metadata->>'from_broker_id')::uuid
    INTO v_ex_dono
    FROM activities a
   WHERE a.lead_id = p_lead_id
     AND a.type = 'bolsao_in'
   ORDER BY a.created_at DESC
   LIMIT 1;
  IF v_ex_dono IS NOT NULL AND v_ex_dono = p_broker_user_id THEN
    RETURN 'ex_dono';
  END IF;

  -- Teto (Story 75-198): régua única, SEM etapas Perdido/Não Qualificado.
  IF public.broker_active_leads_count(v_org_id, p_broker_user_id) >= v_max_leads THEN
    RETURN 'teto';
  END IF;

  -- Empreendimento: se o lead tem property_interest_id, o corretor precisa estar habilitado.
  IF v_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM broker_assignments ba
     WHERE ba.broker_id = v_broker_id
       AND ba.property_id = v_property_id
  ) THEN
    RETURN 'empreendimento';
  END IF;

  -- Atribuição atômica (guard final contra corrida).
  UPDATE leads
     SET assigned_broker_id = p_broker_user_id,
         bolsao_em = NULL
   WHERE id = p_lead_id
     AND bolsao_em IS NOT NULL
     AND assigned_broker_id IS NULL;
  IF NOT FOUND THEN
    RETURN 'gone';
  END IF;

  -- Reinicia o ciclo de 15 min (o cron bolsao-rebalance lê a última distribuição).
  INSERT INTO lead_distribution_log (org_id, lead_id, broker_id, status)
  VALUES (v_org_id, p_lead_id, v_broker_id, 'distributed');

  INSERT INTO activities (org_id, lead_id, user_id, type, description, metadata)
  VALUES (v_org_id, p_lead_id, p_broker_user_id, 'bolsao_pull',
          'Lead puxado do bolsão', jsonb_build_object('broker_user_id', p_broker_user_id));

  RETURN 'ok';
END;
$function$;

-- ---------------------------------------------------------------------------
-- roleta_pick_and_advance — IDÊNTICO à mig 156, exceto o filtro de max_leads
-- (régua única). Guards de bolsão/perdido, round-robin e atomicidade intactos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roleta_pick_and_advance(
  p_org_id            uuid,
  p_lead_id           uuid,
  p_property_id       uuid    DEFAULT NULL,
  p_max_leads_per_day integer DEFAULT NULL
)
RETURNS TABLE(
  broker_id      uuid,
  broker_user_id uuid,
  queue_id       uuid,
  broker_name    text,
  broker_email   text,
  broker_phone   text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key  bigint;
  v_queue_id  uuid;
  v_broker_id uuid;
  v_user_id   uuid;
  v_max_pos   integer;
BEGIN
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
     -- Filtro de empreendimento
     AND (p_property_id IS NULL OR EXISTS (
           SELECT 1 FROM broker_assignments ba
            WHERE ba.broker_id   = b.id
              AND ba.property_id = p_property_id))
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
  -- (guard atômico final)
  UPDATE leads
     SET assigned_broker_id = v_user_id
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
$$;

REVOKE ALL ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO service_role;

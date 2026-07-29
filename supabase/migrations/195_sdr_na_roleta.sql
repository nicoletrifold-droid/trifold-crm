-- 195_sdr_na_roleta.sql
-- Story 75-226 — SDR na fila da roleta: recebe leads e atende qualquer empreendimento.
--
-- 1) roleta_pick_and_advance: usuário com users.role = 'sdr' passa no filtro de
--    empreendimento SEM precisar de broker_assignments (SDR atende tudo; empreendimento
--    novo já nasce coberto). Corretores seguem filtrados por assignments como antes.
-- 2) Restaura o carimbo atômico `distribuido_em = now()` no UPDATE que atribui o
--    corretor (Story 75-106 / mig 142). As redefinições 156 e 185 perderam esse SET —
--    sem ele, lead cujo insert em lead_distribution_log falhe volta a ficar órfão do
--    relógio de SLA (sla-alerts) e do bolsão (bolsao-rebalance).
-- 3) Backfill: todo users.role = 'sdr' sem linha em brokers ganha uma
--    (type internal, max_leads 500, is_available true). NÃO entra na roleta_fila —
--    entrada na fila é ação manual do gestor no CRM (/dashboard/roleta).
--
-- Fora isso, função IDÊNTICA à mig 185 (guards de bolsão/perdido, teto régua única,
-- round-robin e atomicidade intactos).

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
$$;

REVOKE ALL ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Backfill: linha em brokers para todo SDR existente (idempotente).
-- brokers.user_id é UNIQUE → ON CONFLICT DO NOTHING cobre corrida com o app.
-- ---------------------------------------------------------------------------
INSERT INTO public.brokers (org_id, user_id, type, max_leads, is_available)
SELECT u.org_id, u.id, 'internal', 500, true
  FROM public.users u
 WHERE u.role = 'sdr'
   AND NOT EXISTS (SELECT 1 FROM public.brokers b WHERE b.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- 130_roleta_pick_no_bolsao.sql
-- Story 75-89 — Bolsão terminal: a roleta não pode re-atribuir um lead que está no bolsão.
--
-- CONTEXTO: quando um lead não é atendido em 15 min, o cron bolsao-rebalance (75-80)
-- faz assigned_broker_id=null + bolsao_em=now() (vai pro pool). Como a roleta só olhava
-- assigned_broker_id, o lead do bolsão (dono null) voltava a ser candidato e era
-- redistribuído automaticamente (principalmente pelo cron roleta-retry), gerando o
-- estado inconsistente (dono + bolsao_em) e o "lead fantasma" no pool.
--
-- FIX (defensivo — o distributor.ts e o roleta-retry já guardam antes de chamar):
-- roleta_pick_and_advance passa a ignorar leads com bolsao_em IS NOT NULL, tanto no
-- guard inicial quanto no UPDATE final. Único caminho de saída do bolsão continua
-- sendo pegar_lead_bolsao (migration 128, puxada manual, que zera bolsao_em).
-- Demais comportamento idêntico à 102 (round-robin, teto, empreendimento, atômico).

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

  -- Guard: se o lead já tem dono OU está no bolsão, aborta sem erro.
  -- Story 75-89: bolsao_em IS NOT NULL → bolsão é terminal p/ a roleta.
  IF EXISTS (
    SELECT 1 FROM leads
     WHERE id = p_lead_id
       AND (assigned_broker_id IS NOT NULL OR bolsao_em IS NOT NULL)
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
     -- Limite de leads ativos totais (por broker)
     AND (SELECT COUNT(*)
            FROM leads l
           WHERE l.assigned_broker_id = b.user_id
             AND l.is_active = true
             AND l.org_id = p_org_id) < COALESCE(b.max_leads, 50)
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

  -- Atribui o lead — só se ainda estiver sem corretor E fora do bolsão (guard atômico final)
  UPDATE leads
     SET assigned_broker_id = v_user_id
   WHERE id = p_lead_id
     AND assigned_broker_id IS NULL
     AND bolsao_em IS NULL;

  -- Se outra transação atribuiu / mandou pro bolsão entre o guard acima e agora, aborta.
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

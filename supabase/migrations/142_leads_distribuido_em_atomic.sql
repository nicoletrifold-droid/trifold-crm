-- 142_leads_distribuido_em_atomic.sql
-- Story 75-106 — Fix: lead atribuído sem lead_distribution_log fica órfão do SLA/bolsão.
--
-- CONTEXTO: o relógio de SLA e de bolsão é calculado EXCLUSIVAMENTE a partir de
-- lead_distribution_log (status='distributed'). O distributor atribui o corretor
-- dentro da RPC roleta_pick_and_advance (commit) e só DEPOIS faz um INSERT separado,
-- NÃO-checado, no lead_distribution_log. Se esse insert falha (ex.: timeout durante o
-- incidente de recursos do Supabase de 30/06–01/07), o lead fica atribuído + em
-- "Aguardando atendimento" + SEM log → invisível pro SLA e pro bolsão pra sempre.
-- Caso real: lead Giuseppe Leggi Junior (01/07 20:32 → Robson, nunca atendido).
--
-- FIX (Opção A — carimbo ATÔMICO): coluna leads.distribuido_em setada NO MESMO UPDATE
-- que atribui o corretor (impossível atribuir sem carimbar). SLA/bolsão/waiting passam a
-- usar COALESCE(timestamps do log, distribuido_em). O lead_distribution_log continua
-- existindo pra analytics/auditoria — não é mais a ÚNICA fonte do relógio de espera.

-- 1) Coluna do relógio de distribuição (fonte primária a partir de agora)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS distribuido_em timestamptz;

COMMENT ON COLUMN public.leads.distribuido_em IS
  'Story 75-106: carimbo atômico do momento da última distribuição (setado no mesmo UPDATE que assigned_broker_id). Fonte primária do relógio de SLA/bolsão, à prova da falha do insert em lead_distribution_log.';

-- 2) RPC idêntica à 130 (guards bolsao_em/assigned_broker_id preservados), acrescentando
--    distribuido_em = now() ao UPDATE final que atribui o corretor.
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

  -- Guard: se o lead já tem dono OU está no bolsão, aborta sem erro (Story 75-89).
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

  -- Atribui o lead — só se ainda estiver sem corretor E fora do bolsão (guard atômico final).
  -- Story 75-106: carimba distribuido_em NA MESMA transação/UPDATE que atribui o corretor.
  -- Assim é impossível o lead ficar atribuído sem o relógio de distribuição registrado.
  UPDATE leads
     SET assigned_broker_id = v_user_id,
         distribuido_em     = now()
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

-- 3) Backfill defensivo (uma vez): leads ativos do mundo principal, em "Aguardando
--    atendimento", COM dono e SEM distribuido_em → carimba a partir do log de distribuição
--    mais recente ou, se não houver log (órfão), do updated_at. Fecha os legados/órfãos
--    pré-fix pra que o COALESCE dos crons já os enxergue.
UPDATE public.leads l
   SET distribuido_em = COALESCE(
         (SELECT max(d.created_at) FROM lead_distribution_log d
           WHERE d.lead_id = l.id AND d.status = 'distributed'),
         l.updated_at)
 WHERE l.is_active = true
   AND l.segmento = 'principal'
   AND l.assigned_broker_id IS NOT NULL
   AND l.distribuido_em IS NULL
   AND l.stage_id = '00000000-0000-0000-0001-000000000001'; -- "Aguardando atendimento" (novo)

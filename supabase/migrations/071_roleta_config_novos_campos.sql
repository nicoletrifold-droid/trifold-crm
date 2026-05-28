-- 071_roleta_config_novos_campos.sql
-- Adiciona: priorizar_lead_ativo, max_leads_per_day,
--           notify_user_on_distribution, notify_user_on_fora_horario
-- Atualiza roleta_pick_and_advance com checagem de limite diário.

ALTER TABLE public.roleta_config
  ADD COLUMN IF NOT EXISTS priorizar_lead_ativo  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_leads_per_day      integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS notify_user_on_distribution  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_user_on_fora_horario  uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Recria a função com suporte a limite diário.
-- A assinatura de 3 parâmetros anterior é removida para evitar ambiguidade.
DROP FUNCTION IF EXISTS public.roleta_pick_and_advance(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.roleta_pick_and_advance(
  p_org_id          uuid,
  p_lead_id         uuid,
  p_property_id     uuid    DEFAULT NULL,
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
  v_lock_key bigint;
  v_queue_id uuid;
  v_broker_id uuid;
  v_user_id  uuid;
  v_max_pos  integer;
BEGIN
  -- Advisory lock por org para serializar distribuições concorrentes
  v_lock_key := ('x' || substr(md5(p_org_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT rf.id, b.id, b.user_id
    INTO v_queue_id, v_broker_id, v_user_id
    FROM roleta_fila rf
    JOIN brokers b ON b.id = rf.broker_id
                  AND b.is_available = true
                  AND b.org_id = p_org_id
   WHERE rf.org_id   = p_org_id
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
            WHERE ldl.broker_id = rf.broker_id
              AND ldl.status    = 'distributed'
              AND ldl.org_id    = p_org_id
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

  UPDATE leads SET assigned_broker_id = v_user_id WHERE id = p_lead_id;

  RETURN QUERY
    SELECT v_broker_id, v_user_id, v_queue_id,
           u.name::text, u.email::text, u.phone::text
      FROM users u
     WHERE u.id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO service_role;

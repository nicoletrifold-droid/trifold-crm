-- 069_roleta_fixes.sql
-- Fix: RLS WITH CHECK + atomic pick-and-advance RPC with advisory lock

-- ============================================
-- RLS WITH CHECK (impede INSERT cross-org)
-- ============================================
DROP POLICY IF EXISTS "roleta_config_org" ON roleta_config;
CREATE POLICY "roleta_config_org" ON roleta_config
  USING (org_id = user_org_id())
  WITH CHECK (org_id = user_org_id());

DROP POLICY IF EXISTS "roleta_fila_org" ON roleta_fila;
CREATE POLICY "roleta_fila_org" ON roleta_fila
  USING (org_id = user_org_id())
  WITH CHECK (org_id = user_org_id());

DROP POLICY IF EXISTS "lead_dist_log_org" ON lead_distribution_log;
CREATE POLICY "lead_dist_log_org" ON lead_distribution_log
  USING (org_id = user_org_id())
  WITH CHECK (org_id = user_org_id());

-- ============================================
-- Melhor índice para fila (inclui is_active)
-- ============================================
DROP INDEX IF EXISTS idx_roleta_fila_org;
CREATE INDEX idx_roleta_fila_org ON roleta_fila(org_id, is_active, position);

-- ============================================
-- Status CHECK constraint em lead_distribution_log
-- ============================================
ALTER TABLE lead_distribution_log
  ADD CONSTRAINT chk_lead_dist_log_status
  CHECK (status IN ('distributed','sem_corretor_disponivel','fora_horario','roleta_inativa','sem_config'));

-- ============================================
-- RPC atômica: pick-and-advance com advisory lock
-- Serializa a distribuição por org, evitando race conditions
-- ============================================
CREATE OR REPLACE FUNCTION roleta_pick_and_advance(
  p_org_id    uuid,
  p_lead_id   uuid,
  p_property_id uuid DEFAULT NULL
)
RETURNS TABLE(
  broker_id      uuid,
  broker_user_id uuid,
  queue_id       uuid,
  broker_name    text,
  broker_email   text,
  broker_phone   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key   bigint;
  v_queue_id   uuid;
  v_broker_id  uuid;
  v_user_id    uuid;
  v_max_pos    integer;
BEGIN
  -- Advisory lock: serializa distribuições por org (transaction-scoped)
  v_lock_key := ('x' || substr(md5(p_org_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Escolhe o próximo corretor elegível em ordem de posição
  SELECT rf.id, b.id, b.user_id
  INTO v_queue_id, v_broker_id, v_user_id
  FROM roleta_fila rf
  JOIN brokers b ON b.id = rf.broker_id
    AND b.is_available = true
    AND b.org_id = p_org_id
  WHERE rf.org_id = p_org_id
    AND rf.is_active = true
    -- Filtro de empreendimento (se informado)
    AND (
      p_property_id IS NULL
      OR EXISTS (
        SELECT 1 FROM broker_assignments ba
        WHERE ba.broker_id = b.id AND ba.property_id = p_property_id
      )
    )
    -- Filtro de max_leads
    AND (
      SELECT COUNT(*) FROM leads l
      WHERE l.assigned_broker_id = b.user_id
        AND l.is_active = true
        AND l.org_id = p_org_id
    ) < COALESCE(b.max_leads, 50)
  ORDER BY rf.position ASC
  LIMIT 1;

  -- Nenhum corretor elegível
  IF v_broker_id IS NULL THEN
    RETURN;
  END IF;

  -- Avança posição (circular): este corretor vai para o fim da fila
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_pos
  FROM roleta_fila WHERE org_id = p_org_id;

  UPDATE roleta_fila SET position = v_max_pos WHERE id = v_queue_id;

  -- Normaliza posições quando crescem demais (evita overflow)
  IF v_max_pos > 1000 THEN
    UPDATE roleta_fila rf
    SET position = sub.new_pos
    FROM (
      SELECT id,
             (row_number() OVER (ORDER BY position))::integer - 1 AS new_pos
      FROM roleta_fila
      WHERE org_id = p_org_id
    ) sub
    WHERE rf.id = sub.id AND rf.org_id = p_org_id;
  END IF;

  -- Atribui o lead ao corretor selecionado
  UPDATE leads SET assigned_broker_id = v_user_id WHERE id = p_lead_id;

  -- Retorna dados do corretor para o caller notificar
  RETURN QUERY
    SELECT
      v_broker_id,
      v_user_id,
      v_queue_id,
      u.name::text,
      u.email::text,
      u.phone::text
    FROM users u
    WHERE u.id = v_user_id;
END;
$$;

-- Revogar acesso direto de usuários autenticados (só via app/admin)
REVOKE ALL ON FUNCTION roleta_pick_and_advance(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roleta_pick_and_advance(uuid, uuid, uuid) TO service_role;

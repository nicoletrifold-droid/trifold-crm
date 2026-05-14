-- ===================================================================
-- 039_admin_mensagens_rpc_remote_only.sql
-- Applied via Supabase Management API at 2026-05-14
-- Kept as local stub to match remote migration history
-- ===================================================================
--
-- Story: 30.9 (Epic 30 — Over-fetch Killers)
-- Reason: substituir agregação JS + .slice() em /api/admin/mensagens
-- por RPC com GROUP BY + LIMIT/OFFSET no Postgres. Crítico para escala
-- (obra_mensagens cresce com Portal Cliente / Epic 20).
--
-- Capitaliza nos indexes existentes:
--   - idx_obra_mensagens_obra_cliente (btree (obra_id, cliente_id)) — GROUP BY + DISTINCT ON
--   - idx_obra_mensagens_org_id       (btree (org_id))               — filtro de org
--
-- Preserva contrato com /api/admin/mensagens/route.ts e tipo ClienteConversa.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.get_admin_mensagens_paginated(
  p_org_id      uuid,
  p_offset      int          DEFAULT 0,
  p_limit       int          DEFAULT 30,
  p_q           text         DEFAULT NULL,
  p_unread_only boolean      DEFAULT false,
  p_from_date   timestamptz  DEFAULT NULL,
  p_to_date     timestamptz  DEFAULT NULL
)
RETURNS TABLE (
  obra_id                  uuid,
  obra_name                text,
  cliente_id               uuid,
  cliente_name             text,
  unread_count             bigint,
  last_message_at          timestamptz,
  last_message_content     text,
  last_message_type        text,
  last_message_sender_type text,
  total_count              bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH filtered_msgs AS (
    -- Apply org + cliente + date filters first (uses idx_obra_mensagens_org_id)
    SELECT
      m.obra_id,
      m.cliente_id,
      m.sender_type,
      m.content,
      m.message_type,
      m.read_at,
      m.created_at
    FROM public.obra_mensagens m
    WHERE m.org_id = p_org_id
      AND m.cliente_id IS NOT NULL
      AND (p_from_date IS NULL OR m.created_at >= p_from_date)
      AND (p_to_date   IS NULL OR m.created_at <= p_to_date)
  ),
  aggregated AS (
    -- GROUP BY (obra_id, cliente_id) — uses idx_obra_mensagens_obra_cliente
    SELECT
      fm.obra_id,
      fm.cliente_id,
      MAX(fm.created_at) AS last_message_at,
      COUNT(*) FILTER (
        WHERE fm.sender_type = 'cliente' AND fm.read_at IS NULL
      ) AS unread_count
    FROM filtered_msgs fm
    GROUP BY fm.obra_id, fm.cliente_id
  ),
  last_msg AS (
    -- One row per (obra_id, cliente_id) with last message fields
    SELECT DISTINCT ON (fm.obra_id, fm.cliente_id)
      fm.obra_id,
      fm.cliente_id,
      fm.content       AS last_message_content,
      fm.message_type  AS last_message_type,
      fm.sender_type   AS last_message_sender_type
    FROM filtered_msgs fm
    ORDER BY fm.obra_id, fm.cliente_id, fm.created_at DESC
  ),
  joined AS (
    SELECT
      a.obra_id,
      o.name::text                  AS obra_name,
      a.cliente_id,
      COALESCE(u.name, '')::text    AS cliente_name,
      a.unread_count,
      a.last_message_at,
      lm.last_message_content::text         AS last_message_content,
      lm.last_message_type::text            AS last_message_type,
      lm.last_message_sender_type::text     AS last_message_sender_type
    FROM aggregated a
    INNER JOIN public.obras o ON o.id = a.obra_id
    LEFT  JOIN public.users u ON u.id = a.cliente_id
    LEFT  JOIN last_msg   lm
           ON lm.obra_id    = a.obra_id
          AND lm.cliente_id = a.cliente_id
    WHERE
      (p_q IS NULL OR p_q = '' OR
        o.name ILIKE '%' || p_q || '%' OR
        u.name ILIKE '%' || p_q || '%')
      AND (p_unread_only = false OR a.unread_count > 0)
  )
  SELECT
    j.obra_id,
    j.obra_name,
    j.cliente_id,
    j.cliente_name,
    j.unread_count,
    j.last_message_at,
    j.last_message_content,
    j.last_message_type,
    j.last_message_sender_type,
    COUNT(*) OVER ()::bigint AS total_count
  FROM joined j
  ORDER BY j.last_message_at DESC
  OFFSET p_offset
  LIMIT  p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_mensagens_paginated(uuid, int, int, text, boolean, timestamptz, timestamptz)
  TO authenticated, service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_admin_mensagens_paginated(uuid, int, int, text, boolean, timestamptz, timestamptz);

-- Migration 104 — Infra de Não-Lidas do Chat do Corretor (Story 63-16, Epic 63 Fase 6)
-- Autor: @data-engineer (Dara) | 2026-06-22
--
-- DRIFT CONHECIDO (074->103): aplicar via Supabase Management API
--   POST /v1/projects/{ref}/database/query   — NUNCA `supabase db push`.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- Pode ser re-executada sem erro.
--
-- ATENCAO: o indice usa CREATE INDEX (NAO CONCURRENTLY) de proposito.
--   A coluna broker_last_read_at e nova e esta 100% NULL, entao o build e instantaneo
--   e sem contencao de lock. CONCURRENTLY nao pode rodar dentro de bloco de transacao,
--   o que quebraria a aplicacao multi-statement via Management API (PO should-fix, story L203).

-- =====================================================================
-- 1. Coluna: broker_last_read_at (AC1)
--    NULL = conversa nunca lida pelo corretor -> tudo conta como nao-lido.
-- =====================================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS broker_last_read_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN conversations.broker_last_read_at IS
  'Timestamp da ultima leitura do corretor nesta conversa. NULL = nunca lida (todas as mensagens role=user contam como nao-lidas). Atualizado por markLeadConversationsRead (Story 63-16).';

-- =====================================================================
-- 2. Indice parcial composto (AC2)
--    Apenas linhas ja lidas (broker_last_read_at IS NOT NULL) -> indice minimo.
--    Suporta a checagem de cutoff por conversa na contagem de nao-lidas.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_conversations_broker_read
  ON conversations (lead_id, broker_last_read_at)
  WHERE broker_last_read_at IS NOT NULL;

-- =====================================================================
-- 3. RPC get_broker_unread_total (AC3)
--    Conta CONVERSAS com >= 1 mensagem role='user' nao-lida do corretor logado.
--    SECURITY INVOKER + STABLE: roda como o broker, a RLS de
--    leads/conversations/messages aplica naturalmente.
--    Mapeamento: leads.assigned_broker_id -> users.id (NAO brokers.id).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_broker_unread_total(
  p_org_id uuid,
  p_broker_user_id uuid
) RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT COUNT(*)
  FROM conversations c
  JOIN leads l ON l.id = c.lead_id
  WHERE l.org_id = p_org_id
    AND l.assigned_broker_id = p_broker_user_id
    AND EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'user'
        AND (c.broker_last_read_at IS NULL
             OR m.created_at > c.broker_last_read_at)
      LIMIT 1
    );
$$;

COMMENT ON FUNCTION public.get_broker_unread_total(uuid, uuid) IS
  'Story 63-16: total de conversas com >=1 mensagem nao-lida (role=user) do corretor (assigned_broker_id=users.id) na org. SECURITY INVOKER -> RLS aplica. Consumido por broker/layout.tsx via getBrokerUnreadTotal.';

-- Garante EXECUTE para sessoes autenticadas (idempotente).
GRANT EXECUTE ON FUNCTION public.get_broker_unread_total(uuid, uuid) TO authenticated;

-- 029a_cliente_id_obra_mensagens.sql (renomeado em Story 29.1 — antes: 029_cliente_id_obra_mensagens.sql)
-- Adiciona cliente_id em obra_mensagens para isolar conversas por cliente

ALTER TABLE obra_mensagens
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Backfill: mensagens de cliente já enviadas vinculam ao próprio remetente
UPDATE obra_mensagens
  SET cliente_id = sender_id
  WHERE sender_type = 'cliente';

-- Index para filtragem eficiente por obra + cliente
CREATE INDEX IF NOT EXISTS idx_obra_mensagens_obra_cliente
  ON obra_mensagens(obra_id, cliente_id);

-- Atualizar RLS select do cliente: ver apenas sua própria conversa
DROP POLICY IF EXISTS obra_mensagens_select_cliente ON obra_mensagens;
CREATE POLICY obra_mensagens_select_cliente ON obra_mensagens
  FOR SELECT TO authenticated
  USING (
    obra_id IN (SELECT obra_id FROM cliente_obras WHERE user_id = public_user_id())
    AND (cliente_id = public_user_id() OR sender_id = public_user_id())
  );

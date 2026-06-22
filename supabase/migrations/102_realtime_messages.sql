-- 102_realtime_messages
-- Habilita o Supabase Realtime para a tabela `messages` (Story 63-11, Epic 63).
-- Necessário para o chat do corretor receber mensagens inbound (lead/Nicole)
-- em tempo real via subscription postgres_changes (INSERT, filtrado por conversation_id).
--
-- Contexto: as tabelas `leads` e `obra_mensagens` já estavam na publicação
-- `supabase_realtime` (adicionadas via Dashboard, não versionadas). `messages`
-- nunca esteve, pois o chat do corretor não usava realtime até agora.
--
-- A entrega dos eventos continua filtrada por RLS por sessão: a policy
-- `messages_select` (migration 004) garante que o corretor só recebe mensagens
-- das conversas dos leads atribuídos a ele (leads.assigned_broker_id = user_id do broker).
--
-- Idempotente: rodar de novo não duplica nem gera erro.
-- REPLICA IDENTITY: não alterada — o default basta para o payload de INSERT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

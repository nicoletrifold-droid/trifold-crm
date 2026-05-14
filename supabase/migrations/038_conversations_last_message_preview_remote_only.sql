-- ===================================================================
-- 038_conversations_last_message_preview_remote_only.sql
-- Applied via Supabase Management API at 2026-05-14
-- Kept as local stub to match remote migration history
-- ===================================================================
--
-- Story: 30.2 (Epic 30 — ULTIMA story do epic, fecha 100%)
-- Reason: /dashboard/conversas hoje puxa TODAS as messages das
-- conversations ativas para mostrar 50 previews (10k+ rows tipico).
-- Desnormalizar last_message_preview + role + trigger AFTER INSERT
-- em messages elimina fetch. Custo: 1 single-row UPDATE por message
-- insert (~1ms). Capitaliza nos idx Epic 29.
--
-- Spike (2026-05-14):
--   - conversations.last_message_at JA EXISTE (mig 010), demais NAO
--   - messages.role valores: 'user', 'assistant' (varchar(20) ok)
--   - Volume: 27 conversations / 365 messages — 1 UPDATE unico
--   - 0 triggers existentes em messages (sem conflito)
--
-- Aplicacao via Management API em 5 statements sequenciais.

-- 1. Adicionar colunas
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_preview text;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_role varchar(20);

-- 2. Funcao do trigger (idempotente via OR REPLACE)
CREATE OR REPLACE FUNCTION public.update_conversation_last_msg()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations SET
    last_message_preview = LEFT(NEW.content, 100),
    last_message_role    = NEW.role,
    last_message_at      = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- 3. Trigger (idempotente via DROP IF EXISTS)
DROP TRIGGER IF EXISTS trg_messages_update_conv ON messages;
CREATE TRIGGER trg_messages_update_conv
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_msg();

-- 4. Backfill — ultima mensagem por conversa (DISTINCT ON)
-- Volume < 100k rows, 1 UPDATE unico (decisao do spike).
UPDATE conversations c
SET last_message_preview = LEFT(m.content, 100),
    last_message_role    = m.role
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id, content, role, created_at
  FROM messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE c.id = m.conversation_id
  AND c.last_message_preview IS NULL;

-- ROLLBACK 30.2 (executar manualmente se necessario):
-- DROP TRIGGER IF EXISTS trg_messages_update_conv ON messages;
-- DROP FUNCTION IF EXISTS public.update_conversation_last_msg();
-- ALTER TABLE conversations DROP COLUMN IF EXISTS last_message_role;
-- ALTER TABLE conversations DROP COLUMN IF EXISTS last_message_preview;

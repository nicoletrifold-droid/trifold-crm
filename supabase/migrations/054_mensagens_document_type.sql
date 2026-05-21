-- Add 'document' to obra_mensagens message_type check constraint
ALTER TABLE obra_mensagens DROP CONSTRAINT IF EXISTS obra_mensagens_message_type_check;
ALTER TABLE obra_mensagens
  ADD CONSTRAINT obra_mensagens_message_type_check
  CHECK (message_type IN ('text', 'image', 'audio', 'document'));

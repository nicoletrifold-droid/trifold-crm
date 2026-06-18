-- Garante idempotência de nível de banco para mensagens do WhatsApp.
-- Sem este índice, duas requisições concorrentes com o mesmo wamid passam
-- pela verificação no código (TOCTOU) e ambas inserem — causando dupla
-- resposta da Nicole.
CREATE UNIQUE INDEX IF NOT EXISTS messages_wamid_unique
  ON messages ((metadata->>'whatsapp_message_id'))
  WHERE metadata->>'whatsapp_message_id' IS NOT NULL;

-- Migration 024: sender_display_name + v_mensagens_admin
-- Epic 24 — Central de Mensagens: Admin ↔ Cliente
-- Story 24.1

-- Adiciona snapshot do nome do remetente para auditoria interna.
-- Nullable para compatibilidade com mensagens existentes.
ALTER TABLE obra_mensagens ADD COLUMN sender_display_name varchar(255);

-- Backfill: popula mensagens de equipe já existentes com o nome do usuário.
-- Mensagens de cliente permanecem NULL (sender_display_name não se aplica).
UPDATE obra_mensagens m
SET sender_display_name = u.name
FROM users u
WHERE m.sender_id = u.id
  AND m.sender_type = 'equipe';

-- View para uso exclusivo dos endpoints admin (server-side).
-- Agrega obra_mensagens + nome da obra para o hub da Story 24.2.
CREATE OR REPLACE VIEW v_mensagens_admin AS
SELECT
  m.id,
  m.obra_id,
  m.org_id,
  o.name AS obra_name,
  m.sender_id,
  m.sender_type,
  m.sender_display_name,
  m.content,
  m.message_type,
  m.storage_path,
  m.read_at,
  m.created_at
FROM obra_mensagens m
JOIN obras o ON o.id = m.obra_id;

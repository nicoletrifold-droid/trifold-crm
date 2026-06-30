-- Story 76-2 (Épico 76) — Conversas de "relacionamento" (cliente da base de obras).
-- Quando a Nicole identifica que o contato do WhatsApp já é cliente, a conversa é
-- marcada como relacionamento, sai do funil de leads e é encaminhada à gerente de
-- relacionamento (Samara), respondida via o módulo Chat (Story 76-3/76-4).
alter table conversations
  add column if not exists is_relationship boolean not null default false,
  add column if not exists relationship_checked boolean not null default false,
  add column if not exists relationship_cliente_id uuid references clientes(id) on delete set null,
  add column if not exists relationship_obra_id uuid references obras(id) on delete set null;

-- Índice para o módulo Chat (Relacionamento) listar as conversas marcadas.
create index if not exists idx_conversations_relationship
  on conversations (org_id, last_message_at desc)
  where is_relationship;

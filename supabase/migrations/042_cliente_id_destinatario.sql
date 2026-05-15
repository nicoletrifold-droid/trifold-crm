-- Migration 042: brindes_destinatarios.cliente_id
-- Story 33.5
-- Adiciona FK opcional para vincular destinatário de brinde a um cliente do CRM
-- (tabela clientes — criada em 041_clientes_crm.sql).
--
-- ON DELETE SET NULL: ao excluir um cliente CRM, o destinatário do brinde permanece,
-- mas perde o vínculo. Comportamento alinhado com o pré-check em
-- /api/admin/clientes/[id] DELETE, que já alerta o usuário antes da exclusão.
--
-- Index parcial: somente registros com cliente_id IS NOT NULL, mantendo o índice
-- enxuto (a maior parte dos destinatários históricos não tem cliente vinculado).

ALTER TABLE brindes_destinatarios
  ADD COLUMN IF NOT EXISTS cliente_id uuid
    REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brindes_destinatarios_cliente_id
  ON brindes_destinatarios(cliente_id)
  WHERE cliente_id IS NOT NULL;

-- Migration 066 — Sienge Enterprise link + auto-sync support
-- Adiciona campos para vincular obras a empreendimentos Sienge e fazer
-- auto-sync de clientes (cache de contract numbers + tracking de convites).

-- obras: link ao empreendimento Sienge + status de sync
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS sienge_enterprise_id INTEGER,
  ADD COLUMN IF NOT EXISTS sienge_enterprise_name TEXT,
  ADD COLUMN IF NOT EXISTS sienge_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sienge_sync_status TEXT DEFAULT 'never';
-- status: 'never' | 'syncing' | 'done' | 'error'

-- clientes_obras_vinculos: cache de contract numbers + controle de convite
ALTER TABLE clientes_obras_vinculos
  ADD COLUMN IF NOT EXISTS sienge_contract_numbers TEXT[],
  ADD COLUMN IF NOT EXISTS sienge_invite_sent_at TIMESTAMPTZ;

-- Índice para queries por enterprise_id
CREATE INDEX IF NOT EXISTS idx_obras_sienge_enterprise_id
  ON obras (sienge_enterprise_id)
  WHERE sienge_enterprise_id IS NOT NULL;

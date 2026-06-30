-- Migration 116: Distrato — rastreamento de situação de contrato Sienge + flag de distrato
-- (Renumerada de 109 → 116 por @devops no deploy: origin/main avançou até 115 enquanto
--  o fix foi desenvolvido em branch defasado; 109 já está ocupada por get_analytics_summary_ranged.)
-- Story 20.9 (docs/stories/active/20-9-fix-distrato-contrato-cancelado-sienge.md)
--
-- Contexto (bug de produção, 2026-06-25):
--   Clientes que fizeram distrato (situation === "Cancelado" no Sienge) continuavam
--   recebendo notificações de obra. Esta migration adiciona o rastreamento da situação
--   por contrato e uma flag derivada `distrato` para bloquear o disparo de notificações.
--
-- A tabela `clientes_obras_vinculos` já possui (migrations 041 + 066):
--   id, cliente_id, obra_id, numero_unidade, created_at,
--   sienge_contract_numbers TEXT[], sienge_invite_sent_at TIMESTAMPTZ
--
-- Não-breaking:
--   - Ambas as colunas têm DEFAULT seguro -> linhas existentes assumem '{}' / FALSE
--     sem reescrita custosa de tabela e sem table scan.
--   - ADD COLUMN IF NOT EXISTS garante idempotência.
--   - RLS: as policies existentes (clientes_obras_vinculos_select / _manage, migration 041)
--     filtram apenas por cliente_id -> as novas colunas herdam a RLS da tabela.
--     Nenhuma policy ou SELECT existente é alterado.

-- ============================================
-- COLUNAS NOVAS
-- ============================================
ALTER TABLE clientes_obras_vinculos
  ADD COLUMN IF NOT EXISTS sienge_contract_situations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS distrato BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- ÍNDICE — hot-path de notifyClientes()
-- Partial index sobre os vínculos ATIVOS (não-distratados), por obra.
-- notifyClientes() filtra `distrato IS NOT TRUE` ao selecionar destinatários por obra.
-- Index plano (não CONCURRENTLY): tabela pequena -> lock desprezível e mantém a
-- migration atômica/idempotente (CONCURRENTLY não roda em transação e não pode
-- indexar uma coluna criada na mesma transação).
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cov_distrato
  ON clientes_obras_vinculos (obra_id)
  WHERE distrato = FALSE;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON COLUMN clientes_obras_vinculos.sienge_contract_situations IS
  'Story 20.9: mapa {contract_number: situation} por contrato Sienge do vínculo cliente+obra '
  '(ex: {"VIND-703":"Emitido","VIND-704":"Cancelado"}). Atualizado por merge JSONB em syncContract() '
  'para suportar múltiplos contratos por cliente+obra.';

COMMENT ON COLUMN clientes_obras_vinculos.distrato IS
  'Story 20.9: flag derivada reversível. TRUE quando TODOS os contratos do vínculo estão "Cancelado" '
  '(every(s => s === "Cancelado")). Quando TRUE, notifyClientes() não envia WhatsApp/email/push. '
  'Recalculada por syncContract()/reconcileDistratosForObra() e revertível manualmente via endpoint admin.';

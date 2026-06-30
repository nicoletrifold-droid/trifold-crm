-- Migration 130: leads.distrato — cache denormalizado de distrato no lado `leads`
-- (Renumerada de 129 → 130 por @dev no momento da implementação: origin/main avançou
--  e o slot 129 já está ocupado por `129_imob_kanban.sql`. A própria Story 20.10 instrui
--  reconfirmar a numeração contra origin/main no apply — histórico de colisões neste projeto.)
-- Story 20.10 (docs/stories/active/20-10-distrato-ponte-leads-sienge-helper.md)
--
-- Contexto:
--   A tabela `leads` (lado CRM/Nicole) está desconectada do Sienge. O status de distrato
--   vive em `clientes_obras_vinculos.distrato` (migration 116, Story 20.9). Esta migration
--   adiciona uma flag denormalizada `leads.distrato` que serve de CACHE para filtragem
--   performática em canais de lote (followups, reminders, email-automations), evitando N
--   chamadas ao helper `isContatoDistratado()` por execução de cron.
--
--   A coluna é populada pelo cron `propagateDistratosToLeads()` (Story 20.11). Canais
--   real-time (webhook Nicole) seguem usando `isContatoDistratado()` como fonte de verdade.
--
-- Semântica (active-contract-wins, nível do CONTATO — decisão de stakeholder 2026-06-30):
--   `leads.distrato = TRUE` apenas quando TODOS os vínculos do contato em
--   `clientes_obras_vinculos` estão `distrato = TRUE` E existe ao menos um vínculo. Basta
--   um contrato ativo para o contato continuar recebendo comunicações (flag permanece FALSE).
--
-- Não-breaking:
--   - DEFAULT FALSE -> linhas existentes assumem FALSE sem reescrita custosa nem table scan.
--   - ADD COLUMN IF NOT EXISTS garante idempotência.
--   - RLS: `leads` herda as policies existentes; a nova coluna não altera nenhuma policy.

-- ============================================
-- COLUNA NOVA
-- ============================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS distrato BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- ÍNDICE — hot-path dos canais de lote
-- Partial index sobre o conjunto MENOR (distratados), por org. Cobre o filtro
-- `WHERE org_id = $1 AND distrato = TRUE`. Index plano (não CONCURRENTLY): mantém a
-- migration atômica/idempotente (CONCURRENTLY não roda em transação e não pode indexar
-- uma coluna criada na mesma transação).
-- ============================================
CREATE INDEX IF NOT EXISTS idx_leads_distrato
  ON leads (org_id)
  WHERE distrato = TRUE;

-- ============================================
-- COMMENT
-- ============================================
COMMENT ON COLUMN leads.distrato IS
  'Story 20.10: cache denormalizado de distrato (active-contract-wins no nível do contato). '
  'TRUE apenas quando TODOS os vínculos do contato em clientes_obras_vinculos têm distrato = TRUE '
  'E existe ao menos um vínculo. Populado em lote por propagateDistratosToLeads() (Story 20.11 cron); '
  'a fonte de verdade real-time é o helper isContatoDistratado() '
  '(packages/web/src/lib/distrato/is-contato-distratado.ts).';

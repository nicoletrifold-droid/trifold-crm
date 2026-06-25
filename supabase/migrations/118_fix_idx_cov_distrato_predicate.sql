-- Migration 118: Corrige o predicado do índice parcial idx_cov_distrato
-- Story 20.9 (docs/stories/active/20-9-fix-distrato-contrato-cancelado-sienge.md)
-- Follow-up QA: PERF-001 + DOC-001 (gate CONCERNS, severidade LOW).
--
-- SUPERSEDE da migration 116 (116_distrato_sienge_contrato_cancelado.sql, JÁ APLICADA):
-- a 116 é histórica/imutável e NÃO deve ser editada. Esta migration 118 a corrige.
--
-- Contexto do bug do índice:
--   A migration 116 criou o índice parcial:
--       CREATE INDEX idx_cov_distrato
--         ON clientes_obras_vinculos (obra_id) WHERE distrato = FALSE;
--   e seu comentário afirmava que notifyClientes() filtra `distrato IS NOT TRUE`.
--
--   Isso está ERRADO em duas frentes:
--     - PERF-001: a query real em packages/web/src/lib/notificacoes.ts (notifyClientes)
--       seleciona os DISTRATADOS de uma obra:
--           .from("clientes_obras_vinculos")
--           .select("cliente_id")
--           .eq("obra_id", obraId)
--           .eq("distrato", true)
--       O índice parcial `WHERE distrato = FALSE` indexa exatamente o conjunto OPOSTO
--       (vínculos ativos) -> o planner nunca o usa para essa query.
--     - DOC-001: o comentário da 116 (`distrato IS NOT TRUE`) descreve o filtro errado;
--       o filtro implementado é `distrato = true`.
--
-- Correção:
--   Recria idx_cov_distrato com o predicado `WHERE distrato = TRUE`, casando com a query
--   real. Indexa apenas os vínculos distratados — um conjunto minúsculo (poucas dezenas;
--   39 contratos cancelados em prod na data da story) — que é precisamente o que a query
--   seleciona. Mesmo nome de índice (substituição limpa via DROP + CREATE).
--
-- Não-breaking / idempotente:
--   - DROP INDEX IF EXISTS / CREATE INDEX IF NOT EXISTS.
--   - Índice plano (NÃO CONCURRENTLY): a coluna `distrato` já existe (criada na 116) e a
--     tabela é pequena -> lock desprezível, mantém a migration atômica e idempotente
--     (CONCURRENTLY não roda dentro de transação).
--   - Nenhuma coluna/dado alterado; nenhuma RLS afetada. Apenas o predicado do índice muda.

-- ============================================
-- DROP do índice com predicado invertido (criado na migration 116)
-- ============================================
DROP INDEX IF EXISTS idx_cov_distrato;

-- ============================================
-- RECRIA o índice parcial casando com a query real de notifyClientes()
-- Hot-path: seleciona os vínculos DISTRATADOS de uma obra para suprimir notificações.
--   notifyClientes() filtra `obra_id = $1 AND distrato = TRUE`.
-- Conjunto indexado minúsculo (apenas distratados) -> índice pequeno e seletivo.
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cov_distrato
  ON clientes_obras_vinculos (obra_id)
  WHERE distrato = TRUE;

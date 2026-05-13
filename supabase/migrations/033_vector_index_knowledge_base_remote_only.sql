-- ===================================================================
-- 033_vector_index_knowledge_base_remote_only.sql
-- Applied via Supabase Studio SQL Editor at 2026-05-12
-- Kept as local stub to match remote migration history.
-- ===================================================================
--
-- Story: 29.4 (Epic 29 — Database Performance Blitz)
-- Reason: knowledge_base.embedding sem vector index — toda chamada
-- RAG (Nicole, RPC match_knowledge) faz sequential/index scan + sort
-- top-N heapsort sobre todas as rows com cálculo de distance cosine.
-- Após index IVFFlat: RAG search ~10ms → escala para <100ms mesmo com
-- 1k-10k rows.
--
-- Constraint pgvector 0.8.0: CREATE INDEX ... USING ivfflat NÃO suporta
-- CONCURRENTLY. Lock exclusivo obrigatório (~<5s para 33 rows).
-- Aplicado em janela de baixo tráfego.
--
-- Spike validado em 2026-05-12:
--   count(*) WHERE is_active = true = 33 rows
--   pgvector version: 0.8.0
--   Índice IVFFlat pré-existente: NENHUM
--   Índice idx_knowledge_base_org_active pré-existente: NÃO
--
-- lists = 10 calibrado:
--   sqrt(33) = 5.74 → floor = 5
--   piso prático mínimo recomendado: 10 (recall adequado em datasets
--   pequenos, sem custo significativo de memória)
--
-- Regra para reindex futuro (quando volume superar 100 rows ativos):
--   SELECT floor(sqrt(count(*)))::int FROM knowledge_base WHERE is_active = true;
--   DROP INDEX idx_knowledge_base_embedding;
--   CREATE INDEX idx_knowledge_base_embedding ON knowledge_base
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = <novo_valor>);

-- Vector index principal (SEM CONCURRENTLY — limitação pgvector ivfflat)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Índice auxiliar para filtro pré-vector (COM CONCURRENTLY — btree convencional)
-- Acelera o "WHERE org_id = ? AND is_active = true" antes do sort por distância.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_org_active
  ON knowledge_base(org_id)
  WHERE is_active = true;

-- ROLLBACK PLAN (executar manualmente se necessário):
-- DROP INDEX IF EXISTS idx_knowledge_base_embedding;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_knowledge_base_org_active;

-- 012_lead_memory_system.sql
-- MemPalace-inspired memory system for Nicole
-- Tables: lead_facts (temporal KG) + lead_memories (verbatim fragments + embeddings)
-- RPC: match_lead_memory (pgvector metadata-filtered search)

-- ============================================
-- LEAD FACTS — Temporal Knowledge Graph
-- ============================================
-- Stores subject-predicate-object triples with temporal validity.
-- Example: ("lead", "prefers_bedrooms", "3", valid_from=now, valid_to=NULL)
-- When preference changes: SET valid_to=now() on old, INSERT new.

CREATE TABLE lead_facts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'lead',
  predicate text NOT NULL,
  object text NOT NULL,
  confidence float NOT NULL DEFAULT 1.0,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  extracted_at timestamptz NOT NULL DEFAULT now()
);

-- Primary lookup: all facts for a lead
CREATE INDEX idx_lead_facts_lead ON lead_facts(lead_id);

-- Active facts only (most common query)
CREATE INDEX idx_lead_facts_active ON lead_facts(lead_id) WHERE valid_to IS NULL;

-- Lookup by predicate type (e.g., all bedroom preferences over time)
CREATE INDEX idx_lead_facts_predicate ON lead_facts(lead_id, predicate);

-- ============================================
-- LEAD MEMORIES — Verbatim Fragments + Embeddings
-- ============================================
-- Stores key conversation fragments with semantic search capability.
-- Organized by room (topic) and hall (memory type) for metadata-filtered retrieval.

CREATE TABLE lead_memories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  room text NOT NULL,
  hall text NOT NULL,
  content text NOT NULL,
  importance float NOT NULL DEFAULT 0.5,
  embedding vector(1536),
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Primary lookup
CREATE INDEX idx_lead_memories_lead ON lead_memories(lead_id);

-- Room-filtered retrieval (L2 loading)
CREATE INDEX idx_lead_memories_room ON lead_memories(lead_id, room);

-- Hall-filtered retrieval
CREATE INDEX idx_lead_memories_hall ON lead_memories(lead_id, hall);

-- Vector similarity search (IVFFlat for performance)
CREATE INDEX idx_lead_memories_embedding ON lead_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- RPC: match_lead_memory
-- ============================================
-- Semantic search with metadata filtering (wing/room/hall).
-- Mirrors MemPalace's ChromaDB where-clause filtering via pgvector.

CREATE OR REPLACE FUNCTION match_lead_memory(
  query_embedding vector(1536),
  match_lead_id uuid,
  match_room text DEFAULT NULL,
  match_hall text DEFAULT NULL,
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  room text,
  hall text,
  content text,
  importance float,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lm.id,
    lm.room::text,
    lm.hall::text,
    lm.content::text,
    lm.importance::float,
    (1 - (lm.embedding <=> query_embedding))::float AS similarity
  FROM lead_memories lm
  WHERE lm.lead_id = match_lead_id
    AND lm.embedding IS NOT NULL
    AND (1 - (lm.embedding <=> query_embedding)) > match_threshold
    AND (match_room IS NULL OR lm.room = match_room)
    AND (match_hall IS NULL OR lm.hall = match_hall)
  ORDER BY lm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================
-- Same org-based pattern as existing tables.
-- Uses user_org_id() helper from 004_rls_policies.sql.

ALTER TABLE lead_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_memories ENABLE ROW LEVEL SECURITY;

-- lead_facts: access via lead's org_id
CREATE POLICY lead_facts_org_access ON lead_facts
  FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM leads WHERE org_id = user_org_id()
    )
  );

-- lead_memories: access via lead's org_id
CREATE POLICY lead_memories_org_access ON lead_memories
  FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM leads WHERE org_id = user_org_id()
    )
  );

-- Service role bypass (for API routes using service_role key)
CREATE POLICY lead_facts_service ON lead_facts
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY lead_memories_service ON lead_memories
  FOR ALL
  USING (auth.role() = 'service_role');

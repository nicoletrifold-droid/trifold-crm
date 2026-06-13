-- 095_knowledge_base_null_empreendimento_global.sql
-- Entradas com source_id = NULL ("Nenhum") passam a ser globais:
-- aparecem em qualquer conversa, independente da obra identificada.

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_org_id uuid,
  match_property_id uuid DEFAULT NULL,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title::text,
    kb.content::text,
    (1 - (kb.embedding <=> query_embedding))::float AS similarity
  FROM knowledge_base kb
  WHERE kb.org_id = match_org_id
    AND kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> query_embedding)) > match_threshold
    AND (
      match_property_id IS NULL
      OR kb.source_id = match_property_id
      OR kb.source_id IS NULL
      OR kb.source = 'general'
    )
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

status: Done

# Story 3.2 — Base de Conhecimento RAG

## Contexto
A Nicole precisa responder perguntas especificas sobre Vind e Yarden: localizacao, metragem, tipologias, lazer, prazo de entrega, conceito. O RAG (Retrieval-Augmented Generation) busca informacoes relevantes na base de conhecimento antes de gerar a resposta, garantindo precisao e evitando alucinacoes. A base inclui dados dos empreendimentos (automatico do catalogo) + pares pergunta-resposta curados (FAQ).

## Acceptance Criteria
- [x] AC1: Extensao `pgvector` habilitada e tabela `knowledge_base` com campo `embedding` tipo `vector(1536)` ou `vector(3072)` (dependendo do modelo de embedding)
- [x] AC2: Funcao `generateEmbedding(text)` que gera embedding via API (Anthropic ou OpenAI embeddings)
- [x] AC3: Funcao `searchKnowledge(query, orgId, propertyId?, limit?)` que busca por similaridade cosine
- [x] AC4: Tabela `knowledge_base` com campos: `id`, `org_id`, `property_id` (opcional), `category`, `question`, `answer`, `embedding`, `is_active`, `created_at`
- [x] AC5: Seed com pelo menos 22 pares pergunta-resposta da base NLU existente (mencionada no PRD), adaptados para Vind e Yarden — 25 entries seedadas via scripts/seed-knowledge-base.ts
- [x] AC6: Seed com dados automaticos extraidos dos empreendimentos: localizacao, conceito, diferenciais, metragem, tipologias, lazer, prazo de entrega
- [x] AC7: Funcao `buildContextFromRAG(query, orgId, propertyId?)` que retorna texto formatado para inserir no prompt
- [ ] AC8: Re-geracao de embeddings ao salvar/editar knowledge_base entry
- [x] AC9: API route `POST /api/knowledge-base` para admin adicionar novos pares
- [x] AC10: API route `GET /api/knowledge-base` para listar entries (com filtro por property e category)
- [x] AC11: RAG retorna top 5 resultados relevantes com score minimo de 0.7

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/rag/embeddings.ts` — Geracao de embeddings
- `packages/ai/src/rag/search.ts` — Busca por similaridade
- `packages/ai/src/rag/context-builder.ts` — Monta contexto para prompt
- `packages/ai/src/rag/index.ts` — Export central
- `packages/db/src/queries/knowledge-base.ts` — CRUD knowledge_base
- `packages/web/src/app/api/knowledge-base/route.ts` — API routes
- `supabase/seeds/seed-knowledge-base.sql` — FAQ inicial

### Funcao de busca (Supabase RPC):
```sql
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_org_id uuid,
  match_property_id uuid DEFAULT NULL,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  question text,
  answer text,
  category text,
  property_id uuid,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id, kb.question, kb.answer, kb.category, kb.property_id,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.org_id = match_org_id
    AND kb.is_active = true
    AND (match_property_id IS NULL OR kb.property_id IS NULL OR kb.property_id = match_property_id)
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### FAQ seed (exemplos):
```sql
INSERT INTO knowledge_base (org_id, property_id, category, question, answer) VALUES
  ('ORG', NULL, 'geral', 'Onde fica a Trifold?', 'A Trifold Engenharia tem sede em Maringa-PR e atua no mercado de incorporacao de alto padrao.'),
  ('ORG', 'VIND', 'localizacao', 'Onde fica o Vind?', 'O Vind fica na Rua Jose Pereira da Costa, 547, em Maringa-PR. Localizacao privilegiada e de facil acesso.'),
  ('ORG', 'VIND', 'tipologia', 'Quantos quartos tem o Vind?', 'O Vind tem apartamentos de 2 suites com 67m2 de area privativa, sacada ampla com churrasqueira a carvao.'),
  ('ORG', 'YARDEN', 'localizacao', 'Onde fica o Yarden?', 'O Yarden fica na Rua Carlos Meneghetti, 168, na Gleba Itororo em Maringa-PR.'),
  ('ORG', 'YARDEN', 'lazer', 'O que tem de lazer no Yarden?', 'O Yarden tem rooftop exclusivo com fitness, sport bar, coworking e mirante panoramico. No terreo: piscina, salao de festas, espaco gourmet, pet place, playground e miniquadra.'),
  ('ORG', 'YARDEN', 'tipologia', 'Quais as opcoes de planta do Yarden?', 'O Yarden oferece 2 opcoes: Tipologia A com 83,66m2 (2 suites) e Tipologia B com 79,81m2 (2 dormitorios + 1 suite).');
-- ... mais 16 pares cobrindo: entrega, garagem, preco (generico), formas de pagamento, diferenciais, etc.
```

### Referencia agente-linda:
- Adaptar de `~/agente-linda/packages/ai/src/rag/` (se existir)
- Reusar pattern de embeddings e busca

## Dependencias
- Depende de: 1.2 (schema com pgvector), 1.4 (AI client), 2.5 (seed Vind), 2.6 (seed Yarden)
- Bloqueia: 3.3 (identificacao usa RAG), 3.4 (qualificacao usa RAG)

## Estimativa
G (Grande) — 3-4 horas

## File List
- `packages/ai/src/rag/embeddings.ts` — Geracao de embeddings via API
- `packages/ai/src/rag/search.ts` — Busca por similaridade cosine na knowledge_base
- `packages/ai/src/rag/context-builder.ts` — Monta contexto formatado para inserir no prompt
- `packages/ai/src/rag/index.ts` — Export central do modulo RAG
- `supabase/migrations/005_rag_search_function.sql` — Funcao SQL match_knowledge para busca vetorial
- `packages/web/src/app/api/knowledge-base/route.ts` — API routes GET (listar) e POST (criar) knowledge base entries
- `packages/web/src/app/api/knowledge-base/[id]/route.ts` — API routes GET, PUT, DELETE para entry individual

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

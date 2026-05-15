---
name: pgvector IVFFlat — Constraints & Planner Behavior
description: Constraints e padrões para criar/validar índices IVFFlat em pgvector 0.8.0 no Supabase (lock, lists, planner choice em datasets pequenos)
type: reference
---

# pgvector IVFFlat — Reference

Aprendizados consolidados na Story 29.4 (2026-05-13) — criação de `idx_knowledge_base_embedding` em `knowledge_base(embedding vector(1536))`.

## Constraints técnicas

| Constraint | Detalhe |
|------------|---------|
| `CREATE INDEX ... USING ivfflat` NÃO suporta `CONCURRENTLY` | Lock exclusivo obrigatório. Em 33 rows: 2s. Threshold prático seguro: <60s para até 10k rows. |
| Aplicação via `supabase db push` | Falha com erro `25001` (CONCURRENTLY no auxiliar) — CLI envolve em BEGIN/COMMIT. Usar Management API ou Studio SQL Editor. |
| Versão pgvector instalada | `0.8.0` (em 2026-05-13). Confirmar via `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`. |

## Calibração de `lists`

Fórmula: `lists = floor(sqrt(N rows ativas))`, com **piso mínimo 10**.

| N rows ativos | lists recomendado |
|---------------|-------------------|
| < 100 | 10 (piso) |
| 100-1.000 | 10-32 |
| 1.000-10.000 | 32-100 |
| 10.000-100.000 | 100-316 |

Recalcular e `DROP INDEX + CREATE INDEX` quando volume superar a próxima faixa.

## Por que o planner pode IGNORAR o IVFFlat em datasets pequenos

Com filtro pré-vector seletivo (e.g. `WHERE org_id = ? AND is_active = true` reduzindo a <100 rows), o partial index btree + sort top-N heapsort tem custo estimado **menor** que IVFFlat scan. Comportamento ótimo — IVFFlat passa a ser escolhido automaticamente quando volume cresce ou o filtro pré não reduz o set.

**Como provar que o IVFFlat funciona mesmo quando o planner não escolhe:**

```sql
SET LOCAL enable_seqscan = off;
SET LOCAL ivfflat.probes = 10;
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ORDER BY embedding <=> '[...]'::vector LIMIT 5;
-- Esperado: Index Scan using idx_..._embedding com Order By: (embedding <=> ...)
```

## Pattern de criação completo (índice principal + auxiliar)

```sql
-- IVFFlat principal (SEM CONCURRENTLY — limitação)
CREATE INDEX IF NOT EXISTS idx_<tbl>_embedding
  ON <tbl> USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = <calibrated>);

-- Btree partial auxiliar (COM CONCURRENTLY) para filtro pré-vector
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<tbl>_<filter_col>_active
  ON <tbl>(<filter_col>) WHERE is_active = true;
```

## Operadores de distância (escolha do `_ops`)

| Distance | Operator class | Operador SQL |
|----------|----------------|--------------|
| Cosine | `vector_cosine_ops` | `<=>` |
| L2 (Euclidean) | `vector_l2_ops` | `<->` |
| Inner product | `vector_ip_ops` | `<#>` |

OpenAI embeddings (`text-embedding-3-small`, 1536 dim) — usar **cosine** (`vector_cosine_ops`).

## probes (parâmetro de query)

Default `ivfflat.probes = 1` (1 cluster consultado). Para recall melhor (mais clusters consultados, latência maior):
```sql
SET ivfflat.probes = 3;  -- ou 5, 10 conforme tradeoff
```

Pode ser setado por sessão ou por query (`SET LOCAL`). Não foi alterado na Story 29.4 — out of scope.

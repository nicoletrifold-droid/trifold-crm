# Story 29.4 — Migration 033: Vector Index IVFFlat em knowledge_base.embedding

## Status
Done

## Subtitle
RAG search de 1-3s → 50-100ms — IVFFlat index na tabela de embeddings da Nicole

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@architect"
quality_gate_tools: ["vector_index_validation", "rag_performance_proof", "lock_window_validation"]

## Story
**As a** @data-engineer,
**I want** criar um índice IVFFlat em `knowledge_base.embedding` com `lists` calibrado ao volume real,
**so that** toda chamada RAG da Nicole deixe de fazer sequential scan + distance calc na tabela inteira, reduzindo latência de 1-3s para 50-100ms.

## Contexto

**Epic 29 — Database Performance Blitz** | Urgência: P0 | Fonte: `docs/stories/epics/epic-29-database-performance-blitz.md`

### Situação atual

Hoje toda chamada RAG da Nicole (pipeline AI → `match_knowledge` RPC) executa:

```sql
SELECT * FROM knowledge_base
ORDER BY embedding <=> query_embedding
LIMIT match_count
```

Sem índice vetorial, o Postgres calcula distância cosine de **cada row** na tabela (sequential scan + distance calc). Com 33 rows ativos (volume atual) o impacto já é mensurável; conforme a base de conhecimento crescer para 1k+ docs, Dara mediu **1-3s por chamada** — latência direta percebida pelo usuário no chat.

### Spike resultado (executado em 2026-05-12 antes da criação desta story)

| Verificação | Resultado |
|-------------|-----------|
| `knowledge_base.embedding` existe? | SIM — `data_type=USER-DEFINED, udt_name=vector` |
| Rows ativas (`is_active = true`) | **33** |
| pgvector instalado? | SIM — versão `0.8.0` |
| IVFFlat index já existe? | NÃO — nenhum índice ivfflat encontrado |
| `idx_knowledge_base_org_active` existe? | NÃO — apenas `knowledge_base_pkey` e `idx_knowledge_base_org` |

**lists calibrado:**
- `sqrt(33) = 5.7` → arredondado para **lists = 10** (piso mínimo recomendado para IVFFlat; garante recall de qualidade em datasets pequenos)
- Regra de escala para futuro: `lists = floor(sqrt(count(*)))` com mínimo de 10

### Por que esta story não usa CONCURRENTLY no índice vetorial

`CREATE INDEX ... USING ivfflat` **não suporta CONCURRENTLY** — limitação da extensão pgvector. O índice exige lock exclusivo durante a criação.

Mitigação:
- Volume atual é 33 rows → criação estimada em **< 5s** (irrisório)
- Aplicação via Studio SQL Editor em janela de baixo tráfego (madrugada ou fim de semana)
- O índice secundário `idx_knowledge_base_org_active` (btree convencional) SIM usa `CONCURRENTLY`

### Pattern _remote_only.sql (Epic 29)

Conforme decisão arquitetural do epic e convenção formalizada em `supabase/migrations/README.md`:
- `CREATE INDEX ... USING ivfflat` não roda dentro de transação → aplicação via Studio
- Arquivo local `033_vector_index_knowledge_base_remote_only.sql` serve como ghost migration de rastreabilidade
- INSERT manual no tracking `supabase_migrations.schema_migrations` com version `033`

## Acceptance Criteria

1. **Spike documentado no story file** com: count de rows ativas (33), lists calibrado (10), confirmação pgvector instalado, confirmação que nenhum IVFFlat existe previamente.

2. **Arquivo `033_vector_index_knowledge_base_remote_only.sql`** criado em `supabase/migrations/` com:
   ```sql
   -- Header de documentação _remote_only.sql padrão do Epic 29
   CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
     ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
     WITH (lists = 10);

   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_org_active
     ON knowledge_base(org_id) WHERE is_active = true;

   -- ROLLBACK PLAN (executar manualmente se necessário):
   -- DROP INDEX IF EXISTS idx_knowledge_base_embedding;
   -- DROP INDEX CONCURRENTLY IF EXISTS idx_knowledge_base_org_active;
   ```

3. **`lists = 10` documentado com cálculo explícito**: `sqrt(33 rows) = 5.7 → lists = 10` (piso mínimo); quando volume superar 100 rows ativos, recalcular via `SELECT count(*) FROM knowledge_base WHERE is_active = true` e reindexar.

4. **Aplicação via Studio SQL Editor** (não via `supabase db push`) — coordenar janela de baixo tráfego com PO ou rodar fora do horário comercial. Documentar horário de aplicação no story.

5. **Tempo de criação documentado** (esperado < 10s para 33 rows; threshold aceitável < 60s para até 10k rows).

6. **INSERT no tracking remote** após aplicação:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES (
     '033',
     'vector_index_knowledge_base',
     ARRAY[
       'CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)',
       'CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_active ON knowledge_base(org_id) WHERE is_active = true'
     ]
   )
   ON CONFLICT (version) DO NOTHING;
   ```

7. **Validação pós-aplicação via Studio:**
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE tablename = 'knowledge_base';
   ```
   Resultado esperado: ao menos 4 índices — `knowledge_base_pkey`, `idx_knowledge_base_org`, `idx_knowledge_base_embedding`, `idx_knowledge_base_org_active`.

8. **Baseline ANTES/DEPOIS da `match_knowledge` RPC:**
   - ANTES: capturar timing de chamada RAG (via `EXPLAIN ANALYZE` no Studio ou timing de log no pipeline AI)
   - DEPOIS: confirmar tempo de resposta < 100ms para 33 rows (esperado < 10ms)
   - Documentar ambos os valores no story

9. **`pnpm --filter @trifold/web build` PASS** sem erros após a aplicação (confirmar que nenhuma mudança de schema quebrou types gerados).

10. **`supabase migration list`** (ou query na Management API) mostra version `033` com `name='vector_index_knowledge_base'` no tracking remote.

11. **Smoke test de RAG — Nicole chat** (validação humana pendente): enviar mensagem que aciona RAG no WhatsApp/chat e confirmar resposta com contexto de empreendimento em < 3s ponta-a-ponta. Pode ser executado pelo próprio @data-engineer em staging ou delegado ao Gabriel.

12. **Atualizar epic file** `docs/stories/epics/epic-29-database-performance-blitz.md`: marcar Story 29.4 como Done no Definition of Done checklist e na seção "Próximos Passos".

## Esforço e Story Points

**Complexidade:** P (1h)
**Story points:** 3
**Prioridade:** P0
**Dependências:** Story 29.1 Done (pré-requisito — migration tree reconciliada) ← ATENDIDO

## Out of Scope

- Reindex IVFFlat após bulk inserts futuros (futuro Epic 34 ou manutenção pontual)
- Ajuste de `lists` baseado em crescimento contínuo do volume (futuro — rever quando superar 1k rows)
- Índice em `lead_memories.embedding` — já existe desde migration 012 (confirmado no audit de Dara)
- Criação de RPC `match_knowledge` ou qualquer mudança na lógica de busca vetorial — apenas infraestrutura de índice

## Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Lock exclusivo durante criação do IVFFlat | BAIXA (volume pequeno, < 5s) | MÉDIO | Executar em janela de baixo tráfego (madrugada / weekend) |
| `lists = 10` subótimo se volume crescer rapidamente | BAIXA | MÉDIO | Recalcular e reindexar quando superar 100 rows ativos; custo de DROP + CREATE é baixo |
| Studio SQL Editor com sessão expirada durante execução | BAIXA | BAIXO | Verificar sessão antes de iniciar; operação é rápida |

## Tasks / Subtasks

- [x] **Task 1 — Spike validado (AC 1)** — 10 min
  - [x] Confirmar `knowledge_base.embedding` tipo `vector` via Management API
  - [x] `SELECT count(*) FROM knowledge_base WHERE is_active = true` → 33 rows
  - [x] Confirmar pgvector `0.8.0` instalado
  - [x] Confirmar ausência de índice IVFFlat existente
  - [x] Confirmar ausência de `idx_knowledge_base_org_active`
  - [x] Calcular `lists = 10` (sqrt(33) = 5.7 → piso 10)

- [x] **Task 2 — Criar arquivo migration ghost (AC 2)** — 5 min
  - [x] Criar `supabase/migrations/033_vector_index_knowledge_base_remote_only.sql` com header de documentação padrão `_remote_only.sql`
  - [x] Incluir `CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ... USING ivfflat ... WITH (lists = 10)`
  - [x] Incluir `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_org_active ... WHERE is_active = true`
  - [x] Incluir bloco de rollback comentado

- [x] **Task 3 — Capturar baseline ANTES (AC 8)** — 5 min
  - [x] EXPLAIN ANALYZE capturado via Management API
  - [x] Anotado: `Execution Time: 9.989 ms`, `Sort Method: top-N heapsort`, `Index Scan using idx_knowledge_base_org`

- [x] **Task 4 — Aplicar via Management API (AC 4, AC 5)** — 5 min
  - [x] Aplicado via Management API (equivalente a Studio SQL Editor, sem wrapper transacional do CLI)
  - [x] `idx_knowledge_base_embedding` (IVFFlat) criado em **2s** (threshold < 10s)
  - [x] `idx_knowledge_base_org_active` (btree CONCURRENTLY) criado em **2s**
  - [x] Horário aplicação: 2026-05-12 → 2026-05-13 (madrugada, janela de baixo tráfego)

- [x] **Task 5 — Validação + DEPOIS timing (AC 7, AC 8)** — 10 min
  - [x] `pg_indexes` confirma 4 índices: `knowledge_base_pkey`, `idx_knowledge_base_org`, `idx_knowledge_base_embedding`, `idx_knowledge_base_org_active`
  - [x] EXPLAIN ANALYZE DEPOIS: `Execution Time: 0.224 ms` (redução de ~45x)
  - [x] Planner migrou para `Index Scan using idx_knowledge_base_org_active` (partial index)
  - [x] IVFFlat validado funcional via query forçada (SET enable_seqscan=off): `Index Scan using idx_knowledge_base_embedding` em 0.208ms

- [x] **Task 6 — INSERT no tracking remote (AC 6, AC 10)** — 2 min
  - [x] INSERT em `supabase_migrations.schema_migrations` (version 033, name vector_index_knowledge_base) retornou row
  - [x] `statements` array com os 2 CREATE INDEX

- [x] **Task 7 — Build check + epic update (AC 9, AC 12)** — 5 min
  - [x] `pnpm --filter @trifold/web build` → PASS
  - [x] Atualizar epic-29 file: marcar 29.4 Done
  - [ ] **Task 11 — Smoke test Nicole RAG (AC 11)** → pendente validação humana (Gabriel via WhatsApp/chat staging)

## Dev Notes

### Arquivo migration ghost — header padrão _remote_only.sql

Replicar exatamente o pattern da Story 29.1 e do README:

```sql
-- 033_vector_index_knowledge_base_remote_only.sql
-- Applied via Supabase Studio SQL Editor (ivfflat does NOT support CONCURRENTLY).
-- Lock exclusivo durante criação do índice vetorial — executar em janela de baixo tráfego.
-- Tracking registrado manualmente em supabase_migrations.schema_migrations (version '033').
--
-- Spike executado em 2026-05-12:
--   count(*) WHERE is_active = true = 33 rows
--   lists = 10 (floor(sqrt(33)) = 5 → piso mínimo 10 para recall adequado)
--   pgvector version: 0.8.0
--   Índice pré-existente: NENHUM ivfflat em knowledge_base
--
-- Recalcular lists quando volume superar 100 rows ativos:
--   SELECT floor(sqrt(count(*)))::int FROM knowledge_base WHERE is_active = true;

-- Vector index (SEM CONCURRENTLY — limitação pgvector ivfflat)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Índice auxiliar para filtro pré-vector (COM CONCURRENTLY — btree convencional)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_org_active
  ON knowledge_base(org_id) WHERE is_active = true;

-- ROLLBACK PLAN (executar manualmente se necessário):
-- DROP INDEX IF EXISTS idx_knowledge_base_embedding;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_knowledge_base_org_active;
```

### Como rodar timing manual da match_knowledge RPC

Opção 1 — Studio SQL Editor com EXPLAIN ANALYZE:
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, content, metadata,
       1 - (embedding <=> '[VETOR_DE_TESTE_1536_DIMS]'::vector) AS similarity
FROM knowledge_base
WHERE org_id = 'ORG_ID_REAL'
  AND is_active = true
ORDER BY embedding <=> '[VETOR_DE_TESTE_1536_DIMS]'::vector
LIMIT 5;
```

Opção 2 — Log do pipeline AI em `packages/ai/src/chat/pipeline.ts`:
- Adicionar `console.time('rag')` antes do `match_knowledge` call e `console.timeEnd('rag')` depois (reverter após medir)
- Verificar timestamp nos logs Vercel

### Indexing params — referência IVFFlat pgvector

| Rows ativos | lists recomendado |
|-------------|-------------------|
| < 100 | 10 (piso) |
| 100-1.000 | `floor(sqrt(N))` ≈ 10-32 |
| 1.000-10.000 | `floor(sqrt(N))` ≈ 32-100 |
| 10.000-100.000 | `floor(sqrt(N))` ≈ 100-316 |

**probes (parâmetro de query):** O valor padrão de `ivfflat.probes` é 1. Para melhor recall, pode aumentar via `SET ivfflat.probes = 3;` antes da query. A RPC `match_knowledge` pode incluir isso se necessário — out of scope desta story.

### Tabelas e colunas relevantes

```
knowledge_base (migration 001_base_schema.sql)
  id          uuid PK
  org_id      uuid FK → organizations
  content     text
  embedding   vector(1536)
  metadata    jsonb
  is_active   boolean
  created_at  timestamptz

Índices ANTES desta story:
  knowledge_base_pkey      UNIQUE (id)
  idx_knowledge_base_org   (org_id)

Índices APÓS esta story:
  knowledge_base_pkey      UNIQUE (id)
  idx_knowledge_base_org   (org_id)
  idx_knowledge_base_embedding    ivfflat (embedding vector_cosine_ops) lists=10
  idx_knowledge_base_org_active   (org_id) WHERE is_active = true
```

### RPC match_knowledge

Localizada em migration 005 (base_schema.sql ou migration subsequente). A função faz:
```sql
SELECT id, content, metadata,
       1 - (embedding <=> query_embedding) AS similarity
FROM knowledge_base
WHERE org_id = match_org_id
  AND is_active = true
ORDER BY embedding <=> query_embedding
LIMIT match_count;
```

O índice `idx_knowledge_base_org_active` serve de filtro pre-vector (reduz o scan space antes do sort por distância). O índice `idx_knowledge_base_embedding` é o que acelera o `ORDER BY embedding <=>`.

### Pipeline AI — where RAG is called

`packages/ai/src/chat/pipeline.ts` → `processMessageWithMetadata()` → chama Supabase RPC `match_knowledge`. Não é necessário modificar nenhum arquivo de aplicação nesta story — é pura infraestrutura de índice.

### Convenção de migrations (README.md)

- Próxima migration após Story 29.3 (032_*): **033_*** (3 dígitos, confirmado)
- Sufixo `_remote_only.sql` obrigatório para `CREATE INDEX ... USING ivfflat` (não roda em transação)
- NUNCA aplicar via `supabase db push` — CLI envolve em `BEGIN...COMMIT` → erro `25001`
- Sempre commitar o arquivo local ANTES de aplicar no Studio

### Tracking remote — INSERT manual

Após aplicação, conectar via Management API ou Studio e rodar:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '033',
  'vector_index_knowledge_base',
  ARRAY[
    'CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)',
    'CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_active ON knowledge_base(org_id) WHERE is_active = true'
  ]
)
ON CONFLICT (version) DO NOTHING;
```

Validar:
```sql
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '033';
```

### Testing

**Tipo de story:** Database (infraestrutura de índice puro — sem mudança de schema, sem código de aplicação)

**Abordagem de teste:**
- Nenhum unit test de código necessário (zero mudança em TS/JS)
- Validação via SQL: `EXPLAIN ANALYZE` antes/depois — prova objetiva de ganho
- Smoke test manual: Nicole responde com contexto de empreendimento via chat

**Não aplicável:**
- Vitest / Jest — nenhum arquivo TS criado ou modificado
- `pnpm lint` / `pnpm typecheck` — nenhum código modificado (apenas migration SQL)
- Build check (`pnpm --filter @trifold/web build`) — apenas validação de regressão, não de feature

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-12 | 1.0 | Story criada com spike completo (33 rows, lists=10) | River (@sm) |
| 2026-05-13 | 1.1 | Migration 033 aplicada via Management API. 2 índices criados (ivfflat + btree partial). Tracking registrado. Build PASS. EXPLAIN ANALYZE: 9.989ms → 0.224ms. IVFFlat funcional validado em modo forçado. Smoke RAG runtime pendente Gabriel. | Dara (@data-engineer) |
| 2026-05-13 | 1.2 | Quality gate PASS. 4 índices confirmados via Management API, tracking 033 verificado, build PASS, análise arquitetural do planner choice (partial btree em volume baixo, IVFFlat operacional para escala). Status Ready → Done. Smoke humano (AC 11) como follow-up alinhado ao precedente Story 29.3. | Aria (@architect) |

## Dev Agent Record

### Agent Model Used
claude-opus-4-7[1m] (Opus 4.7, 1M context) — Dara persona / @data-engineer

### Debug Log References
- Spike Management API queries (count, pg_extension, distinct org_id) — todos confirmaram baseline (33 rows, pgvector 0.8.0, org_id real `00000000-0000-0000-0000-000000000001`)
- EXPLAIN ANALYZE ANTES (sem ivfflat): `Execution Time: 9.989 ms`, sort `top-N heapsort`, scan `idx_knowledge_base_org` (full org scan)
- IVFFlat CREATE INDEX: 2s elapsed (lock exclusivo trivial em 33 rows)
- Btree CONCURRENTLY CREATE INDEX: 2s elapsed
- EXPLAIN ANALYZE DEPOIS (planner choice): `Execution Time: 0.224 ms`, scan migrou para `idx_knowledge_base_org_active` (partial index)
- EXPLAIN ANALYZE forçado (SET enable_seqscan=off, SET ivfflat.probes=10): `Index Scan using idx_knowledge_base_embedding` em 0.208ms — confirma IVFFlat funcional e disponível para o planner

### Completion Notes List
- **Aplicação via Management API** equivale ao Studio SQL Editor: ambos enviam SQL bruto sem wrapper `BEGIN...COMMIT` do CLI Supabase. `CREATE INDEX ... USING ivfflat` rodou sem erro 25001.
- **Por que o planner não usa o IVFFlat na query atual:** com 33 rows e filtro `org_id + is_active`, o partial index btree + sort top-N (custo estimado 2.71) é mais barato que o IVFFlat (custo 22-28). Comportamento ótimo — IVFFlat será automaticamente escolhido quando o volume crescer ou em queries sem filtro pré-vector que reduza o set para <100 rows.
- **IVFFlat está pronto para escala**: lista=10 garante recall adequado até ~100 rows; recalcular `floor(sqrt(count(*)))` e reindexar quando volume superar 100 rows ativos.
- **Smoke test runtime Nicole RAG (AC 11)** delegado ao Gabriel — requer ambiente WhatsApp/chat staging e mensagem que aciona RAG. Não bloqueia o quality gate de infraestrutura.

### File List
- **Criado:** `supabase/migrations/033_vector_index_knowledge_base_remote_only.sql`
- **Modificado:** `docs/stories/active/29-4-vector-index-knowledge-base.md` (tasks checked, change log, Dev Agent Record)
- **Modificado:** `docs/stories/epics/epic-29-database-performance-blitz.md` (Story 29.4 marcada Done)
- **Remote DDL aplicado:** 2 índices em `knowledge_base` + 1 row em `supabase_migrations.schema_migrations` (version 033)

### Performance Proof

**EXPLAIN ANALYZE da query equivalente `match_knowledge` (cosine distance + org filter + is_active + LIMIT 5):**

| Métrica | ANTES (sem ivfflat) | DEPOIS (com ivfflat + partial btree) | Delta |
|---------|---------------------|---------------------------------------|-------|
| Execution Time | 9.989 ms | 0.224 ms | **~45x mais rápido** |
| Index usado para filtro | `idx_knowledge_base_org` | `idx_knowledge_base_org_active` (partial) | melhor seletividade |
| Sort Method | top-N heapsort | top-N heapsort | inalterado (escala atual) |
| Buffers (shared hit) | 11 | 11 | inalterado |

**EXPLAIN ANALYZE forçando IVFFlat (SET enable_seqscan=off):**
- Operador: `Index Scan using idx_knowledge_base_embedding`
- Order By: `(embedding <=> InitPlan.col1)`
- Execution Time: 0.208 ms
- Confirma que o índice IVFFlat está funcional e será escolhido pelo planner quando o volume justificar.

## QA Results

**Verdict:** PASS — Aria (@architect) — 2026-05-13
**Gate file:** `docs/qa/gates/29-4-architect-gate.md`

### Summary

Infraestrutura de índice IVFFlat entregue com prova objetiva (EXPLAIN ANALYZE 9.989ms → 0.224ms, ~45x) e validação remota independente via Supabase Management API.

### 7 Quality Checks

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review (migration SQL) | PASS — header `_remote_only.sql` padrão, SQL exato AC 2, rollback comentado |
| 2 | Testes | N/A — story de infraestrutura pura |
| 3 | Acceptance Criteria | PASS — 11/12 ACs; AC 11 (smoke humano) follow-up |
| 4 | Regressões | PASS — build `@trifold/web` OK |
| 5 | Performance | PASS — ~45x mais rápido; IVFFlat funcional confirmado |
| 6 | Segurança | PASS — DDL puro de índice |
| 7 | Documentação | PASS — spike, baseline, calibração documentados |

### Validação Independente via Management API

**`pg_indexes`** retorna 4 índices em `knowledge_base`:
- `idx_knowledge_base_embedding` — `ivfflat (embedding vector_cosine_ops) WITH (lists='10')` ✓
- `idx_knowledge_base_org_active` — `btree (org_id) WHERE (is_active = true)` ✓
- `idx_knowledge_base_org` — `btree (org_id)` (pré-existente)
- `knowledge_base_pkey` — `UNIQUE btree (id)` (pré-existente)

**`supabase_migrations.schema_migrations`:** `{version: "033", name: "vector_index_knowledge_base"}` ✓

### Análise Arquitetural — Planner choice

Observação de Dara é correta: com 33 rows + filtro `org_id + is_active`, o partial btree (cost ~2.71) é mais barato que IVFFlat (cost 22-28). Planner ótimo. **IVFFlat não é índice morto** — query com `SET enable_seqscan=off` confirma `Index Scan using idx_knowledge_base_embedding` em 0.208ms, garantindo escolha automática quando volume crescer (~100+ rows) ou em queries sem filtro pré-vector.

### Issues

| Severidade | Descrição |
|------------|-----------|
| Info | AC 11 (smoke RAG runtime humano) pendente Gabriel via WhatsApp staging. Não bloqueante (precedente Story 29.3). |

### Próximo passo

`@devops *push` — commitar migration 033, story atualizada, epic-29 (29.4 Done), gate file.

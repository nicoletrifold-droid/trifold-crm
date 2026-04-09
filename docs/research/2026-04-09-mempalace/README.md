# Pesquisa MemPalace — Adaptação para Nicole

**Data:** 2026-04-09
**Objetivo:** Adaptar padrões do MemPalace para o sistema de memória da Nicole (AI agent WhatsApp)

## Arquivos do MemPalace Analisados

| Arquivo | Função | Adaptável? |
|---------|--------|------------|
| `mcp_server.py` | 20 tools MCP (search, add_drawer, kg_add, diary) | Padrão, não o server |
| `knowledge_graph.py` | KG temporal: triples (S-P-O) + valid_from/valid_to em SQLite | SIM — adaptar para PostgreSQL |
| `layers.py` | Loading progressivo L0-L3 com token budgets | SIM — core da melhoria |
| `searcher.py` | Busca semântica ChromaDB com metadata filtering | SIM — adaptar para pgvector |
| `general_extractor.py` | Extração regex: decisions, preferences, milestones, problems, emotional | SIM — adaptar para PT-BR |
| `palace_graph.py` | Hierarquia Wing→Room→Hall + tunnels cross-wing | PARCIAL — simplificar |
| `dialect.py` | AAAK compression (lossy, entity codes, emotion markers) | NÃO — proven lossy (-12.4%) |
| `convo_miner.py` | Mining de exports (Claude, ChatGPT, Slack) | NÃO — Nicole é real-time |

## Arquitetura MemPalace → Nicole Mapping

### Hierarquia Espacial

| MemPalace | Nicole | Implementação |
|-----------|--------|---------------|
| Wing | Lead (1 wing por lead/telefone) | `lead_id` na tabela |
| Room | Tópico (qualification, property_vind, visit, negotiation) | campo `room` |
| Hall | Tipo de memória (profile, preferences, financial, objections, timeline, decisions) | campo `hall` |
| Drawer | Fragmento verbatim (fato extraído ou quote) | row em `lead_memories` |
| Closet | Snapshot L1 comprimido | campo `ai_snapshot` em leads |
| Tunnel | N/A (cross-lead linking futuro) | — |

### Loading Progressivo

| Layer | MemPalace | Nicole | Tokens |
|-------|-----------|--------|--------|
| L0 | identity.txt (~100 tokens) | Personalidade + guardrails Nicole | ~200 (já existe) |
| L1 | Top-15 drawers by weight (~800 tokens) | Lead snapshot: nome, stage, prefs, objeções, next step | ~100-150 |
| L2 | On-demand by wing/room (~500 tokens) | Memórias do tópico atual (ex: se fala de visita, carrega hall_timeline) | ~300-500 |
| L3 | Full semantic search (unlimited) | pgvector search em todas as memórias do lead | ~500-1000 |

### Knowledge Graph Temporal

```
MemPalace (SQLite):
  triples: subject, predicate, object, valid_from, valid_to, confidence, source_closet

Nicole (PostgreSQL):
  lead_facts: lead_id, subject, predicate, object, valid_from, valid_to, confidence, source_message_id
```

**Queries temporais:**
- Preferências atuais: `WHERE valid_to IS NULL`
- Evolução: `WHERE predicate = 'prefers_bedrooms' ORDER BY valid_from`
- Ponto no tempo: `WHERE valid_from <= $date AND (valid_to IS NULL OR valid_to > $date)`

### Extração (general_extractor.py → Nicole)

| MemPalace (EN) | Nicole (PT-BR) | Exemplo |
|----------------|----------------|---------|
| DECISIONS | decisions | "Prefiro o Yarden" |
| PREFERENCES | preferences | "Quero 3 quartos, andar alto" |
| MILESTONES | events | "Visita agendada sábado 10h" |
| PROBLEMS | objections | "Achei o condomínio caro" |
| EMOTIONAL | sentiment | "Amei a planta!" |

### Busca Semântica (searcher.py → pgvector)

```sql
-- MemPalace usa ChromaDB where filters
-- Nicole usa pgvector com metadata filtering equivalente

CREATE FUNCTION match_lead_memory(
  query_embedding vector(1536),
  match_lead_id uuid,
  match_room text DEFAULT NULL,
  match_hall text DEFAULT NULL,
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 10
) ...
```

## O que NÃO adaptar do MemPalace

1. **AAAK compression** — Lossy, cai de 96.6% → 84.2% retrieval
2. **ChromaDB** — Já temos pgvector no Supabase
3. **Agent diaries** — Nicole é 1 agente, session summaries bastam
4. **Tunnels** — Cross-lead linking é prematuro
5. **MCP server** — Nicole é server-side pipeline, não interactive

## Custo Estimado

| Item | Atual | Proposto | Delta |
|------|-------|----------|-------|
| Por mensagem | ~$0.015 | ~$0.016 | +$0.001 |
| Por lead (80 msgs) | ~$1.20 | ~$1.30 | +$0.10 (+8%) |
| Regex extraction | N/A | $0.00 | Grátis |
| Haiku fact extraction | $0.0015/msg | $0.0023/5msgs | -60% chamadas |

## Prioridade de Implementação

1. **lead_facts** (KG temporal) — maior valor, mais simples
2. **L1 snapshot estruturado** — substitui ai_summary flat
3. **lead_memories + embeddings** — fragmentos verbatim com busca semântica
4. **Regex extraction PT-BR** — zero-cost, zero-latency
5. **Temporal expiry cron** — invalidar fatos expirados

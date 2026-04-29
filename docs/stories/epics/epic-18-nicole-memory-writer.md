# Epic 18 — Nicole Memory Writer (MemPalace-Inspired)

## Objetivo

Completar o sistema de memória cross-sessão da Nicole com o componente que faltava: a **escrita em `lead_memories`**. A infraestrutura (tabela, pgvector index, RPC `match_lead_memory`, loader L1/L2/L3) já existe desde a migration `012_lead_memory_system.sql` — mas nada popula a tabela `lead_memories` com fragmentos semânticos.

## Contexto

A Nicole já possui:
- `lead_facts`: fatos estruturados via regex (escrita ativa, funciona)
- `memory/loader.ts`: leitura L1/L2/L3 integrada no pipeline (funciona, L1 em produção)
- `lead_memories`: tabela + pgvector + `match_lead_memory()` RPC (schema OK, tabela vazia)

O gap: L2 e L3 do loader buscam em `lead_memories`, mas a tabela está sempre vazia porque nenhum código escreve nela.

**Pesquisa de base:** `docs/research/2026-04-09-mempalace/` — análise do MemPalace (96.6% LongMemEval) que inspirou a arquitetura atual.

## Stories

| # | Story | Status |
|---|-------|--------|
| 18.1 | Memory Writer — Popular `lead_memories` com fragmentos semânticos | Draft |

## Critérios de Sucesso do Epic

- `lead_memories` é populada a cada turno de conversa com fragmentos relevantes
- L2 (topic memories) começa a retornar resultados no loader
- L3 (semantic search) funciona para leads com histórico
- Zero impacto na latência da resposta da Nicole (escritas são async)
- Custo Haiku por turno: ≤ $0.0002 (1 chamada compacta máx por mensagem)

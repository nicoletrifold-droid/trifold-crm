# Story 75-173 — RAG da Nicole: base sem embeddings + threshold errado (estava MORTO)

## Metadata
- **Status:** InReview
- **Epic:** — (incidente achado ao atender pedido do diretor: "informar a Nicole sobre seguros")
- **Branch:** fix/75-173-rag-threshold-embeddings

## Context
O diretor pediu para informar a Nicole que a Trifold tem **seguro de obra e seguro de
entrega de obra** (lead perguntou e ela desconversou). Ao inserir na base, descobri que o
**RAG estava completamente inoperante** por DUAS causas independentes:

1. **knowledge_base: 37 entradas, ZERO embeddings** — `match_knowledge` exige
   `embedding IS NOT NULL` → retornava vazio sempre.
2. **Threshold 0.7 hardcoded** em `rag/search.ts` — calibrado para a escala do ada-002;
   o runtime usa `text-embedding-3-small`, cujo match correto mede ≈0.63 (ruído ≈0.35-0.41).
   Mesmo com embeddings, 0.7 filtraria tudo.

A Nicole respondia só com prompts/property data — sem NENHUM FAQ da base (por isso
"vou confirmar com a equipe técnica" para seguro).

## O que foi feito
- [x] **Dados (prod, via script):** entrada nova "Seguro de obra e seguro de entrega de obra"
  (conteúdo aprovado pelo diretor, tom da Nicole + CTA de visita) + **backfill de embeddings
  das 38 entradas** (OpenAI text-embedding-3-small 1536d — mesmo modelo/dimensão do runtime).
- [x] **Código:** `match_threshold` 0.7 → **0.45** em `rag/search.ts` (comentário com a
  calibração medida).
- [x] **Validação em prod:** "Tem seguro de obra?" → TOP-1 = entrada de seguros (0.633);
  ruído abaixo de 0.41 (bem separado do threshold novo).
- [x] type-check/lint/suíte verdes (1064/1064).

## Riscos/observações
- Threshold 0.45 pode deixar passar um vizinho ocasional (ex.: 0.46 irrelevante) — o prompt
  da Nicole trata o contexto como REFERÊNCIA, não verdade absoluta; risco aceitável vs. RAG morto.
- Follow-up sugerido: quando criar/editar entrada da base pela UI (se existir), gerar o
  embedding na gravação — senão a entrada nasce invisível de novo.

## File List
- `docs/stories/75-173-rag-nicole-embeddings-threshold.story.md` (this file)
- `packages/ai/src/rag/search.ts`

## Change Log
- @dev (Dex): diagnóstico (2 causas), fix de dados via script (embeddings 38/38) + threshold.
- @qa (Quinn): PASS — validação com pergunta real do lead contra match_knowledge em prod.

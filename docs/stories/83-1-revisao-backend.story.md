# Story 83-1 — Backend: flow de revisão ortográfica + rota genérica

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 83 — Revisão ortográfica na saída
- **Branch:** feat/83-revisao-ortografica-envio
- **Tipo:** Feature (backend + flow LLM)

## Escopo
**IN:** flow `packages/ai/src/flows/message-review.ts` (`reviewOutgoingMessage`) — Haiku
(ANTHROPIC_MODELS.haiku), JSON `{has_errors, corrected}`, timeout 6s, extração por blocos
text (lição 82-4), parse defensivo; prompt de MUDANÇA MÍNIMA (não formaliza, preserva
vc/tb/blz, gírias, emojis, nomes, números/links, quebras). Rota `POST /api/messages/review`:
requireAuth (qualquer usuário ativo), skip trivial (<8 chars ou sem letras), fail-open em
qualquer erro (`{has_errors:false, reviewed:false}`).
**OUT:** UI (83-2/3); persistência (não grava nada).

## Acceptance Criteria
- [x] AC1: texto com erro claro → has_errors=true + corrected integral; texto limpo → false.
- [x] AC2: has_errors=true mas corrected igual/vazio → normalizado para false (nunca sugere à toa).
- [x] AC3: trivial (<8 chars/sem letras) → reviewed:false sem chamada de IA.
- [x] AC4: flow lança/timeout → rota responde 200 fail-open (nunca 5xx pro composer).
- [x] AC5: testes do parse + flow com mock (incl. bloco thinking antes do text); suíte verde.

## Change Log
- 2026-07-21 @sm/@po: criada e validada (GO) a partir do Epic 83.

## Dev Agent Record / QA (2026-07-21)
- @dev (Dex): implementado; fail-open verificado em todos os caminhos (helper client
  captura tudo → null; rota captura tudo → 200 has_errors=false). Lição 82-4 aplicada
  (filtro de blocos text). Checks: vitest 1117/1117 (10 novos), tsc/eslint limpos, build OK.
- @qa (Quinn): PASS — ver gate docs/qa/gates/epic-83-revisao-ortografica.yml.
- @devops (Gage): PR único do épico.

# Story 83-3 — Guarda no chat do portal (lado empresa, obras/mensagens)

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 83 — Revisão ortográfica na saída
- **Branch:** feat/83-revisao-ortografica-envio
- **Depende de:** 83-1, 83-2 (helper + caixa)

## Escopo
**IN:** admin-chat-feed.tsx (dashboard/obras/[obra_id]): spellCheck+lang no textarea;
sendText intercepta com o MESMO helper/caixa da 83-2 (reuso integral).
**OUT:** chat do CLIENTE (comprador) — fora por decisão; upload de arquivo — não é texto.

## Acceptance Criteria
- [x] AC1: mesma experiência da 83-2 no chat do portal lado empresa.
- [x] AC2: fail-open preservado; envio nunca bloqueado.
- [x] AC3: reuso: zero duplicação de prompt/fetch/UI de sugestão.

## Change Log
- 2026-07-21 @sm/@po: criada e validada (GO) a partir do Epic 83.

## Dev Agent Record / QA (2026-07-21)
- @dev (Dex): implementado; fail-open verificado em todos os caminhos (helper client
  captura tudo → null; rota captura tudo → 200 has_errors=false). Lição 82-4 aplicada
  (filtro de blocos text). Checks: vitest 1117/1117 (10 novos), tsc/eslint limpos, build OK.
- @qa (Quinn): PASS — ver gate docs/qa/gates/epic-83-revisao-ortografica.yml.
- @devops (Gage): PR único do épico.

# Story 83-2 — Guarda no chat do lead (composer compartilhado) + spellcheck nativo

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 83 — Revisão ortográfica na saída
- **Branch:** feat/83-revisao-ortografica-envio
- **Depende de:** 83-1

## Escopo
**IN:** helper client `lib/messages/review-outgoing.ts` (elegibilidade + fetch com timeout
+ fail-open null) e caixa compartilhada `components/messages/review-suggestion.tsx`
([Enviar corrigida] / [Enviar como escrevi], diff simples: mostra o texto corrigido).
BrokerMessageInput: spellCheck+lang="pt-BR" no textarea; handleSend intercepta — elegível →
revisa → erro claro? mostra sugestão e para; senão envia. Editar o texto limpa a sugestão.
"Enviar corrigida" envia com `original_message`; send-message grava `metadata.reviewed_original`.
**OUT:** Ctrl+Enter muda? Não — mesmo caminho. Áudio/anexos fora (não são texto digitado).

## Acceptance Criteria
- [x] AC1: mensagem com erro → caixa de sugestão; corrigida vai pro lead e original fica no metadata.
- [x] AC2: "Enviar como escrevi" envia o original SEM nova revisão (sem loop).
- [x] AC3: mensagem limpa/trivial → envia direto sem fricção perceptível além da latência da revisão.
- [x] AC4: revisão falhou/timeout → envia normal (fail-open); nenhuma regressão na janela 24h/erros existentes.
- [x] AC5: textarea com corretor nativo pt-BR ativo. Vale em TODAS as telas que usam o composer.

## Change Log
- 2026-07-21 @sm/@po: criada e validada (GO) a partir do Epic 83.

## Dev Agent Record / QA (2026-07-21)
- @dev (Dex): implementado; fail-open verificado em todos os caminhos (helper client
  captura tudo → null; rota captura tudo → 200 has_errors=false). Lição 82-4 aplicada
  (filtro de blocos text). Checks: vitest 1117/1117 (10 novos), tsc/eslint limpos, build OK.
- @qa (Quinn): PASS — ver gate docs/qa/gates/epic-83-revisao-ortografica.yml.
- @devops (Gage): PR único do épico.

# Story 82-4 — BUG: Análise IA retornava "formato inválido" (bloco de thinking do Sonnet 5)

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 82 — Análise de Comportamento IA do lead
- **Branch:** fix/82-4-sonnet-thinking-block
- **Tipo:** Bug — reportado pelo Marcos (print, 2026-07-21, lead Palmieri): primeiro
  clique real em "Analisar comportamento" → "A análise retornou um formato inválido".

## Context
O **Sonnet 5 roda adaptive thinking POR PADRÃO** (diferente do Haiku 4.5 usado nos
outros flows): `response.content` traz bloco(s) `thinking` ANTES do bloco `text`.
O flow lia `content[0]` esperando texto → pegava o thinking (texto vazio) → parse
null → rota 502 sem persistir (o guard anti-lixo funcionou como desenhado; o erro
foi na extração). Agravantes: `max_tokens: 2000` apertado (thinking consome do
mesmo orçamento) e função Vercel sem `maxDuration` (Sonnet pensando pode passar
do default).

## Acceptance Criteria
- [x] AC1: flow concatena TODOS os blocos `text` (ignorando `thinking`); regressão
  coberta por teste com mock retornando [thinking, text].
- [x] AC2: `max_tokens` 8000 e timeout 60s no client; `maxDuration = 90` na rota
  (padrão do repo: webhook/whatsapp e agent/chat usam 60).
- [x] AC3: parse recorta JSON cercado de prosa (primeiro `{` ao último `}`) — teste.
- [x] AC4: só-thinking sem texto → null → 502 sem persistir (teste).
- [x] AC5: suíte completa verde, tsc/eslint limpos.

## File List
- `docs/stories/82-4-fix-sonnet-thinking-block.story.md` (this file)
- `packages/ai/src/flows/behavior-analysis.ts` (extração de blocos text + max_tokens/timeout + parse com recorte)
- `packages/ai/src/flows/behavior-analysis.test.ts` (+4 testes de regressão)
- `packages/web/src/app/api/leads/[id]/behavior-analysis/route.ts` (maxDuration 90)

## Change Log
- @sm/@po: fluxo mínimo — bug reproduzido em prod no 1º teste real; causa raiz identificada (adaptive thinking default do Sonnet 5); GO.
- @dev (Dex): extração por filtro de blocos text; max_tokens 8000; recorte de JSON; maxDuration.
- @qa (Quinn): PASS — 4 testes de regressão cobrindo o cenário exato do bug + só-thinking + multi-text + prosa; suíte completa verde.
- @devops (Gage): PR + squash-merge + verificação pós-deploy.

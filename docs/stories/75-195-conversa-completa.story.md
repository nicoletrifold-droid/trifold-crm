# Story 75-195 — Conversa do lead cortada por limites fixos → conversa INTEIRA, sempre

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 75 — CRM core (conversas)
- **Branch:** fix/75-195-conversa-completa
- **Tipo:** Bug — reportado pelo Marcos (print, 2026-07-21): aba Conversa não mostra
  a conversa desde a entrada do lead (o que a Nicole falou some).

## Context
Limites fixos e INCONSISTENTES entre telas:
- `/dashboard/leads/[id]` (aba Conversa): embed com 20 msgs/conversa (5 conversas)
  + corte client em 50 → o COMEÇO da conversa sumia (exatamente a parte da Nicole).
- `/broker/leads/[id]`: `.order(asc).limit(50)` → duplamente errado: cortava e
  mantinha as 50 mais ANTIGAS (conversa longa perdia o FINAL).
- `/dashboard/conversas/[id]`, `/dashboard/chat/[id]`, `/broker/chat`: já sem corte.
Decisão Marcos: TODA a conversa visível SEMPRE, para todos os perfis.

## Acceptance Criteria
- [x] AC1: dashboard/leads aba Conversa carrega TODAS as mensagens de TODAS as
  conversas do lead, em ordem cronológica (fetch flat, sem embed limitado).
- [x] AC2: broker/leads idem (limit(50) removido).
- [x] AC3: nenhuma regressão: conversa ativa ([0] por last_message_at), janela 24h,
  collected_data, staleness da Análise IA e sender names continuam funcionando.
- [x] AC4: tsc/eslint limpos, suíte 1121/1121, next build OK.

## File List
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (fetch flat sem cortes)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (limit removido)

## Change Log
- @sm/@po: GO — bug visual confirmado no print (conversa começa no meio).
- @dev (Dex): fetch completo; follow-up anotado: se algum lead acumular milhares de
  mensagens e a página pesar, paginação "carregar mais antigas" é a evolução (hoje o
  volume real é de dezenas/centenas — carregar tudo é barato).
- @qa (Quinn): PASS — checks verdes; consumidores do fetch antigo revisados.
- @devops (Gage): PR + merge + verificação.

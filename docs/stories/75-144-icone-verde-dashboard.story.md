# Story 75-144 — Dashboard (leads): padronizar ícone de WhatsApp no mesmo verde do corretor

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #141 · **Complexidade:** XS (1 ponto) · **Branch:** feat/75-144-icone-verde-dashboard
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Follow-up da 75-143: deixar o ícone de WhatsApp na lista de leads do dashboard (`leads-bulk-table.tsx`) com o mesmo tratamento verde (emerald) + hover da lista do corretor, pra padronizar. Ver [[project-corretor-whatsapp-atendimento]].

## Escopo
IN: `leads-bulk-table.tsx` — classe do ícone `MessageCircle` recebe `rounded p-1 hover:bg-emerald-50 dark:hover:bg-emerald-500/10` (mantém emerald-600/400). OUT: outras telas.

## Acceptance Criteria
1. Ícone do dashboard visualmente consistente com o do corretor (verde + realce no hover), light/dark. tsc/lint/vitest limpos.

## Dev Agent Record (@dev — 2026-07-06)
- `leads-bulk-table.tsx`: className do ícone padronizada (emerald + hover bg + rounded/p-1). tsc 0 · eslint 0 · vitest 816/816.

## QA Results (@qa — 2026-07-06)
- **PASS.** Consistência visual com 75-143; só apresentação; 816/816.

## Change Log
- 2026-07-06 — @devops — PR #141 + merge. Status → Done.
- 2026-07-06 — @qa — PASS. — @dev — Implementado. — @po — GO. — @sm — Criada.

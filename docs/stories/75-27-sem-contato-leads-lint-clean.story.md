# Story 75-27 — "Sem contato" na lista de Leads via helper (lint-clean)

## Metadata
- **Status:** Done
- **Epic:** 75 · **Branch:** main · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** time, **I want** o filtro "Sem contato" da lista de Leads sem erro de lint e
consistente com o chat, **so that** o código fique limpo e o comportamento idêntico.

## Contexto
`dashboard/leads/page.tsx` (L100) e `broker/leads/page.tsx` (L91) já filtram por
`updated_at < corte`, mas calculam o corte com `new Date(Date.now() - ...)` no corpo
do Server Component → erro `react-hooks/purity` (pré-existente). Reusa o helper
`staleCutoffMs` (Story 75-26) para isolar o `Date.now()`.

## Escopo
**IN:** trocar o cálculo do corte pelas duas páginas por `new Date(staleCutoffMs(n)).toISOString()`
(via helper); guardar `cutoff>0`. Comportamento (filtro por `updated_at`) inalterado.
**OUT:** mudar a semântica (continua `updated_at`, não last_message); demais usos de `days`.

## Acceptance Criteria
1. `dashboard/leads` e `broker/leads` filtram igual a antes (parado N dias por `updated_at`).
2. Sem `Date.now()` no corpo dos componentes — usa `staleCutoffMs`.
3. typecheck e lint limpos nas duas páginas (erro de purity some).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.27-...yml`, quality_score 93)
- **typecheck:** limpo. **lint:** erro de purity removido nas 2 páginas (resta só warning pré-existente `isAdmin` não usado, alheio).

## File List
- `packages/web/src/app/dashboard/leads/page.tsx`
- `packages/web/src/app/broker/leads/page.tsx`

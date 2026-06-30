# Story 75-53 — Analytics: "Leads por Corretor" (renomear) + ocultar corretores inativos

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** que o card mostre "Leads por Corretor" (não "Performance") e não liste
corretores inativos, **so that** o título seja correto e a lista mostre só quem está ativo.

## Contexto
Pedido do usuário: (1) o card "Performance por Corretor" mostra nº de leads por corretor, não
performance → renomear; (2) não exibir corretores inativos (apareciam Ana, Vitor, Samara com 0
leads). No banco, todos têm `users.is_active=true`; o que distingue é `brokers.is_available`
(indisponíveis = inativos na operação). O `activeBrokerIds` (tela e relatório) NÃO filtrava por
isso (pegava todos), apesar do nome/comentário "ativos".

## Escopo
**IN:**
- Renomear "Performance por Corretor" → "Leads por Corretor" na tela (`analytics/page.tsx`) e no
  PDF (`analytics-report-pdf.tsx`).
- `activeBrokerIds` passa a filtrar `brokers.is_available = true` na tela e em
  `analytics-report-data.ts` (consistência tela↔relatório). Reflete nos cards Leads por Corretor
  e Tempo Médio de Atendimento (ambos filtram por activeBrokerIds).
**OUT:** mudar a definição de "ativo" para `users.is_active` (todos true hoje, não distingue).

## Acceptance Criteria
1. Card e PDF exibem "Leads por Corretor".
2. Corretores `is_available=false` (Ana, Vitor, Samara) não aparecem nos cards de corretor (tela e PDF).
3. Os 6 disponíveis seguem aparecendo. typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.53-analytics-leads-por-corretor-ativos.yml`)
- Filtro `is_available=true` aplicado na tela e no relatório. type-check/lint limpos.

## File List
- `packages/web/src/app/dashboard/analytics/page.tsx`
- `packages/web/src/lib/analytics-report-data.ts`
- `packages/web/src/lib/pdf/analytics-report-pdf.tsx`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Renomeia card p/ "Leads por Corretor" + oculta corretores indisponíveis (tela + PDF).

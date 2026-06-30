# Story 75-51 — Relatório PDF do analytics: tempo de atendimento = distribuição → atendimento

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** que o PDF do analytics use o mesmo cálculo de tempo de atendimento
da tela, **so that** relatório e tela nunca divirjam.

## Contexto
Princípio do usuário: **o relatório PDF tem que sempre seguir a base de dados da tela do
analytics** — toda mudança na tela reflete no relatório. A 75-47 corrigiu a tela
(distribuição→atendimento via `primeiro_atendimento_em`), mas o PDF tinha o cálculo DUPLICADO e
antigo (`broker_note − created_at`) em `lib/analytics-report-data.ts`. Esta story alinha o PDF.

## Escopo
**IN:** `lib/analytics-report-data.ts`: query de tempo passa a buscar leads ATENDIDOS
(`primeiro_atendimento_em` no período) e o cálculo vira `primeiro_atendimento_em −
lead_distribution_log.created_at` (distribuição mais recente antes do atendimento), igual à
tela (75-47). Título no PDF (`analytics-report-pdf.tsx`) atualizado e sem "(últimos 7 dias)" fixo.
**OUT:** extrair o cálculo compartilhado tela↔relatório (refactor — ver follow-up).

## Acceptance Criteria
1. PDF (on-demand `/api/analytics/report` e cron semanal `analytics-report`) calcula
   distribuição→atendimento, idêntico à tela.
2. Título do PDF condizente; sem rótulo fixo enganoso.
3. typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.51-relatorio-pdf-tempo-atendimento.yml`)
- Mesma lógica da 75-47/75-46. type-check/lint limpos.

## Follow-up
- Risco de duplicação: tela (`analytics/page.tsx`) e relatório (`analytics-report-data.ts`)
  têm cálculos separados. Considerar extrair p/ um util único, p/ futuras mudanças refletirem
  automaticamente em ambos (o que o usuário pediu como princípio).

## File List
- `packages/web/src/lib/analytics-report-data.ts`
- `packages/web/src/lib/pdf/analytics-report-pdf.tsx`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — PDF do analytics alinhado à tela (distribuição→atendimento).

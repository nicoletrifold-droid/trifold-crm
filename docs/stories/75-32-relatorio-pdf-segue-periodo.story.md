# Story 75-32 — PDF sob demanda segue o período da tela (cron mantém semanal)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, build]

## Story
**As a** gestor, **I want** que o PDF gerado ao clicar "Baixar/Relatório PDF" reflita o
período selecionado na tela, **so that** o relatório bata com o que estou vendo — mantendo
o relatório AUTOMÁTICO (cron) como resumo semanal comparativo.

## Contexto
Decisão do usuário (2026-06-23): PDF ao clicar muda com o período; automático mantém a
comparação semanal. `buildAnalyticsReportData` era compartilhado e fixo (mês + comparação
semanal). Tornei o período opcional e aditivo: sem período = comportamento original (cron
intocado); com período = relatório do período + comparação com período anterior de mesma duração.

## Escopo
**IN:**
- `buildAnalyticsReportData(supabase, orgId, period?)`: com período usa o RPC ranged
  (funil/origem/empreendimento/corretor), comparativo = período atual × anterior de mesma
  duração, tempo de atendimento e LPs do período, label = intervalo do período.
- `/api/analytics/report` lê `range`/`from`/`to` da URL → `resolvePeriod` → passa o período.
- Página: links "Relatório PDF"/"Baixar PDF" levam o período atual (reportHref).

**OUT:** cron `/api/cron/analytics-report` (chama sem período → resumo semanal, inalterado);
layout do PDF (mantido — mesma estrutura, dados do período).

## Acceptance Criteria
1. PDF clicado com 7d/30d/90d/Custom reflete o período (funil, origem, empreend., comparativo).
2. Comparativo do PDF por período = atual × período anterior de mesma duração.
3. Cron continua gerando o resumo semanal (sem período) — sem regressão.
4. typecheck, lint e build limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.32-...yml`, quality_score 88)
- **typecheck/lint/build:** limpos.
- **Ressalva:** render do PDF não verificável por CLI — usuário confere baixando com período.

## File List
- `packages/web/src/lib/analytics-report-data.ts`
- `packages/web/src/app/api/analytics/report/route.ts`
- `packages/web/src/app/dashboard/analytics/page.tsx`

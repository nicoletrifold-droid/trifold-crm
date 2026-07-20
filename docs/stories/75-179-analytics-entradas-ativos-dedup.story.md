# Story 75-179 — Analytics: Entradas + Ativos, dedup e PDF "sem empreendimento"

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (analytics / relatórios)
- **Branch:** feat/75-179-analytics-entradas-ativos-dedup
- **Tipo:** Feature + refactor (follow-ups da 75-178)

## Context
Fecha os 3 follow-ups mapeados na [[75-178]] ([[project-analytics-metrica-unificada]]):

1. **Dedup** — tela e PDF ainda tinham código próprio derivando as métricas da mesma RPC
   (`get_analytics_summary_ranged`). Falta uma fonte única no client.
2. **"Novos leads" excluía perdidos** — a RPC tinha `total_leads` IDÊNTICO a `new_leads` (ambos
   `is_active AND lost_reason IS NULL`). Decisão do Marcos (2026-07-20): mostrar **Entradas**
   (todas as entradas do período, inclui perdidos) **E Ativos** (subconjunto ativo/não-perdido).
   Conversão passa a usar Entradas.
3. **PDF "Por Empreendimento" não fechava o total** — leads sem `property_interest_id` sumiam do
   detalhamento (soma < total).

## Acceptance Criteria
- [x] AC1 (RPC/mig 178): `total_leads` conta TODAS as entradas da janela (drop do filtro
  is_active/lost_reason); `new_leads` inalterado (ativos); `lost_agg` (perdidos) sem filtro
  `is_active` → perdidos = subconjunto real das entradas. Demais CTEs inalteradas.
- [x] AC2 (dedup): helper único `lib/analytics/metrics.ts::deriveAnalyticsMetrics(summary)` →
  `{ entradas, ativos, perdidos }` + tipo `AnalyticsSummary` compartilhado. Tela e PDF importam.
  Teste unitário cobrindo os 3 campos.
- [x] AC3 (tela): cards passam a exibir **Entradas** e **Ativos** (+ Perdidos); `mediaDiaria` e
  `conversao` usam **entradas**. Branch com filtro de empreendimento calcula entradas por query
  própria (todos os criados da janela p/ o empreendimento).
- [x] AC4 (PDF): card herói vira **Entradas** (valor + variação vs período anterior) com sublinha
  "{ativos} ativos"; card Perdidos mantido; usa o helper. Variação de entradas via 2ª chamada da
  RPC no período anterior.
- [x] AC5 (PDF): comparativo "Por Empreendimento" ganha linha **"Sem empreendimento"** — o
  detalhamento passa a fechar com o total (ativos) do comparativo.
- [x] AC6: type-check/lint/suíte verdes; migração aplicada em prod e conferida (entradas ≥ ativos).

## Out of Scope
- Redefinir o comparativo (por corretor/origem) para base "entradas" — segue base ativos (funil),
  agora com a linha "Sem empreendimento" fechando o total. Full rebase p/ entradas = follow-up.
- Média diária por dia comercial (segue calendário/janela, como hoje).

## File List
- `docs/stories/75-179-analytics-entradas-ativos-dedup.story.md` (this file)
- `supabase/migrations/178_analytics_total_leads_entradas.sql` (novo)
- `packages/web/src/lib/analytics/metrics.ts` (novo — helper + tipo compartilhado)
- `packages/web/src/lib/analytics/metrics.test.ts` (novo)
- `packages/web/src/app/dashboard/analytics/page.tsx` (cards Entradas/Ativos; helper)
- `packages/web/src/lib/analytics-report-data.ts` (helper; entradas/ativos/delta; sem-empreendimento)
- `packages/web/src/lib/pdf/analytics-report-pdf.tsx` (card herói Entradas + sublinha Ativos)

## Change Log
- @sm/@po: fluxo — follow-ups da 75-178; decisão de produto (Entradas+Ativos) confirmada pelo Marcos.
- @dev (Dex): mig 178 (total_leads=entradas, lost_agg sem is_active); helper `lib/analytics/metrics.ts`
  (deriveAnalyticsMetrics + tipo AnalyticsSummary + toCount) usado por tela e PDF; tela com cards
  Entradas/Ativos (+ média/conversão ÷ entradas) e query de entradas por empreendimento; PDF com
  card herói Entradas + sublinha "{ativos} ativos · {perdidos} perdidos" (2ª chamada RPC p/ delta) +
  linha "Sem empreendimento" no comparativo; cron do e-mail semanal atualizado (entradas/ativos).
- @qa (Quinn): PASS — 1080/1080 (4 novos), tsc verde, lint limpo. Migration aplicada em prod via
  Management API e conferida (janela 12→19: entradas 173 ≥ ativos 130 ≥ perdidos 37; subconjuntos ok).
- @devops (Gage): (pendente)

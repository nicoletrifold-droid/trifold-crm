# Story 75-180 — PDF: comparativo do Analytics na base "Entradas"

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (analytics / relatórios)
- **Branch:** feat/75-180-pdf-comparativo-base-entradas
- **Tipo:** Ajuste de métrica (follow-up remanescente da 75-179)

## Context
Follow-up remanescente da [[75-179]] ([[project-analytics-metrica-unificada]]): o card herói do
PDF virou **Entradas** (todas), mas o comparativo (Total / Por Empreendimento / Por Corretor /
Por Origem) ainda somava só **ativos** (`recentLeadsRaw` filtrava `is_active=true AND lost_reason
IS NULL`). Resultado: o Total do comparativo (ativos) não batia com o card Entradas.

**Decisão do Marcos:** rebasear o comparativo para **entradas** — assim o Total do comparativo
bate com o card herói e os detalhamentos refletem tudo que entrou no período.

## Acceptance Criteria
- [x] AC1: `recentLeadsRaw` deixa de filtrar `is_active`/`lost_reason` — passa a trazer TODAS as
  entradas da janela (comparativo atual e anterior). Segmento principal preservado.
- [x] AC2: Linha Total do comparativo volta a rotular "Novos leads" e passa a bater com o card
  herói **Entradas** (currLeads.length ≡ RPC `total_leads`).
- [x] AC3: "Por Corretor" ganha linha **"Sem corretor"** (leads sem `assigned_broker_id`), análoga
  ao "Sem empreendimento" (75-179), para o detalhamento fechar o total.
- [x] AC4: Hero (Entradas/Ativos/Perdidos) segue vindo da RPC via `deriveAnalyticsMetrics` — par
  com a tela. Total do comparativo (rows) == Entradas do hero (verificado).
- [x] AC5: type-check/lint/suíte verdes.

## Out of Scope
- Mudar o cálculo de tempo médio de atendimento (segue base "atendidos", correto).
- Cards do hero (já corretos na 75-179).

## File List
- `docs/stories/75-180-pdf-comparativo-base-entradas.story.md` (this file)
- `packages/web/src/lib/analytics-report-data.ts` (query recentLeadsRaw + buildComparison)

## Change Log
- @sm/@po: fluxo — follow-up direto da 75-179, decisão do Marcos.
- @dev (Dex): recentLeadsRaw sem filtro is_active/lost_reason (base entradas); Total do comparativo
  volta a "Novos leads"; add linha "Sem corretor" (análoga a "Sem empreendimento").
- @qa (Quinn): PASS — 1080/1080, tsc verde, lint limpo. Prod (janela 12→19): entradas=173 (== Total
  do comparativo == card Entradas), sem_empreendimento=14, sem_corretor=6 — detalhamentos fecham.
- @devops (Gage): (pendente)

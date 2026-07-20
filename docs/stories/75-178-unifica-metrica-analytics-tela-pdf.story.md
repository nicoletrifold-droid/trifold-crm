# Story 75-178 — Unifica métrica do Analytics: tela e PDF leem a mesma fonte

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (analytics / relatórios)
- **Branch:** fix/75-178-unifica-metrica-analytics-tela-pdf
- **Tipo:** Bug fix (consistência de métrica) — reportado pelo Marcos (2026-07-20)

## Context
Marcos comparou a tela de Analytics (Custom 12→19/07: Total **121**, Perdidos **29**) com o PDF
do mesmo rótulo de período (Novos leads **129**, Perdidos **16**) e perguntou por que divergem.

Diagnóstico (código + banco de prod):
1. **Janela diferente apesar do rótulo igual** — a tela Custom usa 8 dias cheios; o PDF comparado
   foi gerado pelo cron "7d" (janela móvel). Para o MESMO período os números têm que bater.
2. **Cálculo duplicado** (dívida técnica conhecida, [[feedback-relatorio-segue-tela]]): tela e PDF
   chamam a mesma RPC `get_analytics_summary_ranged`, mas **não leem os mesmos campos**:
   - **Total/Novos leads:** tela = `stages.reduce` (soma do funil) · PDF = linhas criadas
     (`currLeads.length`, ≡ `new_leads`). A soma do funil exclui etapas não exibidas → 121 ≠ new_leads.
   - **Perdidos:** tela = `sum(lost_reasons)` da RPC (29, sem filtro is_active) · PDF = query própria
     com `is_active=true AND lost_reason IS NOT NULL` (16). A diferença exata (13) = perdidos inativos.

**Decisão:** a RPC é a fonte única. Tela e PDF passam a ler `new_leads` (novos leads) e
`sum(lost_reasons)` (perdidos) da RPC, sobre a MESMA janela `[since, until)`.

## Acceptance Criteria
- [x] AC1: Tela — card de topo passa a ler `new_leads` da RPC (era soma do funil). Relabel para
  "Novos leads". `mediaDiaria` e `conversao` seguem usando esse mesmo total.
- [x] AC2: Tela (branch com filtro de empreendimento) — `newLeads = allLeads.length` (mesma
  definição: ativos, não-perdidos, criados na janela) e a query de perdidos por empreendimento
  perde o filtro `is_active` (fica igual à `lost_reasons` da RPC).
- [x] AC3: PDF — card "Perdidos" passa a ler `sum(lost_reasons)` da RPC (era query própria com
  `is_active`); card "Novos leads" lê `new_leads` da RPC (numericamente ≡ ao atual `currLeads.length`).
- [x] AC4: Para o MESMO período (mesmos `range/from/to`), tela e PDF exibem Novos leads e Perdidos
  idênticos. Presets ("7d") podem ter diferença mínima só pela hora de geração (janela móvel) —
  documentado, não é divergência de cálculo.
- [x] AC5: type-check/lint/suíte verdes.

## Out of Scope
- Dedup completo do cálculo num único helper compartilhado (tela e PDF continuam com código próprio,
  mas agora leem os MESMOS campos da RPC) — follow-up.
- Redefinir "novos leads" para incluir perdidos (hoje `new_leads` exclui perdidos; manter). Se quiser
  "total de entradas incl. perdidos", trocar para `total_leads` nas duas pontas — decisão à parte.
- Inconsistência interna do PDF (Por Empreendimento não soma o total quando há leads sem
  empreendimento) — follow-up separado.
- Forwarding de período na página de preview `/dashboard/analytics/report` (o caminho principal,
  botões da tela, já encaminha via `reportHref`).

## File List
- `docs/stories/75-178-unifica-metrica-analytics-tela-pdf.story.md` (this file)
- `packages/web/src/app/dashboard/analytics/page.tsx` (totalLeads = new_leads + relabel + lost query)
- `packages/web/src/lib/analytics-report-data.ts` (perdidos = sum(lost_reasons); novos = new_leads)

## Change Log
- @sm/@po: fluxo mínimo — divergência reportada pelo diretor com reprodução clara (tela vs PDF + banco).
- @dev (Dex): tela lê `new_leads` da RPC p/ o card (era soma do funil) + relabel "Novos leads" +
  `newLeads=allLeads.length` no branch de empreendimento + query de perdidos sem `is_active`; PDF lê
  `sum(lost_reasons)` (era query própria com is_active) e `new_leads` p/ o card. Fonte única = a RPC.
- @qa (Quinn): PASS — 1076/1076, type-check verde, lint limpo. Verificação na RPC de prod (janela
  12→19): new_leads=135 e sum(lost_reasons)=32 idênticos p/ as duas pontas (funil antigo somava 120).
- @devops (Gage): (pendente)

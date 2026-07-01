# Story 75-94 — Filtro de data (período de captura) na tela de Leads

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (push + PR + deploy; sem migration) · **Epic:** 75 · **Branch:** feat/75-94-leads-filtro-data · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, verificação do filtro]
- **Prioridade:** 🟢 Média — pedido do diretor (o filtro de data fazia falta na tela de Leads).

## Story
**As a** gestão, **I want** filtrar os leads por **período de captura** (De/Até) na tela de Leads, **so that** eu veja só os leads que entraram numa janela de datas — como já existe no Pipeline.

## Contexto
`/dashboard/leads` hoje filtra por Etapa, Empreendimento, Corretor e "Sem contato" (via componente compartilhado `components/lead-filters.tsx`). Não tem filtro de **intervalo de datas**. O **Pipeline já tem** (`date_from`/`date_to` em `created_at`, timezone America/Sao_Paulo). Reusar o mesmo padrão.

`LeadFilters` é COMPARTILHADO (Leads, Conversas, broker/chat, broker/leads) → o filtro de data entra **opt-in** (prop `showDateRange`, default false) pra não afetar as outras telas.

## Escopo
**IN:**
1. `components/lead-filters.tsx`: nova prop `showDateRange?: boolean` (default false) + `dateFromParam="date_from"`/`dateToParam="date_to"`. Quando ligada, renderiza 2 inputs `type="date"` (De/Até) que setam os params; entram no `hasFilters` e no "Limpar".
2. `dashboard/leads/page.tsx`: ler `date_from`/`date_to` do searchParams e aplicar em `query` + `countQuery`: `gte("created_at", "<from>T00:00:00-03:00")` e `lte("created_at", "<to>T23:59:59-03:00")` (idêntico ao Pipeline). Passar `showDateRange` ao `<LeadFilters>`. Preservar os params na paginação (`buildPageHref`).

**OUT:**
- Não muda as outras telas que usam `LeadFilters` (opt-in).
- Não mexe nos filtros existentes (etapa/empreendimento/corretor/sem contato/criados).
- Filtro é por **created_at** (captura), consistente com o Pipeline — não por última interação.

## Acceptance Criteria
1. **Given** a tela de Leads, **then** há os campos "Captura — De" e "Até".
2. **Given** `De` e/ou `Até` preenchidos, **then** a lista (e a contagem) mostram só leads com `created_at` na janela (fuso -03:00; De inclui 00:00, Até inclui 23:59:59).
3. **Given** filtros de data ativos + paginação, **then** os params se preservam ao trocar de página.
4. **Given** "Limpar", **then** os campos de data também são limpos.
5. **Given** Conversas/broker (que usam o mesmo componente), **then** nada muda (sem os inputs de data).
6. typecheck/lint limpos.

## Dev Notes
- Padrão de data = `pipeline/page.tsx:131-136` (`created_at` + `T00:00:00-03:00`/`T23:59:59-03:00`).
- `LeadFilters` já tem `setParam(key,value)` + `hasFilters` + botão Limpar — só estender.
- `leads/page.tsx`: `buildPageHref` (linha ~24) monta a URL da paginação — incluir `date_from`/`date_to`.
- Input date: usar `type="date"` com o mesmo estilo (`selectClass` ou similar).

## File List
- `packages/web/src/components/lead-filters.tsx` — prop `showDateRange` + inputs De/Até.
- `packages/web/src/app/dashboard/leads/page.tsx` — aplica `date_from`/`date_to` na query + paginação + passa `showDateRange`.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Reuso do padrão do Pipeline, opt-in não afeta telas irmãs, ACs testáveis, sem migration/risco de dado. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] `lead-filters.tsx`: prop `showDateRange` (default false) + `dateFromParam`/`dateToParam`; inputs "Captura de / até" (com min/max cruzados); entram no `hasFilters` e no Limpar.
- [x] `dashboard/leads/page.tsx`: lê `date_from`/`date_to`, aplica `gte/lte` em `created_at` (fuso -03:00, De=00:00 / Até=23:59:59) em query + countQuery; `buildPageHref` + as 2 chamadas preservam os params; passa `showDateRange` ao `LeadFilters`.
- **Checks:** `tsc` 0; `eslint` 0 errors (1 warning `isAdmin` pré-existente, alheio). Sem migration.
- Branch `feat/75-94-leads-filtro-data`, commit local (sem push).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅
- **Read-only (prod):** filtro `created_at` com fuso -03:00 retorna coerente — 1133 ativos, 3 criados em 01/07, 1126 em junho. Padrão idêntico ao Pipeline já em prod.
- **Rastreabilidade:** AC1/AC2 — inputs De/Até + query gte/lte em created_at (query e count). AC3 — buildPageHref propaga date_from/date_to. AC4 — Limpar apaga os 2. AC5 — opt-in (`showDateRange`) → Conversas/broker/chat/broker-leads não passam a prop, sem mudança. AC6 — tsc/lint 0.

**Gate → PASS.** Pronto para @devops (push + PR + deploy). Sem migration.

## Change Log
- 2026-07-01 — @qa (Quinn) — Gate PASS (filtro created_at validado read-only; tsc/lint 0). Status → Done.
- 2026-07-01 — @dev (Dex) — Implementado: date range opt-in no LeadFilters + query created_at + paginação na tela de Leads. Sem push.
- 2026-07-01 — @po (Pax) — GO. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic 75). Filtro de período de captura na tela de Leads (reusa padrão do Pipeline, opt-in no componente compartilhado).

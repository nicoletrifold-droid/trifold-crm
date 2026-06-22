# Story 70-1 — "Leads ativos" (card) = "Em atendimento" (lista): fonte única

## Metadata
- **Status:** Done
- **Epic:** 68 — Dashboard: Coerência de Contadores
- **Branch:** feature/70-1-leads-ativos-fonte-unica
- **Complexidade:** S (2 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck]

## Story

**As a** admin no dashboard,
**I want** que o card "Leads ativos" mostre exatamente o mesmo total da lista "Em atendimento",
**so that** os números do CRM sejam coerentes e confiáveis.

## Contexto

Após a Story 69-1, a lista "Em atendimento" mostra ~525 (is_active=true, excluindo Perdido,
Não Qualificado, Corretores Antigos, Represamento). Mas o card "Leads ativos" mostra 534 —
ele deriva do RPC `get_dashboard_stage_counts` subtraindo só represamento + corretores-antigo,
e ainda conta Não Qualificado e leads inativos.

Causa de fundo: "ativo" está definido em DOIS lugares com regras diferentes (dashboard via
RPC+slug; lista via is_active + stage_id). Eles divergem.

**Solução:** uma fonte única de verdade — `EM_ATENDIMENTO_EXCLUDED_IDS` em módulo compartilhado.
O card "Leads ativos" passa a usar uma contagem direta idêntica à da lista.

**Arquivos alvo:**
- `packages/web/src/lib/leads/stage-filters.ts` (NOVO — constantes compartilhadas)
- `packages/web/src/app/dashboard/leads/page.tsx` (importa do módulo)
- `packages/web/src/app/dashboard/page.tsx` (card "Leads ativos" via count direto)

## Escopo

**IN:**
- Extrair `PERDIDO_STAGE_IDS`, `ACERVO_STAGE_IDS`, `EM_ATENDIMENTO_EXCLUDED_IDS` para módulo compartilhado.
- `leads/page.tsx` importa do módulo (remove definição local).
- Dashboard: card "Leads ativos" = `count(leads where is_active=true AND stage_id NOT IN EM_ATENDIMENTO_EXCLUDED_IDS)` — mesma regra da lista.

**OUT:**
- "Total no pipeline" (810) e o breakdown por stage do Pipeline (seguem via RPC — métricas distintas).
- Aba "Perdidos".
- RPC `get_dashboard_stage_counts` (não alterado).

## Acceptance Criteria

1. O card "Leads ativos" usa a MESMA regra da lista "Em atendimento" (is_active=true + exclusão dos 4 stages).
2. O número do card é igual ao total da lista `/dashboard/leads` (view ativos), sem filtros.
3. As constantes vivem em um único módulo compartilhado, importado por dashboard e leads.
4. "Total no pipeline" e o breakdown por stage permanecem inalterados.
5. Typecheck sem erros.

## Tasks / Subtasks

- [x] **Task 1 — Módulo compartilhado** (AC: 3)
  - [x] 1.1 Criar `lib/leads/stage-filters.ts` com as 3 constantes
  - [x] 1.2 `leads/page.tsx` importa (remove def local)
- [x] **Task 2 — Card "Leads ativos" via count direto** (AC: 1, 2, 4)
  - [x] 2.1 Query de contagem no Promise.all do dashboard
  - [x] 2.2 Render do card usa o novo count
- [x] **Task 3 — Typecheck** (AC: 5)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada e validada GO — Status → Ready | River (@sm) / Pax (@po) |
| 2026-06-18 | 1.1 | Implementado (módulo compartilhado + count direto); typecheck 0; paridade 525=525 — Status → InReview | Dex (@dev) |
| 2026-06-18 | 1.2 | QA Gate PASS — Status → Done | Quinn (@qa) |

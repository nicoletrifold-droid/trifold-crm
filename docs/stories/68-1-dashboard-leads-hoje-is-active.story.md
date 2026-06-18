# Story 68-1 — Dashboard: contador "Leads hoje" só conta leads ativos

## Metadata
- **Status:** Ready
- **Epic:** 68 — Dashboard: Coerência de Contadores
- **Branch:** feature/68-1-dashboard-leads-hoje-is-active
- **Complexidade:** XS (1 ponto) — 1 filtro no query do card

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck]

## Story

**As a** admin no dashboard,
**I want** que o card "Leads hoje" conte o mesmo que aparece ao clicar nele,
**so that** o número não confunde (mostrava 2, abria 1).

## Contexto

O card "Leads hoje" (`packages/web/src/app/dashboard/page.tsx`, query linha ~30-33) conta
`created_at >= meia-noite` **sem filtrar `is_active`**. A lista de leads (aberta ao clicar,
`?criados=hoje`) filtra `is_active = true` (`leads/page.tsx` linhas 62/68).

Após a Story 67-1, não-leads são arquivados (`is_active=false`). O card contava o não-lead
arquivado (Massaroni), mostrando 2; a lista mostrava 1. Divergência.

## Escopo

**IN:** adicionar `.eq("is_active", true)` ao query do card "Leads hoje".
**OUT:** outros cards (Leads ativos/Total no pipeline usam outra lógica via RPC e já são coerentes).

## Acceptance Criteria

1. O card "Leads hoje" conta apenas leads com `is_active = true` criados a partir da meia-noite.
2. O número do card é igual ao total exibido em `/dashboard/leads?criados=hoje`.
3. Typecheck sem erros.

## Tasks / Subtasks

- [x] **Task 1 — Filtro no query do card** (AC: 1, 2)
  - [x] 1.1 Adicionar `.eq("is_active", true)` ao query `leadsToday`
- [x] **Task 2 — Typecheck** (AC: 3)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada e validada 9/10 GO — Status → Ready | River (@sm) / Pax (@po) |

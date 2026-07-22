# Story 75-206 — Lista de Leads: Último contato antes do Score + remover "Ver"

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (UX)
- **Branch:** fix/75-206-leads-tabela-ajustes
- **Tipo:** Ajuste estético — Marcos (prints, 2026-07-22).

## Acceptance Criteria
- [x] AC1: colunas invertidas — **Último contato** antes de **Score** (último
  contato é mais relevante à análise). Header + células, todas as visões
  (em atendimento e perdidos), todos os perfis (componente único
  `leads-bulk-table.tsx`).
- [x] AC2: botão **"Ver"** removido — a linha inteira já navega
  (`onClick → /dashboard/leads/[id]`). A coluna de ação agora só existe na
  visão Perdidos com permissão de reativar (botão Reativar); colSpan do
  empty-state acompanha (9/10).
- [x] AC3: type-check/lint/suíte verdes (1146/1146).

## File List
- `docs/stories/75-206-leads-tabela-ajustes.story.md` (this file)
- `packages/web/src/components/leads/leads-bulk-table.tsx`

## Change Log
- @sm/@po/@dev/@qa 2026-07-22: fluxo mínimo (ajuste visual, componente único,
  sem lógica de dados). PASS.
- @devops (Gage) 2026-07-22: PR + squash-merge + deploy.

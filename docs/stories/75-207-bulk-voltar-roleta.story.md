# Story 75-207 — Transferência em massa: opção "Voltar para a Roleta"

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (roleta)
- **Branch:** feat/75-207-bulk-voltar-roleta
- **Tipo:** Feature — Marcos (prints, 2026-07-22): o dropdown "Novo Corretor"
  da transferência em massa só tinha corretores + "Remover corretor"; faltava
  poder devolver o lead à Roleta para redistribuição.

## Acceptance Criteria
- [x] AC1 (UI): opção "↩ Voltar para a Roleta" no select do bulk
  (leads-bulk-table.tsx), disponível a quem já vê a barra (admin/supervisor/
  gerente-comercial/sdr — mesma permissão do bulk).
- [x] AC2 (API `/api/leads/bulk`): flag `roleta` → limpa `assigned_broker_id` E
  `bolsao_em` (senão a roleta recusa com em_bolsao), stage → "Aguardando
  atendimento", lost_reason → null (mesma semântica da transferência), grava
  activity de auditoria ("Lead devolvido à Roleta por {nome}", com user_id) e
  dispara `distributeLeadToNextBroker` NA HORA, lead a lead (sequencial,
  respeita a ordem da roleta; falha de um não derruba os demais).
- [x] AC3: fora de horário/sem corretor disponível → lead fica sem corretor e o
  cron roleta-retry (*/3min) assume — comportamento padrão da roleta. Guards
  existentes respeitados (perdido/imob nunca entram; 75-197 preserva Visita
  Agendada se for o caso na redistribuição).
- [x] AC4: type-check/lint/suíte verdes (1146/1146).

## File List
- `docs/stories/75-207-bulk-voltar-roleta.story.md` (this file)
- `packages/web/src/components/leads/leads-bulk-table.tsx`
- `packages/web/src/app/api/leads/bulk/route.ts`

## Change Log
- @sm/@po/@dev/@qa 2026-07-22: fluxo mínimo. Decisão de UX confirmada pelo
  Marcos in-loop ("incluir roleta na lista já resolve"). Redistribuição imediata
  reusa o motor único (distributor) — sem lógica nova de fila. PASS.
- @devops (Gage) 2026-07-22: PR + squash-merge + deploy.

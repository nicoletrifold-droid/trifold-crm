# Story 75-203 — Feedback de visita assinado (autor na linha do tempo)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / estende 75-185..202 (feedback de visita)
- **Branch:** feat/75-203-feedback-autor
- **Tipo:** Melhoria — Marcos (2026-07-22): "foi a atendente ou a Daiana que
  preencheu?" → o evento "Visita concluída" aparecia como "Sistema" porque a
  activity nascia com `user_id` NULL; o CRM não gravava o autor do feedback.

## Acceptance Criteria
- [x] AC1: `VisitFeedbackBody` ganha `actor_user_id` (public.users.id) e o
  núcleo (`visit-feedback-core.ts`) grava `activities.user_id` — a timeline do
  dashboard já resolve `users:user_id(name)` e passa a exibir o nome no lugar
  de "Sistema". FK conferida (activities.user_id → public.users.id = appUser.id,
  lição da mig 125).
- [x] AC2: os dois endpoints (porta normal e retroativa) passam `appUser.id`.
- [x] AC3: registros antigos ficam como estão (autor não foi gravado — não há
  como recuperar); follow-up pós-visita da Nicole segue como Sistema (é o
  sistema mesmo). type-check/lint/suíte verdes (1144/1144).

## File List
- `docs/stories/75-203-feedback-autor.story.md` (this file)
- `packages/web/src/lib/appointments/visit-feedback-core.ts`
- `packages/web/src/app/api/leads/[id]/visit-feedback/route.ts`
- `packages/web/src/app/api/appointments/[id]/feedback/route.ts`

## Change Log
- @sm/@po 2026-07-22: fluxo mínimo (campo faltando no insert). GO.
- @dev (Dex) / @qa (Quinn) 2026-07-22: PASS — suíte 1144/1144; sem migration
  (coluna e render já existiam).
- @devops (Gage) 2026-07-22: PR + squash-merge + deploy.

# Story 75-202 — Relato da visita visível no Histórico do lead

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / estende 75-185..201 (feedback de visita)
- **Branch:** feat/75-202-feedback-visivel-historico
- **Tipo:** Melhoria — Marcos (2026-07-22): "onde vejo os feedbacks?" → o evento
  "Visita concluída" só mostrava o interesse; o relato ("como foi a visita") e os
  próximos passos ficavam gravados em `visit_feedback` mas invisíveis fora da
  aba Análise IA.

## Acceptance Criteria
- [x] AC1: `visit-feedback-core.ts` — a activity `visit_completed` ganha
  description completa: "Visita concluída. Interesse: quente/morno/frio" +
  relato + "Próximos passos: ..." (quando houver). Interesse traduzido p/ PT.
  Vale p/ TODAS as portas (as 8 convergem no núcleo) e todas as telas que
  renderizam description (Histórico dashboard + broker), todos os perfis.
- [x] AC2 (mig 188): backfill das activities antigas a partir do
  `visit_feedback` correspondente (`metadata->>'feedback_id'`). Idempotente.
  Aplicada em PROD (3 activities reescritas, verificadas com o texto real) e
  DEV. GOTCHA: `interest_after` é enum `interest_level` — CASE precisa de
  `::text` nos dois lados (senão 22P02 'quente' inválido p/ o enum).
- [x] AC3: nada parseia a description antiga (conferido: "Visita concluída" na
  timeline é map de TÍTULO por tipo, não parse) — mudança segura.
  type-check/lint/suíte verdes (1144/1144).

## File List
- `docs/stories/75-202-feedback-visivel-historico.story.md` (this file)
- `packages/web/src/lib/appointments/visit-feedback-core.ts`
- `supabase/migrations/188_backfill_visit_feedback_description.sql`

## Change Log
- @sm/@po 2026-07-22: fluxo mínimo (gap de exibição — dado já estava salvo). GO.
- @dev (Dex) 2026-07-22: description rica no núcleo + backfill.
- @qa (Quinn) 2026-07-22: PASS — suíte 1144/1144; verificação real no prod das
  3 activities backfilled (relato legível); metadata preservado (Análise IA e
  chips continuam funcionando); Nicole pós-visita intocada.
- @devops (Gage) 2026-07-22: mig 188 aplicada em PROD+DEV (registrada '188');
  PR + squash-merge + deploy.

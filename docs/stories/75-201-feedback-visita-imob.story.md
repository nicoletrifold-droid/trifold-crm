# Story 75-201 — Feedback de visita no mundo IMOB (+ destravar drag do pipeline IMOB)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (mundo IMOB) / estende 75-185/186/188/193 (feedback de visita)
- **Branch:** feat/75-201-feedback-visita-imob
- **Tipo:** Feature — pedido do Marcos (2026-07-22): levar a solução de feedback de
  visita da HOUSE (incl. gatilho do arrasto p/ "Visitou") para o IMOB.

## Context
Mapeamento confirmou: o formulário/modal/gatilhos de feedback são compartilhados e
NÃO têm condição de mundo — o pipeline IMOB reusa o mesmo KanbanBoard, então a UI
já renderizaria. Os bloqueios eram de backend:
1. **RLS (bug latente):** perfil imob não conseguia NEM MOVER card no pipeline
   IMOB — o drag persiste via browser client e as policies de leads (mig 085) não
   contemplam o role; o UPDATE afetava 0 linhas e o card voltava (rollback do
   board). A porta C (arrasto → Visitou) nunca chegava a abrir.
2. **Role-guard dos endpoints de feedback** (`FEEDBACK_ADMIN_ROLES` = admin/
   supervisor/gerente-comercial; fora isso só o dono) → imob levaria 403.
3. **Appointment retroativo nascia `team='house'`** fixo (default do banco) —
   lead IMOB sujaria a agenda da HOUSE.
A porta da Agenda ("Registrar visita") já funcionava (canMutateAppointment 81-3
permite imob em team imob).

## Acceptance Criteria
- [x] AC1 (mig 187): função `is_imob_profile()` + policies `leads_select_imob`/
  `leads_update_imob` ESCOPADAS a `segmento='imob'` (sem tocar
  `is_admin_or_supervisor` — imob não ganha acesso a obras/clientes/leads house).
  WITH CHECK (=USING) impede tirar o lead do mundo imob. DO block defensivo
  (dev DB sem coluna segmento). Aplicada em prod+dev.
- [x] AC2: `POST /api/leads/[id]/visit-feedback` (retroativa) — perfil imob/
  consultoria autorizado quando `lead.segmento='imob'`; appointment retroativo
  nasce `team = segmento==='imob' ? 'imob' : 'house'`.
- [x] AC3: `POST /api/appointments/[id]/feedback` — perfil imob/consultoria
  autorizado quando `appointment.team='imob'` (mesma matriz da governança 81-3).
- [x] AC4: nenhuma mudança de UI necessária (KanbanBoard/VisitFeedbackModal/
  drawer já cobrem o pipeline IMOB); house inalterada; type-check/lint/suíte
  verdes.

## File List
- `docs/stories/75-201-feedback-visita-imob.story.md` (this file)
- `supabase/migrations/187_leads_rls_imob_segmento.sql`
- `packages/web/src/app/api/leads/[id]/visit-feedback/route.ts`
- `packages/web/src/app/api/appointments/[id]/feedback/route.ts`

## Change Log
- @sm/@po 2026-07-22: escopo desenhado a partir do mapeamento das 8 portas do
  feedback; decisão de RLS dedicada escopada (não alargar is_admin_or_supervisor). GO.
- @dev (Dex) 2026-07-22: implementado conforme ACs.
- @qa (Quinn) 2026-07-22: PASS — suíte 1144/1144; type-check/eslint verdes;
  policies verificadas no prod pós-aplicação (leads_select_imob/update_imob
  presentes, escopadas a segmento='imob'); descoberta: policy de prod já havia
  evoluído (assigned_broker_id = public_user_id()) — dona direta já movia os
  próprios leads; a nova policy torna o mundo imob gerenciável pelo perfil
  independente do responsável. House inalterada (policies permissivas, OR).
- @devops (Gage) 2026-07-22: mig 187 aplicada em PROD e DEV (registrada '187');
  PR + squash-merge + deploy Vercel.

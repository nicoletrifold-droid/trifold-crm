# Story 75-185 — Feedback de visita acessível: 1 modal compartilhado, 3 portas

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (agenda / visitas)
- **Branch:** feat/75-185-feedback-visita-3-portas
- **Tipo:** Feature/UX — decisão do Marcos ("faz numa story só os 3 pontos"), 2026-07-20

## Context
O formulário de feedback de visita (dispara TODO o ciclo: `visit_feedback` + appointment
`completed` + lead → Visitou + pós-visita da Nicole) existia num único lugar:
`/broker/agenda/[id]/feedback`, alcançável só pelos botões da agenda do corretor. Resultado
(caso Fernanda/75-177): quem registra visita "no braço" (kanban + nota) ou trabalha no
dashboard **não tinha acesso ao formulário** — o dashboard só "marcava como realizado" SEM
feedback (sem Nicole pós-visita, sem visit_feedback).

Solução: extrair o formulário p/ um componente compartilhado e plugá-lo nos 3 pontos de
contato naturais — sem duplicar código.

Descoberta no caminho: o kanban muda etapa via UPDATE direto no Supabase client (não passa
pela rota `/api/leads/[id]/stage`), então o guard 3 da 75-177 não cobre o drag — mais um
motivo p/ a porta 3 (e os guards 1/2 do cron seguram o resto).

## Acceptance Criteria
- [x] AC1 (componente): `components/appointments/visit-feedback-form.tsx` com
  `VisitFeedbackForm` (campos + POST — extraído da página existente), `VisitFeedbackModal`
  (overlay padrão do projeto) e `VisitFeedbackButton` (botão + modal + router.refresh).
  Página `/broker/agenda/[id]/feedback` refatorada p/ REUSAR o form (rota preservada).
- [x] AC2 (porta 1 — lead do corretor): `/broker/leads/[id]` mostra botão "Registrar visita"
  no header quando o lead tem agendamento pendente de feedback (scheduled/confirmed no
  passado, ou completed sem `visit_feedback`).
- [x] AC3 (porta 2 — dashboard/agenda): "Marcar como realizado" vira o modal de feedback
  (Fernanda ganha o formulário no ambiente dela). O caminho antigo `mark_completed` (que
  completava SEM feedback) é removido.
- [x] AC4 (porta 3 — kanban): ao arrastar o card p/ **Visitou**, se o lead tem agendamento
  aberto (scheduled/confirmed, já passado), abre o modal oferecendo o feedback — NÃO trava
  o arrasto (fechar o modal mantém a mudança de etapa).
- [x] AC5 (hardening): `POST /api/appointments/[id]/feedback` ganha auth (antes era PÚBLICA):
  requireAuth + org + permissão (admin/supervisor/gerente-comercial, ou corretor dono do
  agendamento/lead) — espelha a governança da 75-103.
- [x] AC6: type-check/lint/suíte verdes.

## Out of Scope
- Notificação/cobrança de feedbacks pendentes (ex.: alerta "3 visitas sem feedback") — v2.
- Editar feedback já enviado.

## File List
- `docs/stories/75-185-feedback-visita-3-portas.story.md` (this file)
- `packages/web/src/components/appointments/visit-feedback-form.tsx` (novo)
- `packages/web/src/app/broker/agenda/[id]/feedback/page.tsx` (refactor — usa o form)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (porta 1 — query + botão)
- `packages/web/src/app/dashboard/agenda/page.tsx` (porta 2 — modal no lugar do mark_completed)
- `packages/web/src/components/pipeline/kanban-board.tsx` (porta 3 — modal pós-drop)
- `packages/web/src/app/api/appointments/[id]/feedback/route.ts` (AC5 — auth)

## Change Log
- @sm/@po: decisão do Marcos (1 story, 3 portas); mapa das superfícies feito antes do draft.
- @dev (Dex): VisitFeedbackForm/Modal/Button compartilhados (extraídos da página da agenda, que foi refatorada p/ reusar); porta 1 = botão no header do lead do corretor (agendamento passado sem visit_feedback); porta 2 = "Registrar visita" no dashboard/agenda via modal + remoção do caminho mark_completed; porta 3 = modal pós-drop no kanban (não bloqueia o arrasto); API de feedback ganhou requireAuth + org + governança (antes pública).
- @qa (Quinn): PASS — 1093/1093, tsc verde, eslint 0 erros (warning <img> pré-existente). Sem restos de mark_completed; rota broker/agenda/[id]/feedback preservada (4 links).
- @devops (Gage): PR squash-merge, deploy prod automático.

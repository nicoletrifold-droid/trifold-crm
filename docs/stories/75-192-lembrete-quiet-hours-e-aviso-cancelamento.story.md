# Story 75-192 — Lembretes fora de horário importuno + aviso de cancelamento pelo cliente

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / complemento da 75-191
- **Branch:** feat/75-192-quiet-hours-e-cancelamento
- **Tipo:** Ajustes pedidos pelo Marcos (2026-07-21) sobre a 75-191.

## Context
1. **Horário importuno:** lembrete de 3h de uma visita às 09:00 sairia às 06:00.
2. **Cancelamento mudo:** POST `/api/appointments/cancel/[token]` (link do cliente)
   só mudava status + removia do Google Calendar — NINGUÉM era avisado.

## O que foi feito
- [x] **Quiet hours no cron de lembretes:** gate 08:00–20:00 BRT (run inteiro adia
  fora disso) + janelas com catch-up: 3h = [30min, 3h15] antes; 24h = [20h, 24h15]
  antes. Visita às 09:00 → lembrete "hoje às 09:00" sai às 08:00 (1h antes) em vez
  de 06:00 (ou de nunca). Flags por janela garantem envio único.
- [x] **Template Meta** `visita_cancelada_aviso` (UTILITY, pt_BR, 4 params)
  submetido 2026-07-21.
- [x] **Aviso de cancelamento** (`notifyVisitCancelledWhatsApp` em
  `lib/appointments/visit-whatsapp.ts`), fire-and-forget no POST de cancel:
  - `team='house'` → corretor do agendamento (fallback: responsável do lead).
  - `team='imob'` → corretor parceiro (metadata.corretor_parceiro) + TODOS os
    usuários role=imob ativos c/ telefone (Daiana) — mesmo público da 75-174.
  - Dedup por telefone; nome do cliente via client_name ou lead.
- [x] Activity `appointment_cancelled` na timeline do lead (origem: cancel_link).
- [x] type-check/lint/suíte verdes (1093/1093).

## File List
- `docs/stories/75-192-lembrete-quiet-hours-e-aviso-cancelamento.story.md` (this file)
- `packages/web/src/lib/appointments/visit-whatsapp.ts` (notifyVisitCancelledWhatsApp)
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (gate + catch-up)
- `packages/web/src/app/api/appointments/cancel/[token]/route.ts` (aviso + activity)

## Change Log
- @sm/@po: fluxo mínimo — 2 ajustes objetivos sobre a 75-191. GO.
- @dev (Dex): gate BRT + janelas catch-up; helper de cancelamento; activity.
- @qa (Quinn): PASS — janelas sem overlap (3h15 < 20h); label "amanhã" seguro
  (visitas só em horário comercial); dedup; template PENDING → retry gracioso.
- @devops (Gage): PR squash-merge, deploy prod automático.

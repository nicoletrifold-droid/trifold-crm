# Story 63-15 — Handoff automático após o agendamento da Nicole

## Metadata
- **Epic:** 63 (UX do Atendimento do Corretor) — Fase 5
- **Status:** Ready for Review
- **Priority:** P0
- **Complexity:** S/M
- **Implementado por:** orquestrador (modo direto — subagentes indisponíveis por sobrecarga 529 da API); pendente auditoria @qa.

## User Story
Como **gestor do atendimento**, quero que o lead entre em **handoff** (a Nicole pare de responder) **após a Nicole agendar uma visita**, além do handoff já existente quando o corretor envia mensagem — para que, uma vez agendada a visita, o corretor assuma a conversa sem a IA respondendo em paralelo.

## Contexto
Antes desta story, o handoff (`conversations.is_ai_active=false`) acontecia em **1 gatilho**: o corretor enviar mensagem na janela de 24h (Story 63-13, `send-message` seta `is_ai_active=false`, `handoff_at`, `handoff_reason='broker_reply'`). O agendamento **não** disparava handoff (`handoff.ts`: *"Visit scheduled is NOT a handoff trigger"*) — a Nicole continuava atendendo. Esta story adiciona o **2º gatilho** (agendamento) e ajusta a **reativação automática 24h** para não anular o handoff por agendamento.

## Acceptance Criteria
- [x] **AC1** — Quando o pipeline emite `APPOINTMENT_CREATED`, o webhook desliga `is_ai_active=false` na conversa, com `handoff_at=now()` e `handoff_reason='appointment'`, **após** a Nicole enviar a confirmação do agendamento. Escopo por-conversa (`.eq("id", conversation.id)`), admin client, idempotente (`.eq("is_ai_active", true)`).
- [x] **AC2** — `notifyBrokerOfAppointment` continua sendo chamado (corretor é avisado). Não regrediu.
- [x] **AC3** — Reativação 24h ancorada em `resolveTakeoverAnchor(handoff_at, lastBrokerAt)` = instante **mais recente** entre o `handoff_at` da conversa e a última msg `role='broker'`. A Nicole só reassume se passou ≥ 24h desde a âncora. Cobre os dois handoffs (agendamento e msg do corretor) e o caso do corretor que responde por vários dias.
- [x] **AC4** — Não-regressão: lead **novo** (sem agendamento e sem msg de corretor) mantém `is_ai_active=true` → a Nicole atende normalmente. O handoff só ocorre nos 2 gatilhos.
- [x] **AC5** — Ao reassumir, o webhook limpa `handoff_at=null`/`handoff_reason=null` (não influencia cálculos futuros).
- [x] **AC6** — TS/ESLint limpos; helper puro testado.

## Tasks
- [x] T1 — `resolveTakeoverAnchor(handoffAt, lastBrokerAt)` em `packages/web/src/lib/broker/broker-takeover-status.ts` (helper puro) + 9 testes.
- [x] T2 — Webhook (`packages/web/src/app/api/webhook/whatsapp/route.ts`): reativação usa a âncora e limpa o handoff ao reassumir.
- [x] T3 — Webhook: flag `appointmentCreated` no `onEvent` (`APPOINTMENT_CREATED`); após enviar a resposta da Nicole, UPDATE de handoff (`is_ai_active=false`, `handoff_at`, `handoff_reason='appointment'`).

## Dev Notes
- `conversations.is_ai_active`/`handoff_at`/`handoff_reason` já existem (migration 001) — **sem migration**.
- Gate da Nicole no webhook (`if (isAiActive)`) inalterado: o handoff por agendamento roda **dentro** do bloco, após o envio da confirmação; as próximas mensagens do lead já encontram `is_ai_active=false`.
- `handoff_reason`: `'broker_reply'` (msg do corretor, 63-13) | `'appointment'` (agendamento, esta story).

## Decisões resolvidas
- **`handoff_reason='appointment'`** para o gatilho de agendamento.
- **Âncora = `max(handoff_at, lastBrokerAt)`** unifica os 2 gatilhos de handoff (confirmado: `send-message` já seta `handoff_at`).
- **Janela de reativação = 24h** (`BROKER_WINDOW_MS`).

## Riscos
- **GR (alto):** mexe no webhook da Nicole (produção). Mitigação: escopo por-conversa, idempotência, helper puro testado, suíte 526 verde. **Exige smoke manual pré-deploy** (handoff por agendamento + reativação + não-regressão de lead novo). Rollback: `UPDATE conversations SET is_ai_active=true` via SQL admin.

## Out of Scope
- Mudar `handoff.ts`/`shouldHandoff` (o gatilho de agendamento é tratado no webhook via `APPOINTMENT_CREATED`, não no `shouldHandoff`).

## Change Log
- v1.0 (2026-06-21) — Implementação direta (handoff por agendamento + reativação ancorada). Suíte 526/526, type-check/lint limpos. Pendente auditoria @qa.

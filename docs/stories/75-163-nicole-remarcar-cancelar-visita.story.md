# Story 75-163 — Nicole remarca e cancela visita (com disponibilidade + notifica corretor)

## Metadata
- **Status:** InReview · **Epic:** Nicole — agendamento confirmado · **PR:** — · **Complexidade:** L (8 pontos) · **Branch:** feat/75-163-nicole-remarcar-cancelar-visita
- **executor:** @dev · **quality_gate:** @qa

## Contexto
A Nicole age como SDR ([[project-nicole-como-sdr]]) e já cria a visita (75-162). Mas se **já existe** visita marcada, ela cai num beco de "só reconfirmar" (`pipeline.ts:561-565`, injeta "NÃO pergunte dia nem horário") — **não remarca nem cancela**. Cenário real do Marcos: marcou 9h dia 18; 2 dias depois o cliente quer 10h dia 21 → a Nicole tem que **cancelar o evento antigo e marcar o novo** (consultando disponibilidade), em **qualquer etapa/dia**. Decisões do Marcos: autônoma + **notifica o corretor** + loga; cancelamento puro ela executa e se oferece pra remarcar.

Gaps confirmados: (a) sem detecção de intenção remarcar/cancelar; (b) branch de visita-existente é beco sem saída; (c) `isSlotFree` NÃO exclui a própria visita do lead (`visit-slot.ts:237-247`) → remarcar perto do mesmo horário daria "ocupado" por conflito consigo; (d) Google helper só tem create+delete (remarcar = delete antigo + create novo); (e) padrão humano reusável em `api/appointments/[id]` (governança 75-103).

## Escopo
**IN:**
1. **`visit-slot.ts`:** `isSlotFree`/`checkSlotAvailability` aceitam `excludeAppointmentId?` (aplica `.neq("id", …)`) — corrige o auto-conflito na remarcação. `detectCancelIntent(text)` e `detectRescheduleIntent(text)` (puros, keywords). +testes.
2. **`pipeline.ts` — branch de visita ativa:** ampliar o gate para rodar também quando existe visita ativa (funciona em qualquer etapa/dia). Ao detectar:
   - **Remarcar** (keyword de remarcar OU novo dia+hora, da MENSAGEM/pendências — não do visit_availability antigo — que difere do atual): `evaluateSlot` + `checkSlotAvailability(excludeId=atual)`; se livre, injeta contexto de confirmação e, no bloco de mutação, **move** o appointment (novo `scheduled_at`), sincroniza Google (delete antigo + create novo → grava `google_event_id`), `activities` (`appointment_updated`, reason "remarcada pelo cliente via Nicole", de X para Y), emite `APPOINTMENT_RESCHEDULED`. Se ocupado → oferece alternativas, não mexe. Parcial (só dia/hora) → guarda pendência e pergunta.
   - **Cancelar** (intenção clara, sem novo slot): marca `status='cancelled'`, `deleteCalendarEvent`, `activities` (`appointment_cancelled`, reason), emite `APPOINTMENT_CANCELLED`; contexto manda confirmar o cancelamento e se oferecer pra remarcar.
   - Senão → reconfirma (comportamento atual).
3. **`notify-appointment.ts` + webhook:** notificar o corretor em remarcação/cancelamento (variante de `notifyBrokerOfAppointment` com título/corpo por tipo); webhook trata `APPOINTMENT_RESCHEDULED`/`APPOINTMENT_CANCELLED` no `onEvent` (mesmo padrão do `APPOINTMENT_CREATED`).

**OUT:** editar outros campos (local/duração) por chat; remarcar/cancelar de visitas Calendly externas; UI (é fluxo de conversa); backfill; helper `updateCalendarEvent` in-place (usa delete+create).

## Acceptance Criteria
1. **Given** visita marcada (9h dia 18) e o cliente pede "pode mudar pra 10h dia 21?", **when** a Nicole processa, **then** confere disponibilidade do novo slot (excluindo a própria visita), **move** o appointment p/ 21 10h, sincroniza Google, loga `appointment_updated` e a Nicole confirma o novo horário.
2. **Given** o novo horário pedido está ocupado, **then** NÃO remarca; a Nicole oferece alternativas.
3. **Given** o cliente diz claramente que quer cancelar (sem nova data), **then** a visita vira `cancelled`, sai do Google, loga `appointment_cancelled`, e a Nicole confirma + oferece remarcar.
4. **Given** remarcação/cancelamento, **then** o **corretor designado é notificado** (push/e-mail/whats conforme config) e há registro em `activities`.
5. **Given** o cliente volta **dias depois** (nova mensagem, mesma conversa) pra mudar, **then** o fluxo funciona (não depende de estar "em modo agendamento" no turno).
6. **Given** intenção ambígua (menção a horário sem pedir mudança) ou slot igual ao atual, **then** NÃO remarca/cancela — reconfirma o existente (sem falso positivo).
7. Sem dupla-marcação (guards mantidos); tsc/lint/vitest limpos, com testes de intents + availability com exclusão + resolveVisitSlotParts.

## Dev Notes
- Branch de visita ativa: `pipeline.ts:549-565`. Criação: `:854-945` (padrão a espelhar p/ mutação). `activeAppointment` select precisa incluir `id, google_event_id, broker_id, scheduled_at`.
- `isSlotFree` `visit-slot.ts:225-249` (add exclude). `resolveVisitSlotParts` (75-162) — para remarcar use `visitAvailability: null` (o va guarda o slot ANTIGO).
- Google: `createCalendarEvent`/`deleteCalendarEvent` (`lib/google-calendar.ts`). Remarcar = delete `google_event_id` antigo + create novo + update do id.
- Notificação: `notifyBrokerOfAppointment` (`lib/broker/notify-appointment.ts`) — add variante título/corpo; webhook `onEvent` em `route.ts:869` (novo `if` p/ RESCHEDULED/CANCELLED).
- Padrão humano (reusar semântica): `api/appointments/[id]/route.ts` (PATCH conflito com `.neq("id", id)`; DELETE soft-cancel + `deleteCalendarEvent` + activity com reason). Respeita [[feedback-nicole-nunca-move-etapa]] (não move stage) e [[project-agenda-governanca]].

## 🤖 CodeRabbit Integration
- **Story Type:** AI/pipeline + Integration (Calendar) · **Complexity:** High.
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** sem dupla-marcação; sem cancelar/remarcar por engano (intent + slot diff); availability exclui a própria visita; Google sincronizado; corretor notificado; auditoria.

## Dev Agent Record (@dev — 2026-07-16)
- **`visit-slot.ts`:** `isSlotFree`/`checkSlotAvailability` c/ `excludeAppointmentId` (corrige auto-conflito na remarcação); `detectCancelIntent`/`detectRescheduleIntent` (puros); `dayPartsFromUtc` (troca só-de-horário no mesmo dia).
- **`pipeline.ts`:** bloco de slot agora roda SEMPRE que há lead (busca visita ativa); se existe visita → detecta **remarcar** (novo dia+hora concreto e diferente → checa disponibilidade excluindo a própria → move o appointment, Google delete+create, `activities` appointment_updated, `APPOINTMENT_RESCHEDULED`), **cancelar** (intenção clara sem novo slot → status cancelled, delete Google, `appointment_cancelled`, `APPOINTMENT_CANCELLED`), parcial → pergunta, senão reconfirma. Injeta `deleteCalendarEvent` (novo param). Mutação após a resposta (espelha o create). Guards anti-duplicação intactos.
- **webhook + `notify-appointment.ts`:** injeta `deleteCalendarEvent`; `onEvent` notifica o corretor em RESCHEDULED/CANCELLED (variante de título/corpo).
- **Testes:** +4 (detectCancel/Reschedule intents); resolveVisitSlotParts/availability já cobertos.
- **Checks:** tsc 0 (web+ai) · eslint 0 · vitest **1021/1021** (+4).
- **Branch:** `feat/75-163-nicole-remarcar-cancelar-visita`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (remarca novo dia+hora, checa disponibilidade excluindo a própria, move+Google+log) ✓ · AC2 (novo horário ocupado → não remarca, oferece alternativas) ✓ · AC3 (cancela + oferece remarcar, sai do Google, log) ✓ · AC4 (corretor notificado + activities) ✓ · AC5 (funciona em qualquer etapa/dia — gate roda sempre que há lead+visita ativa) ✓ · AC6 (slot igual/menção sem pedido → reconfirma, sem falso positivo; cancel só sem novo slot) ✓ · AC7 (guards anti-dup + tsc/eslint/1021) ✓.
- Risco (Nicole com poder de mover/cancelar): mitigado por intent + slot-diff + disponibilidade + auditoria + notificação. Falha de mutação → `APPOINTMENT_*_FAILED` (não finge sucesso). **Validação definitiva = teste real** (remarcar/cancelar por chat e conferir Agenda + Google + aviso ao corretor).

## Change Log
- 2026-07-16 — @qa — **QA GATE: PASS**. 7 ACs, 1021/1021.
- 2026-07-16 — @dev — Implementado (remarcar/cancelar + exclude-self + intents + Google sync + notificação). tsc/eslint/1021. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).

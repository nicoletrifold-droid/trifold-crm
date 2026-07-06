# Story 75-141 — Aviso claro quando o número não tem WhatsApp (fecha a Fase 1)

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #138 · **Complexidade:** S (2 pontos) · **Branch:** feat/75-141-aviso-numero-sem-whatsapp
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Fecha a Fase 1 (ver [[project-corretor-whatsapp-atendimento]]). Como a Meta não valida "é WhatsApp?" antes, o corretor só descobre no envio. Hoje o envio falho virava `HTTP_400` genérico e a rota gravava a mensagem com `sent:false` retornando `success:true` — o corretor **não via aviso**. Decisão do diretor: mostrar aviso claro quando o número não tiver WhatsApp.

## Escopo
**IN:**
1. **`lib/broker/send-errors.ts`** (novo + teste): `classifyWhatsAppSendError(httpStatus, metaCode)` (códigos Meta 131026/131021 → `WHATSAPP_UNREACHABLE`; senão `HTTP_<status>`) e `brokerSendErrorMessage(code)` (mensagens PT amigáveis).
2. **`dispatch-broker-message.ts`:** ao falhar o POST, ler `error.code` do corpo da Meta (robusto a resposta sem corpo) e classificar. Import relativo (`./send-errors`) por causa do vitest.
3. **`broker-message-input.tsx`:** quando `data.sent === false`, exibir `brokerSendErrorMessage(data.sendError)` (a bolha já é marcada como não entregue).

**OUT:** validação online prévia (não existe na Meta); disparo por template (Fase 2).

## Acceptance Criteria
1. **Given** o envio falha com código Meta 131026/131021, **then** o dispatch retorna `WHATSAPP_UNREACHABLE`.
2. **Given** `WHATSAPP_UNREACHABLE`, **then** o corretor vê "Não foi possível entregar. Este número pode não ter WhatsApp." (e a bolha fica marcada como não entregue).
3. **Given** resposta de erro sem corpo/JSON, **then** cai em `HTTP_<status>` sem quebrar (regressão coberta).
4. `send-errors` e o caminho no dispatch cobertos por testes. tsc/lint/vitest limpos.

## Dev Agent Record (@dev — 2026-07-06)
- `lib/broker/send-errors.ts` (+6 testes) + caso de integração no dispatch (cenário 5, Meta 131026 → WHATSAPP_UNREACHABLE).
- `dispatch-broker-message.ts`: parse do corpo em try/catch (mantém HTTP_<status> se sem corpo — regressão do cenário 4 preservada).
- `broker-message-input.tsx`: banner de aviso quando `sent:false`.
- **Checks:** tsc 0 · eslint 0 · vitest 801/801 (+7).

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (131026/131021 → UNREACHABLE) ✓ · AC2 (mensagem PT + bolha não entregue) ✓ · AC3 (sem corpo → HTTP_<status>, cenário 4 intacto) ✓ · AC4 (7 testes; tsc/eslint/801) ✓. Loop pegou robustez do `res.json` ausente → corrigido com try/catch.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #138** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS** (loop: try/catch no parse). 4 ACs, 801/801.
- 2026-07-06 — @dev — Implementado (classificação + aviso). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**.
- 2026-07-06 — @sm — Story criada.

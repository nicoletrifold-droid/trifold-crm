# Story 75-162 — Nicole cria o agendamento quando confirma a visita (desacopla de visit_proposed)

## Metadata
- **Status:** InReview · **Epic:** Nicole — agendamento confirmado · **PR:** — · **Complexidade:** M (5 pontos) · **Branch:** feat/75-162-nicole-agenda-visita-confirmada
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (Marcos, 2026-07-16): a Nicole **confirmou** a visita com a Andréia ("Confirmado! Sábado, dia 18, às 9h…") mas **não criou o compromisso na agenda** → risco de dupla-marcação (o corretor Odair lançou manualmente depois; appointment com `created_by='broker'`). Diagnóstico no banco confirma que é **amplo**: nos últimos 45 dias a Nicole criou só **3** agendamentos (último 16/jun) vs 22 do corretor; `conversation_state.visit_proposed` é **false em 147** conversas (true em 2); e **40** conversas têm `visit_availability` capturado sem agendamento da Nicole.

Causa raiz: a criação do compromisso (`pipeline.ts:543`) só roda quando `visit_proposed=true`, que é setado apenas quando a mensagem ANTERIOR da Nicole casa com `VISIT_INVITE_PATTERNS` (frases fixas: "qual dia seria melhor", "link da agenda", "calendly"…). O texto atual da Nicole não casa → `visit_proposed` fica false → **nunca agenda**. É frágil por depender de casar texto livre do modelo.

Decisão do Marcos: **desacoplar** — agendar a partir do slot que a Nicole JÁ captura (`collected_data.visit_availability`, ex.: "Sábado, 18 de julho, às 9h"), passando pelas validações que já existem. Só daqui pra frente (sem backfill).

## Escopo
**IN:**
1. **`visit-slot.ts`:** helper puro `resolveVisitSlotParts({ message, now, pendingDay, pendingTime, visitAvailability })` → `{ day, time }`, combinando na ordem: mensagem do lead → pendências de turnos → **`visit_availability`**. +testes.
2. **`pipeline.ts`:** o bloco de slot (L543) passa a rodar quando `visit_proposed` **OU** `visit_availability` presente (não só visit_proposed). Usa `resolveVisitSlotParts` (visit_availability como fallback de dia/hora). Mantém TODAS as validações: `evaluateSlot` (horário comercial), `checkSlotAvailability` (slot livre), e o guard anti-duplicação (`activeAppointment` no bloco + `!existingAppt` no insert). Sem duplicar.
3. **`pipeline.ts` (insert L862):** checar erro do insert; emitir `APPOINTMENT_CREATED` **só** quando a linha foi gravada; em falha, emitir `APPOINTMENT_INSERT_FAILED` (fecha a brecha de notificar corretor/logar "agendado" sem gravar).

**OUT:** backfill das ~40 conversas antigas (manual/etapa futura); dar tool de agendamento à Nicole (maior); mover o lead p/ "Visita Agendada" (segue manual, Story 73-1); mexer nos padrões de `visit_proposed` (desacoplado torna-o não-crítico).

## Acceptance Criteria
1. **Given** `visit_availability` = "Sábado, 18 de julho, às 9h" (slot concreto capturado) e sem appointment futuro, **when** a Nicole processa a conversa, **then** cria o appointment (sáb 09:00 BRT) via as validações existentes — mesmo com `visit_proposed=false`. Reproduz/corrige o caso Andréia.
2. **Given** `visit_availability` só com dia (sem hora parseável) OU só intenção ("quero visitar"), **then** **não** cria appointment (falta dia+hora) — pergunta o que falta.
3. **Given** já existe appointment futuro (scheduled/confirmed) do lead, **then** **não** duplica (guard mantido).
4. **Given** slot fora do horário comercial ou ocupado, **then** não agenda (validações mantidas) e a Nicole oferece alternativa.
5. **Given** o INSERT do appointment falhar, **then** emite `APPOINTMENT_INSERT_FAILED` e **não** emite `APPOINTMENT_CREATED` nem notifica corretor.
6. tsc/lint/vitest limpos, com testes de `resolveVisitSlotParts` (combina turnos/va; ambíguo→parcial).

## Dev Notes
- `pipeline.ts`: gate em L543; resolução dia/hora L564-573; insert em L854-921 (só depende de `bookableSlotUtc && !existingAppt && org_id`). `visit_availability` setado em `qualification.ts:269-293` (exige day-keyword/intent). `parseDayParts`/`parseTimeParts`/`evaluateSlot`/`checkSlotAvailability` em `visit-slot.ts`.
- Segurança: só agenda com dia+hora resolvidos + horário comercial + slot livre + sem appointment existente → dupla-marcação bloqueada. `created_by='nicole'`. Respeita [[project-nicole-agendamento]] (push Google best-effort, não move stage) e [[feedback-nicole-nunca-move-etapa]].

## 🤖 CodeRabbit Integration
- **Story Type:** AI/pipeline (agendamento) · **Complexity:** Medium.
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** sem dupla-marcação (guards), sem agendar slot inválido, insert error-checado, sem regressão no fluxo visit_proposed atual.

## Dev Agent Record (@dev — 2026-07-16)
- **`visit-slot.ts`:** `resolveVisitSlotParts` (puro): dia/hora combinando msg do lead → pendências → **visit_availability**. **Bug latente corrigido:** `parseDay`/`parseHour` eram case-sensitive (`stripAccents` não minusculizava) → "Sábado"/"9H" não casavam; agora `.toLowerCase()` (afetava o visit_availability capitalizado da Nicole — e o parse em geral).
- **`pipeline.ts`:** gate do bloco de slot agora `visit_proposed || visit_availability`; usa `resolveVisitSlotParts`; insert do appointment com checagem de erro → `APPOINTMENT_CREATED` só quando gravou; falha → `APPOINTMENT_INSERT_FAILED` (fecha brecha de notificar corretor sem gravar).
- **Testes:** `resolveVisitSlotParts` (5: só va/caso Andréia, prioridade da msg, dia+hora pendente, só-dia→null, sem sinais→null).
- **Checks:** tsc 0 (web+ai) · vitest **1017/1017** (+10). Guards anti-duplicação (activeAppointment + !existingAppt) e validações (evaluateSlot/checkSlotAvailability) intactos.
- **Branch:** `feat/75-162-nicole-agenda-visita-confirmada`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (agenda pelo slot capturado mesmo com visit_proposed=false; case-insensitive p/ "Sábado") ✓ · AC2 (só-dia/intenção → não agenda) ✓ · AC3 (appointment existente → não duplica) ✓ · AC4 (fora do horário/ocupado → não agenda) ✓ · AC5 (insert error-checado → APPOINTMENT_INSERT_FAILED, sem APPOINTMENT_CREATED falso) ✓ · AC6 (tsc/vitest 1017/1017, +10) ✓.
- Risco de dupla-marcação coberto pelos guards existentes. Validação definitiva = teste real (Nicole confirma visita → aparece na Agenda).

## Change Log
- 2026-07-16 — @qa — **QA GATE: PASS**. 6 ACs, 1017/1017.
- 2026-07-16 — @dev — Implementado (resolveVisitSlotParts + gate visit_availability + parse case-insensitive + insert error-check). tsc/1017. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).

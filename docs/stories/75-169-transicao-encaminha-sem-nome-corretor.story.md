# Story 75-169 — Mensagem de transição: Nicole encaminha (sem citar o nome do corretor)

## Metadata
- **Status:** Done · **Epic:** Transferir conversa / atendimento · **PR:** #218 · deploy d216261 · **Complexidade:** XS (1 ponto) · **Branch:** feat/75-169-transicao-encaminha-sem-nome-corretor
- **executor:** @dev · **quality_gate:** @qa

## Contexto
A mensagem automática de transição dizia *"Olá {lead}! Sou {corretor}, da equipe Trifold. Estou aqui para continuar te ajudando. 😊"* — gravada com `role='assistant'` (aparece como "Nicole"), então soava como a Nicole se apresentando como um corretor humano (confuso), e ainda gerava apresentação em dobro (o corretor reapresentava). Decisão do Marcos (2026-07-16): a transição vira uma **passagem de bastão da Nicole**, **sem citar o nome** de quem vai atender.

## Escopo
**IN:**
1. **`lib/broker/transition-message.ts`:** `buildTransitionText(leadName)` (remove o param `brokerName` e o `BROKER_NAME_FALLBACK`). Novo texto: **"Olá {lead}! Já vou te encaminhar para o nosso consultor especialista da Trifold. Ele vai continuar seu atendimento por aqui. 😉"** (sem nome → "Olá! Já vou…").
2. **`send-message/route.ts`:** call site passa só `lead.name`. Segue gravando `role='assistant'` + `metadata.is_transition/broker_id`, uma vez por conversa (`shouldSendTransition`), e enviando ao lead.
3. Testes atualizados.

**OUT:** mudar cor/rótulo da bolha; suprimir a reapresentação manual do corretor (orientação de equipe).

## Acceptance Criteria
1. **Given** um humano assume a conversa (1ª msg do corretor), **then** o lead recebe a transição da Nicole **sem nome de corretor** e no novo texto ("consultor especialista").
2. **Given** lead sem nome, **then** "Olá! Já vou te encaminhar…" (sem "undefined/null").
3. **Given** já houve msg de corretor, **then** a transição NÃO se repete (idempotência mantida).
4. Não cita mais "Sou {nome}" / nome de corretor.
5. tsc/lint/vitest limpos.

## Dev Notes
- `transition-message.ts`: `buildTransitionText` só recebe `leadName`; mantém `shouldSendTransition`/`normalizeName`. Como a mensagem agora é genuinamente a Nicole encaminhando, o `role='assistant'` fica coerente (resolve a confusão do rótulo "Nicole"). Ver [[project-transferir-conversa]].

## Dev Agent Record (@dev — 2026-07-16)
- `buildTransitionText(leadName)` — novo texto, sem broker/fallback. Call site `send-message/route.ts:171` passa só `lead.name`. Testes reescritos (6). tsc web 0 · eslint 0 · vitest **1033/1033**.
- Branch: `feat/75-169-transicao-encaminha-sem-nome-corretor`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (novo texto, sem nome) ✓ · AC2 (sem nome do lead → "Olá! …", sem undefined) ✓ · AC3 (idempotência `shouldSendTransition` mantida) ✓ · AC4 (não cita "Sou {nome}") ✓ · AC5 (tsc/eslint/1033) ✓.

## Change Log
- 2026-07-16 — @devops — PR #218 + merge. Deploy prod **SUCCESS** (d216261). Status → **Done**.
- 2026-07-16 — @qa — **QA GATE: PASS**. 5 ACs, 1033/1033.
- 2026-07-16 — @dev — Novo texto de transição sem nome do corretor.
- 2026-07-16 — @po/@sm — GO. Story criada.

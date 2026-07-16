# Story 75-156 — Nicole "digitando…" + atraso humano antes de responder (WhatsApp)

## Metadata
- **Status:** InReview · **Epic:** Humanização da Nicole (WhatsApp) · **PR:** — · **Complexidade:** S (3 pontos) · **Branch:** feat/75-156-nicole-digitando-delay-humano
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Hoje a Nicole responde **instantâneo**: o webhook chama `processMessage` e dispara o texto no mesmo instante (`packages/web/src/app/api/webhook/whatsapp/route.ts` — send inline ~L863). Isso soa robótico. Para humanizar, queremos o indicador **"digitando…"** no WhatsApp do lead (igual conversa entre pessoas) + um **pequeno atraso** proporcional ao tamanho da resposta antes de enviar.

Provedor = **Meta WhatsApp Cloud API** (Graph v21.0), que **suporta** o typing indicator, porém **só como reação a uma mensagem recebida** (precisa do `wamid` da mensagem do lead) e ele **também marca a mensagem como lida (✓✓ azul)** — comportamento **aprovado pelo Marcos** (2026-07-16). O indicador some sozinho em ~25s ou quando a resposta é enviada. Já existe padrão análogo pronto para o **Telegram** (`calculateTypingDelay` / `sendTypingAction` em `packages/web/src/app/api/telegram/webhook/route.ts`) — reaproveitar a lógica de cadência.

Decisão de escopo do Marcos: **apenas o lado do lead no WhatsApp** (maior impacto, menor risco). Indicador na tela interna (Nicole/corretor "digitando") e "lead digitando na nossa tela" ficam **fora** — este último é **impossível** pela Cloud API (a Meta não nos envia evento de presença do usuário).

## Escopo
**IN:**
1. **`lib/whatsapp/send-typing-indicator.ts`** (novo): helper `sendWhatsAppTypingIndicator(waConfig, inboundWamid)` — POST em `https://graph.facebook.com/v21.0/{phone_number_id}/messages` com body `{ messaging_product:"whatsapp", status:"read", message_id: <wamid>, typing_indicator:{ type:"text" } }`. **Fire-and-forget** (try/catch, nunca lança/atrasa a resposta). +testes.
2. **`lib/whatsapp/typing-delay.ts`** (novo, ou reaproveitar a lógica do Telegram): `calculateTypingDelay(text)` → base ~800–1200ms + ~25ms/caractere, **teto 3000ms**. +testes.
3. **Webhook (`route.ts`, bloco `if (isAiActive)`):** logo ao entrar no bloco (antes/junto do `processMessage`), disparar `sendWhatsAppTypingIndicator(config, <inbound wamid>)`; após obter `response`, aplicar `await sleep(calculateTypingDelay(response))` **antes** do `fetch` de envio. Guard natural: só roda dentro de `isAiActive` (não em handoff / IA desligada).

**OUT:** indicador na tela interna do CRM (Nicole/corretor "digitando"); mostrar "lead digitando" pra nós (impossível na Cloud API); presence/broadcast entre corretores; aplicar em Telegram (já tem); dividir resposta em múltiplas bolhas.

## Acceptance Criteria
1. **Given** um lead manda mensagem e a Nicole vai responder (`isAiActive=true`), **then** o lead vê "digitando…" no WhatsApp e a mensagem dele fica marcada como lida (✓✓); **when** a Nicole termina, **then** a resposta chega após um atraso curto (≤3s).
2. **Given** a IA está desligada naquela conversa (handoff / corretor no controle), **then** o indicador **não** é disparado (fora do bloco `isAiActive`).
3. **Given** falha no POST do "digitando" (rede/Meta), **then** é engolida (fire-and-forget) e a resposta da Nicole é enviada normalmente, **sem** atraso extra nem erro na tela.
4. **Given** o atraso calculado, **then** respeita o teto de 3s (resposta longa não trava o fluxo assíncrono do webhook).
5. tsc/lint/vitest limpos (com testes de `calculateTypingDelay` e do helper de typing).

## Dev Notes
- **Ponto de inserção:** `packages/web/src/app/api/webhook/whatsapp/route.ts`, dentro de `if (isAiActive)` (~L797) — o send inline fica ~L863. Usar o `config` (phone_number_id/access_token já resolvidos por org) e o **wamid da mensagem recebida** (variável `messageId` do payload inbound; conferir nome exato no handler) como `message_id`. Destinatário do texto = `fromRaw`.
- **Referência de cadência:** `packages/web/src/app/api/telegram/webhook/route.ts` — `sendTypingAction` (~L182) e `calculateTypingDelay` (~L194). Reusar/portar a fórmula (base 800–1200ms + ~25ms/char, cap 3s).
- **Meta Cloud API:** o typing indicator NÃO tem chamada "começar a digitar" avulsa — vai junto do `status:"read"` sobre o `wamid` recebido; auto-dismiss ~25s ou ao enviar a resposta. Marcar como lida é aceito (decisão do Marcos).
- **Risco baixo:** todo o bloco roda no caminho assíncrono via `after()` (o webhook já respondeu `ok` à Meta), então o atraso não afeta o ACK do webhook. Manter teto de 3s pra não estourar timeout do runtime.
- Não confundir com [[project-corretor-whatsapp-atendimento]] (outbound do corretor) nem violar [[feedback-nicole-nunca-move-etapa]] (esta story não toca stage).

## 🤖 CodeRabbit Integration
- **Story Type:** Integration (Meta Cloud API) · **Complexity:** Low (1 ponto de inserção + 2 helpers novos).
- **Primary Agents:** @dev · **Quality Gate:** @qa.
- **Focus:** fire-and-forget correto (typing nunca bloqueia/lança); guard `isAiActive`; cap do delay; sem regressão no envio atual da Nicole.

## Dev Agent Record (@dev — 2026-07-16, YOLO)
- **`lib/whatsapp/typing-delay.ts`** (novo): `calculateTypingDelay(text, randomImpl?)` — base 800–1200ms + 25ms/char, teto 3s no componente por caractere (`TYPING_CHAR_DELAY_CAP_MS`). `randomImpl` injetável p/ testes determinísticos. Portado do padrão do Telegram.
- **`lib/whatsapp/send-typing-indicator.ts`** (novo): `sendWhatsAppTypingIndicator(waConfig, inboundWamid, fetchImpl?)` — POST `status:"read"` + `typing_indicator:{type:"text"}` sobre o wamid inbound. Fire-and-forget (try/catch vazio; no-op sem config/wamid); `AbortSignal.timeout(10s)`. Reusa o tipo `WhatsAppConfig` de `send-whatsapp-message.ts`.
- **`webhook/whatsapp/route.ts`:** dentro de `if (isAiActive)` (guard natural — não roda em handoff): `void sendWhatsAppTypingIndicator(config, messageId)` antes do `processMessage`; e `await sleep(calculateTypingDelay(response))` antes do `fetch` de envio. Tudo no `after()` (pós-ACK do webhook), sem afetar o HTTP 200 à Meta. +2 imports estáticos.
- **Testes:** `typing-delay.test.ts` (5) + `send-typing-indicator.test.ts` (4).
- **Checks:** tsc 0 · eslint 0 · vitest **984/984** (+9). Sem regressão (webhook/whatsapp 34/34).
- **Branch:** `feat/75-156-nicole-digitando-delay-humano`.

## QA Results (@qa)
_(a preencher no quality gate)_

## Change Log
- 2026-07-16 — @dev — Implementado (2 helpers + wiring no webhook + 9 testes). tsc/eslint/984. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).

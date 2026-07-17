# Story 75-171 — Assinatura automática do remetente humano na mensagem ao lead

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #232 · deploy b9fb4f9e · **Complexidade:** S (2 pontos) · **Branch:** feat/75-171-assinatura-corretor-mensagem
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Do lado do lead, toda mensagem chega pelo número da EMPRESA (perfil WhatsApp Business da House) — a Meta não transmite quem é o operador. Quando um humano (Valeria, Marcos…) assume a conversa da Nicole, o lead não percebe a troca e pergunta "Como é seu nome?" (caso real 2026-07-17, lead Daiana). A abertura via template (75-164) já nomeia o corretor, mas só cobre conversa INICIADA pelo corretor — não cobre assumir conversa que a Nicole começou.

**Decisão (Marcos, 2026-07-17):** assinatura automática por mensagem — o texto enviado pelo humano vai prefixado com o primeiro nome de quem escreveu.

## Escopo
**IN:**
- Helper puro `lib/broker/message-signature.ts` — `buildSignedMessage(senderName, message, channel)`:
  - WhatsApp: `*{PrimeiroNome}:*\n{mensagem}` (negrito nativo do WhatsApp).
  - Telegram: `{PrimeiroNome}:\n{mensagem}` (sem `*` — `sendMessage` vai sem `parse_mode`, asterisco apareceria cru).
  - Nome vazio/ausente → mensagem inalterada.
- `api/leads/[id]/send-message/route.ts` — assina APENAS a mensagem principal digitada pelo humano (`role='broker'`), usando `appUser.name`, antes do `dispatchBrokerMessage`.
- Limite: mensagem ASSINADA deve caber em 4096 chars → senão 400 `MESSAGE_TOO_LONG` (validação passa a considerar o prefixo).
- Persistência: `messages.content` guarda o texto ORIGINAL (sem prefixo) + `metadata.signed_as = {PrimeiroNome}`. A UI interna já rotula o remetente real (75-165) — gravar o prefixo duplicaria o rótulo e mostraria asteriscos crus na tela.
- Testes unitários do helper + integração leve no route (vitest).

**OUT:**
- Mensagem de transição (51-2/75-169 — é `role='assistant'`, fala como equipe).
- Nicole (caminho separado via webhook, `role='assistant'`).
- Áudio/arquivos (`send-file` — Cloud API não tem caption em áudio).
- Template de abertura `start-whatsapp` (já nomeia o corretor — 75-164/166).
- Toggle por org/usuário (se incomodar, vira story futura).
- Cron follow-up (`send-whatsapp-message.ts` — mensagens da Nicole/automação, não humanas).

## Acceptance Criteria
1. **Given** Valeria (name="Valeria Souza") envia "Oi, tudo bem?" a um lead WhatsApp, **then** o lead recebe `*Valeria:*\nOi, tudo bem?` e `messages.content` = "Oi, tudo bem?" com `metadata.signed_as="Valeria"`.
2. **Given** lead Telegram (`phone` com `tg:`), **then** o lead recebe `Valeria:\nOi, tudo bem?` (sem asteriscos).
3. **Given** é a 1ª mensagem do corretor (dispara transição 51-2), **then** a transição vai SEM assinatura e a mensagem principal COM assinatura.
4. **Given** mensagem cujo tamanho + prefixo excede 4096, **then** 400 `MESSAGE_TOO_LONG` (nada é enviado/gravado).
5. **Given** `appUser.name` vazio, **then** mensagem segue inalterada (sem prefixo, sem erro).
6. Nicole, áudio, arquivos e template de abertura NÃO ganham prefixo (sem regressão nos caminhos OUT).
7. tsc/eslint/vitest limpos.

## Regras/Notas
- Primeiro nome = primeiro token de `appUser.name` após trim (ex.: "Valeria Souza" → "Valeria").
- Ponto único de mudança cobre `/dashboard` e `/broker` (ambos usam `BrokerMessageInput` → mesmo route) e ambos os canais (branch de canal é downstream no dispatch).
- Risco mapeado: NENHUM outro caller de `dispatchBrokerMessage` deve ser afetado — assinatura fica no route, não no helper de dispatch.

## Dev Agent Record (@dev — 2026-07-17)
- **Novo** `lib/broker/message-signature.ts` — `senderFirstName()` + `buildSignedMessage()` (puro, sem imports `@web/*`, padrão dispatch-broker-message).
- **Novo** `lib/broker/message-signature.test.ts` — 9 testes (AC1/AC2/AC5 + multi-linha/trim).
- `api/leads/[id]/send-message/route.ts`:
  - assina a mensagem principal com `appUser.name` logo após `resolveChannel` (antes de criar conversation/transição — AC4: nada é enviado se estourar o limite);
  - check de 4096 considera o prefixo (erro cita a assinatura no texto);
  - `dispatchBrokerMessage` recebe `signedMessage`; transição segue com `transitionText` puro (AC3);
  - `messages.content` = texto original + `metadata.signed_as` (AC1, condicional — nome vazio não grava a chave, AC5).
- Caminhos OUT intocados (AC6): webhook Nicole, send-file, start-whatsapp, cron followup — diff toca só os 3 arquivos acima.
- tsc web 0 · eslint 0 · vitest **1069/1069**.

## QA Results (@qa — 2026-07-17)
- **PASS.** AC1/AC2/AC5 ✓ (9 testes do helper) · AC3 ✓ (transição usa `transitionText` puro, inspeção do diff) · AC4 ✓ (check de 4096 com prefixo ANTES de criar conversation/enviar transição) · AC6 ✓ (diff toca só route + helper + testes; webhook/send-file/start-whatsapp/cron intocados) · AC7 ✓ (tsc 0 · eslint 0 · vitest 1069/1069).
- Sem regressão; helper puro segue o padrão de `dispatch-broker-message.ts` (REUSE do padrão vitest-friendly).

## Change Log
- 2026-07-17 — @devops — PR #232 + squash-merge (b9fb4f9e) + deploy prod (Vercel auto). Status → **Done**.
- 2026-07-17 — @qa — **PASS** (tsc 0 · eslint 0 · vitest 1069/1069).
- 2026-07-17 — @dev — Implementação (helper + route + 9 testes).
- 2026-07-17 — @po — Validação 10/10 → **GO**. Status Draft → Ready.
- 2026-07-17 — @sm — Story criada (decisão: opção 1, assinatura automática).

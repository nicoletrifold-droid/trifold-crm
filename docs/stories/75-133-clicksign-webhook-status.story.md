# Story 75-133 — BUG: webhook da Clicksign não atualiza status ("Aguardando assinatura" trava) + baixa PDF assinado

## Metadata
- **Status:** Done · **Epic:** Pastas · **Branch:** fix/75-133-clicksign-webhook-status · **PR:** #130 · **Complexidade:** S (3 pontos)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Retomada da pendência de [[project-clicksign-integracao]]. Após assinar o Termo (sandbox), a Clicksign envia o e-mail "Processo de assinatura finalizado", mas no CRM o documento continua **"Aguardando assinatura"** — o status nunca vira "Assinado" e o PDF assinado não é baixado.

**Diagnóstico (comprovado em prod `dsopqkqjkmhytudaaolv`, via `clicksign_webhook_debug` — 8 eventos reais):**
- **Webhook chega** (user-agent Ruby, eventos `sign`, `auto_close`, `document_closed`). Não é entrega.
- **HMAC confere** — recomputado HMAC-SHA256 do body RAW com o secret da Vercel: `match=true` nos 3 últimos. Não é segurança.
- **Formato é o LEGADO (v1) da Clicksign:** body = `{ event: { name, data, occurred_at }, document: {...} }`. O identificador do documento vem em **`document.key`** (ex.: `11a68121-…`).
- **Bug 1 — parser:** `parseWebhook` procura o id em `event.data.envelope.id` / JSON:API — não existe nesse payload → retorna `null` → rota ignora ("sem event/envelopeId").
- **Bug 2 — lookup:** a rota busca `signature_envelopes` por `clicksign_envelope_id`, mas `document.key` casa com **`clicksign_document_id`** (confirmado: o row tem `clicksign_document_id = 11a68121-…`).
- **Bônus:** o PDF assinado vem pronto no payload em `document.downloads.signed_file_url` (URL S3, expira ~5min) — mais confiável que chamar `getEnvelopeDocuments` (API v2) com um documento legado.

## Escopo
**IN:**
1. **`lib/clicksign/webhook.ts` — `parseWebhook`:** extrair `documentKey` de `["document","key"]` (mantendo fallbacks v2/JSON:API para `envelopeId`). Retornar `{ event, documentKey, envelopeId }`.
2. **`api/webhooks/clicksign/route.ts`:**
   - Lookup por `clicksign_document_id = documentKey` (fallback `clicksign_envelope_id = envelopeId`).
   - Baixar o PDF assinado a partir do **payload** (`document.downloads.signed_file_url` via `findSignedUrl`), não mais via `getEnvelopeDocuments`.
   - **Remover** o insert de debug temporário (`clicksign_webhook_debug`) — diagnóstico concluído.
3. **Backfill:** atualizar o envelope de teste já assinado (status `running` → `closed`) pra destravar a UI (o PDF daquele teste tem URL S3 expirada; a validação de ponta-a-ponta será por uma assinatura nova).

**OUT:** suportar o formato v2/JSON:API de fato (só deixamos o fallback); reprocessar webhooks antigos; múltiplos signatários (v1 = 1 signatário).

## Acceptance Criteria
1. **Given** um webhook `sign`/`auto_close`/`document_closed` com HMAC válido, **when** chega, **then** o `signature_envelopes` correspondente (casado por `document.key` = `clicksign_document_id`) tem `status` atualizado (`signed`/`closed`) e `last_event` preenchido.
2. **Given** um evento de finalização com `document.downloads.signed_file_url`, **then** o PDF assinado é baixado 1x pro bucket `pastas` e `signed_storage_path` é setado (idempotente).
3. **Given** a UI do detalhe da pasta após finalizar, **then** o Termo mostra **"Assinado"** e os botões **Ver/Baixar assinado** aparecem (`hasSigned = signed_storage_path != null`).
4. **Given** HMAC inválido, **then** 401 (inalterado). **Given** documento desconhecido, **then** 200 ignorado (Clicksign não reenvia).
5. tsc/lint/testes limpos (incluindo testes de `parseWebhook`/`verifyClicksignHmac`).

## Tasks (@dev)
- [ ] `parseWebhook`: `documentKey` via `document.key` + retorno `{event, documentKey, envelopeId}`; atualizar testes.
- [ ] route: lookup por `clicksign_document_id` (fallback envelope); download do assinado via payload; remover debug insert; remover import `getEnvelopeDocuments` se ocioso.
- [ ] Backfill do envelope de teste (`status=closed`).
- [ ] tsc/eslint/vitest.

## Riscos
- **Baixo/médio.** Núcleo de integração externa. Mitigado: HMAC já validado, formato real capturado do payload de prod, mudança guiada por dados. Idempotência preservada. URL S3 do assinado expira ~5min → baixar no próprio evento (é o que o webhook faz).

## Dev Agent Record (@dev — 2026-07-06)
- **`webhook.ts`:** `parseWebhook` agora retorna `{ event, documentKey, envelopeId }` — `documentKey` de `["document","key"]` (formato real v1), mantendo fallback v2 pro `envelopeId`.
- **`route.ts`:** lookup em `signature_envelopes` por `clicksign_document_id = documentKey` (fallback `clicksign_envelope_id`); download do PDF assinado direto do payload (`document.downloads.signed_file_url`) em vez de `getEnvelopeDocuments` (removido import); **removido** o insert de debug temporário; storage path `assinados/${row.id}.pdf`.
- **Testes:** novo `webhook.test.ts` (10 casos) — parser v1/v2, mapEventToStatus, verifyClicksignHmac (com HMAC recomputado do payload real), deepGet.
- **Backfill:** envelope de teste `fab7d47f` (`clicksign_document_id 11a68121…`) `running→closed`/`last_event=document_closed` via PostgREST (PDF daquele teste com URL S3 expirada → sem `signed_storage_path`).
- **Diagnóstico (dados de prod):** 8 webhooks reais; HMAC recomputado = match; formato `{event:{name}, document:{key,downloads}}`; `document.key` = `clicksign_document_id` do row.
- **Checks:** tsc 0 · eslint 0 · vitest 767/767 (+10).
- **Files:** `lib/clicksign/webhook.ts`; `lib/clicksign/webhook.test.ts`; `app/api/webhooks/clicksign/route.ts`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (status atualizado casando por document.key) ✓ · AC2 (PDF assinado do payload, idempotente) ✓ · AC3 (UI "Assinado" + botões quando signed_storage_path) ✓ · AC4 (401 HMAC inválido / 200 ignorado inalterados) ✓ · AC5 (tsc/eslint/767, +10 testes) ✓. Diagnóstico comprovado por dados reais de prod; HMAC e gate de autorização preservados. Nota: validação end-to-end real depende de uma assinatura nova pós-deploy (o teste antigo teve backfill de status; URL do PDF expirou).

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #130** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 5 ACs, 767/767.
- 2026-07-06 — @dev — Fix (parser document.key + lookup clicksign_document_id + PDF do payload + testes). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).

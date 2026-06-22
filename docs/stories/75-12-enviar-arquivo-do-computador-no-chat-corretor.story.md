# Story 75-12 — Enviar arquivo do computador no chat do corretor com o lead

## Metadata
- **Status:** InReview
- **Epic:** 51/56 — Corretor / Mídia
- **Branch:** main

## Context
No chat do corretor com o lead (`broker/leads/[id]`), o botão 📎 abre a "Biblioteca de Mídia" (`media-picker-modal.tsx`), que lista apenas assets pré-cadastrados (`agent_media_assets`) — frequentemente vazia e não funcional para o corretor. É preciso permitir **enviar arquivos do próprio computador** ao lead.

O envio de mídia ao WhatsApp já existe (`api/nicole/media/[id]/send`): manda por **link público** (image/document), respeita a janela de 24h e grava em `messages`. Vamos reaproveitar esse mecanismo para um upload ad-hoc.

Decisões:
- Sem migration: reusar o bucket público **`nicole-media`** sob o prefixo `broker-chat/{leadId}/` (não polui a biblioteca, que é a tabela `agent_media_assets`).
- **Limite de 4 MB** no v1 (teto de body do serverless na Vercel). Arquivos maiores → enhancement futuro (upload direto ao storage).
- Tipo: `image/jpeg`/`image/png` → enviado como `image`; demais → `document`.

## Acceptance Criteria
- [x] AC1: Novo endpoint `POST /api/leads/[id]/send-file` (multipart): autentica, valida ownership do lead (admin/supervisor/gerente-comercial ou corretor dono), respeita janela de 24h do WhatsApp; faz upload do arquivo para `nicole-media/broker-chat/{leadId}/{uuid.ext}` (admin client), obtém URL pública e envia ao lead via WhatsApp Cloud API (`image` p/ jpeg/png, senão `document`).
- [x] AC2: Valida tamanho ≤ 4 MB (retorna erro claro se exceder) e exige `file`.
- [x] AC3: Grava em `messages` (role `broker`, `metadata.is_media=true`, `media_url`, `media_type`, `file_name`, `sent_via_whatsapp`, `source: "broker_upload"`), independente do resultado do envio.
- [x] AC4: No `media-picker-modal.tsx`, botão "Enviar arquivo do computador" (input file): seleciona → envia → feedback (sucesso/erro, incl. WHATSAPP_WINDOW_CLOSED e tamanho) → `router.refresh()`.
- [x] AC5: Biblioteca de Mídia (assets) continua funcionando; nenhuma regressão no composer/envio de texto.

## Out of Scope
- Upload direto ao storage (client-side) para arquivos > 4 MB — enhancement futuro.
- Preview/galeria das mídias enviadas no histórico (apenas registra a mensagem).
- Vídeo/áudio com limites específicos do WhatsApp (tratados como `document`).

## Dependencies
- Bucket público `nicole-media` (existe). `whatsapp_config` ativo. Helpers `resolveChannel`/`isWithinWhatsAppWindow` (`lib/broker/dispatch-broker-message`).

## Complexity
- **T-shirt:** M (1 endpoint multipart + envio WhatsApp + UI no modal).

## Business Value
Corretor passa a enviar arquivos do computador (fotos, PDFs) direto ao lead pelo CRM — necessidade operacional real; hoje não é possível.

## Risks
- Médio. Envio ao WhatsApp depende de janela 24h + config. Limite de 4 MB pode frustrar arquivos grandes (comunicado). Reuso de bucket público — prefixo isolado evita poluir a biblioteca.

## Definition of Done
- ACs atendidos, type-check/lint OK, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-12-enviar-arquivo-do-computador-no-chat-corretor.story.md` (this file)
- `packages/web/src/app/api/leads/[id]/send-file/route.ts` (new)
- `packages/web/src/app/broker/leads/[id]/_components/media-picker-modal.tsx`

## Dev Notes (@dev / Dex)
- Novo `api/leads/[id]/send-file/route.ts`: multipart; valida file + ≤4MB + ownership; janela 24h; upload via admin client em `nicole-media/broker-chat/{leadId}/{uuid.ext}`; URL pública; envia WhatsApp (`image` p/ jpeg/png, senão `document`); grava em `messages` (metadata.is_media, source broker_upload). Espelha `nicole/media/[id]/send`.
- `media-picker-modal.tsx`: botão "Enviar arquivo do computador" (input file) + handler que faz POST multipart, trata WHATSAPP_WINDOW_CLOSED/tamanho, refresh. Biblioteca de assets mantida abaixo.
- type-check 0 erros; eslint EXIT 0. Sem migration (bucket nicole-media público reutilizado sob prefixo).

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC5. Endpoint reusa o mecanismo de envio de mídia já em produção (WhatsApp link image/document, janela 24h, registro em messages). UI no modal com feedback. type-check/eslint OK. Limitação v1 documentada: ≤4MB (teto serverless). Pronta para @devops *push (testar envio real de imagem/PDF pequeno a um lead com janela aberta).

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação → GO. Status Draft → Ready.
- @dev (Dex): endpoint send-file + botão no modal. Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.

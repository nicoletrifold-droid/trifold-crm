# Story 75-85 — Renderizar mídia (imagem) recebida nas conversas

## Metadata
- **Status:** Ready · **Epic:** 75 · **Branch:** feat/75-85-render-midia-recebida · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do componente de mídia, review do webhook]
- ⚠️ **Deploy SEGURADO** até o Supabase sair do incidente (NANO esgotado) + OK do usuário.

## Story
**As a** atendente (corretor/admin/relacionamento), **I want** ver a imagem que o cliente enviou na conversa,
**so that** eu entenda o contexto (ex.: cliente manda foto perguntando algo).

## Contexto (diagnóstico)
Hoje: (1) imagem recebida via WhatsApp é baixada SÓ para a IA (visão) e **descartada** — não vai pra bucket nem
grava `media_url`; (2) **nenhuma tela renderiza mídia** (`/dashboard/conversas/[id]` e broker `conversation-thread`
mostram só `{msg.content}`). Mídia que JÁ tem URL (arquivos enviados pelo corretor via 📎 → bucket `nicole-media`
path `broker-chat/`; Telegram) também não é renderizada.

## Escopo
**IN:**
1. **Persistir imagem/documento recebido (webhook WhatsApp):**
   - No ramo sync de `image`/`document`, setar `mediaMetadata.media_type` (`image`/`document`) → garante que a
     mensagem do lead é inserida (hoje imagem sem legenda não cria bolha).
   - No async, após baixar a mídia (que já acontece p/ a IA), **subir o buffer ao bucket `nicole-media`**
     (`whatsapp-inbound/{leadId}/...`), pegar URL pública e dar **UPDATE** na mensagem (por `whatsapp_message_id`)
     gravando `media_url`. **Tudo em try/catch — falha de storage NUNCA quebra o fluxo de mensagem/IA.**
2. **Renderizar mídia nas conversas:** componente compartilhado `MessageMedia` que, a partir de
   `metadata.media_type` + `metadata.media_url`, renderiza: imagem → `<img>`; áudio/voz → `<audio>` (se url);
   documento → link. Usado em `/dashboard/conversas/[id]` e no broker `conversation-thread`. Texto (`content`)
   segue aparecendo junto.
3. Fallback de render: `media_type` sem `media_url` → rótulo ("📷 Imagem", "🎤 Áudio", "📄 Documento").

**OUT:**
- Não re-baixa mídia histórica (forward-looking). Áudio recebido segue o fluxo atual (pede p/ digitar) — não persiste,
  só renderiza rótulo. Não mexe na lógica da IA/distribuição.

## Acceptance Criteria
1. **Given** o cliente envia uma imagem no WhatsApp, **then** ela é salva no bucket e a mensagem do lead ganha
   `media_url`; **and** a imagem é renderizada na conversa (dashboard e broker).
2. **Given** uma falha no upload/storage, **then** a mensagem ainda é registrada e a IA segue normal (sem quebrar).
3. **Given** uma mensagem com `media_url` (ex.: arquivo enviado pelo corretor), **then** renderiza a mídia.
4. **Given** `media_type` sem `media_url`, **then** mostra rótulo (sem `<img>` quebrado).
5. typecheck/lint limpos; teste do `MessageMedia` (image/audio/document/rótulo).

## Dev Notes
- Upload: padrão de `send-file/route.ts` — `admin.storage.from("nicole-media").upload(path, Buffer, {contentType})`
  + `getPublicUrl`. Bucket público.
- Webhook: insert sync em ~L431 (`whatsapp_message_id` é a chave). Async download de imagem ~L484, doc ~L518.
  UPDATE a mensagem por `metadata->>whatsapp_message_id = messageId` com metadata completa (campos conhecidos).
- Render: dashboard `conversas/[id]/page.tsx` (server, `{msg.content}`) + broker `conversation-thread.tsx` (~L236/257).

## File List
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — persistir mídia recebida (sync media_type + async upload/update).
- `packages/web/src/components/conversas/message-media.tsx` — NOVO componente de render de mídia.
- `packages/web/src/components/conversas/message-media.test.tsx` — testes.
- `packages/web/src/app/dashboard/conversas/[id]/page.tsx` — render.
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — render.

## QA Results
- **Verdict: PASS (deploy SEGURADO).** Webhook: sync marca media_type (cria bolha) + async sobe a mídia ao
  bucket `nicole-media` (`whatsapp-inbound/{leadId}/`) e grava media_url via UPDATE por whatsapp_message_id —
  TUDO em try/catch (falha de storage não quebra inbound/IA). Render: `MessageMedia` compartilhado (img/áudio/doc
  + rótulo de fallback) no dashboard conversa e no broker thread (ThreadMessage ganhou metadata; query passou a
  selecionar metadata). 
- Testes: MessageMedia 5/5, thread 20/20 (tipo retrocompatível), type-check 0, lint 0. Bucket `nicole-media` já
  usado em prod (send-file) → alvo válido. Validação end-to-end real fica p/ pós-deploy (precisa imagem real + Supabase estável).

## Change Log
- 2026-06-30 — @sm/@po — Story criada e validada (GO). Persistir + renderizar imagem recebida. Deploy segurado (incidente Supabase).

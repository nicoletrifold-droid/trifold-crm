# Story 75-222 — Chat: mídia inbound do cliente aparecia como bolha vazia

**Status:** InReview
**Tipo:** Bug fix + backfill
**Epic:** Chat / Relacionamento (76) · Mídia inbound (75-85)
**Complexidade:** S

## Contexto
Bug confirmado em prod (27/07): imagens ENVIADAS PELO CLIENTE (inbound WhatsApp)
apareciam como **bolha vazia** na tela de Chat (`/dashboard/chat/[id]`). Evidência:
conversa `4f625149-51ad-45e6-9fcc-d8a10a2cf23e`, mensagens
`0a2f45d3-1196-49fa-9a1b-60a1e42a11d6` e `f2eab37f-136d-4d27-b86c-c2aea5d111a4` —
`content` vazio, colunas `media_url`/`media_type` NULL, mas `metadata` com
`{media_url: ".../nicole-media/whatsapp-inbound/...jpeg", media_type: "image"}`.
O arquivo em si estava corretamente no bucket `nicole-media`.

## Causa raiz (dupla)
1. **Escrita** — os caminhos inbound gravavam mídia SÓ em `metadata.media_*`,
   deixando as colunas top-level `messages.media_url`/`media_type` NULL:
   - `packages/web/src/app/api/webhook/whatsapp/route.ts:472` (INSERT síncrono — só metadata)
   - `packages/web/src/app/api/webhook/whatsapp/route.ts:55-58` (`persistInboundMedia` — UPDATE só metadata, imagem/documento)
   - `packages/web/src/app/api/webhook/whatsapp/route.ts:633-644` (UPDATE de voz pós-transcrição — só metadata)
   - `packages/web/src/app/api/telegram/webhook/route.ts:417` (INSERT inbound Telegram — só metadata)
   Em contraste, TODOS os caminhos outbound (send-file, nicole/media/send,
   send-library-media) já gravavam colunas + metadata.
2. **Leitura** — a tela do Chat (`/dashboard/chat/[id]/page.tsx`) **não renderizava
   mídia nenhuma** (só `msg.content`) — por isso a bolha vazia. As telas de Conversas
   e do corretor renderizam via `<MessageMedia>` lendo `metadata.media_*` (por isso lá
   a imagem aparecia).

## Acceptance Criteria
1. **AC1** — Inbound WhatsApp (imagem/documento/voz) grava `media_url`/`media_type`
   nas colunas top-level de `messages`, mantendo `metadata.media_*` (compat).
   `media_type` já no INSERT síncrono (bolha de mídia nasce identificada);
   `media_url` no async, após upload ao bucket.
2. **AC2** — Inbound Telegram idem (única outra escrita inbound com mídia).
3. **AC3** — Tela `/dashboard/chat/[id]` renderiza mídia via `<MessageMedia>`
   (colunas primeiro, fallback `metadata.media_*` → histórico aparece mesmo antes
   do backfill).
4. **AC4** — SQL de backfill idempotente promovendo `metadata.media_*` → colunas
   (histórico), em `supabase/backfills/`. **Execução manual pelo @devops** — NÃO é
   migration, NÃO foi executado pelo @dev.
5. **AC5** — GOTCHA respeitado: nenhum insert em `messages` recebe `org_id`.
6. **AC6** — Testes: colunas preenchidas no sync (image), no async
   (persistInboundMedia → coluna + metadata em sincronia) e NULL para texto puro.

## Fora de escopo
- Trocar as telas de Conversas/corretor para ler das colunas (leem `metadata.media_*`,
  que continua sendo gravado — funcionam para histórico e mensagens novas).
- Mensagens outbound (já gravavam colunas + metadata).

## Backfill (executar no deploy — @devops)
`supabase/backfills/75-222-backfill-messages-media-colunas.sql`
```sql
UPDATE public.messages
SET media_url  = COALESCE(media_url,  NULLIF(metadata->>'media_url',  '')),
    media_type = COALESCE(media_type, NULLIF(metadata->>'media_type', ''))
WHERE (media_url  IS NULL AND NULLIF(metadata->>'media_url',  '') IS NOT NULL)
   OR (media_type IS NULL AND NULLIF(metadata->>'media_type', '') IS NOT NULL);
```
(arquivo completo tem BEGIN/COMMIT + queries de conferência pré/pós)

## Dev Agent Record
### Decisões
- `[AUTO-DECISION]` diretório de backfill: repo não tinha padrão p/ SQL pontual
  (`scripts/` guarda backfills .ts) → criado `supabase/backfills/` (fora de
  `migrations/` de propósito: não deve rodar no pipeline de migrations).
- `[AUTO-DECISION]` fallback de leitura: incluído SÓ na tela do Chat (que não
  renderizava mídia); telas que já liam metadata não foram tocadas (menor raio de
  impacto — regra "não quebrar o que funciona").
- Telegram incluído no fix de escrita: mesma lacuna, mesma tabela, 1 linha.

### File List
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (3 pontos de escrita)
- `packages/web/src/app/api/telegram/webhook/route.ts` (INSERT inbound)
- `packages/web/src/app/dashboard/chat/[id]/page.tsx` (render de mídia + fallback)
- `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` (mock: colunas
  de mídia + storage; 3 testes novos 75-222)
- `supabase/backfills/75-222-backfill-messages-media-colunas.sql` (novo — @devops executa)
- `docs/stories/75-222-chat-midia-inbound-invisivel.story.md` (novo)

### Testes / Verificações
- `vitest run` webhook route: 9 pass (6 pré-existentes + 3 novos)
- `message-media.test.ts` + `inbound-media.test.ts`: pass
- `tsc --noEmit` (packages/web): limpo
- `eslint` nos arquivos alterados: limpo
- Suíte completa: ver Change Log

## QA Results
_(pendente @qa *qa-gate)_

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-27 | 1.0 | Colunas top-level nos 4 pontos de escrita inbound + render de mídia no Chat (fallback metadata) + SQL de backfill. | @dev (Dex) |

-- Story 75-222 — Backfill: mídia inbound invisível no Chat
--
-- Contexto: os caminhos de escrita inbound (webhook WhatsApp e Telegram) gravavam a
-- mídia APENAS em metadata.media_url / metadata.media_type, deixando as colunas
-- top-level media_url/media_type NULL. O fix de código (mesma story) passou a gravar
-- as colunas; este backfill promove o histórico de metadata -> colunas.
--
-- Execução: MANUAL pelo @devops no deploy (NÃO é migration; rodar uma única vez).
-- Idempotente: só toca linhas cuja coluna está NULL e cujo metadata tem valor.
-- Raio de impacto: apenas public.messages; não altera metadata (compat preservada).
--
-- Conferência prévia (opcional):
--   SELECT count(*) FROM public.messages
--   WHERE media_url IS NULL AND NULLIF(metadata->>'media_url', '') IS NOT NULL;

BEGIN;

UPDATE public.messages
SET
  media_url  = COALESCE(media_url,  NULLIF(metadata->>'media_url',  '')),
  media_type = COALESCE(media_type, NULLIF(metadata->>'media_type', ''))
WHERE
  (media_url  IS NULL AND NULLIF(metadata->>'media_url',  '') IS NOT NULL)
  OR (media_type IS NULL AND NULLIF(metadata->>'media_type', '') IS NOT NULL);

COMMIT;

-- Conferência pós-execução (esperado: 0):
--   SELECT count(*) FROM public.messages
--   WHERE media_url IS NULL AND NULLIF(metadata->>'media_url', '') IS NOT NULL;
--
-- Validação do caso real reportado (as duas mensagens devem sair com media_url preenchido):
--   SELECT id, media_url, media_type FROM public.messages
--   WHERE id IN ('0a2f45d3-1196-49fa-9a1b-60a1e42a11d6', 'f2eab37f-136d-4d27-b86c-c2aea5d111a4');

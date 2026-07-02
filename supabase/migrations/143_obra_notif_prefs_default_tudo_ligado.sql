-- 143_obra_notif_prefs_default_tudo_ligado.sql
-- Story 75-107 — Portal do cliente: default de notificações = TUDO habilitado.
--
-- CONTEXTO: havia 3 fontes de default divergentes para `obra_notificacao_prefs`:
--   - coluna no banco: email=true, whatsapp=FALSE, push=FALSE
--   - API/UI (route.ts): email=true, whatsapp=FALSE, push=FALSE
--   - dispatcher (notificacoes.ts): email=true, whatsapp=TRUE, push=FALSE
-- Efeito: cliente sem linha salva via WhatsApp DESLIGADO na tela, mas o sistema
-- ENVIAVA WhatsApp (default do dispatcher). E push nascia off em todo lugar.
--
-- DECISÃO (dono do produto): default = TUDO habilitado; o cliente desmarca o que não
-- quiser (o opt-out já é respeitado no envio, canal a canal e evento a evento).
-- Esta migration alinha os DEFAULTs de coluna com o código (belt — o upsert da API
-- sempre envia todos os campos, então a coluna default é redundante, mas fica coerente).
-- email_enabled e notify_* já eram true.

ALTER TABLE public.obra_notificacao_prefs
  ALTER COLUMN whatsapp_enabled SET DEFAULT true,
  ALTER COLUMN push_enabled     SET DEFAULT true;

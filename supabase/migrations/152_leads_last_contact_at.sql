-- 152_leads_last_contact_at.sql
-- Story 75-110 — BUG: "dias sem contato" (card do Pipeline + Alertas) usava leads.updated_at,
-- que NÃO é atualizado ao registrar contato (nota no Histórico) nem em mensagens (essas mexem
-- em conversations.last_message_at). Resultado: lead com contato hoje aparecia "3d sem contato".
--
-- FIX: fonte única `leads.last_contact_at` = momento do último contato real, alimentada por
-- trigger (SECURITY DEFINER → à prova de RLS; só avança pra frente) em:
--   (a) INSERT em messages (qualquer role: recebida/enviada/Nicole) → via conversations.lead_id
--   (b) INSERT em activities do tipo contato ('broker_note','note_added') → registro manual
-- + backfill de TODOS os leads a partir do histórico (mensagens + notas + created_at).

-- Coluna (default now() cobre leads novos = criação; triggers avançam depois).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_leads_last_contact ON leads(org_id, last_contact_at);

COMMENT ON COLUMN leads.last_contact_at IS
  'Story 75-110: momento do último contato real (mensagem qualquer role OU registro manual no Histórico). Fonte única do "dias sem contato" (card/alertas/follow-up). Mantida por trigger, só avança.';

-- (a) Mensagens → bump via conversation.lead_id
CREATE OR REPLACE FUNCTION public.bump_lead_last_contact_from_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leads l
     SET last_contact_at = NEW.created_at
    FROM conversations c
   WHERE c.id = NEW.conversation_id
     AND l.id = c.lead_id
     AND (l.last_contact_at IS NULL OR l.last_contact_at < NEW.created_at);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_msg_lead_last_contact ON messages;
CREATE TRIGGER trg_msg_lead_last_contact
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION bump_lead_last_contact_from_message();

-- (b) Registro manual de contato (activities broker_note / note_added)
CREATE OR REPLACE FUNCTION public.bump_lead_last_contact_from_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    UPDATE leads l
       SET last_contact_at = NEW.created_at
     WHERE l.id = NEW.lead_id
       AND (l.last_contact_at IS NULL OR l.last_contact_at < NEW.created_at);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_act_lead_last_contact ON activities;
CREATE TRIGGER trg_act_lead_last_contact
  AFTER INSERT ON activities
  FOR EACH ROW WHEN (NEW.type IN ('broker_note', 'note_added'))
  EXECUTE FUNCTION bump_lead_last_contact_from_activity();

-- Backfill: último contato = MAIOR entre criação, última mensagem e última nota de contato.
UPDATE leads l SET last_contact_at = sub.lc
FROM (
  SELECT x.id,
    GREATEST(
      x.created_at,
      COALESCE((SELECT max(m.created_at) FROM messages m
                  JOIN conversations c ON c.id = m.conversation_id
                 WHERE c.lead_id = x.id), x.created_at),
      COALESCE((SELECT max(a.created_at) FROM activities a
                 WHERE a.lead_id = x.id AND a.type IN ('broker_note', 'note_added')), x.created_at)
    ) AS lc
  FROM leads x
) sub
WHERE l.id = sub.id;

-- 148_lancamento_card_extras.sql
-- Story Lançamentos-05 — Checklists + anexos nos cartões do board.
-- RLS ABILITADA SEM POLICIES (acesso via lancamentosGuard + admin client). Bucket privado.

CREATE TABLE IF NOT EXISTS lancamento_card_checklist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_id    uuid NOT NULL REFERENCES lancamento_cards(id) ON DELETE CASCADE,
  text       text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamento_checklist_card ON lancamento_card_checklist(card_id, position);

CREATE TABLE IF NOT EXISTS lancamento_card_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_id         uuid NOT NULL REFERENCES lancamento_cards(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  file_size_bytes bigint,
  mime            text,
  uploaded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamento_attach_card ON lancamento_card_attachments(card_id, created_at);

ALTER TABLE lancamento_card_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamento_card_attachments ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY: acesso só via service-role/admin client + API gated)

-- Bucket privado para anexos dos cartões (mesmo padrão do módulo Pastas).
INSERT INTO storage.buckets (id, name, public)
VALUES ('lancamentos', 'lancamentos', false)
ON CONFLICT (id) DO NOTHING;

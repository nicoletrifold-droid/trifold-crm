-- 146_lancamento_kanban.sql
-- Story Lançamentos-03 — Board Kanban POR lançamento (relocação do Kanban dormente imob_*).
-- Diferença central p/ o imob (129, board único por org): aqui as colunas pertencem a um
-- LANÇAMENTO (lancamento_id) → cada empreendimento tem seu próprio board.
--
-- Segurança: RLS ABILITADA SEM POLICIES → acesso só via API/página gated (lancamentosGuard)
-- com service-role (admin client). Mesmo padrão de 129/131.

CREATE TABLE IF NOT EXISTS lancamento_columns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  title         text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamento_columns_board ON lancamento_columns(lancamento_id, position);

CREATE TABLE IF NOT EXISTS lancamento_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  column_id   uuid NOT NULL REFERENCES lancamento_columns(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamento_cards_col ON lancamento_cards(column_id, position);
CREATE INDEX IF NOT EXISTS idx_lancamento_cards_org ON lancamento_cards(org_id);

CREATE TABLE IF NOT EXISTS lancamento_card_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_id    uuid NOT NULL REFERENCES lancamento_cards(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamento_comments_card ON lancamento_card_comments(card_id, created_at);

ALTER TABLE lancamento_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamento_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamento_card_comments ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY de propósito: acesso só via service-role/admin client + API gated)

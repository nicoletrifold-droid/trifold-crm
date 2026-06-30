-- 129_imob_kanban.sql
-- Story 75-88 (Epic IMOB) — Kanban estilo Trello do módulo IMOB (imobiliárias externas).
-- Board único por org: colunas (etapas), cards e comentários (discussão).
--
-- Segurança: RLS ABILITADA SEM POLICIES → ninguém (anon/authenticated) acessa direto.
-- Todo acesso passa pela API/página gated (admin/supervisor) via service-role (admin client),
-- mesmo padrão do Chat de relacionamento.

CREATE TABLE IF NOT EXISTS imob_columns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title      text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imob_columns_org ON imob_columns(org_id, position);

CREATE TABLE IF NOT EXISTS imob_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  column_id   uuid NOT NULL REFERENCES imob_columns(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imob_cards_col ON imob_cards(column_id, position);
CREATE INDEX IF NOT EXISTS idx_imob_cards_org ON imob_cards(org_id);

CREATE TABLE IF NOT EXISTS imob_card_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_id    uuid NOT NULL REFERENCES imob_cards(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imob_comments_card ON imob_card_comments(card_id, created_at);

ALTER TABLE imob_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE imob_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE imob_card_comments ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY de propósito: acesso só via service-role/admin client + API gated)

-- 150_lancamento_card_fornecedores.sql
-- Story Lançamentos-07 — Vínculo N:N entre cartões do board e fornecedores globais.
-- RLS sem policy → acesso via lancamentosGuard + admin client.

CREATE TABLE IF NOT EXISTS lancamento_card_fornecedores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_id       uuid NOT NULL REFERENCES lancamento_cards(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, fornecedor_id)
);
CREATE INDEX IF NOT EXISTS idx_card_fornecedores_card ON lancamento_card_fornecedores(card_id);

ALTER TABLE lancamento_card_fornecedores ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY: acesso só via service-role/admin client + API gated)

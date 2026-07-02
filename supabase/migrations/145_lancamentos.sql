-- 145_lancamentos.sql
-- Story Lançamentos-02 — Entidade Lançamento (cada lançamento = um empreendimento com board).
--
-- Segurança: RLS ABILITADA SEM POLICIES → acesso só via API/página gated (lancamentosGuard,
-- módulo "lancamentos") com service-role (admin client). Mesmo padrão de imobiliarias (131)
-- e das tabelas imob_* (129). O board e os cartões (lancamento_columns/cards) entram na Story 3.

CREATE TABLE IF NOT EXISTS lancamentos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                 text NOT NULL,
  property_interest_id uuid REFERENCES properties(id) ON DELETE SET NULL,  -- empreendimento vinculado (opcional)
  status               text NOT NULL DEFAULT 'planejamento'
                         CHECK (status IN ('planejamento', 'lancamento', 'venda', 'concluido', 'pausado')),
  cor                  text NOT NULL DEFAULT 'coral',   -- chave da paleta de identidade (UI resolve p/ hex)
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_org ON lancamentos(org_id, status);

ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY de propósito: acesso só via service-role/admin client + API gated)

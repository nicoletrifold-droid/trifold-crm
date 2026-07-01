-- 131_imobiliarias.sql
-- Story 75-92 (Epic IMOB) — Cadastro de imobiliárias parceiras (tela própria, separada do board).
--
-- Segurança: RLS ABILITADA SEM POLICIES → ninguém (anon/authenticated) acessa direto.
-- Acesso só via API/página gated (admin/supervisor) com service-role (admin client),
-- mesmo padrão das tabelas imob_* (migration 129).

CREATE TABLE IF NOT EXISTS imobiliarias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text NOT NULL,                       -- nome fantasia (obrigatório)
  razao_social     text,
  cnpj             text,
  telefone         text,
  email            text,
  cidade           text,
  estado           text,                                -- UF
  endereco         text,
  num_corretores   integer CHECK (num_corretores IS NULL OR num_corretores >= 0),
  gerente_nome     text,                                -- nome do gerente da imobiliária
  contato_nome     text,                                -- contato construtora <-> imobiliária
  contato_telefone text,
  contato_email    text,
  status           text NOT NULL DEFAULT 'prospeccao'
                     CHECK (status IN ('prospeccao', 'ativo', 'inativo')),
  observacoes      text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imobiliarias_org ON imobiliarias(org_id, status);

ALTER TABLE imobiliarias ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY de propósito: acesso só via service-role/admin client + API gated)

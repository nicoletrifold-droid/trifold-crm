-- 149_fornecedores.sql
-- Story Lançamentos-06 — Cadastro GLOBAL de fornecedores (reutilizável em qualquer lançamento/cartão).
-- Modelado em imobiliarias (131). RLS sem policy → acesso via lancamentosGuard + admin client.

CREATE TABLE IF NOT EXISTS fornecedores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome          text NOT NULL,               -- nome fantasia / apelido (obrigatório)
  razao_social  text,
  cnpj          text,
  categoria     text,                        -- ex.: marketing, construcao_civil, fotografia…
  status        text NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'avaliacao', 'inativo', 'bloqueado')),
  contato_nome  text,
  telefone      text,
  email         text,
  cidade        text,
  estado        text,
  endereco      text,
  site          text,
  observacoes   text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fornecedores_org ON fornecedores(org_id, status);

ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY: acesso só via service-role/admin client + API gated)

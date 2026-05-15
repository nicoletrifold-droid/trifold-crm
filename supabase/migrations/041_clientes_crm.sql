-- Migration 041: CRM clientes — tabelas clientes e clientes_obras_vinculos
-- Story 33.1
-- Cria as entidades fundacionais do módulo CRM de clientes:
--   - clientes: ficha completa (dados pessoais, endereço, CRM)
--   - clientes_obras_vinculos: vínculo CRM cliente ↔ obra com numero_unidade
--
-- Observação importante:
--   Esta tabela `clientes` é uma entidade CRM SEPARADA de:
--     - `users` com role='cliente' (portal users)
--     - `cliente_obras` (vínculo user_id ↔ obra_id para autorização no portal)
--   Um cliente CRM pode ou não ter um user correspondente — sem FK obrigatória.
--
-- RLS pattern canônico (007_unit_sales.sql, 008_followup.sql, 015_meta_marketing_api.sql):
--   - public.user_org_id() para isolamento por org
--   - public.is_admin_or_supervisor() para gate de escrita/manage
--
-- Trigger updated_at: usa update_updated_at() (definida em 001_base_schema.sql).

-- ============================================
-- TABELA: clientes
-- ============================================
CREATE TABLE IF NOT EXISTS clientes (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Dados pessoais
  nome                  varchar(255) NOT NULL,
  cpf                   varchar(14),
  rg                    varchar(20),
  email                 varchar(255),
  telefone              varchar(20),
  whatsapp              varchar(20),
  data_nascimento       date,
  estado_civil          varchar(50),
  profissao             varchar(100),
  -- Endereço
  endereco_logradouro   varchar(255),
  endereco_numero       varchar(20),
  endereco_complemento  varchar(100),
  endereco_bairro       varchar(100),
  endereco_cidade       varchar(100),
  endereco_estado       varchar(2),
  endereco_cep          varchar(10),
  endereco_referencia   text,
  -- CRM
  observacao            text,
  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- TABELA: clientes_obras_vinculos
-- Vínculo CRM cliente ↔ obra (separado de cliente_obras do portal)
-- ============================================
CREATE TABLE IF NOT EXISTS clientes_obras_vinculos (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id      uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  obra_id         uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero_unidade  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, obra_id)
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS clientes_org_id_idx
  ON clientes(org_id);

CREATE INDEX IF NOT EXISTS clientes_email_idx
  ON clientes(email);

CREATE INDEX IF NOT EXISTS clientes_obras_vinculos_cliente_id_idx
  ON clientes_obras_vinculos(cliente_id);

CREATE INDEX IF NOT EXISTS clientes_obras_vinculos_obra_id_idx
  ON clientes_obras_vinculos(obra_id);

-- ============================================
-- RLS — clientes
-- Padrão canônico: SELECT por org, manage requer admin_or_supervisor
-- ============================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select" ON clientes
  FOR SELECT
  USING (org_id = public.user_org_id());

CREATE POLICY "clientes_manage" ON clientes
  FOR ALL
  USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================
-- RLS — clientes_obras_vinculos
-- Acesso via JOIN em clientes: valida que o cliente pertence à org do usuário.
-- SELECT permitido para qualquer usuário da org; manage requer admin_or_supervisor.
-- ============================================
ALTER TABLE clientes_obras_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_obras_vinculos_select" ON clientes_obras_vinculos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = clientes_obras_vinculos.cliente_id
        AND c.org_id = public.user_org_id()
    )
  );

CREATE POLICY "clientes_obras_vinculos_manage" ON clientes_obras_vinculos
  FOR ALL
  USING (
    public.is_admin_or_supervisor()
    AND EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = clientes_obras_vinculos.cliente_id
        AND c.org_id = public.user_org_id()
    )
  );

-- ============================================
-- TRIGGER updated_at — clientes
-- Reusa função update_updated_at() definida em 001_base_schema.sql
-- ============================================
DROP TRIGGER IF EXISTS set_clientes_updated_at ON clientes;
CREATE TRIGGER set_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

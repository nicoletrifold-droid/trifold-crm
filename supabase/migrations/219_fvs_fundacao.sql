-- 219_fvs_fundacao.sql
-- Story 75-293 — FVS (Controle de serviços no canteiro): fundação + cadastros.
-- Piloto: obra Vind. A régua é o LOCAL (apartamento, hall, área comum) — decisão do
-- Jonathan (06/08): "cadastraremos os aptos e as áreas comuns com halls, então fica
-- por local e não exatamente apartamentos". Tabelas fvs_* próprias: NÃO tocam units
-- (mundo comercial) nem alteram obras — fvs_locais apenas referencia obras(id).
--
-- Segurança: RLS HABILITADA SEM POLICIES → acesso só via API/página gated
-- (fvsGuard, módulo "fvs") com service-role (admin client). Mesmo padrão de
-- lancamentos (145), imobiliarias (131) e imob_* (129).

-- ============================================================================
-- 1. Locais — o cadastro de base (48 aptos + halls + áreas comuns no Vind)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fvs_locais (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  obra_id    uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  tipo       text NOT NULL DEFAULT 'apartamento'
               CHECK (tipo IN ('apartamento', 'hall', 'area_comum')),
  torre      text,
  pavimento  int,                        -- null para áreas comuns sem pavimento
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_fvs_locais_org_obra ON fvs_locais(org_id, obra_id);

-- ============================================================================
-- 2. Serviços — os 10 aplicáveis do Vind entram por cadastro (piloto: 2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fvs_servicos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, nome)
);

-- ============================================================================
-- 3. Fichas-modelo — a lista de itens a conferir de cada serviço.
--    É esta peça que faz os outros 23 serviços entrarem por CADASTRO, não por
--    desenvolvimento. foto_config parametriza a definição pendente nº 3 do
--    Jonathan (por ficha / por item / só onde reprova) — a resposta dele vira
--    um valor, não retrabalho.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fvs_fichas_modelo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  servico_id  uuid NOT NULL REFERENCES fvs_servicos(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  ativa       boolean NOT NULL DEFAULT true,
  foto_config text NOT NULL DEFAULT 'por_ficha'
                CHECK (foto_config IN ('por_ficha', 'por_item', 'apenas_reprova')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fvs_fichas_modelo_servico ON fvs_fichas_modelo(servico_id);
-- Regra "1 ficha ativa por serviço" garantida no BANCO (não só na rota):
CREATE UNIQUE INDEX IF NOT EXISTS uq_fvs_ficha_ativa_por_servico
  ON fvs_fichas_modelo(servico_id) WHERE ativa;

-- ============================================================================
-- 4. Itens da ficha-modelo — botão (conforme/NC/NA) ou medida com tolerância.
--    A tolerância vem ESCRITA na ficha (texto), nunca embutida no código.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fvs_ficha_modelo_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ficha_modelo_id uuid NOT NULL REFERENCES fvs_fichas_modelo(id) ON DELETE CASCADE,
  ordem           int NOT NULL DEFAULT 0,
  descricao       text NOT NULL,
  tipo            text NOT NULL DEFAULT 'botao' CHECK (tipo IN ('botao', 'medida')),
  unidade         text,      -- só para tipo=medida (mm, %, cm/m...)
  tolerancia      text,      -- texto livre, ex.: "±3 mm em 2 m de régua"
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fvs_itens_ficha ON fvs_ficha_modelo_itens(ficha_modelo_id, ordem);

-- ============================================================================
-- 5. Equipes — quem executou o serviço (própria ou empreiteiro). Na solicitação
--    de vistoria (etapa 2) toda vistoria nasce apontando a equipe executora.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fvs_equipes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  tipo       text NOT NULL DEFAULT 'interna' CHECK (tipo IN ('interna', 'empreiteiro')),
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, nome)
);

-- RLS sem policy de propósito (ver cabeçalho)
ALTER TABLE fvs_locais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fvs_servicos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fvs_fichas_modelo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fvs_ficha_modelo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fvs_equipes           ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. Seed do módulo "fvs" na matriz de Perfil de Acesso (padrão da mig 144).
--    Acesso = admin + supervisor + obras. ON CONFLICT DO NOTHING → idempotente
--    e não sobrescreve ajustes feitos na matriz de Perfil.
-- ============================================================================
INSERT INTO role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, 'fvs',
       r.name IN ('admin', 'supervisor', 'obras')
  FROM roles r
ON CONFLICT (role_id, module) DO NOTHING;

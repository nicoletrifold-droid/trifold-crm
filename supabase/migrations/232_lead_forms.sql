-- =============================================================================
-- 232_lead_forms.sql — Story 75-330 (Epic 89)
-- =============================================================================
-- Motor do formulário público de qualificação para tráfego pago.
--
-- Duas tabelas:
--   lead_forms           — a DEFINIÇÃO (perguntas, ramificação e pesos em jsonb,
--                          editável por tela sem deploy — AC8)
--   lead_form_responses  — as RESPOSTAS, inclusive as PARCIAIS de quem abandonou
--                          no meio (AC4)
--
-- Segurança: RLS HABILITADA SEM POLICIES → nenhum acesso anônimo direto. A porta
-- pública é a rota /api/formulario/[token], que valida o token e escreve com
-- service-role. Mesmo padrão de fvs_* (219), lancamentos (145), imobiliarias
-- (131) e imob_* (129). AC10.
-- =============================================================================

-- ============================================================================
-- 1. Definição do formulário
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  -- Token da URL pública. Não-enumerável, como imobiliarias.booking_token.
  -- Vários tokens podem apontar para formulários diferentes (uma campanha cada).
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  -- O schema das perguntas. A FORMA é validada em código (lib/forms/schema.ts,
  -- parseFormSchema) tanto na gravação quanto na leitura: o banco garante que é
  -- JSON, o código garante que é um formulário. Guardar como jsonb (não json)
  -- para permitir índice GIN se algum dia precisarmos buscar por pergunta.
  schema      jsonb NOT NULL DEFAULT '{"perguntas": []}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_lead_forms_org ON lead_forms(org_id);
-- FK indexada: created_by entra em JOIN de auditoria e no ON DELETE SET NULL.
CREATE INDEX IF NOT EXISTS idx_lead_forms_created_by ON lead_forms(created_by);

-- ============================================================================
-- 2. Respostas (parciais e completas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_form_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id       uuid NOT NULL REFERENCES lead_forms(id) ON DELETE CASCADE,
  -- NULL só na janela entre abrir o formulário e informar nome+telefone. Depois
  -- disso o lead existe (AC4) e nunca mais volta a ser NULL.
  lead_id       uuid REFERENCES leads(id) ON DELETE SET NULL,
  -- Identifica a MESMA sessão de preenchimento entre um POST parcial e o
  -- seguinte, sem exigir login. Fica no navegador de quem preenche.
  session_token uuid NOT NULL DEFAULT gen_random_uuid(),
  -- { "id_da_pergunta": <resposta> } — resposta é string, número ou array.
  answers       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 0–100, MESMA escala de leads.qualification_score, que já é mostrado ao
  -- corretor com faixa de cor (broker/leads/[id]/page.tsx:200-210). Decisão da
  -- AC5: aqui fica o histórico imutável da resposta; em leads.qualification_score
  -- fica o valor que o corretor vê. NULL enquanto a resposta é parcial.
  score         int CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  status        text NOT NULL DEFAULT 'parcial'
                  CHECK (status IN ('parcial', 'completa')),
  -- AC7: aceite de LGPD com data/hora. NULL = ainda não aceitou (resposta
  -- parcial). Uma resposta 'completa' sempre tem aceite — garantido no CHECK
  -- abaixo, não só na aplicação.
  lgpd_aceito_em timestamptz,
  -- UTM chega aqui antes de o lead existir e é copiada para as COLUNAS
  -- dedicadas de leads (utm_source/medium/campaign/content/term, 001:129-133)
  -- no momento em que o lead nasce. Aqui é bagagem de trânsito, não a verdade.
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_token),
  CONSTRAINT lead_form_responses_completa_exige_lgpd
    CHECK (status <> 'completa' OR lgpd_aceito_em IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lead_form_responses_org_form
  ON lead_form_responses(org_id, form_id);
-- A ficha do lead (AC9) lê por lead_id. Parcial: resposta órfã não interessa
-- a essa tela e o índice fica menor.
CREATE INDEX IF NOT EXISTS idx_lead_form_responses_lead
  ON lead_form_responses(lead_id) WHERE lead_id IS NOT NULL;

-- ============================================================================
-- 3. RLS — habilitada e SEM policies (acesso só por service-role)
-- ============================================================================
ALTER TABLE lead_forms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_form_responses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. updated_at
-- ============================================================================
-- A função é `update_updated_at()` (001_base_schema.sql:279) e o trigger se chama
-- `set_updated_at` em todas as tabelas do projeto. Seguir o nome de lá.
DROP TRIGGER IF EXISTS set_updated_at ON lead_forms;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON lead_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON lead_form_responses;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON lead_form_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

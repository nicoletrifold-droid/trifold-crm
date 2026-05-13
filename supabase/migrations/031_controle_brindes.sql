-- Migration 031: Controle de Entrega de Brindes
-- Story 29.1 — Epic 29

-- ============================================================
-- TABELA: datas_comemorativas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.datas_comemorativas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome              text        NOT NULL,
  data              date        NOT NULL,
  ativa             boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_datas_com_org_id
  ON public.datas_comemorativas (org_id);

ALTER TABLE public.datas_comemorativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "datas_com_select" ON public.datas_comemorativas
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "datas_com_write" ON public.datas_comemorativas
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================================
-- TABELA: brindes_destinatarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brindes_destinatarios (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  obra_nome             text        NOT NULL,
  tipo                  text        NOT NULL CHECK (tipo IN ('mae', 'pai', 'outro')),
  nome                  text        NOT NULL,
  observacao            text,
  endereco_logradouro   text,
  endereco_numero       text,
  endereco_complemento  text,
  endereco_bairro       text,
  endereco_cidade       text,
  endereco_estado       char(2),
  endereco_cep          text,
  endereco_referencia   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brindes_dest_org_id
  ON public.brindes_destinatarios (org_id);
CREATE INDEX IF NOT EXISTS idx_brindes_dest_obra_nome
  ON public.brindes_destinatarios (org_id, obra_nome);
CREATE INDEX IF NOT EXISTS idx_brindes_dest_cidade
  ON public.brindes_destinatarios (org_id, endereco_cidade);

ALTER TABLE public.brindes_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brindes_dest_select" ON public.brindes_destinatarios
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "brindes_dest_write" ON public.brindes_destinatarios
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================================
-- TABELA: brindes_entregas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brindes_entregas (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  destinatario_id         uuid        NOT NULL REFERENCES public.brindes_destinatarios(id) ON DELETE CASCADE,
  data_comemorativa_id    uuid        NOT NULL REFERENCES public.datas_comemorativas(id) ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'entregue', 'nao_encontrado')),
  observacao_entrega      text,
  entregue_em             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destinatario_id, data_comemorativa_id)
);

CREATE INDEX IF NOT EXISTS idx_brindes_ent_destinatario_id
  ON public.brindes_entregas (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_brindes_ent_data_id
  ON public.brindes_entregas (data_comemorativa_id);

ALTER TABLE public.brindes_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brindes_ent_select" ON public.brindes_entregas
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "brindes_ent_write" ON public.brindes_entregas
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================================
-- SEED: Datas comemorativas 2026 e 2027
-- ============================================================
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'trifold' LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.datas_comemorativas (id, org_id, nome, data) VALUES
    (gen_random_uuid(), v_org_id, 'Carnaval 2026',        '2026-03-03'),
    (gen_random_uuid(), v_org_id, 'Páscoa 2026',           '2026-04-05'),
    (gen_random_uuid(), v_org_id, 'Dia do Trabalho 2026',  '2026-05-01'),
    (gen_random_uuid(), v_org_id, 'Dia das Mães 2026',     '2026-05-10'),
    (gen_random_uuid(), v_org_id, 'Dia dos Namorados 2026','2026-06-12'),
    (gen_random_uuid(), v_org_id, 'São João 2026',          '2026-06-24'),
    (gen_random_uuid(), v_org_id, 'Dia dos Pais 2026',     '2026-08-09'),
    (gen_random_uuid(), v_org_id, 'Dia das Crianças 2026', '2026-10-12'),
    (gen_random_uuid(), v_org_id, 'Finados 2026',           '2026-11-02'),
    (gen_random_uuid(), v_org_id, 'Natal 2026',             '2026-12-25'),
    (gen_random_uuid(), v_org_id, 'Carnaval 2027',         '2027-02-16'),
    (gen_random_uuid(), v_org_id, 'Páscoa 2027',            '2027-03-28'),
    (gen_random_uuid(), v_org_id, 'Dia das Mães 2027',     '2027-05-09'),
    (gen_random_uuid(), v_org_id, 'Dia dos Pais 2027',     '2027-08-08'),
    (gen_random_uuid(), v_org_id, 'Natal 2027',             '2027-12-25')
  ON CONFLICT (org_id, nome) DO NOTHING;
END;
$$;

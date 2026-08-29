-- 246_org_integrations_e_unicidade_whatsapp.sql
-- Story 900-21b (Epic 900, Onda 2, Fatia 1) — continuação da 900-21/PR #498 (migration 240).
--
-- O QUE ISTO RESOLVE
-- ------------------
-- 1. O `.maybeSingle()` duplo de `whatsapp_config`. Hoje NADA no banco impede duas linhas
--    `active` da mesma org, nem o mesmo `phone_number_id` em duas orgs. Com duas linhas,
--    `.maybeSingle()` devolve `null` — indistinguível de "não achei" — e o WhatsApp da org fica
--    mudo em silêncio. As duas UNIQUE parciais tornam esses estados impossíveis por construção,
--    em vez de por convenção de aplicação.
-- 2. `org_integrations`: toda org passa a ter onde guardar STATUS de integração por provider.
--    Sem isso, as stories seguintes da Onda 2 (webhooks por org, crons defeituosos) não têm onde
--    escrever nem de onde ler o dataset do CAPI por empresa.
--
-- ALCANCE REAL DA SEGUNDA UNIQUE (medido, não estimado)
-- -----------------------------------------------------
-- São 31 call sites com `.maybeSingle()`/`.single()` em `whatsapp_config` em `packages/web/src`;
-- 27 filtram por `org_id`, mas só 18 desses 27 também filtram `.eq("status","active")`. O índice
-- é PARCIAL (`WHERE status='active'`), então ele só torna a duplicata impossível para esses 18.
-- Os outros 9 continuam expostos e estão NOMEADOS na AC2 da story — e a seção 5 desta migration,
-- que semeia uma linha `inactive` por org, torna o cenário residual MAIS provável, não menos.
-- Encaminhamento (pôr `.eq("status","active")` nos 9, ou tornar o índice incondicional) é decisão
-- de outra story. Registrado aqui para que ninguém leia esta migration como "fechado".
--
-- PRÉ-CONDIÇÃO RODADA ANTES DE ESCREVER ESTE ARQUIVO (2026-08-29)
-- ---------------------------------------------------------------
-- As duas queries de duplicata devolveram ZERO linhas nos dois ambientes (`xnxvygyfyyyzwhiuoehz`
-- e `dsopqkqjkmhytudaaolv`, esta última read-only). Se voltassem linha, o `CREATE UNIQUE INDEX`
-- falharia com 23505 — e é isso que se quer descobrir, não contornar.
--
-- ROLLBACK: ver o bloco no fim do arquivo (NFR-8).

-- =============================================================================
-- 1. whatsapp_config — as duas UNIQUE parciais
-- =============================================================================

-- Um número de WhatsApp ATIVO pertence a UMA org. É o identificador com que a 900-24 vai
-- resolver a org no webhook: sem unicidade, "resolver por phone_number_id" é roteamento por
-- convenção, e o lead cai na org errada em silêncio.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_phone_ativo
  ON whatsapp_config (phone_number_id)
  WHERE status = 'active' AND phone_number_id IS NOT NULL;

-- Uma org tem NO MÁXIMO uma config ATIVA. Esta é a subestimada: é ela que torna o
-- `.eq("org_id", X).eq("status","active").maybeSingle()` de 18 call sites incapaz de devolver
-- `null` por ambiguidade.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_org_ativo
  ON whatsapp_config (org_id)
  WHERE status = 'active';

-- =============================================================================
-- 2. org_integrations — catálogo de integrações por org
-- =============================================================================
CREATE TABLE IF NOT EXISTS org_integrations (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- SEIS providers. `resend` fica de FORA por decisão do dono do produto (2026-08-29): e-mail
  -- transacional permanece da plataforma, o SaaS envia por conta própria.
  -- `meta_ads` e `meta_capi` são linhas SEPARADAS (decisão @po, B6): `status` é por linha, e
  -- "Ads quebrado com CAPI funcionando" (ou o inverso) não tem onde morar numa linha única.
  provider   text NOT NULL CHECK (provider IN ('whatsapp', 'meta_ads', 'meta_capi', 'sienge', 'telegram', 'google')),
  status     text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  -- Só identificadores PÚBLICOS. Segredo vai para o Vault via `secret_ref` (Onda 7) — confirmado
  -- em 2026-08-29 que `supabase_vault` v0.3.1 + `pgcrypto` v1.3 existem nos dois projetos.
  config     jsonb NOT NULL DEFAULT '{}',
  -- DECLARADO E NULO nesta story, de propósito: a coluna existe para que a story do painel não
  -- precise de ALTER TABLE numa tabela que a essa altura já roteia webhook em produção.
  secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider),
  -- Torna EXECUTÁVEL a decisão travada do plano (correção C2 do parecer @po), em vez de deixá-la
  -- como comentário: WhatsApp resolve a org por `whatsapp_config.phone_number_id` (seção 1 desta
  -- mesma migration), NUNCA por `org_integrations`. Sem este CHECK, reabrir a decisão custava um
  -- UPDATE; com ele, custa uma migration — que é exatamente o custo que a decisão quis impor.
  CONSTRAINT whatsapp_sem_identificador_proprio
    CHECK (provider <> 'whatsapp' OR NOT (config ? 'phone_number_id'))
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON org_integrations(org_id);

-- Roteamento reverso do webhook Meta Ads (900-24): dado o `page_id` do payload, achar a org em
-- O(1) e sem ambiguidade. NÃO existe equivalente para `whatsapp` — ver o CHECK acima. `meta_capi`
-- também não tem: ele guarda `dataset_id`, que não é chave de entrada de webhook nenhum.
CREATE UNIQUE INDEX IF NOT EXISTS org_integrations_meta_page_ativo
  ON org_integrations ((config->>'page_id'))
  WHERE provider = 'meta_ads' AND config->>'page_id' IS NOT NULL;

ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_integrations_select" ON org_integrations;
CREATE POLICY "org_integrations_select" ON org_integrations
  FOR SELECT USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "org_integrations_manage" ON org_integrations;
CREATE POLICY "org_integrations_manage" ON org_integrations
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin());

DROP TRIGGER IF EXISTS set_updated_at ON org_integrations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON org_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE org_integrations IS
  'Story 900-21b — catálogo de integrações por org (status + identificadores públicos). Segredo NÃO mora aqui: secret_ref aponta para o Vault a partir da Onda 7. WhatsApp resolve a org por whatsapp_config.phone_number_id, nunca por esta tabela (CHECK whatsapp_sem_identificador_proprio).';

-- =============================================================================
-- 3. provision_org() — corpo da migration 240 REPRODUZIDO INTEGRALMENTE + 2 blocos novos
--
-- Assinatura inalterada: (p_name text, p_slug text) RETURNS uuid. Os blocos 1-4 abaixo são
-- cópia literal da 240; os blocos 5 e 6 são o que esta story acrescenta, entre o INSERT de
-- kanban_stages e o RETURN.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.provision_org(
  p_name  text,
  p_slug  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id  uuid;
  v_role_id uuid;
  v_module  text;
  v_modules text[] := ARRAY[
    'dashboard','pipeline','leads','imoveis','conversas','agenda','alertas','atividades',
    'corretores','chamados','configuracoes','campanhas','analytics','roleta','bolsao',
    'mensagens','materiais','treinamento','obras','lancamentos','brindes','chat','imob',
    'fluxo','pastas','sistema'
  ];
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'nome da organização é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'slug é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'slug inválido: use minúsculas, números e hífen (ex.: acme-imoveis)'
      USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. Organização — a idempotência mora aqui
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_org_id FROM organizations WHERE slug = btrim(p_slug);

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, slug)
    VALUES (btrim(p_name), btrim(p_slug))
    RETURNING id INTO v_org_id;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. Roles do sistema
  -- ---------------------------------------------------------------------------
  INSERT INTO roles (org_id, name, label, color, is_system) VALUES
    (v_org_id, 'admin',      'Administrador', 'purple', true),
    (v_org_id, 'supervisor', 'Supervisor',    'blue',   true),
    (v_org_id, 'broker',     'Corretor',      'green',  true),
    (v_org_id, 'obras',      'Obras',         'orange', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 3. Permissões — admin recebe tudo; os demais nascem sem acesso
  -- ---------------------------------------------------------------------------
  FOR v_role_id, v_module IN
    SELECT r.id, m
    FROM roles r
    CROSS JOIN unnest(v_modules) AS m
    WHERE r.org_id = v_org_id
  LOOP
    INSERT INTO role_permissions (org_id, role_id, module, can_access)
    VALUES (
      v_org_id,
      v_role_id,
      v_module,
      (SELECT name FROM roles WHERE id = v_role_id) = 'admin'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 4. Stages do Kanban
  -- ---------------------------------------------------------------------------
  INSERT INTO kanban_stages (org_id, name, slug, type, position, color, is_default, is_active) VALUES
    (v_org_id, 'Novo',            'novo',            'novo',      0,  '#64748B', true,  true),
    (v_org_id, 'Em Qualificação', 'em-qualificacao', 'novo',      1,  '#0EA5E9', false, true),
    (v_org_id, 'Qualificado',     'qualificado',     'agendado',  2,  '#8B5CF6', false, true),
    (v_org_id, 'Visita Agendada', 'visita-agendada', 'agendado',  3,  '#6366F1', false, true),
    (v_org_id, 'No-Show',         'no-show',         'no_show',   4,  '#F43F5E', false, true),
    (v_org_id, 'Visitou',         'visitou',         'visitou',   5,  '#14B8A6', false, true),
    (v_org_id, 'Proposta',        'proposta',        'proposta',  6,  '#F59E0B', false, true),
    (v_org_id, 'Negociando',      'negociando',      'proposta',  7,  '#EAB308', false, true),
    (v_org_id, 'Fechou',          'fechou',          'fechado',   8,  '#22C55E', false, true),
    (v_org_id, 'Represamento',    'represamento',    'represamento', 9, '#94A3B8', false, true),
    (v_org_id, 'Perdido',         'perdido',         'perdido',   10, '#EF4444', false, true)
  ON CONFLICT (org_id, slug) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 5. whatsapp_config — skeleton INATIVO (Story 900-21b)
  --
  -- Toda org tem que ter UMA linha: 27 call sites fazem `.eq('org_id', X).maybeSingle()` nela, e
  -- a AUSÊNCIA de linha produz exatamente o mesmo silêncio que "config quebrada". `inactive` e
  -- sem credencial é o estado honesto de uma empresa que ainda não conectou a WABA dela.
  --
  -- `WHERE NOT EXISTS` (e não ON CONFLICT): a tabela não tem UNIQUE(org_id) incondicional — só a
  -- parcial `WHERE status='active'` criada na seção 1 —, então não há constraint para conflitar.
  -- ---------------------------------------------------------------------------
  INSERT INTO whatsapp_config (org_id, status)
  SELECT v_org_id, 'inactive'
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config WHERE org_id = v_org_id);

  -- ---------------------------------------------------------------------------
  -- 6. org_integrations — catálogo `disconnected` por provider (Story 900-21b)
  --
  -- SEIS linhas. `resend` fica de fora (decisão do dono do produto): permanece da plataforma.
  -- `meta_ads` e `meta_capi` separados (decisão @po, B6). `disconnected` aqui significa "linha
  -- existe, integração não verificada" — NÃO reflete integração já configurada por env global.
  -- ---------------------------------------------------------------------------
  INSERT INTO org_integrations (org_id, provider, status, config) VALUES
    (v_org_id, 'whatsapp',  'disconnected', '{}'),
    (v_org_id, 'meta_ads',  'disconnected', '{"page_id": null}'),
    (v_org_id, 'meta_capi', 'disconnected', '{"dataset_id": null}'),
    (v_org_id, 'sienge',    'disconnected', '{}'),
    (v_org_id, 'telegram',  'disconnected', '{}'),
    (v_org_id, 'google',    'disconnected', '{}')
  ON CONFLICT (org_id, provider) DO NOTHING;

  RETURN v_org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_org(text, text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Backfill da(s) org(ns) existente(s)
--
-- ADITIVO POR CONSTRUÇÃO: só INSERT, com ON CONFLICT DO NOTHING / WHERE NOT EXISTS. Nenhum
-- UPDATE, nenhum DELETE, nenhuma linha existente é tocada — é o que sustenta a AC6 (produção,
-- hoje com uma org só, não muda de comportamento em nenhum caminho de leitura).
-- =============================================================================

INSERT INTO org_integrations (org_id, provider, status, config)
SELECT o.id, p.provider, 'disconnected',
       CASE WHEN p.provider = 'meta_ads'  THEN '{"page_id": null}'::jsonb
            WHEN p.provider = 'meta_capi' THEN '{"dataset_id": null}'::jsonb
            ELSE '{}'::jsonb END
FROM organizations o
CROSS JOIN (VALUES ('whatsapp'), ('meta_ads'), ('meta_capi'), ('sienge'), ('telegram'), ('google')) AS p(provider)
ON CONFLICT (org_id, provider) DO NOTHING;

-- Esperado em PRODUÇÃO: 0 linhas afetadas — a Trifold já tem `whatsapp_config` ativa (medido
-- read-only em 2026-08-29: 1 linha, status='active'). No `trifold-crm-dev` a org de teste NÃO
-- tem nenhuma linha (medido: 0), então lá esta query cria 1 — é o caso para o qual ela existe.
INSERT INTO whatsapp_config (org_id, status)
SELECT o.id, 'inactive'
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config wc WHERE wc.org_id = o.id);

-- =============================================================================
-- ROLLBACK (NFR-8)
-- =============================================================================
-- DROP TABLE IF EXISTS org_integrations;              -- leva junto índices, policies e trigger
-- DROP INDEX IF EXISTS whatsapp_config_org_ativo;
-- DROP INDEX IF EXISTS whatsapp_config_phone_ativo;
-- -- provision_org volta ao corpo da 240 reaplicando 240_provision_org.sql (CREATE OR REPLACE).
-- -- As linhas semeadas por esta migration NÃO são apagadas pelo rollback do schema:
-- --   DELETE FROM whatsapp_config WHERE status = 'inactive' AND access_token IS NULL;
-- -- (conferir manualmente antes — o predicado é heurístico, não uma marca de origem.)

-- Migration 020: Portal do Cliente — Fundação (Schema + RLS)
-- Epic 20 — Portal do Cliente (Story 20.1a)
-- Plan: docs/approved-plans/migration-018_portal_cliente.md
--
-- HISTORICAL CONTEXT:
-- Originally numbered 018 in the plan doc. Renumbered:
--   - 018 was already applied remotely under the name 'email_central'
--     (committed retroactively here as 018_email_central.sql)
--   - 019_portal_cliente_enum.sql owns the ALTER TYPE statement (separate
--     transaction is required by Postgres before the new enum value can be
--     referenced by code in this file — SQLSTATE 55P04).
-- The plan doc keeps the 018_ filename for historical traceability.
--
-- Depends on: 019_portal_cliente_enum.sql (must be committed first so that
-- 'cliente' value is usable inside is_cliente() defined below).
--
-- Cria:
--   - 7 tabelas: obras, obra_fases, obra_fotos, obra_documentos,
--     cliente_obras, obra_mensagens, obra_notificacao_prefs
--   - Helper functions RLS: is_cliente(), cliente_obra_ids()
--   - Policies RLS isolando por org + por vínculo cliente↔obra
--
-- Storage Buckets (criar via CLI separadamente, NÃO via SQL):
--   supabase storage create obra-fotos --public
--   supabase storage create obra-docs
--   supabase storage create obra-mensagens
--
-- Storage policies para buckets privados serão definidas em stories posteriores
-- (20.4 documentos, 20.5 mensagens) junto com o código de upload.

-- ============================================
-- 1. TABELA: obras (sem FK current_phase_id ainda — adicionada após obra_fases)
-- ============================================

CREATE TABLE IF NOT EXISTS obras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text,
  progress_pct integer NOT NULL DEFAULT 0
    CHECK (progress_pct >= 0 AND progress_pct <= 100),
  current_phase_id uuid,
  expected_delivery_date date,
  status varchar(50) NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluida', 'pausada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 3. TABELA: obra_fases
-- ============================================

CREATE TABLE IF NOT EXISTS obra_fases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text,
  order_index integer NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'pendente',
  progress_pct integer NOT NULL DEFAULT 0
    CHECK (progress_pct >= 0 AND progress_pct <= 100),
  start_date date,
  end_date date,
  expected_start_date date,
  expected_end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 4. FK CIRCULAR: obras.current_phase_id → obra_fases.id
-- DEFERRABLE INITIALLY DEFERRED para permitir bulk insert (obra+fases) numa
-- mesma transação, com verificação só no COMMIT.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_obras_current_phase'
  ) THEN
    ALTER TABLE obras
      ADD CONSTRAINT fk_obras_current_phase
      FOREIGN KEY (current_phase_id) REFERENCES obra_fases(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ============================================
-- 5. TABELA: obra_fotos
-- ============================================

CREATE TABLE IF NOT EXISTS obra_fotos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  fase_id uuid REFERENCES obra_fases(id) ON DELETE SET NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  storage_path text NOT NULL,
  caption text,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 6. TABELA: obra_documentos
-- ============================================

CREATE TABLE IF NOT EXISTS obra_documentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  name varchar(255) NOT NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  category varchar(100),
  file_size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 7. TABELA: cliente_obras (M:N user ↔ obra)
-- ============================================

CREATE TABLE IF NOT EXISTS cliente_obras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, obra_id)
);

-- ============================================
-- 8. TABELA: obra_mensagens
-- ============================================

CREATE TABLE IF NOT EXISTS obra_mensagens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_type varchar(20) NOT NULL
    CHECK (sender_type IN ('cliente', 'equipe')),
  content text,
  message_type varchar(20) NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio')),
  storage_path text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 9. TABELA: obra_notificacao_prefs (preferências por usuário)
-- ============================================

CREATE TABLE IF NOT EXISTS obra_notificacao_prefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  notify_nova_foto boolean NOT NULL DEFAULT true,
  notify_novo_documento boolean NOT NULL DEFAULT true,
  notify_nova_mensagem boolean NOT NULL DEFAULT true,
  notify_progresso boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 10. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_obras_org_id ON obras(org_id);
CREATE INDEX IF NOT EXISTS idx_obra_fases_obra_id ON obra_fases(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_fases_org_id ON obra_fases(org_id);
CREATE INDEX IF NOT EXISTS idx_obra_fotos_obra_id ON obra_fotos(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_fotos_org_id ON obra_fotos(org_id);
CREATE INDEX IF NOT EXISTS idx_obra_documentos_obra_id ON obra_documentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_documentos_org_id ON obra_documentos(org_id);
CREATE INDEX IF NOT EXISTS idx_cliente_obras_user_id ON cliente_obras(user_id);
CREATE INDEX IF NOT EXISTS idx_cliente_obras_obra_id ON cliente_obras(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_mensagens_obra_id ON obra_mensagens(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_mensagens_org_id ON obra_mensagens(org_id);

-- ============================================
-- 11. HELPER FUNCTIONS RLS
-- Padrão: SECURITY DEFINER STABLE (segue convenção de 004_rls_policies.sql)
-- ============================================

-- Verifica se o usuário autenticado é cliente
CREATE OR REPLACE FUNCTION public.is_cliente()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
    AND role = 'cliente'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Retorna os obra_ids acessíveis ao cliente autenticado (via cliente_obras)
CREATE OR REPLACE FUNCTION public.cliente_obra_ids()
RETURNS SETOF uuid AS $$
  SELECT co.obra_id
  FROM public.cliente_obras co
  JOIN public.users u ON u.id = co.user_id
  WHERE u.auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 12. ENABLE RLS em todas as 7 tabelas
-- ============================================

ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_notificacao_prefs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. POLICIES — obras
-- ============================================

DROP POLICY IF EXISTS "obras_manage_admin" ON obras;
CREATE POLICY "obras_manage_admin" ON obras
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.is_admin_or_supervisor()
  );

DROP POLICY IF EXISTS "obras_select_cliente" ON obras;
CREATE POLICY "obras_select_cliente" ON obras
  FOR SELECT USING (
    id IN (SELECT public.cliente_obra_ids())
  );

-- ============================================
-- 14. POLICIES — obra_fases
-- ============================================

DROP POLICY IF EXISTS "obra_fases_manage_admin" ON obra_fases;
CREATE POLICY "obra_fases_manage_admin" ON obra_fases
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.is_admin_or_supervisor()
  );

DROP POLICY IF EXISTS "obra_fases_select_cliente" ON obra_fases;
CREATE POLICY "obra_fases_select_cliente" ON obra_fases
  FOR SELECT USING (
    obra_id IN (SELECT public.cliente_obra_ids())
  );

-- ============================================
-- 15. POLICIES — obra_fotos
-- ============================================

DROP POLICY IF EXISTS "obra_fotos_manage_admin" ON obra_fotos;
CREATE POLICY "obra_fotos_manage_admin" ON obra_fotos
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.is_admin_or_supervisor()
  );

DROP POLICY IF EXISTS "obra_fotos_select_cliente" ON obra_fotos;
CREATE POLICY "obra_fotos_select_cliente" ON obra_fotos
  FOR SELECT USING (
    obra_id IN (SELECT public.cliente_obra_ids())
  );

-- ============================================
-- 16. POLICIES — obra_documentos
-- ============================================

DROP POLICY IF EXISTS "obra_documentos_manage_admin" ON obra_documentos;
CREATE POLICY "obra_documentos_manage_admin" ON obra_documentos
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.is_admin_or_supervisor()
  );

DROP POLICY IF EXISTS "obra_documentos_select_cliente" ON obra_documentos;
CREATE POLICY "obra_documentos_select_cliente" ON obra_documentos
  FOR SELECT USING (
    obra_id IN (SELECT public.cliente_obra_ids())
  );

-- ============================================
-- 17. POLICIES — cliente_obras
-- Admin gerencia (mas org_id vem da obra, não da própria tabela);
-- Cliente vê apenas seus próprios vínculos.
-- ============================================

DROP POLICY IF EXISTS "cliente_obras_manage_admin" ON cliente_obras;
CREATE POLICY "cliente_obras_manage_admin" ON cliente_obras
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM obras o
      WHERE o.id = cliente_obras.obra_id
      AND o.org_id = public.user_org_id()
    )
    AND public.is_admin_or_supervisor()
  );

DROP POLICY IF EXISTS "cliente_obras_select_self" ON cliente_obras;
CREATE POLICY "cliente_obras_select_self" ON cliente_obras
  FOR SELECT USING (
    user_id = public.public_user_id()
  );

-- ============================================
-- 18. POLICIES — obra_mensagens
-- Admin/supervisor: ALL na sua org
-- Cliente: SELECT em obras vinculadas + INSERT (só próprias mensagens)
-- ============================================

DROP POLICY IF EXISTS "obra_mensagens_manage_admin" ON obra_mensagens;
CREATE POLICY "obra_mensagens_manage_admin" ON obra_mensagens
  FOR ALL USING (
    org_id = public.user_org_id()
    AND public.is_admin_or_supervisor()
  );

DROP POLICY IF EXISTS "obra_mensagens_select_cliente" ON obra_mensagens;
CREATE POLICY "obra_mensagens_select_cliente" ON obra_mensagens
  FOR SELECT USING (
    obra_id IN (SELECT public.cliente_obra_ids())
  );

DROP POLICY IF EXISTS "obra_mensagens_insert_cliente" ON obra_mensagens;
CREATE POLICY "obra_mensagens_insert_cliente" ON obra_mensagens
  FOR INSERT WITH CHECK (
    obra_id IN (SELECT public.cliente_obra_ids())
    AND sender_id = public.public_user_id()
    AND sender_type = 'cliente'
  );

-- ============================================
-- 19. POLICIES — obra_notificacao_prefs
-- Apenas o próprio usuário gerencia suas preferências.
-- ============================================

DROP POLICY IF EXISTS "obra_notif_prefs_manage_self" ON obra_notificacao_prefs;
CREATE POLICY "obra_notif_prefs_manage_self" ON obra_notificacao_prefs
  FOR ALL USING (
    user_id = public.public_user_id()
  );

-- ============================================
-- 20. UPDATED_AT TRIGGERS
-- Reaproveita função public.update_updated_at() criada em 001_base_schema.sql
-- ============================================

DROP TRIGGER IF EXISTS set_updated_at ON obras;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON obras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON obra_fases;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON obra_fases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON obra_notificacao_prefs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON obra_notificacao_prefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 21. SERVICE ROLE BYPASS
-- O service_role key bypassa RLS automaticamente no Supabase.
-- Isso permite que Edge Functions (uploads, notificações, crons) acessem
-- todas as tabelas sem restrição — mantendo o pattern do projeto.
-- ============================================

-- Fim da migration 018_portal_cliente.sql

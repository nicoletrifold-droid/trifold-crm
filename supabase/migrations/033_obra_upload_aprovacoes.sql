-- Migration 033: Aprovação de Uploads do Perfil Obras
-- Story 31.1 — Epic 31
--
-- Propósito: Criar tabela de staging para uploads enviados pelo role 'obras'.
-- Uploads ficam pendentes até admin/supervisor aprovar ou rejeitar.
-- Ao aprovar: API (Story 31.2) move para obra_fotos ou obra_documentos.
-- Ao rejeitar: API remove arquivo do Supabase Storage e registra motivo.
--
-- IMPORTANTE sobre RLS:
--   - is_admin_or_supervisor() inclui role 'obras' (migration 030).
--   - Policies de UPDATE/DELETE usam subquery inline com role IN ('admin','supervisor')
--     para impedir que o role 'obras' aprove/rejeite seus próprios uploads.

-- ============================================================
-- TABELA: obra_upload_aprovacoes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.obra_upload_aprovacoes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  obra_id           uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo              text        NOT NULL CHECK (tipo IN ('foto', 'documento')),
  storage_path      text        NOT NULL,
  storage_bucket    text        NOT NULL,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'pendente'
                                CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  enviado_por       uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  aprovado_por      uuid        NULL     REFERENCES public.users(id) ON DELETE SET NULL,
  motivo_rejeicao   text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_at       timestamptz NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_obra_upload_apr_org_id
  ON public.obra_upload_aprovacoes (org_id);

CREATE INDEX IF NOT EXISTS idx_obra_upload_apr_obra_id
  ON public.obra_upload_aprovacoes (obra_id);

CREATE INDEX IF NOT EXISTS idx_obra_upload_apr_status
  ON public.obra_upload_aprovacoes (status);

CREATE INDEX IF NOT EXISTS idx_obra_upload_apr_enviado_por
  ON public.obra_upload_aprovacoes (enviado_por);

-- Index composto para badge global (contagem de pendências por org)
CREATE INDEX IF NOT EXISTS idx_obra_upload_apr_org_status
  ON public.obra_upload_aprovacoes (org_id, status);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.obra_upload_aprovacoes ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado da org pode visualizar aprovações
CREATE POLICY "aprovacoes_select" ON public.obra_upload_aprovacoes
  FOR SELECT USING (org_id = public.user_org_id());

-- Apenas o próprio usuário pode inserir seu upload como pendente
CREATE POLICY "aprovacoes_insert" ON public.obra_upload_aprovacoes
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND enviado_por = public.public_user_id()
  );

-- Apenas admin/supervisor podem aprovar ou rejeitar (obras excluído intencionalmente)
CREATE POLICY "aprovacoes_update" ON public.obra_upload_aprovacoes
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  );

-- Apenas admin/supervisor podem deletar registros de aprovação
CREATE POLICY "aprovacoes_delete" ON public.obra_upload_aprovacoes
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  );

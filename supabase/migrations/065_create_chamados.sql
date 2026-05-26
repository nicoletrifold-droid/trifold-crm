-- =============================================================================
-- Migration 065: Módulo Chamados (tickets de bugs e melhorias do sistema)
-- Story 43.1
-- =============================================================================

-- Tabela principal de chamados
CREATE TABLE IF NOT EXISTS public.chamados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reporter_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name text NOT NULL,
  description   text NOT NULL CHECK (char_length(trim(description)) >= 20),
  reason        text NOT NULL CHECK (char_length(trim(reason)) >= 10),
  image_url     text,
  status        text NOT NULL DEFAULT 'aberto'
                  CHECK (status IN ('aberto', 'em_analise', 'resolvido')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chamados_org_id
  ON public.chamados(org_id);

CREATE INDEX IF NOT EXISTS idx_chamados_reporter_id
  ON public.chamados(reporter_id);

CREATE INDEX IF NOT EXISTS idx_chamados_created_at
  ON public.chamados(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_chamados_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chamados_updated_at ON public.chamados;
CREATE TRIGGER trg_chamados_updated_at
  BEFORE UPDATE ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION public.set_chamados_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

-- INSERT: qualquer usuário autenticado da mesma org pode abrir chamado
-- reporter_id é forçado pelo WITH CHECK — não pode ser forjado pelo cliente
CREATE POLICY "chamados_insert_own"
  ON public.chamados FOR INSERT
  WITH CHECK (
    org_id = public.user_org_id()
    AND reporter_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- SELECT: usuário vê apenas os seus; admin/supervisor vê todos da org
CREATE POLICY "chamados_select"
  ON public.chamados FOR SELECT
  USING (
    org_id = public.user_org_id()
    AND (
      reporter_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
      OR public.is_admin_or_supervisor()
    )
  );

-- UPDATE: somente admin/supervisor (ex: mudar status)
CREATE POLICY "chamados_update_admin"
  ON public.chamados FOR UPDATE
  USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor())
  WITH CHECK (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- DELETE: somente admin
CREATE POLICY "chamados_delete_admin"
  ON public.chamados FOR DELETE
  USING (org_id = public.user_org_id() AND public.user_role() = 'admin');

-- =============================================================================
-- Storage bucket: chamados-attachments
-- Nota: o bucket deve ser criado via API do Supabase ou dashboard.
-- Políticas de storage abaixo são criadas para quando o bucket existir.
-- =============================================================================

-- Permite que qualquer usuário autenticado faça upload no path correto
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chamados-attachments',
  'chamados-attachments',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: qualquer autenticado pode upload (INSERT)
CREATE POLICY "chamados_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chamados-attachments'
    AND auth.uid() IS NOT NULL
  );

-- Policy: usuário pode ver seus próprios objetos; admin vê todos
-- O path segue o padrão: {org_id}/{user_id}/{uuid}.{ext}
CREATE POLICY "chamados_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chamados-attachments'
    AND auth.uid() IS NOT NULL
    AND (
      -- Arquivo pertence ao usuário (2º segmento do path = users.id)
      (storage.foldername(name))[2] = (SELECT id::text FROM public.users WHERE auth_id = auth.uid())
      OR public.is_admin_or_supervisor()
    )
  );

-- Policy: apenas admin pode deletar
CREATE POLICY "chamados_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chamados-attachments'
    AND public.is_admin_or_supervisor()
  );

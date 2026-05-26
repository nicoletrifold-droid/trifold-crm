-- =============================================================================
-- Migration 067: Tabela de log de aceite de privacidade (LGPD)
-- Story 44.1
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accepted_at    timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL DEFAULT '2026-05-26'
);

CREATE INDEX IF NOT EXISTS idx_privacy_consents_user_id
  ON public.privacy_consents(user_id);

ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;

-- Usuário autenticado pode inserir apenas o seu próprio registro
CREATE POLICY "privacy_consents_insert_own"
  ON public.privacy_consents FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Apenas admin/supervisor pode ler todos os registros
CREATE POLICY "privacy_consents_select_admin"
  ON public.privacy_consents FOR SELECT
  USING (public.is_admin_or_supervisor());

-- Imutável: sem UPDATE nem DELETE para ninguém (nem admin)
-- Isso garante a validade jurídica do log

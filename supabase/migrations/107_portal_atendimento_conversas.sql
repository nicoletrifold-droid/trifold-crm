-- Story 75-16/17/18 — Atendimento do portal do cliente: conversa com ATENDENTE
-- responsável (atendente padrão configurável), TRANSFERÊNCIA entre usuários e
-- PARTICIPANTES. (Schema completo das 3 fases numa migration só.)

-- 1. Atendente padrão do portal por organização (configurável)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS portal_atendente_padrao_id uuid
  REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Conversa do portal — uma por (obra, cliente)
CREATE TABLE IF NOT EXISTS public.obra_conversas (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id      uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status       varchar(20) NOT NULL DEFAULT 'aberta',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS idx_obra_conversas_assigned ON public.obra_conversas(assigned_to);
CREATE INDEX IF NOT EXISTS idx_obra_conversas_org ON public.obra_conversas(org_id);

-- 3. Participantes adicionais da conversa
CREATE TABLE IF NOT EXISTS public.obra_conversas_participants (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id  uuid NOT NULL REFERENCES public.obra_conversas(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_obra_conv_part_user ON public.obra_conversas_participants(user_id);

-- 4. RLS
ALTER TABLE public.obra_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_conversas_participants ENABLE ROW LEVEL SECURITY;

-- Staff (admin/supervisor/obras/gerente-comercial) gerencia conversas da org;
-- participante (qualquer role) enxerga as conversas em que foi incluído.
DROP POLICY IF EXISTS "obra_conversas_manage" ON public.obra_conversas;
CREATE POLICY "obra_conversas_manage" ON public.obra_conversas
  FOR ALL USING (
    org_id = public.user_org_id()
    AND (
      public.is_admin_or_supervisor()
      OR id IN (
        SELECT conversa_id FROM public.obra_conversas_participants
        WHERE user_id = public.public_user_id()
      )
    )
  );

DROP POLICY IF EXISTS "obra_conv_part_manage" ON public.obra_conversas_participants;
CREATE POLICY "obra_conv_part_manage" ON public.obra_conversas_participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.obra_conversas c
      WHERE c.id = conversa_id
        AND c.org_id = public.user_org_id()
        AND (public.is_admin_or_supervisor() OR obra_conversas_participants.user_id = public.public_user_id())
    )
  );

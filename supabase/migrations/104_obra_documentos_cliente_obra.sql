-- Story 75-6 — Documentos exclusivos por cliente/unidade
-- Adiciona vínculo opcional de um documento a um cliente/unidade do portal
-- (cliente_obras). NULL = documento geral da obra (todos os clientes veem).

-- 1. Coluna de vínculo (opcional)
ALTER TABLE public.obra_documentos
  ADD COLUMN IF NOT EXISTS cliente_obra_id uuid NULL
  REFERENCES public.cliente_obras(id) ON DELETE SET NULL;

-- 2. Índice parcial (só docs exclusivos)
CREATE INDEX IF NOT EXISTS idx_obra_documentos_cliente_obra
  ON public.obra_documentos(cliente_obra_id)
  WHERE cliente_obra_id IS NOT NULL;

-- 3. Helper: ids de vínculo (cliente_obras) do usuário logado.
--    Espelha public.cliente_obra_ids(), mas retorna o id do vínculo.
CREATE OR REPLACE FUNCTION public.cliente_obra_link_ids()
RETURNS SETOF uuid AS $$
  SELECT co.id
  FROM public.cliente_obras co
  JOIN public.users u ON u.id = co.user_id
  WHERE u.auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. RLS: cliente vê docs gerais (cliente_obra_id null) + os exclusivos dele.
--    Mantém o escopo por obra; policy admin/supervisor (FOR ALL) inalterada.
DROP POLICY IF EXISTS "obra_documentos_select_cliente" ON public.obra_documentos;
CREATE POLICY "obra_documentos_select_cliente" ON public.obra_documentos
  FOR SELECT USING (
    obra_id IN (SELECT public.cliente_obra_ids())
    AND (
      cliente_obra_id IS NULL
      OR cliente_obra_id IN (SELECT public.cliente_obra_link_ids())
    )
  );

-- Story 75-45 — carimbo de "primeiro atendimento" do lead.
-- Mede o tempo desde a entrada do lead (created_at) até ele SAIR do estágio
-- "Aguardando atendimento" (slug 'novo') pela primeira vez. Usado no relatório
-- diário do diretor. Trigger no banco para capturar TODOS os caminhos de
-- mudança de estágio (~20 lugares no app) de forma confiável e idempotente.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS primeiro_atendimento_em timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_primeiro_atendimento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_novo_id uuid;
BEGIN
  -- Só age quando o estágio realmente muda e ainda não há carimbo (idempotente:
  -- mover de volta para "novo" e sair de novo NÃO sobrescreve o primeiro).
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id
     AND NEW.primeiro_atendimento_em IS NULL THEN
    SELECT id INTO v_novo_id
      FROM public.kanban_stages
     WHERE slug = 'novo' AND org_id = NEW.org_id
     LIMIT 1;

    -- Carimba apenas quando SAI de "novo" para outro estágio. Lead que nunca
    -- passou por "novo" (ex.: criado direto em outro estágio) não é carimbado.
    IF OLD.stage_id = v_novo_id AND NEW.stage_id IS DISTINCT FROM v_novo_id THEN
      NEW.primeiro_atendimento_em := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_primeiro_atendimento ON public.leads;
CREATE TRIGGER stamp_primeiro_atendimento
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_primeiro_atendimento();

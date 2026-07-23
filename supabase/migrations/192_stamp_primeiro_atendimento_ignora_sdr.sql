-- Story 75-213 — mover lead para a etapa "SDR" não é atendimento de corretor.
-- Incidente 2026-07-23: a SDR moveu 52 leads da base antiga (parados em
-- "Aguardando atendimento") para a etapa "SDR" e o trigger da mig 112 carimbou
-- primeiro_atendimento_em em todos, contaminando o "tempo médio de
-- atendimento" do relatório diário (durações de ~6 semanas). Guard: saída de
-- "novo" com DESTINO na etapa slug 'sdr' não carimba. Quando o lead voltar ao
-- funil (SDR → Aguardando atendimento → corretor move adiante), o carimbo
-- acontece normalmente na saída real de "novo". Org sem etapa 'sdr' →
-- comportamento idêntico ao da mig 112.

CREATE OR REPLACE FUNCTION public.stamp_primeiro_atendimento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_novo_id uuid;
  v_sdr_id uuid;
BEGIN
  -- Só age quando o estágio realmente muda e ainda não há carimbo (idempotente:
  -- mover de volta para "novo" e sair de novo NÃO sobrescreve o primeiro).
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id
     AND NEW.primeiro_atendimento_em IS NULL THEN
    SELECT id INTO v_novo_id
      FROM public.kanban_stages
     WHERE slug = 'novo' AND org_id = NEW.org_id
     LIMIT 1;

    SELECT id INTO v_sdr_id
      FROM public.kanban_stages
     WHERE slug = 'sdr' AND org_id = NEW.org_id
     LIMIT 1;

    -- Carimba apenas quando SAI de "novo" para outro estágio que NÃO seja a
    -- etapa "SDR" (requalificação de base parada, não atendimento — 75-213).
    IF OLD.stage_id = v_novo_id
       AND NEW.stage_id IS DISTINCT FROM v_novo_id
       AND (v_sdr_id IS NULL OR NEW.stage_id IS DISTINCT FROM v_sdr_id) THEN
      NEW.primeiro_atendimento_em := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

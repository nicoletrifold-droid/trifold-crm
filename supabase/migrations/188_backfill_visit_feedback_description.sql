-- =============================================================================
-- 188_backfill_visit_feedback_description.sql — Story 75-202
-- =============================================================================
-- O evento "Visita concluída" da linha do tempo só mostrava o interesse — o
-- relato ("como foi a visita") e os próximos passos ficavam gravados em
-- visit_feedback mas invisíveis fora da Análise IA. O código passou a escrever
-- a description completa (visit-feedback-core.ts); esta migration reescreve as
-- activities ANTIGAS a partir do visit_feedback correspondente
-- (metadata->>'feedback_id').
--
-- Idempotente: reescreve a description por completo a cada execução.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.visit_feedback') IS NOT NULL THEN
    UPDATE activities a
    SET description =
      'Visita concluída. Interesse: ' ||
      CASE vf.interest_after::text
        WHEN 'hot' THEN 'quente'
        WHEN 'warm' THEN 'morno'
        WHEN 'cold' THEN 'frio'
        ELSE vf.interest_after::text
      END ||
      CASE WHEN COALESCE(TRIM(vf.feedback), '') <> ''
        THEN E'\n' || TRIM(vf.feedback) ELSE '' END ||
      CASE WHEN COALESCE(TRIM(vf.next_steps), '') <> ''
        THEN E'\nPróximos passos: ' || TRIM(vf.next_steps) ELSE '' END
    FROM visit_feedback vf
    WHERE a.type = 'visit_completed'
      AND (a.metadata ->> 'feedback_id') IS NOT NULL
      AND vf.id = (a.metadata ->> 'feedback_id')::uuid;
  END IF;
END $$;

-- 75-327 (parte 2) — Dois agendamentos `completed` viram `no_show`.
-- Decisão do Marcos em 17/08/2026, depois de ver as notas do corretor.
--
-- Os dois são do MESMO lead (754f2d4f-fdb4-44b4-b434-189b25922c4e) e o corretor
-- registrou por escrito que a visita não aconteceu:
--
--   0c609bcc… (visita de 08/08) → nota de 10/08:
--     "A cliente não compareceu na visita, tentei contato para confirmar e não consegui."
--   5d809dc1… (visita de 13/08) → nota de 13/08:
--     "Cliente desmarcou, perguntei se ela tem disponibilidade para dar entrada."
--
-- Ambos estavam `completed` por causa do guard 2 do detector de no-show (Story 75-177),
-- que fechava como realizada qualquer agendamento com atividade do corretor depois do
-- horário. A 75-321 corrigiu o comportamento; aqui corrigimos os dois registros.
--
-- A ETAPA DO LEAD NÃO MUDA. O fluxo manual da 75-321 devolveria o lead à etapa de
-- No-Show, mas este lead vem sendo trabalhado desde então (última nota em 17/08) e a
-- posição no kanban é do corretor, não da correção de métrica.
--
-- EFEITO NAS MÉTRICAS: "Visitas realizadas" cai 2 (semanas de 08/08 e 13/08) e o
-- no-show sobe 2 — que é o número honesto.
--
-- REVERSÃO:
--   UPDATE appointments SET status = 'completed'
--   WHERE id IN ('0c609bcc-da29-4fc8-960a-6e765524f701','5d809dc1-fcdb-4786-a440-0e382c5033dd');
--   DELETE FROM activities WHERE metadata->>'backfill' = '75-327-no-show';

WITH alvo AS (
  SELECT id, lead_id, org_id, scheduled_at
  FROM appointments
  WHERE id IN (
    '0c609bcc-da29-4fc8-960a-6e765524f701',
    '5d809dc1-fcdb-4786-a440-0e382c5033dd'
  )
    AND status = 'completed' -- idempotente: rodar de novo não faz nada
),
log AS (
  INSERT INTO activities (org_id, lead_id, user_id, type, description, metadata)
  SELECT
    a.org_id,
    a.lead_id,
    NULL, -- sistema
    'appointment_no_show',
    'Correção retroativa (75-327): a visita de '
      || to_char(a.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
      || ' estava marcada como realizada, mas as notas do corretor registram que o cliente '
      || 'não compareceu. Reclassificada como no-show em 17/08.',
    jsonb_build_object('appointment_id', a.id, 'backfill', '75-327-no-show')
  FROM alvo a
  RETURNING lead_id
)
UPDATE appointments SET status = 'no_show'
WHERE id IN (SELECT id FROM alvo);

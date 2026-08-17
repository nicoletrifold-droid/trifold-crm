-- 75-327 — Backfill: agendamentos `completed` SEM feedback contam como visita realizada.
-- Decisão do Marcos em 17/08/2026, após a auditoria do Analytics (Stories 75-321..326).
--
-- CONTEXTO. Até a 75-321, o cron de follow-up marcava `completed` quando havia atividade
-- do corretor depois do horário — sem prova de comparecimento. Sobraram 7 agendamentos
-- `completed` sem nenhum `visit_feedback`. O código novo impede que aconteça de novo;
-- este script trata o passado.
--
-- TRIAGEM DOS 7 (medida em prod em 17/08):
--   • 4 leads JÁ passaram pela etapa "Visitou" no log → já contam no funil. Nada a fazer.
--   • 1 lead (agendamento 4391a1ca, 20/07) nunca passou, e não há nota contradizendo a
--     visita ("vai ver com o filho") → é o único tratado aqui.
--   • 2 agendamentos (0c609bcc de 08/08 e 5d809dc1 de 13/08, do MESMO lead
--     754f2d4f) têm prova ESCRITA do corretor de que a visita não aconteceu:
--       10/08 "A cliente não compareceu na visita, tentei contato e não consegui."
--       13/08 "Cliente desmarcou, perguntei se ela tem disponibilidade para dar entrada."
--     Ficaram DE FORA deste script, aguardando decisão — carimbá-los como visita
--     realizada contradiz o registro do próprio corretor e infla exatamente a métrica
--     que a 75-321 acabou de consertar.
--
-- POR QUE LOG E NÃO `leads.stage_id`. Mover a etapa dispara
-- `trg_log_lead_stage_change`, que ALÉM do log enfileira um evento Meta CAPI "Schedule"
-- (Story 86-2) — uma conversão enviada ao Meta por uma visita de julho. Também
-- reposicionaria o card no kanban do corretor, que hoje reflete o trabalho em curso.
-- O funil (Story 75-323) conta pelo `metadata.to_stage` das activities `stage_change`,
-- então registrar a passagem basta para a métrica, sem efeito colateral externo.
--
-- REVERSÃO: DELETE FROM activities WHERE metadata->>'backfill' = '75-327';

INSERT INTO activities (org_id, lead_id, user_id, type, description, metadata)
SELECT
  l.org_id,
  l.id,
  NULL, -- sistema: não houve ação humana no momento do registro
  'stage_change',
  'Correção retroativa (75-327): agendamento de 20/07 ficou concluído sem feedback e foi '
    || 'contabilizado como visita realizada, por decisão de 17/08. A etapa atual do lead não mudou.',
  jsonb_build_object(
    'from_stage', jsonb_build_object('id', l.stage_id, 'name', ks.name),
    'to_stage', jsonb_build_object('id', '00000000-0000-0000-0001-000000000005', 'name', 'Visitou'),
    'from_stage_id', l.stage_id,
    'to_stage_id', '00000000-0000-0000-0001-000000000005',
    'appointment_id', a.id,
    'backfill', '75-327'
  )
FROM appointments a
JOIN leads l ON l.id = a.lead_id
LEFT JOIN kanban_stages ks ON ks.id = l.stage_id
WHERE a.id = '4391a1ca-1f4c-48b4-acba-db731bc1d2ca'
  -- Idempotente: rodar de novo não duplica.
  AND NOT EXISTS (
    SELECT 1 FROM activities ac
    WHERE ac.lead_id = l.id AND ac.metadata->>'backfill' = '75-327'
  );

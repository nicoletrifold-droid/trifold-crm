-- Story 75-279 — medição que decide se vale bloquear o envio (ou não).
-- Rodar ~1 semana após o deploy de 06/08/2026 (PR #368) em PROD (dsopqkqjkmhytudaaolv).
--
-- A pergunta: quando a guarda acende, é promessa de verdade ("te espero sábado
-- às 11h") ou menção inocente ("sua visita passada foi terça às 10h")?
-- Só o TEXTO responde — por isso a consulta 2 traz a fala inteira.

-- 1) Volume: com que frequência acende?
select
  event_type,
  count(*)                                   as ocorrencias,
  count(distinct metadata->>'lead_id')       as leads,
  min(created_at)::date                      as primeiro,
  max(created_at)::date                      as ultimo
from system_events
where event_type in ('NICOLE_SLOT_UNAUTHORIZED', 'NICOLE_SYSTEM_BLOCK_LEAK', 'NICOLE_SLOT_MISMATCH')
group by 1
order by 2 desc;

-- 2) O que ela disse em cada caso — é aqui que se separa promessa de menção.
select
  created_at,
  event_type,
  metadata->>'lead_id'                       as lead_id,
  metadata->>'said_at'                       as horario_afirmado,
  metadata->>'assistant_message'             as fala_da_nicole
from system_events
where event_type in ('NICOLE_SLOT_UNAUTHORIZED', 'NICOLE_SYSTEM_BLOCK_LEAK')
order by created_at desc;

-- 3) Consequência real: o lead que disparou o evento acabou com visita na agenda?
--    Evento + visita = a rede funcionou (alguém fechou o buraco).
--    Evento + nenhuma visita = é exatamente o caso da Maria, de novo.
select
  se.created_at::date                        as dia,
  l.name                                     as lead,
  (select k.name from kanban_stages k where k.id = l.stage_id) as etapa,
  exists (select 1 from appointments a where a.lead_id = l.id) as tem_visita
from system_events se
join leads l on l.id = (se.metadata->>'lead_id')::uuid
where se.event_type = 'NICOLE_SLOT_UNAUTHORIZED'
order by se.created_at desc;

-- 4) Controle: a Nicole voltou a agendar de verdade depois do fix?
--    Antes do 75-279 ela não criava visita desde 31/07.
select
  created_at::date                           as dia,
  client_name,
  scheduled_at
from appointments
where created_by = 'nicole'
  and created_at >= '2026-08-06'
order by created_at desc;

-- COMO LER O RESULTADO
--   Consulta 2 majoritariamente PROMESSA  → bloquear se justifica; a rede humana
--                                           (recomendação aceita em 06/08) vira urgente.
--   Consulta 2 majoritariamente MENÇÃO    → apertar o filtro de detectAffirmedSlot,
--                                           NÃO desligar o evento.
--   Consulta 1 com zero linhas            → ou o fix resolveu, ou a Nicole parou de
--                                           agendar de vez: conferir pela consulta 4
--                                           antes de comemorar.

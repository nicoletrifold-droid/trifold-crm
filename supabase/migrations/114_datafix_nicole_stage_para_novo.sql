-- 114_datafix_nicole_stage_para_novo.sql
-- Story 75-56 — Corrige leads poluídos pelo bug em que a Nicole (IA) movia o
-- lead de etapa automaticamente (novo → em_qualificacao → qualificado) por score
-- ou no handoff, SEM o lead ter sido distribuído a um corretor. Regra nova: a IA
-- nunca move etapa; o único lugar que seta a etapa é a distribuição da roleta
-- (que coloca em "Aguardando atendimento").
--
-- (a) Lead SEM corretor (assigned_broker_id IS NULL) que ficou em "1º Contato"
--     (em_qualificacao) ou "Qualificado" volta para "Aguardando atendimento" (novo).
-- (b) Zera o carimbo primeiro_atendimento_em (Story 75-45) disparado falsamente
--     pela mudança de etapa da IA. O trigger da migration 112 só carimba quando o
--     campo está NULL (nunca regrava); sem este reset, o atendimento REAL do
--     corretor (pós-distribuição) jamais seria registrado e o relatório de tempo
--     de atendimento (75-45/75-46) ficaria com horário errado.
--
-- IDs fixos de stage = STAGE_IDS (packages/shared/src/constants/stages.ts).
-- Idempotente: re-rodar não tem efeito (após a 1ª execução nenhum lead casa o filtro).

-- (a) Volta a etapa para "Aguardando atendimento"
UPDATE public.leads
   SET stage_id = '00000000-0000-0000-0001-000000000001'   -- novo / Aguardando atendimento
 WHERE assigned_broker_id IS NULL
   AND stage_id IN (
       '00000000-0000-0000-0001-000000000002',             -- em_qualificacao / 1º Contato
       '00000000-0000-0000-0001-000000000003'              -- qualificado
   );

-- (b) Zera o carimbo de primeiro atendimento falso (lead sem corretor nunca foi atendido)
UPDATE public.leads
   SET primeiro_atendimento_em = NULL
 WHERE assigned_broker_id IS NULL
   AND primeiro_atendimento_em IS NOT NULL;

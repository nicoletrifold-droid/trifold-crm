-- 211_meta_rankings_sem_constraint_fechada.sql
-- Story 75-262 — o sync de ANÚNCIO do Meta estava congelado desde 07/06 porque
-- estas três constraints recusavam valor legítimo da Graph API.
--
-- O QUE ELAS EXIGIAM
--   CHECK (col = ANY (ARRAY['ABOVE_AVERAGE','AVERAGE','BELOW_AVERAGE']))
--
-- O QUE A API DE FATO DEVOLVE — medido em 2026-08-03 contra a conta real
-- (act_324928230003186 + act_10042267189149069, last_30d + last_7d, level=ad):
--
--   quality_ranking          UNKNOWN            38x   ← recusado
--                            ABOVE_AVERAGE       7x
--                            AVERAGE             5x
--   engagement_rate_ranking  UNKNOWN            39x   ← recusado
--                            BELOW_AVERAGE_35   10x   ← recusado
--                            ABOVE_AVERAGE       1x
--   conversion_rate_ranking  UNKNOWN            39x   ← recusado
--                            BELOW_AVERAGE_35    6x   ← recusado
--                            AVERAGE             5x
--
-- `UNKNOWN` é o valor DOMINANTE — a Graph API o devolve quando o anúncio não tem
-- impressões suficientes para ranquear, que é o caso comum numa conta de volume
-- baixo. E `BELOW_AVERAGE` não existe puro: vem com sufixo de decil
-- (`_10`, `_20`, `_35`).
--
-- CONSEQUÊNCIA MEDIDA: 82 execuções de sync com status='error', 8 semanas sem um
-- único dado de anúncio, e as 3 colunas 100% NULL — só sobreviveram as linhas em
-- que a API não devolveu ranking nenhum.
--
-- POR QUE REMOVER EM VEZ DE ESTENDER A LISTA
-- Estender só empurra o problema: o enum é de TERCEIRO e cresce sem aviso (o
-- próprio `BELOW_AVERAGE_35` não existia quando esta constraint foi escrita). E o
-- custo de errar é assimétrico:
--   • valor estranho gravado num campo de observabilidade  = ruído, visível, barato
--   • valor recusado                                       = um NÍVEL INTEIRO do
--     sync morre, em silêncio, por 8 semanas
-- Para dado de observabilidade, falhar ABERTO é o comportamento correto. A
-- validação, quando fizer falta, é do lado de quem LÊ.
--
-- Idempotente (DROP ... IF EXISTS).
--
-- ROLLBACK — só se alguém decidir que vale voltar a recusar (não recomendado):
--   ALTER TABLE public.meta_insights_daily
--     ADD CONSTRAINT meta_insights_daily_quality_ranking_check
--     CHECK (quality_ranking = ANY (ARRAY['ABOVE_AVERAGE','AVERAGE','BELOW_AVERAGE']));
--   (idem para engagement_rate_ranking e conversion_rate_ranking)
--   ⚠️ Recriar sem antes LIMPAR os valores novos faria o ALTER falhar — e é
--   exatamente a prova de que a lista fechada não serve.

ALTER TABLE public.meta_insights_daily
  DROP CONSTRAINT IF EXISTS meta_insights_daily_quality_ranking_check;

ALTER TABLE public.meta_insights_daily
  DROP CONSTRAINT IF EXISTS meta_insights_daily_engagement_rate_ranking_check;

ALTER TABLE public.meta_insights_daily
  DROP CONSTRAINT IF EXISTS meta_insights_daily_conversion_rate_ranking_check;

COMMENT ON COLUMN public.meta_insights_daily.quality_ranking IS
  'Ranking da Graph API, texto CRU. Enum de terceiro (ABOVE_AVERAGE, AVERAGE, BELOW_AVERAGE_10/_20/_35, UNKNOWN) que cresce sem aviso — NÃO adicionar CHECK de lista fechada aqui (story 75-262).';
COMMENT ON COLUMN public.meta_insights_daily.engagement_rate_ranking IS
  'Ranking da Graph API, texto CRU. Ver comentário de quality_ranking (story 75-262).';
COMMENT ON COLUMN public.meta_insights_daily.conversion_rate_ranking IS
  'Ranking da Graph API, texto CRU. Ver comentário de quality_ranking (story 75-262).';

-- Verificação (esperado: ZERO linhas):
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.meta_insights_daily'::regclass AND conname LIKE '%ranking%';

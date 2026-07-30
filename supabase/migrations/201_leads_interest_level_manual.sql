-- 201_leads_interest_level_manual.sql
-- Story 75-237 — "o corretor é superior ao sistema" (Marcos, 30/07): a IA PODE
-- definir a temperatura do lead (entra frio pelo sistema), mas quando o humano
-- muda, a escolha dele não pode mais ser desfeita.
--
-- Contexto do bug: interest_level era recalculado do qualification_score em DOIS
-- lugares, sem olhar se alguém mexeu — packages/ai/src/chat/pipeline.ts (a cada
-- mensagem da Nicole) e flows/haiku-enrichment.ts (cron enrich-leads). Corretor
-- evoluía p/ Quente e a próxima mensagem devolvia p/ Frio.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + backfill condicionado.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS interest_level_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.interest_level_manual IS
  'true = temperatura definida por HUMANO (corretor/gestor) — a IA não sobrescreve mais. Volta a false se o humano limpar p/ "Não definido". Story 75-237.';

-- Backfill: marca como humano quem HOJE diverge do valor que o score geraria —
-- essa divergência só pode ter vindo de alguém escolhendo a mão (a IA sempre
-- grava exatamente a régua abaixo). Quem coincide fica false: a IA segue livre
-- até um humano tocar.
UPDATE public.leads
   SET interest_level_manual = true
 WHERE interest_level IS NOT NULL
   AND interest_level_manual = false
   AND interest_level::text <> CASE
         WHEN COALESCE(qualification_score, 0) >= 70 THEN 'hot'
         WHEN COALESCE(qualification_score, 0) >= 40 THEN 'warm'
         ELSE 'cold'
       END;

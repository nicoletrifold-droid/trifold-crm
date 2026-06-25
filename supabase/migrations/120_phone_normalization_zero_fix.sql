-- =============================================================================
-- Migration 120 — Phone normalization: zero de discagem + DDI sem DDD
-- =============================================================================
-- Story: 25-4 — Phone Normalization: zero de discagem e prefixo 55 ambíguo
--
-- Renumbered from 065 → 120 on 2026-06-25: slot 065 collides with
-- 065_create_chamados.sql (already on origin/main). Highest slot on main was
-- 119_whatsapp_send_log.sql, so the next free slot is 120 (NOT 119 — 119 is
-- already taken).
--
-- Purpose (SAFE part only — the destructive lead merge was REMOVED, see below):
--   1. Atualiza normalize_phone_br() com dois novos edge cases do formato BR:
--      a) Zero de discagem (trunk prefix): 04399873661 → 5543999873661 (DDD 43)
--      b) DDI 55 sem DDD (11 dígitos iniciando com 55): 55998041130 → NULL
--   2. Recalcula phone_normalized de todos os leads cujo valor mudou sob as
--      novas regras — EXCETO linhas cuja recomputação colidiria com outro lead
--      existente no mesmo org (essas ficam intactas p/ merge manual supervisado).
--
-- ⚠️  O MERGE DESTRUTIVO DAS 2 DUPLICATAS FOI REMOVIDO DESTA MIGRATION.
--     Motivo: `DELETE FROM leads` dispara ON DELETE CASCADE em 9 tabelas-filhas
--     (conversations→messages, appointments, lead_facts, lead_memories,
--     lead_tasks, follow_up_rules, lead_property_interest, visit_feedback,
--     lead_distribution_log) — perda silenciosa de histórico de conversas e
--     dados da Nicole — e é BLOQUEADO por unit_sales / properties.reserved_by_lead_id
--     (ON DELETE NO ACTION). A migration original só reatribuía `activities`.
--     Mesclar leads de produção tocando esse leque de FKs NÃO pode rodar
--     desacompanhado. Ver bloco "MANUAL MERGE" comentado no final + story 25-4.
--
-- Idempotente: CREATE OR REPLACE + recalc guardado por IS DISTINCT FROM e
-- NOT EXISTS de colisão. Rodar 2x não quebra e não muda nada na 2ª vez.
-- Não-breaking: nenhuma mudança de schema, apenas corpo de função + dados.
-- =============================================================================

-- =============================================================================
-- 1) Atualizar função normalize_phone_br()
-- =============================================================================
-- Mirror EXATO de packages/shared/src/utils/phone.ts (28 testes, fonte de
-- verdade). IMMUTABLE + STRICT obrigatórios: phone_normalized é
-- GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED.
-- Paridade verificada nos casos: 04399873661→5543999873661, 55998041130→NULL,
-- 043999873661→5543999873661.
-- =============================================================================

CREATE OR REPLACE FUNCTION normalize_phone_br(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  digits text;
  trimmed text;
BEGIN
  -- STRICT handles NULL automatically. Defensive whitespace check:
  trimmed := btrim(raw);
  IF length(trimmed) = 0 THEN
    RETURN NULL;
  END IF;

  -- Strip non-digit characters
  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  -- Less than 10 digits → invalid
  IF length(digits) < 10 THEN
    RETURN NULL;
  END IF;

  -- Strip Brazilian trunk prefix (leading zero) from 11 or 12-digit numbers.
  -- After stripping: if 10 digits remain (DDD + old 8-digit subscriber), insert
  -- the mandatory 9th mobile digit after the DDD (Anatel res. 575/2011).
  IF left(digits, 1) = '0' AND length(digits) IN (11, 12) THEN
    digits := right(digits, length(digits) - 1);
    IF length(digits) = 10 THEN
      digits := left(digits, 2) || '9' || right(digits, 8);
    END IF;
  END IF;

  -- 11 digits starting with '55' = Brazil DDI without DDD → not normalizable
  IF length(digits) = 11 AND left(digits, 2) = '55' THEN
    RETURN NULL;
  END IF;

  -- 11 digits without '55' prefix → prepend '55'
  IF length(digits) = 11 AND left(digits, 2) <> '55' THEN
    RETURN '55' || digits;
  END IF;

  -- 12 digits starting with '55' (legacy without 9th mobile digit) →
  -- insert '9' after the first 4 chars ('55DD' + '9' + last 8)
  IF length(digits) = 12 AND left(digits, 2) = '55' THEN
    RETURN left(digits, 4) || '9' || right(digits, 8);
  END IF;

  -- 13+ digits, 10 digits (local) or non-BR international → return as-is
  RETURN digits;
END;
$$;

COMMENT ON FUNCTION normalize_phone_br(text) IS
  'Normalize a Brazilian phone number to canonical E.164 format with the '
  'mandatory mobile 9th digit (Anatel res. 575/2011). Mirrors the TS utility '
  'in packages/shared/src/utils/phone.ts. '
  'Story 21.1 (initial), Story 25-4 (zero prefix + DDI-without-DDD fix).';

-- =============================================================================
-- 2) Recalcular phone_normalized — colisão-segura e idempotente
-- =============================================================================
-- phone_normalized é GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED.
-- Trocar a função NÃO recomputa linhas existentes; `SET phone = phone` força
-- a recomputação apenas das linhas tocadas.
--
-- Guardas:
--   • `normalize_phone_br(phone) IS DISTINCT FROM phone_normalized`
--     → toca somente linhas cujo valor REALMENTE muda sob as novas regras
--       (idempotência: na 2ª execução nada muda → 0 linhas).
--   • NOT EXISTS (colisão) → pula linhas cuja recomputação geraria o MESMO
--       (org_id, phone_normalized) de OUTRO lead existente, o que violaria o
--       índice UNIQUE idx_leads_org_phone_normalized_unique. Essas duplicatas
--       reais (ex.: par José Edson Biraia) ficam com o valor antigo até serem
--       mescladas manualmente (ver bloco MANUAL MERGE abaixo).
--
-- Par Anezio Ribeiro: '55998041130' recomputa p/ NULL (não colide, NULL≠NULL no
-- índice UNIQUE) → é recomputado normalmente aqui; nenhum merge necessário.
-- =============================================================================

UPDATE leads l
SET phone = l.phone
WHERE l.phone IS NOT NULL
  AND normalize_phone_br(l.phone) IS DISTINCT FROM l.phone_normalized
  AND NOT EXISTS (
    SELECT 1
    FROM leads o
    WHERE o.org_id = l.org_id
      AND o.id <> l.id
      AND o.phone_normalized = normalize_phone_br(l.phone)
  );

-- =============================================================================
-- Verificação pós-migration (executar manualmente):
-- =============================================================================
-- -- (a) Leads cujo valor recomputado ainda diverge = duplicatas pendentes de
-- --     merge manual (esperado: a linha "ruim" do par José Edson Biraia):
-- SELECT id, org_id, name, phone, phone_normalized,
--        normalize_phone_br(phone) AS would_be
-- FROM leads
-- WHERE phone IS NOT NULL
--   AND normalize_phone_br(phone) IS DISTINCT FROM phone_normalized;
--
-- -- (b) Casos-alvo da story:
-- SELECT phone, phone_normalized FROM leads
-- WHERE phone IN ('04399873661','043999873661','55998041130',
--                 '44998041130','43999873661','44997382536');
-- =============================================================================


-- #############################################################################
-- ## MANUAL MERGE — NÃO RODAR AUTOMATICAMENTE / DO NOT RUN VIA db push       ##
-- #############################################################################
-- Todo este bloco está COMENTADO de propósito: `supabase db push` o ignora.
-- Mesclar duas leads de produção apaga (CASCADE) histórico de conversas/
-- mensagens e dados da Nicole se as FKs-filhas não forem reatribuídas antes do
-- DELETE. Execute UM PAR POR VEZ, via Management API, sob supervisão humana,
-- DEPOIS de inspecionar as contagens de filhos de cada lead.
--
-- Mapa de tabelas-filhas de `leads` (auditado 2026-06-25):
--   ON DELETE CASCADE (perda de dados se não reatribuir):
--     conversations(001) → messages cascateiam via conversation_id
--     appointments(006), lead_facts(012), lead_memories(012),
--     follow_up_rules(008), lead_tasks(053),
--     lead_property_interest(002) [UNIQUE(lead_id,property_id) → tratar conflito],
--     visit_feedback(002), lead_distribution_log(068)
--   ON DELETE SET NULL (não perde a linha, mas perde o vínculo):
--     activities(001), campaign_entries(013)
--   ON DELETE NO ACTION (BLOQUEIA o delete se houver referência):
--     unit_sales(007).lead_id, properties(002).reserved_by_lead_id
--
-- Critério de identificação: telefone RAW (estável; não usar UUID fixo).
-- Pares conhecidos (2026-05-26):
--   Par 1 José Edson Biraia: ruim='04399873661'  sobrevivente='43999873661'
--   Par 2 Anezio Ribeiro   : ruim='55998041130'  sobrevivente='44998041130'
--   (Par 2 só precisa de merge se quiser consolidar dados; a recomputação já
--    zerou o phone_normalized da linha ruim sem conflito.)
--
-- ┌─ TEMPLATE (substituir os dois telefones; revisar contagens antes) ────────┐
-- DO $$
-- DECLARE
--   v_bad  uuid;
--   v_good uuid;
-- BEGIN
--   SELECT id INTO v_bad  FROM leads WHERE phone = '04399873661' LIMIT 1;
--   SELECT id INTO v_good FROM leads WHERE phone = '43999873661' LIMIT 1;
--   IF v_bad IS NULL OR v_good IS NULL OR v_bad = v_good THEN
--     RAISE NOTICE 'Par já mesclado ou não encontrado (bad=%, good=%)', v_bad, v_good;
--     RETURN;
--   END IF;
--
--   -- Reatribuir TODAS as filhas (CASCADE + SET NULL + NO ACTION):
--   UPDATE conversations          SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE appointments           SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE lead_facts             SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE lead_memories          SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE follow_up_rules        SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE lead_tasks             SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE visit_feedback         SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE lead_distribution_log  SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE activities             SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE campaign_entries       SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE unit_sales             SET lead_id = v_good WHERE lead_id = v_bad;
--   UPDATE properties             SET reserved_by_lead_id = v_good
--                                 WHERE reserved_by_lead_id = v_bad;
--   -- lead_property_interest tem UNIQUE(lead_id, property_id): mover só o que
--   -- o sobrevivente ainda não tem; o resto descarta (duplicado real):
--   DELETE FROM lead_property_interest bad
--     WHERE bad.lead_id = v_bad
--       AND EXISTS (SELECT 1 FROM lead_property_interest g
--                   WHERE g.lead_id = v_good AND g.property_id = bad.property_id);
--   UPDATE lead_property_interest  SET lead_id = v_good WHERE lead_id = v_bad;
--
--   -- (Opcional) copiar campos do bad p/ o good se o good estiver mais pobre.
--   DELETE FROM leads WHERE id = v_bad;
--   -- Recomputar a coluna gerada do sobrevivente:
--   UPDATE leads SET phone = phone WHERE id = v_good;
--   RAISE NOTICE 'MERGE ok: % consolidado em %', v_bad, v_good;
-- END;
-- $$;
-- └───────────────────────────────────────────────────────────────────────────┘
-- #############################################################################

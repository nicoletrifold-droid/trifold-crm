-- 215_meta_capi_outbox.sql
-- Story 86-2 (Epic 86 — Conversions API / rastreamento Meta).
--
-- Cria a tabela `meta_capi_outbox` (outbox pattern) e ESTENDE — sem substituir —
-- a função de trigger `log_lead_stage_change()` (migration 124) para enfileirar
-- um evento CAPI "Schedule" quando um lead entra no stage `visitou`.
--
-- Por que outbox pattern:
--   A detecção do evento é SÍNCRONA e roda dentro do banco (no mesmo trigger que
--   já registra `stage_change` em `activities`), garantindo que TODO caminho de
--   mudança de stage é coberto — inclusive o UPDATE direto do client no kanban
--   (kanban-board.tsx, drag-and-drop) que não passa por nenhuma API route. O
--   ENVIO à CAPI é ASSÍNCRONO (cron dispatcher — Story 86-4), lendo desta tabela
--   as linhas `status='pending'`. Desacoplar detecção de envio evita que uma
--   indisponibilidade da API do Meta bloqueie o kanban.
--
-- Por que estender a função 124 em vez de um 2º trigger:
--   Dois triggers na mesma coluna (`stage_id`) teriam ordem de execução não
--   determinística. Estender a função existente garante que a outbox só é
--   avaliada DEPOIS do insert crítico em `activities` (comportamento já testado
--   em produção — Story 75-72), preservando o "convergence point" único.
--
-- STAGE_IDS.visitou = '00000000-0000-0000-0001-000000000005'
--   Fonte de verdade: packages/shared/src/constants/stages.ts (const STAGE_IDS).
--   A função SQL NÃO importa TS, então o UUID é hardcoded abaixo. Qualquer
--   mudança futura em STAGE_IDS.visitou precisa ser sincronizada manualmente
--   nesta migration (mesmo risco assumido pelo trigger 124 original).
--
-- Idempotência do evento (decisão de escopo):
--   UNIQUE (lead_id, event_name) + ON CONFLICT DO NOTHING → o evento Visitou é
--   enfileirado UMA vez por lead. Se o lead sair de `visitou` e voltar, NÃO gera
--   segundo evento (reenviar a cada oscilação de kanban inflaria artificialmente
--   o volume do evento e distorceria a Custom Conversion usada em Lookalike).
--   "Visitou de novo" como novo evento é mudança de escopo para story futura.

-- ---------------------------------------------------------------------------
-- AC1 — Tabela `meta_capi_outbox`
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_capi_outbox (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id     uuid        NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  event_name  text        NOT NULL DEFAULT 'Schedule',
  -- event_id determinístico/opaco: 'visit_' || lead_id || '_' || random_uuid.
  -- O sufixo aleatório torna o event_id opaco; a unicidade real (1 por lead) é
  -- garantida pelo UNIQUE(lead_id, event_name) abaixo, não pelo sufixo.
  event_id    text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts    integer     NOT NULL DEFAULT 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- AC1 — 1 evento por lead+evento (idempotência); referenciado pelo
  -- ON CONFLICT do trigger.
  CONSTRAINT meta_capi_outbox_lead_event_uniq UNIQUE (lead_id, event_name)
);

-- AC1 — índice para a query do dispatcher (Story 86-4) buscar pendentes
-- ordenados por antiguidade: WHERE status = 'pending' ORDER BY created_at.
CREATE INDEX IF NOT EXISTS idx_meta_capi_outbox_status_created
  ON meta_capi_outbox (status, created_at);

COMMENT ON TABLE meta_capi_outbox IS
  'Story 86-2: outbox de eventos Meta CAPI. Enfileirado pelo trigger de stage change (SECURITY DEFINER) quando lead entra em visitou; consumido pelo cron dispatcher (86-4) via createAdminClient/service-role. RLS habilitada sem policies + REVOKE de authenticated/anon.';
COMMENT ON COLUMN meta_capi_outbox.event_id IS
  'ID opaco do evento no formato visit_<lead_id>_<random_uuid>. Unicidade lógica garantida por UNIQUE(lead_id, event_name), não pelo sufixo.';
COMMENT ON COLUMN meta_capi_outbox.status IS
  'pending (a enviar) | sent (confirmado pela CAPI) | failed (esgotou tentativas) | skipped (descartado por regra do dispatcher).';

-- ---------------------------------------------------------------------------
-- AC2 — RLS: tabela acessível SOMENTE via service-role (dispatcher cron).
--   O insert vem do trigger SECURITY DEFINER (contorna RLS, igual ao insert em
--   `activities`). Nenhuma policy é criada de propósito → authenticated/anon não
--   têm acesso. REVOKE explícito porque o Supabase concede GRANT ALL por padrão
--   a esses roles (gotcha "Supabase GRANT ALL default"), e GRANT ALL inclui
--   TRUNCATE, que NÃO passa por RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE meta_capi_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON meta_capi_outbox FROM authenticated, anon;
-- (sem CREATE POLICY de propósito — acesso apenas via service-role/owner.)

-- ---------------------------------------------------------------------------
-- AC3/AC4/AC5 — Estender log_lead_stage_change() para enfileirar na outbox.
--   Comportamento existente (insert em `activities`) preservado 100%. O bloco
--   novo roda DEPOIS e é isolado em BEGIN...EXCEPTION: uma falha ao enfileirar
--   na outbox NÃO propaga — apenas RAISE WARNING —, para que a garantia P0
--   (registro de stage_change em `activities` + o próprio UPDATE do lead) nunca
--   dependa do tracking Meta. Recriada via CREATE OR REPLACE (idempotente); o
--   trigger 124 continua apontando para esta função (não recriamos o trigger).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  from_name text;
  to_name   text;
BEGIN
  SELECT name INTO from_name FROM kanban_stages WHERE id = OLD.stage_id;
  SELECT name INTO to_name   FROM kanban_stages WHERE id = NEW.stage_id;

  INSERT INTO activities (org_id, lead_id, user_id, type, description, metadata)
  VALUES (
    NEW.org_id,
    NEW.id,
    auth.uid(),                       -- null em ações via service-role (cron/admin server) — OK
    'stage_change',
    'Etapa alterada de "' || COALESCE(from_name, 'Nenhuma') || '" para "' || COALESCE(to_name, '?') || '"',
    jsonb_build_object(
      -- formato "objeto" (igual ao endpoint admin) …
      'from_stage', CASE WHEN OLD.stage_id IS NULL THEN NULL
                         ELSE jsonb_build_object('id', OLD.stage_id, 'name', from_name) END,
      'to_stage',   jsonb_build_object('id', NEW.stage_id, 'name', to_name),
      -- … e formato "id" (igual ao kanban): mantém ambos os leitores compatíveis.
      'from_stage_id', OLD.stage_id,
      'to_stage_id',   NEW.stage_id
    )
  );

  -- [Story 86-2] Enfileirar evento CAPI "Schedule" quando o lead entra no
  -- stage `visitou`. STAGE_IDS.visitou (packages/shared/src/constants/stages.ts)
  -- = '00000000-0000-0000-0001-000000000005'. Isolado para não quebrar o fluxo
  -- crítico acima em caso de qualquer erro na outbox (AC4).
  IF NEW.stage_id = '00000000-0000-0000-0001-000000000005'::uuid THEN
    BEGIN
      INSERT INTO meta_capi_outbox (org_id, lead_id, event_name, event_id)
      VALUES (
        NEW.org_id,
        NEW.id,
        'Schedule',
        'visit_' || NEW.id || '_' || gen_random_uuid()
      )
      ON CONFLICT (lead_id, event_name) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Nunca propagar: o tracking Meta não pode virar ponto de falha do kanban.
      RAISE WARNING 'meta_capi_outbox enqueue falhou para lead % (org %): %',
        NEW.id, NEW.org_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger 124 (trg_log_lead_stage_change) NÃO é recriado — ele já aponta para
-- log_lead_stage_change(), que acabamos de estender via CREATE OR REPLACE.

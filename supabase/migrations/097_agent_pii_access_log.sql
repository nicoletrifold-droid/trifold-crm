-- 097_agent_pii_access_log.sql
-- Epic 52 — Story 52-4: Auditoria de Acesso a PII
--
-- Cria tabela append-only de auditoria (agent_pii_access_log) + função
-- log_pii_access(...) (SECURITY DEFINER, fail-safe) que serve de ponto de
-- entrada controlado para registrar acessos sensíveis pelo agente.
--
-- ===========================================================================
-- DECISÕES (documentadas no Change Log v0.3 da story)
-- ===========================================================================
-- 1) ROLE — fonte da verdade: public.users.role via public.user_role().
--    A story sugeria auth.jwt() -> 'app_metadata' ->> 'role'. CONFIRMADO no
--    código que app_metadata.role só é populado para role='cliente' (externos);
--    usuários internos (admin) têm app_metadata.role = NULL. Usar o JWT faria
--    a função SEMPRE retornar FALSE para admins reais. Adotado public.user_role().
--
-- 2) APPEND-ONLY EM DUAS CAMADAS:
--      (a) Ausência de GRANT UPDATE/DELETE ao role authenticated → o GRANT é
--          verificado ANTES da RLS no Postgres, portanto esta é a primeira
--          camada acionada: UPDATE/DELETE via authenticated falha com
--          "permission denied for table" antes mesmo de avaliar política RLS.
--      (b) Ausência de política RLS de UPDATE/DELETE (RLS habilitada) → segunda
--          camada defensiva; mesmo que um GRANT fosse concedido por engano,
--          sem política o comando afeta 0 rows.
--    Ordem no Supabase/PostgreSQL: GRANT (a) é avaliado primeiro.
--
-- 3) SECURITY DEFINER com verificação interna de role: a função roda com
--    privilégios do owner para conseguir inserir, mas verifica o role do
--    chamador (public.user_role()) ANTES de qualquer INSERT e valida que
--    p_org_id corresponde ao org do chamador (anti cross-tenant — R3).
--    EXCEPTION WHEN OTHERS THEN RETURN FALSE garante fail-safe (NFR-OBS-1):
--    qualquer falha resulta em FALSE sem propagar exceção SQL, permitindo à
--    52-2 implementar fail-closed.
--
-- 4) session_id: FK para agent_chat_sessions(id) com ON DELETE SET NULL —
--    o log NÃO deve quebrar nem ser apagado se a sessão for deletada; a
--    auditoria precisa sobreviver à sessão. Coluna aceita NULL.
--
-- 5) INTEGRIDADE DA AUDITORIA — admin_user_id NÃO confiável via parâmetro
--    (SEC-003, fix QA v0.4):
--    A versão anterior aceitava p_admin_user_id como parâmetro e o gravava
--    diretamente, permitindo a um admin forjar a trilha registrando acesso
--    em nome de OUTRO usuário da mesma org. CORRIGIDO: o parâmetro foi
--    REMOVIDO da assinatura; admin_user_id é SEMPRE derivado internamente de
--    public.public_user_id() (lê public.users.id por auth_id = auth.uid()),
--    a única fonte autoritativa do usuário que efetivamente chamou a função.
--    Resultado: a trilha de auditoria é INFALSIFICÁVEL por construção — não
--    há mais nenhum parâmetro através do qual outro user_id possa ser injetado.
--    A Story 52-2 NÃO deve mais passar adminUserId na chamada RPC.

-- ===========================================================================
-- TABELA agent_pii_access_log (AC2) — append-only
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.agent_pii_access_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  admin_user_id  UUID        NOT NULL,   -- public.users.id do admin que gerou o acesso
  session_id     UUID        REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  accessed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_type      TEXT        NOT NULL
                 CHECK (data_type IN ('lead_drill', 'conversation_content', 'aggregated_metrics')),
  scope          JSONB       NOT NULL,   -- {"lead_ids":[...],"campaign":"...","filters":{...}}
  view_or_source TEXT        NOT NULL    -- 'v_lead_drill' | 'v_lead_conversations' | ...
  -- append-only: UPDATE/DELETE não são concedidos ao role authenticated
);

COMMENT ON TABLE public.agent_pii_access_log IS
  'Epic52 52-4: trilha append-only de acessos a PII/conversa pelo agente. RLS admin+org; sem UPDATE/DELETE.';

-- ===========================================================================
-- RLS — habilitar + políticas SELECT/INSERT admin-strict (sem UPDATE/DELETE)
-- ===========================================================================
ALTER TABLE public.agent_pii_access_log ENABLE ROW LEVEL SECURITY;

-- Idempotência: dropar políticas antes de recriar (CREATE POLICY não tem IF NOT EXISTS)
DROP POLICY IF EXISTS "pii_log_admin_select_own_org" ON public.agent_pii_access_log;
DROP POLICY IF EXISTS "pii_log_admin_insert_only"    ON public.agent_pii_access_log;

CREATE POLICY "pii_log_admin_select_own_org" ON public.agent_pii_access_log
  FOR SELECT
  USING (
    public.user_role() = 'admin'
    AND org_id = public.user_org_id()
  );

CREATE POLICY "pii_log_admin_insert_only" ON public.agent_pii_access_log
  FOR INSERT
  WITH CHECK (
    public.user_role() = 'admin'
    AND org_id = public.user_org_id()
  );

-- DELIBERADAMENTE NENHUMA política de UPDATE nem DELETE (append-only camada b).

-- ===========================================================================
-- GRANTS — SELECT + INSERT apenas (AC3). Sem UPDATE/DELETE (append-only camada a).
-- ===========================================================================
-- ACHADO DE RUNTIME (dev xnxvygyfyyyzwhiuoehz, v0.5): o Supabase concede por
-- padrão GRANT ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER) aos roles `authenticated` E `anon` em objetos do schema public.
-- A RLS bloqueia UPDATE/DELETE de LINHAS (so ha policies INSERT+SELECT), MAS
-- TRUNCATE *NAO* passa por RLS — authenticated/anon poderiam truncar e apagar
-- TODA a trilha de auditoria, quebrando o append-only (NFR-SEC-4 / AC3).
-- Um simples GRANT SELECT,INSERT NAO revoga esse baseline amplo. Portanto o
-- enforcement append-only precisa ser DETERMINISTICO via REVOKE explicito —
-- nunca confiar na mera ausencia de GRANT.
--
-- Estado final desejado: authenticated = SELECT+INSERT; anon = nada;
-- PUBLIC = nada. service_role/postgres permanecem (privilegiados por design;
-- a mitigacao de service_role e a 52-2 usar apenas o client `authenticated`).
-- Ordem: REVOKE amplo PRIMEIRO, depois o GRANT final restritivo. REVOKE/GRANT
-- sao idempotentes — seguro re-aplicar.
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.agent_pii_access_log FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, SELECT, INSERT ON public.agent_pii_access_log FROM anon;
REVOKE ALL ON public.agent_pii_access_log FROM PUBLIC;
GRANT SELECT, INSERT ON public.agent_pii_access_log TO authenticated;

-- ===========================================================================
-- ÍNDICES DE SUPORTE (AC9) — idempotentes
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_pii_log_org_id
  ON public.agent_pii_access_log (org_id);

CREATE INDEX IF NOT EXISTS idx_pii_log_admin_accessed
  ON public.agent_pii_access_log (admin_user_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_log_session
  ON public.agent_pii_access_log (session_id);

-- ===========================================================================
-- FUNÇÃO log_pii_access (AC7) — SECURITY DEFINER, fail-safe, verificação de role
-- ===========================================================================
-- SEC-003 (fix QA v0.4): p_admin_user_id REMOVIDO da assinatura. O usuário que
-- registra o acesso é SEMPRE derivado de public.public_user_id() (auth.uid()),
-- nunca recebido como parâmetro — trilha infalsificável.
-- DROP da assinatura antiga (6 args) para a migration aplicar limpo caso já exista.
DROP FUNCTION IF EXISTS public.log_pii_access(UUID, UUID, UUID, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.log_pii_access(
  p_org_id        UUID,
  p_session_id    UUID,          -- NULL permitido
  p_data_type     TEXT,          -- 'lead_drill' | 'conversation_content' | 'aggregated_metrics'
  p_scope         JSONB,
  p_view_or_source TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public           -- evita search_path injection (R4)
AS $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  -- 1) Verificação de role: apenas admin pode registrar (AC6)
  IF public.user_role() IS DISTINCT FROM 'admin' THEN
    RETURN FALSE;
  END IF;

  -- 2) Anti cross-tenant (R3): o org informado deve ser o org do chamador
  IF p_org_id IS DISTINCT FROM public.user_org_id() THEN
    RETURN FALSE;
  END IF;

  -- 3) Fonte autoritativa do usuário que registra (SEC-003): SEMPRE auth.uid()
  --    via public.public_user_id(). Não há parâmetro de user_id — impossível
  --    forjar a trilha em nome de outro usuário. Fail-closed se não resolver
  --    (ex.: chamada sem JWT autenticado → NULL → violaria NOT NULL → FALSE).
  v_admin_user_id := public.public_user_id();
  IF v_admin_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 4) data_type válido
  IF p_data_type NOT IN ('lead_drill', 'conversation_content', 'aggregated_metrics') THEN
    RETURN FALSE;
  END IF;

  -- 5) Inserção da trilha (admin_user_id derivado, NÃO recebido)
  INSERT INTO public.agent_pii_access_log
    (org_id, admin_user_id, session_id, accessed_at, data_type, scope, view_or_source)
  VALUES
    (p_org_id, v_admin_user_id, p_session_id, now(), p_data_type, p_scope, p_view_or_source);

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    -- Fail-safe (NFR-OBS-1): qualquer falha → FALSE sem propagar exceção.
    -- A Story 52-2 interpreta FALSE como "negar acesso sensível" (fail-closed).
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, JSONB, TEXT) IS
  'Epic52 52-4: ponto de entrada de auditoria de PII. admin_user_id derivado internamente de public_user_id() (auth.uid()) — infalsificavel (SEC-003 fix). Retorna TRUE em sucesso, FALSE em qualquer falha/role-invalido/cross-tenant/sem-auth. SECURITY DEFINER com verificacao interna de role.';

GRANT EXECUTE ON FUNCTION public.log_pii_access(UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;

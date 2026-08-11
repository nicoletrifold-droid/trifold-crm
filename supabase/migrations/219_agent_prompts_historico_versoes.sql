-- 219_agent_prompts_historico_versoes.sql
-- Story 87-1 — governança do painel: quem mudou o prompt, quando, por quê, e como voltar.
--
-- POR QUE EXISTE
-- --------------
-- A decisão D-87-0-a (05/08/2026) fez do painel admin a fonte da verdade dos prompts da
-- Nicole. Isso resolveu a ambiguidade e transferiu para o painel um trabalho que o git
-- fazia de graça: histórico, autoria, motivo e rollback. O custo já foi medido duas vezes:
--
--   • `visit-scheduling` de 04/08/2026 17:28 UTC não corresponde a NENHUM commit e até hoje
--     ninguém sabe quem o editou — a divergência sobreviveu ~4 meses;
--   • em 10/08/2026 o @po mediu 3 de 7 slugs divergentes do snapshot 3 dias após ele subir;
--     duas dessas edições (`stand de vendas` → `sede da Trifold`) não têm story, commit
--     nem autor.
--
-- A tabela `agent_prompt_versions` responde "quem mudou isso?" em 30 segundos, e o
-- `previous_content` é o alvo de rollback (AC4) — melhor que o snapshot commitado, que
-- pode estar velho.
--
-- POR QUE TRIGGER, E NÃO VALIDAÇÃO NA APLICAÇÃO
-- ---------------------------------------------
-- Existem CINCO superfícies de escrita em `agent_prompts` (§Context da story): a server
-- action do painel, o PUT da API, dois scripts de seed e SQL direto (migrations, runbooks,
-- Management API). As duas escritas invisíveis que motivaram esta story vieram POR FORA
-- da aplicação. O trigger é o único ponto por onde TODA escrita passa.
--
-- 🔴 O TRIGGER NUNCA PODE ABORTAR O UPDATE (Risco 1 da story)
-- -----------------------------------------------------------
-- Ele roda na mesma transação do UPDATE. Um INSERT que falhe por RLS, NOT NULL, FK ou
-- tipo REVERTE a edição do prompt — e no próximo incidente ninguém consegue corrigir a
-- Nicole. Precedente literal neste repositório: a migration 125 é um hotfix de exatamente
-- isso (auth.uid() violando a FK de `activities.user_id` fazia o card do kanban voltar
-- sozinho). Daí, aqui:
--   (a) todo o corpo vive dentro de BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING —
--       histórico perdido é aceitável, prompt não gravado NÃO é;
--   (b) SECURITY DEFINER, senão a RLS da tabela nova bloqueia o próprio trigger;
--   (c) NENHUMA coluna NOT NULL sem default e NENHUMA foreign key na tabela de histórico —
--       um slug/usuário apagado no futuro não pode virar erro de escrita de prompt;
--   (d) AFTER UPDATE, e com nome próprio: `set_updated_at` (BEFORE UPDATE, função
--       `update_updated_at`) já existe nesta tabela desde 001_base_schema.sql:295 e
--       continua intocado.
--
-- COMO O MOTIVO CHEGA AQUI (decisão D2 — opção (a) das duas que o @po documentou)
-- ------------------------------------------------------------------------------
-- Um trigger de linha só enxerga NEW/OLD, e "motivo" não era coluna. Escolhida a coluna
-- `agent_prompts.last_change_reason`, escrita pela aplicação NO MESMO UPDATE do content.
-- A opção (b) — `set_config('app.change_reason', …)` lido por `current_setting` — exigiria
-- transformar toda escrita numa função RPC única (o supabase-js não compartilha transação
-- entre chamadas), o que reescreveria as duas superfícies da aplicação e ainda deixaria
-- SQL cru de fora. A coluna custa uma coluna e funciona por qualquer caminho.
--
-- 🔴 Restrição inegociável (story, Dev Notes): UPDATE SEM motivo AINDA GRAVA HISTÓRICO,
--    com `change_reason` nulo. Motivo ausente jamais pode virar escrita perdida — é
--    exatamente o caso do `visit-scheduling` de 04/08, e escondê-lo derrotaria a story.
--
-- ⚠️ O motivo só é creditado quando MUDA neste mesmo UPDATE
--    (`NEW.last_change_reason IS DISTINCT FROM OLD.last_change_reason`). Sem essa guarda,
--    um UPDATE por SQL cru herdaria o motivo da última edição do painel e o histórico
--    passaria a MENTIR sobre por que a mudança aconteceu — pior que não ter motivo.
--    Efeito colateral aceito: duas edições seguidas com o texto de motivo IDÊNTICO
--    registram a segunda como "não informado". Erra para menos, nunca para mais.
--
-- APLICAÇÃO
-- ---------
-- Manualmente, arquivo inteiro num POST na Supabase Management API (R-G do epic 87).
-- `supabase db push` é proibido neste projeto. Idempotente: pode ser reaplicada.

-- ---------------------------------------------------------------------------
-- (1) AC2 — o transporte do motivo até o trigger.
--     Nullable de propósito: SQL cru continua podendo escrever sem motivo.
-- ---------------------------------------------------------------------------
ALTER TABLE agent_prompts
  ADD COLUMN IF NOT EXISTS last_change_reason text;

COMMENT ON COLUMN agent_prompts.last_change_reason IS
  'Story 87-1: motivo da ÚLTIMA edição, escrito pela aplicação no mesmo UPDATE do content e copiado pelo trigger agent_prompts_versionar para agent_prompt_versions.change_reason. Não é histórico — o histórico é agent_prompt_versions.';

-- ---------------------------------------------------------------------------
-- (2) AC1 — a tabela de histórico.
--     Sem FK e sem NOT NULL-sem-default de propósito (item (c) acima).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_prompt_versions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sem REFERENCES agent_prompts(id): um DELETE futuro do slug não pode transformar
  -- o histórico numa fonte de erro de escrita (nem apagar o histórico junto).
  prompt_id           uuid,
  org_id              uuid,
  slug                text,
  name                text,
  -- O alvo de rollback da AC4. `new_content` também é guardado para que o diff de uma
  -- versão seja legível numa linha só, sem depender da linha seguinte.
  previous_content    text,
  new_content         text,
  change_reason       text,
  -- auth.uid() (auth.users) e public_user_id() (public.users) são IDs DIFERENTES; os dois
  -- ficam registrados porque uma escrita por service-role tem os dois nulos, e é
  -- justamente esse caso que precisa aparecer no histórico como "system".
  author_auth_id      uuid,
  author_user_id      uuid,
  author_label        text,
  previous_is_active  boolean,
  new_is_active       boolean,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_prompt_versions IS
  'Story 87-1: histórico de edições de agent_prompts, alimentado pelo trigger agent_prompts_versionar (AFTER UPDATE, SECURITY DEFINER). Uma linha por UPDATE que muda content ou is_active. Escrita SEM autor identificado aparece com author_label = system — isso é achado, não ruído.';
COMMENT ON COLUMN agent_prompt_versions.previous_content IS
  'Conteúdo ANTES da edição. É o alvo do rollback (runbook docs/runbooks/87-1-rollback-agent-prompts.md) — preferível ao snapshot commitado, que pode estar velho.';
COMMENT ON COLUMN agent_prompt_versions.change_reason IS
  'Motivo informado pela aplicação no mesmo UPDATE. NULL = escrita sem motivo (SQL cru, Management API, migration). NULL nunca impede o registro.';

-- Consulta da tela (AC3): últimas N versões de um slug, org por org.
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_org_slug_created
  ON agent_prompt_versions (org_id, slug, created_at DESC);

-- ---------------------------------------------------------------------------
-- (3) RLS da tabela nova: leitura admin (mesma assinatura da 098, Story 53-2 —
--     `098_harden_rls_agent_prompts_admin_only.sql`, NÃO a 096, que é o
--     crm_pipeline_readonly_layer). Nenhuma policy de escrita: quem escreve é o
--     trigger SECURITY DEFINER (roda como owner, ignora RLS) e o service-role.
--     REVOKE explícito porque o Supabase concede GRANT ALL por padrão a
--     anon/authenticated, e GRANT ALL inclui TRUNCATE, que NÃO passa por RLS.
--     PUBLIC entra no REVOKE porque um GRANT a PUBLIC fura o REVOKE de anon.
-- ---------------------------------------------------------------------------
ALTER TABLE agent_prompt_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON agent_prompt_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON agent_prompt_versions TO authenticated;

DROP POLICY IF EXISTS "agent_prompt_versions_select_admin" ON agent_prompt_versions;
CREATE POLICY "agent_prompt_versions_select_admin" ON agent_prompt_versions
  FOR SELECT USING (org_id = public.user_org_id() AND public.is_admin());

-- ---------------------------------------------------------------------------
-- (4) AC1 — a função do trigger.
--     Todo o corpo é um bloco protegido: qualquer falha vira WARNING e o UPDATE
--     do prompt segue. Perder uma linha de histórico é ruim; impedir a correção
--     de um prompt em produção durante um incidente é inaceitável.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_prompts_registrar_versao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason    text;
  v_auth_id   uuid;
  v_user_id   uuid;
  v_label     text;
BEGIN
  BEGIN
    -- Motivo só conta se veio NESTE update (senão o histórico herdaria o motivo antigo
    -- e passaria a atribuir uma justificativa a quem não a deu).
    v_reason := CASE
                  WHEN NEW.last_change_reason IS DISTINCT FROM OLD.last_change_reason
                    THEN NULLIF(btrim(NEW.last_change_reason), '')
                  ELSE NULL
                END;

    -- Cada lookup em seu próprio bloco: nenhum deles pode custar a linha de histórico.
    BEGIN
      v_auth_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_auth_id := NULL;
    END;

    BEGIN
      v_user_id := public.public_user_id();
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;

    BEGIN
      SELECT COALESCE(NULLIF(btrim(u.name), ''), u.email)
        INTO v_label
        FROM public.users u
       WHERE u.id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      v_label := NULL;
    END;

    INSERT INTO public.agent_prompt_versions (
      prompt_id, org_id, slug, name,
      previous_content, new_content, change_reason,
      author_auth_id, author_user_id, author_label,
      previous_is_active, new_is_active
    )
    VALUES (
      OLD.id, OLD.org_id, OLD.slug, OLD.name,
      OLD.content, NEW.content, v_reason,
      v_auth_id, v_user_id,
      -- 'system' é informação, não fallback cosmético: é assim que uma escrita por
      -- service-role / Management API (o caminho do incidente de 04/08) fica VISÍVEL.
      COALESCE(v_label, 'system'),
      OLD.is_active, NEW.is_active
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'agent_prompt_versions: falha ao registrar versao do slug % (org %): %',
      OLD.slug, OLD.org_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.agent_prompts_registrar_versao() IS
  'Story 87-1: grava em agent_prompt_versions a versão anterior de um prompt a cada UPDATE que muda content ou is_active. NUNCA propaga erro (Risco 1): o UPDATE do prompt sobrevive a qualquer falha do histórico.';

-- ---------------------------------------------------------------------------
-- (5) O trigger. AFTER UPDATE (o BEFORE é do `set_updated_at`, que carimba
--     updated_at e não pode competir com este).
--     WHEN: só versiona o que muda o que a Nicole lê — content ou is_active
--     (`loadAgentConfig` filtra is_active=true). Um save que não muda nada não
--     vira linha de histórico; histórico com ruído é histórico que ninguém lê.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS agent_prompts_versionar ON agent_prompts;
CREATE TRIGGER agent_prompts_versionar
  AFTER UPDATE ON agent_prompts
  FOR EACH ROW
  WHEN (
    OLD.content   IS DISTINCT FROM NEW.content
    OR OLD.is_active IS DISTINCT FROM NEW.is_active
  )
  EXECUTE FUNCTION public.agent_prompts_registrar_versao();

-- PostgREST precisa enxergar a coluna nova (last_change_reason) e a tabela nova,
-- senão a server action do painel recebe "column not found" no primeiro save.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (manual, se o histórico causar qualquer problema)
-- ============================================================================
-- DROP TRIGGER IF EXISTS agent_prompts_versionar ON agent_prompts;
-- DROP FUNCTION IF EXISTS public.agent_prompts_registrar_versao();
-- -- A tabela e a coluna podem ficar: são inertes sem o trigger, e derrubá-las
-- -- apagaria o histórico já registrado.
-- -- DROP TABLE IF EXISTS agent_prompt_versions;
-- -- ALTER TABLE agent_prompts DROP COLUMN IF EXISTS last_change_reason;
-- ============================================================================

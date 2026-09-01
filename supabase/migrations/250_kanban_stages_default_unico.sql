-- 250_kanban_stages_default_unico
-- Story 75-371 — a etapa padrão volta a ser ÚNICA por org, no banco.
--
-- POR QUÊ: a migration 086 já limpou este mesmo estrago ("Todos os stages tinham
-- is_default=true, causando indeterminismo ao criar leads via webhook"), mas o furo que
-- o produziu ficou aberto: `POST/PATCH /api/stages` gravam `is_default = true` sem zerar
-- o padrão anterior, e não havia constraint. `getDefaultStageId`
-- (lib/leads/default-stage.ts) faz `.single()` em `is_default = true` — com dois padrões
-- a consulta falha e todo lead novo cai no fallback "primeira etapa por posição".
--
-- Estado medido em produção (01/09/2026, ref dsopqkqjkmhytudaaolv): 1 org, 17 etapas,
-- exatamente 1 padrão ("Aguardando atendimento", slug=novo, position=0). O datafix abaixo
-- é no-op hoje; existe para a migration ser idempotente em qualquer ambiente.

-- 1. Datafix: no máximo um padrão por org. Sobra o de MENOR position — em prod é
--    justamente "Aguardando atendimento" (position 0), a porta de entrada do funil.
UPDATE kanban_stages k
   SET is_default = false
 WHERE k.is_default
   AND k.id <> (
     SELECT k2.id
       FROM kanban_stages k2
      WHERE k2.org_id = k.org_id
        AND k2.is_default
      -- is_active primeiro: eleger uma etapa INATIVA como padrão sobrevivente
      -- reproduziria a patologia que esta migration existe para fechar (lead novo
      -- nascendo em etapa que o Pipeline não mostra). @qa QA-75-371-3.
      ORDER BY k2.is_active DESC, k2.position ASC, k2.created_at ASC, k2.id ASC
      LIMIT 1
   );

-- 2. A invariante, no banco. Índice parcial: só as linhas com is_default entram, então
--    N etapas não-padrão por org continuam livres.
CREATE UNIQUE INDEX IF NOT EXISTS kanban_stages_default_unico_por_org
    ON kanban_stages (org_id)
 WHERE is_default;

-- 3. Marcar uma etapa como padrão TIRA o padrão da anterior, na mesma transação.
--    Sem isto o índice do passo 2 transformaria o bug silencioso num erro 500 na cara
--    de quem marca o checkbox — o comportamento certo é ceder o posto, não recusar.
--    Vale para qualquer escritor (rota, SQL direto, seed, service role), que é o motivo
--    de ser trigger e não dois statements na rota: dois statements não são atômicos e,
--    se o INSERT falhasse depois do UPDATE, a org ficaria SEM padrão nenhum.
CREATE OR REPLACE FUNCTION kanban_stages_default_unico()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- GUARDA DO ON CONFLICT (@qa QA-75-371-2). Em `INSERT ... ON CONFLICT (org_id, slug)
  -- DO NOTHING` — que é como `provision_org()` semeia os 11 stages de uma org nova
  -- (migration 246), declaradamente idempotente — o Postgres roda o trigger BEFORE
  -- INSERT ANTES de arbitrar o conflito, e NÃO desfaz o efeito colateral quando
  -- descarta a linha. Sem esta guarda, reexecutar `provision_org` numa org existente
  -- zerava o padrão dela e o INSERT do 'Novo' era descartado: org com ZERO padrões,
  -- exatamente o estado que esta migration existe para impedir.
  --
  -- Trocar para AFTER INSERT não resolve: o índice único parcial do passo 2 é checado
  -- na hora da inserção da linha e não pode ser DEFERRABLE, então o INSERT estouraria
  -- antes de qualquer AFTER rodar.
  --
  -- A leitura é confiável porque existe `kanban_stages_org_id_slug_key`
  -- (UNIQUE (org_id, slug), conferido em prod): se a linha já existe, este INSERT não
  -- pode virar inserção — ou é descartado, ou estoura. Nos dois casos não há posto a
  -- ceder. E `ON CONFLICT DO UPDATE`, se algum dia for usado, entra pelo ramo de
  -- UPDATE deste mesmo trigger.
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM kanban_stages WHERE org_id = NEW.org_id AND slug = NEW.slug
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_default THEN
    -- Recursão é inofensiva: este UPDATE grava is_default = false e o IF não reentra.
    UPDATE kanban_stages
       SET is_default = false
     WHERE org_id = NEW.org_id
       AND is_default
       AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Direitos do INVOCADOR de propósito (sem SECURITY DEFINER): quem escreve em
-- kanban_stages já passou pela RLS que exige has_capability('configuracoes.pipeline_editar')
-- (migration 229), então o UPDATE nos irmãos da mesma org passa. Nada a escalar aqui.

DROP TRIGGER IF EXISTS trg_kanban_stages_default_unico ON kanban_stages;
CREATE TRIGGER trg_kanban_stages_default_unico
    BEFORE INSERT OR UPDATE OF is_default ON kanban_stages
    FOR EACH ROW
    EXECUTE FUNCTION kanban_stages_default_unico();

-- ROLLBACK PLAN:
-- DROP TRIGGER IF EXISTS trg_kanban_stages_default_unico ON kanban_stages;
-- DROP FUNCTION IF EXISTS kanban_stages_default_unico();
-- DROP INDEX IF EXISTS kanban_stages_default_unico_por_org;
-- (o datafix do passo 1 não é revertido: o estado que ele produz é o correto)

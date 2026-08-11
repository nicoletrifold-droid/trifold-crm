-- ============================================================================
-- Story 87-13 — PASSO 4: devolve Japura e Solum ao CRM, fechando a dívida do
-- paliativo de 10/08.
--
-- 🔴 NÃO APLICAR JUNTO COM A 220. Esta migration é o QUARTO passo de uma ordem
-- de quatro, e só sai DEPOIS da janela de observação de 24 h:
--
--   1. migration 220  →  2. deploy do código  →  3. janela de 24 h  →  4. AQUI
--
-- Por que ela vem depois da janela, e não junto: nas primeiras 24 h o rollback é
-- "reverter o PR", sem tocar em nenhum dado, porque Japura e Solum continuam
-- `is_active = false` e o paliativo ainda segura. Depois desta migration, um
-- rollback de código OS TRAZ DE VOLTA ao contexto da Nicole — e por isso a
-- instrução de desfazê-la está escrita no critério de rollback da story. Um passo
-- de ordem que custa 24 h e compra um rollback limpo.
--
-- Executor: @data-engineer (R-B — restauração de dado em produção).
-- Backup dos 4 registros antes do paliativo: `scratchpad/BACKUP-properties-104357.json`.
--
-- O QUE ELA CONSERTA
-- ------------------
-- Em 10/08 13:45:54 UTC os dois foram desligados com `is_active = false`. Mas
-- `is_active` NÃO é "visível para a Nicole" — é o SOFT DELETE da tabela
-- (`softDelete`, packages/web/src/lib/api-utils.ts:29-49). Dos 47 call sites de
-- `from("properties")`, 39 são SELECT com `.eq("is_active", true)`. Ou seja: o
-- paliativo não escondeu os dois da Nicole, ELE OS EXCLUIU DO CRM — sumiram da
-- lista de Empreendimentos, do seletor das telas de lead, do painel do corretor,
-- do `enrich-leads`, da roleta, do analytics — e do VÍNCULO DE LEAD, que é
-- exatamente a função para a qual eles foram cadastrados (Story 75-281).
--
-- Depois desta migration os dois voltam a existir no CRM e continuam FORA da boca
-- da Nicole — agora pelo campo certo (`nicole_enabled = false`, da 220). Dois
-- conceitos, dois campos.
--
-- POR QUE POR `id`, E NÃO POR `slug`
-- ----------------------------------
-- O slug do Solum é `solun`, com "n" (Achado nº 1 da própria story, ainda em
-- aberto). Um `where slug in ('japura','solun')` afetaria ZERO LINHAS EM SILÊNCIO
-- no dia em que alguém corrigir o slug — o mesmo modo de falha mudo que esta
-- story inteira existe para atacar. ids medidos contra produção em 11/08.
--
-- ROLLBACK desta migration (parte do rollback da story pós-passo 4):
--   update public.properties set is_active = false
--    where id in ('fcbd2a01-7c59-48b0-8e88-f5a68f4970cd',
--                 '5694ecf1-eb53-4d9e-bb82-4c06f0b19690');
--   -- conferir: exatamente 2 linhas afetadas
--
-- Aplicar por Supabase Management API, ARQUIVO INTEIRO NUM ÚNICO POST.
-- ============================================================================

begin;

do $$
declare
  afetadas integer;
begin
  update public.properties
     set is_active = true
   where id in (
     'fcbd2a01-7c59-48b0-8e88-f5a68f4970cd',  -- Japura (slug 'japura')
     '5694ecf1-eb53-4d9e-bb82-4c06f0b19690'   -- Solum  (slug 'solun', com "n")
   );

  get diagnostics afetadas = row_count;

  -- A mesma guarda da 220, e pela mesma razão: uma restauração que afeta 1 ou 0
  -- linhas sem avisar seria lida como "nada a restaurar".
  if afetadas <> 2 then
    raise exception
      'Story 87-13 / migration 221: a restauração esperava afetar EXATAMENTE 2 linhas, afetou %. '
      'Confira os ids contra `select id, name, slug from properties order by created_at, name`.', afetadas;
  end if;
end $$;

-- Guarda de segurança: esta migration NÃO pode ligar a Nicole em ninguém. Se o
-- `nicole_enabled` dos dois não estiver `false` neste ponto, alguma coisa entre a
-- 220 e aqui mexeu no switch — e restaurar o `is_active` os poria de volta no
-- contexto. Aborta em vez de fazer isso em silêncio.
do $$
declare
  ligados integer;
begin
  select count(*) into ligados
    from public.properties
   where id in ('fcbd2a01-7c59-48b0-8e88-f5a68f4970cd',
                '5694ecf1-eb53-4d9e-bb82-4c06f0b19690')
     and nicole_enabled;

  if ligados <> 0 then
    raise exception
      'Story 87-13 / migration 221: % dos dois empreendimentos está(ão) com nicole_enabled = true. '
      'Restaurar o is_active agora os devolveria ao contexto da Nicole. Abortado.', ligados;
  end if;
end $$;

commit;

-- ── Conferência depois de aplicar (AC9) ──────────────────────────────────────
-- select name, slug, is_active, nicole_enabled from properties
--  where id in ('fcbd2a01-7c59-48b0-8e88-f5a68f4970cd',
--               '5694ecf1-eb53-4d9e-bb82-4c06f0b19690');
-- -- Japura   japura   true   false
-- -- Solum    solun    true   false

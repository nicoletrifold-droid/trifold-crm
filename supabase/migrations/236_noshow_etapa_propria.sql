-- Story 75-358 — A etapa No-Show volta a existir, com UUID próprio.
--
-- O diagnóstico (produção, 20/08/2026): `STAGE_IDS.no_show` aponta para
-- `00000000-0000-0000-0001-000000000009`, que HOJE é a etapa **"Atendimento"** —
-- 129 leads. A `011_noshow_stage.sql` criou essa linha como
-- `'No-Show','no-show','no_show'`, mas em 08/06/2026 ela foi renomeada pela tela
-- Configurações → Pipeline. Sobrou o slug `no-show` denunciando a troca:
--
--   id=…0009  name='Atendimento'  slug='no-show'  type='novo'  position=4
--
-- Nenhuma linha de `kanban_stages` tem `type='no_show'`: o board não tem coluna
-- No-Show. Com isso, `pipeline.ts:720` injetava o NO-SHOW CONTEXT para TODO lead
-- em Atendimento, e a Nicole abria a conversa acusando de furar visita quem nunca
-- agendou nada — os 4 de 4 leads que responderam ao cron das 11:00 de 20/08, os
-- quatro com ZERO linhas em `appointments`. Do outro lado, o no-show REAL
-- (`applyNoShowFeedback`, detector de 48h) era despejado nesse mesmo balaio.
--
-- Decisão do Marcos (20/08): criar a coluna No-Show entre "Visita Agendada" e
-- "Visitou". Quem faltou volta a ser visível para o comercial.
--
-- 🔥 A `…0009` NÃO é tocada além do slug. Ela é a "Atendimento" que 129 leads e o
-- `supremo-sync` usam hoje; foi mexer nela que causou tudo isto. A etapa nova
-- nasce com UUID novo (`…0011`).
--
-- ⚠️  ESTA MIGRATION VAI EM **DOIS POSTS** NA MANAGEMENT API. `ALTER TYPE ... ADD
--     VALUE` pode rodar dentro de transação no PG 12+, mas o valor novo NÃO pode
--     ser USADO na mesma transação ("unsafe use of new value of enum type") — e
--     cada POST /database/query é uma transação implícita. Rode a Parte 1
--     sozinha, depois a Parte 2. Mesma classe de pegadinha do
--     `CREATE INDEX CONCURRENTLY` (reference_supabase_management_api_tx).

-- ===========================================================================
-- PARTE 1 — POST separado, sozinho
-- ===========================================================================
-- O enum de produção não tem 'no_show': o `ALTER TYPE` da 011 nunca chegou lá
-- (é o que explica `type='novo'` na linha renomeada). Enquanto faltar o valor, a
-- opção "No Show" dos modais de criar/editar etapa grava 22P02 — mesma armadilha
-- do `lead_source` (mig 181).
alter type stage_type add value if not exists 'no_show';

-- ===========================================================================
-- PARTE 2 — POST seguinte
-- ===========================================================================

-- 2.1 O slug para de mentir sobre o nome.
--
-- Slug mentindo é a pista que fez este bug demorar 73 dias para aparecer, e é
-- `slug` que dá o `ON CONFLICT (org_id, slug)` do seed — sem liberar `no-show`
-- aqui, o INSERT de 2.2 colidiria com a linha da "Atendimento".
update public.kanban_stages
   set slug = 'atendimento',
       updated_at = now()
 where id = '00000000-0000-0000-0001-000000000009'
   and slug = 'no-show';

-- 2.2 Abre espaço na posição de "Visitou" e insere No-Show ali.
--
-- Sem constraint UNIQUE em (org_id, position) — o shift é só para a ordem de
-- exibição do board não ficar com duas colunas empatadas.
update public.kanban_stages
   set position = position + 1,
       updated_at = now()
 where org_id = '00000000-0000-0000-0000-000000000001'
   and position >= 7;

insert into public.kanban_stages (id, org_id, name, slug, type, position, color, is_default, is_active)
values (
  '00000000-0000-0000-0001-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'No-Show', 'no-show-real', 'no_show', 7, '#F43F5E', false, true
)
on conflict (id) do update set
  name     = excluded.name,
  type     = excluded.type,
  position = excluded.position,
  color    = excluded.color,
  is_active = true;

comment on column public.kanban_stages.slug is
  'Story 75-358 — slug NÃO acompanha renomeação feita na UI: a …0009 virou "Atendimento" em 08/06/2026 e ficou com slug "no-show" por 73 dias, enganando quem lia o banco. Ao renomear etapa, conferir o slug.';

-- 2.3 Verificação — o retorno do POST é o resultado do ÚLTIMO statement.
select id, name, slug, type, position
  from public.kanban_stages
 where org_id = '00000000-0000-0000-0000-000000000001'
 order by position;

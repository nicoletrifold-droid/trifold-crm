-- ============================================================================
-- Story 87-13 — um switch POR EMPREENDIMENTO decide se a Nicole pode falar dele.
--
-- PREFIXO: 220. Conferido em `supabase/migrations/` na `main` (f885b06a) em
-- 11/08/2026: o maior prefixo aplicado é o 218 (Story 87-6, PR #383, `24932de3`);
-- o 219 está REIVINDICADO pela Story 87-1 (PR #391, aberto, não mergeado). O
-- prefixo `NNN_` é convenção só do repositório — em produção,
-- `supabase_migrations.schema_migrations` versiona por timestamp e não colide.
--
-- ✅ RECONFERIDO PELO @devops NA ABERTURA DO PR (11/08/2026, `origin/main` em
--    `72439220`) — 220 e 221 SEGUEM LIVRES, mantidos. **Sem renumeração**, e ela
--    não seria trivial: a 220 já foi APLICADA EM PRODUÇÃO com este nome.
--    Mudou uma coisa desde a conferência do @dev: o **219 foi consumido pela
--    `main`** por `219_fvs_fundacao.sql` (Story 75-293, PR #392, `72439220`,
--    mergeado 11/08 10:11 -03) — ou seja, o 219 NÃO é mais do 87-1. Quem colide
--    agora é o **PR #391**, que traz `219_agent_prompts_historico_versoes.sql`
--    para um prefixo já ocupado; é o #391 que precisa renumerar (222+), não esta
--    story. `git log --all` não devolve nenhum arquivo `220_` nem `221_` em
--    branch alguma.
--
-- O DEFEITO
-- ---------
-- Até aqui, o único critério que decidia se um empreendimento entrava no contexto
-- da Nicole era `properties.is_active` — que é o SOFT DELETE da tabela
-- (`softDelete`, packages/web/src/lib/api-utils.ts:29-49, chamado pelo
-- `DELETE /api/properties/[id]`; 39 dos 47 call sites de `from("properties")`
-- filtram por ele). Ou seja: o critério era "ele não foi excluído".
-- **Cadastrar bastava para entrar na boca dela, no mesmo turno.**
--
-- POR QUE COLUNA, E NÃO CHAVE EM `commercial_rules`
-- -------------------------------------------------
-- Uma flag de controle escondida num JSONB é uma superfície de configuração
-- invisível ao `information_schema`, ao `select` do runtime e a qualquer
-- inventário — que é a definição do problema que a Story 87-0 existe para não
-- repetir. Nome em inglês, como toda coluna desta tabela; rótulo em pt-BR na tela.
--
-- POR QUE O DEFAULT É `false`
-- ---------------------------
-- É a escolha entre dois modos de falha, e esta casa já viveu os dois:
--   default ligado  ⇒ falha = "esqueceram de desligar": silenciosa, sem dono,
--                     descoberta por acidente (a classe da Célia, 5 semanas).
--   default deslig. ⇒ falha = "esqueceram de ligar": barulhenta e com dono — o
--                     corretor pergunta por que a Nicole não fala do lançamento.
--
-- ORDEM DE DEPLOY — ESTA MIGRATION É PRÉ-REQUISITO DO CÓDIGO
-- ----------------------------------------------------------
--   1. 220 (aqui)  →  2. deploy do código  →  3. janela de 24 h  →  4. 221
-- Código antes da migration ⇒ `.eq("nicole_enabled", true)` contra coluna
-- inexistente ⇒ erro do PostgREST ⇒ `if (error || !data) return []`
-- (pipeline.ts) ⇒ a Nicole perde o contexto de TODOS os empreendimentos, em
-- silêncio. Catastrófico e mudo.
--
-- ROLLBACK: `alter table public.properties drop column nicole_enabled;`
--   ⚠️ SOMENTE enquanto o passo 2 não subiu. Com o código no ar, derrubar a
--   coluna reproduz EXATAMENTE a catástrofe muda acima. Depois do passo 2 o
--   rollback é reverter o PR primeiro, a coluna depois (ou nunca — ela é inerte).
--
-- Aplicar por Supabase Management API, ARQUIVO INTEIRO NUM ÚNICO POST.
-- `supabase db push` é proibido (R-G do Epic 87).
-- ============================================================================

begin;

alter table public.properties
  add column if not exists nicole_enabled boolean not null default false;

comment on column public.properties.nicole_enabled is
  'Story 87-13 — a Nicole (IA) só consome empreendimentos com este campo TRUE: '
  'ele filtra `loadProperties` (packages/ai/src/chat/pipeline.ts), que alimenta os '
  'três consumidores do turno (identifyProperty, checkYardenGate e '
  'buildPropertyDataContext). Desligado ⇒ ela não menciona, não reconhece o nome e '
  'não envia mídia do empreendimento. NÃO CONFUNDIR COM `is_active`, que é o SOFT '
  'DELETE da tabela: `is_active` = existe no CRM; `nicole_enabled` = a IA fala dele. '
  'Foi empilhar os dois significados no mesmo booleano que produziu esta story.';

-- ── Backfill: uma DECISÃO NOMEADA, não uma fórmula ────────────────────────────
-- Por `id`, nunca `where status = 'selling'`. Uma fórmula é a mesma doença de
-- novo: no dia em que alguém cadastrar o próximo `selling`, ele entra na boca
-- dela sozinho — e a story inteira existe para acabar com isso. Estes dois ids
-- são a decisão do Gabriel de 10/08, conferidos contra produção pelo @po em 11/08
-- e remedidos pelo @dev em 11/08 (batem com o `metadata->>'property_id'` dos 126
-- eventos `PROPERTY_IDENTIFIED` all-time).
do $$
declare
  afetadas integer;
begin
  update public.properties
     set nicole_enabled = true
   where id in (
     '00000000-0000-0000-0004-000000000001',  -- Vind Residence (selling, 1 tipologia, 48 un.)
     '00000000-0000-0000-0004-000000000002'   -- Yarden         (selling, 2 tipologias, 60 un.)
   );

  get diagnostics afetadas = row_count;

  -- Guarda obrigatória: um backfill que afeta 1 ou 0 linhas em silêncio é o
  -- mesmo modo de falha mudo que esta story existe para atacar.
  if afetadas <> 2 then
    raise exception
      'Story 87-13 / migration 220: o backfill esperava afetar EXATAMENTE 2 linhas, afetou %. '
      'Confira os ids contra `select id, name, slug from properties order by created_at, name` '
      'antes de reaplicar.', afetadas;
  end if;
end $$;

commit;

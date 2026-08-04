-- ===========================================================================
-- Migration 212 — Motivo de perda estruturado + view de classificação do legado
-- Story 75-264
-- ===========================================================================
-- O QUE CRIA:
--   1. Coluna leads.lost_reason_grupo (TEXT + CHECK, 6 grupos + 'outro').
--   2. View v_lead_lost_reason_grupo — classifica o HISTÓRICO (texto livre) por
--      heurística e respeita o grupo estruturado quando existe (dado novo).
--
-- POR QUÊ:
--   leads.lost_reason é texto livre: medido em prod em 2026-08-04, 614 valores
--   distintos em 1.042 leads perdidos (985 com texto). Todo relatório de motivo
--   de perda era reconstrução por regex fora do banco — irreproduzível.
--
-- DECISÕES DE DESIGN:
--   - TEXT + CHECK (não enum PG): grupos são nossos e podem evoluir; enum exige
--     migration para cada valor e a 75-262 acabou de pagar o preço de constraint
--     fechada demais (mig 211).
--   - A observação livre CONTINUA em lost_reason (a story manda manter). O
--     servidor grava o rótulo do grupo em lost_reason quando o corretor não
--     comenta — o analytics conta "perdido" pela PRESENÇA de lost_reason
--     (get_analytics_summary*, executive.ts); grupo sem texto sumiria da
--     contagem (ressalva R1 do PO).
--   - A ORDEM do CASE da view é PARTE DA DEFINIÇÃO da heurística (mover um
--     ramo muda a atribuição de dezenas de leads). Não reordenar sem re-medir.
--
-- SEGURANÇA (precedente mig 096):
--   - security_invoker = on + filtro embutido: role admin + org própria.
--     O predicado do WHERE é o controle load-bearing, não o invoker.
--
-- COBERTURA MEDIDA EM PROD (2026-08-04, base 1.042 perdidos — AC4):
--   nao_conseguimos_falar 427 (41,0%) · sem_interesse 240 (23,0%) ·
--   nao_qualifica_preco 102 (9,8%) · fora_perfil_regiao 41 (3,9%) ·
--   foi_para_outro 36 (3,5%) · clicou_sem_intencao 33 (3,2%) ·
--   duplicado_teste_corretor 27 (2,6%) · sem_motivo 57 (5,5%) ·
--   nao_classificado 79 (7,6%).
--   => 92,0% dos textos classificados. A view é HEURÍSTICA sobre dado legado —
--   não tratar como verdade absoluta; o agente recebe a cobertura declarada.
-- ===========================================================================

-- ── 1. Coluna estruturada ──────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason_grupo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_lost_reason_grupo_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_lost_reason_grupo_check
      CHECK (lost_reason_grupo IS NULL OR lost_reason_grupo IN (
        'nao_conseguimos_falar',
        'sem_interesse',
        'nao_qualifica_preco',
        'fora_perfil_regiao',
        'foi_para_outro',
        'clicou_sem_intencao',
        'outro'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.lost_reason_grupo IS
  'Motivo de perda ESTRUTURADO (6 grupos + outro), escolhido pelo humano ao marcar perdido. '
  'A observação livre continua em lost_reason, ao lado. Anulado junto com lost_reason em toda '
  'reativação (convenção: perdido = ETAPA, motivo não pode ficar residual). Story 75-264.';

-- ── 2. View de classificação (legado por heurística, novo pelo campo) ──────

CREATE OR REPLACE VIEW public.v_lead_lost_reason_grupo
WITH (security_invoker = on) AS
SELECT
  l.id,
  l.org_id,
  l.created_at,
  l.source,
  l.stage_id,
  l.lost_reason,
  l.lost_reason_grupo,
  -- Dado novo (estruturado) SEMPRE vence a heurística (AC7).
  COALESCE(
    l.lost_reason_grupo,
    CASE
      WHEN l.lost_reason IS NULL OR trim(l.lost_reason) = '' THEN 'sem_motivo'
      ELSE (
        -- Heurística sobre texto legado. r = texto normalizado.
        -- A ORDEM É PARTE DA DEFINIÇÃO — ver header.
        SELECT CASE
          -- 1:1 com os 11 labels do antigo select do bulk (leads-bulk-table)
          WHEN r = 'cliente nao atende/responde mais' THEN 'nao_conseguimos_falar'
          WHEN r = 'comprou com concorrente' THEN 'foi_para_outro'
          WHEN r IN ('condicao de pagamento','cpf com restricao','preco','renda insuficiente') THEN 'nao_qualifica_preco'
          WHEN r = 'desistiu de comprar' THEN 'sem_interesse'
          WHEN r = 'lead duplicado' THEN 'duplicado_teste_corretor'
          WHEN r = 'nao interesse' THEN 'sem_interesse'
          WHEN r = 'telefone inexistente' THEN 'nao_conseguimos_falar'
          WHEN r = 'outros' THEN 'nao_classificado'
          -- Frases explícitas de "não conseguimos falar" vencem os demais grupos
          WHEN r ~ '(nao consegui falar|nao foi possivel falar|nao consegui contato|nao conseguimos falar|nao conseguimos contato)' THEN 'nao_conseguimos_falar'
          WHEN r ~ '(duplicado|duplicidade|teste|corretor|colaborador|funcionario|portal|buscando clientes|prospec)' THEN 'duplicado_teste_corretor'
          WHEN r ~ '(concorrente|comprou|compro outr|compradu|ja adquiriu|ja fechou|fechando (uma|um)|ja achou|fez aquisicao|fez proposta|investiu em outr)' THEN 'foi_para_outro'
          WHEN r ~ '(curios|sem querer|clicou (por|sem|errado)|nao lembra|nao se lembra|nunca entrou|engano|enganou|enviou errado|acessou errado|nao preencheu|nao se inscreveu|nao se cadastrou|mexeu no celular|sorteio)' THEN 'clicou_sem_intencao'
          WHEN r ~ '(perfil|regiao|cidade|mora (em|fora)|outro estado|distante|localizacao|longe|londrina|paranavai|arapongas|cianorte|praia|embora de|quer casa|preferiu casa|quer alugar|esta alugando|quer um imovel proximo)' THEN 'fora_perfil_regiao'
          WHEN r ~ '(renda|restricao|cpf|score|serasa|spc|condicoes financeiras|condicao de pagamento|poder de compra|(sem|nao tem) condic|preco|caro|valor|orcamento|entrada|financiamento|nao qualifica|menor de idade|adolescente|desempregad|emprego|busca trabalho|nome sujo|credito|baixo padrao|sem dinheiro|nao tem dinheiro|vender o|venda do|nao vendeu)' THEN 'nao_qualifica_preco'
          WHEN r ~ '(atende|respond|interacao|interag|retorn|contato|bloque|numero (errado|inexistente|invalido)|deu o numero|nao existe|inexistente|sem resposta|caixa postal|tentativas|so chama|desligou o celular|telefone)' THEN 'nao_conseguimos_falar'
          WHEN r ~ '(interess|desis|nao quer|nao tem inten|apenas pesquisando|so pesquisando|nao pretende|nao esta procurando|especulando|momento|vai aguardar|deixar (para|pro)|proximo ano|fora dos planos|mudou os planos|outras obrigacoes|nao consegue (assumir|investir|fazer)|nao vai conseguir vir|nao consegue vir)' THEN 'sem_interesse'
          ELSE 'nao_classificado'
        END
        FROM (SELECT lower(public.f_unaccent(trim(l.lost_reason))) AS r) t
      )
    END
  ) AS grupo_final,
  CASE WHEN l.lost_reason_grupo IS NOT NULL THEN 'estruturado' ELSE 'heuristica' END AS fonte
FROM public.leads l
WHERE l.stage_id IN (
    '00000000-0000-0000-0001-000000000008',  -- Perdido
    '95327bd7-3e88-4038-aa16-250a74ab085c'   -- Não Qualificado
  )
  -- FILTRO DE SEGURANÇA (admin-strict + isolamento org — precedente mig 096)
  AND public.user_role() = 'admin'
  AND l.org_id = public.user_org_id();

GRANT SELECT ON public.v_lead_lost_reason_grupo TO authenticated;

COMMENT ON VIEW public.v_lead_lost_reason_grupo IS
  'Story 75-264: motivo de perda por grupo. Dado novo = lost_reason_grupo (estruturado, fonte=estruturado); '
  'legado = HEURÍSTICA por regex sobre lost_reason normalizado (fonte=heuristica). Cobertura medida em prod '
  'em 2026-08-04 sobre 1.042 perdidos: 92,0% dos textos classificados; 7,6% nao_classificado; 5,5% sem_motivo. '
  'NÃO tratar a parte heurística como verdade absoluta. A ordem do CASE é parte da definição. '
  'Admin-only + org própria embutidos no WHERE (security_invoker on).';

-- ROLLBACK PLAN:
--   DROP VIEW IF EXISTS public.v_lead_lost_reason_grupo;
--   ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_reason_grupo_check;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS lost_reason_grupo;

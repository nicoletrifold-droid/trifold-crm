-- 208_marketing_posts_artes.sql
-- Story 75-255 — UMA ARTE POR TELA do story.
--
-- O motor gerava UMA arte por post enquanto a Lídia propõe 2 telas de story: a
-- tela 2 saía só com texto, e o marketing produzia a segunda à mão (justamente a
-- do CTA). O preview da 75-254 foi construído para revelar isso, e revelou.
--
-- POR QUE COLUNA jsonb E NÃO TABELA NOVA:
--   • segue a convenção da casa — arte_arquivos, cores e fontes já são jsonb;
--   • não exige policy de RLS nova (herda a de marketing_posts);
--   • essas linhas nunca são consultadas relacionalmente: são exibidas junto do
--     post e sempre inteiras.
--
-- 🔴 `arte_url` CONTINUA EXISTINDO e apontando para a arte da TELA 1. É o que a
-- miniatura do card, o `removerArteAntiga` e o preview já leem. Quebrar isso seria
-- trocar um bug por outro. Quem escreve mantém os dois em sincronia — há UMA
-- função responsável por isso no arte-service.
--
-- Formato de `artes`:
--   [{"ordem": 1, "url": "https://…", "descricao": "…", "cta": "…"}, …]
--
-- Idempotente. O número é 208 (e não 207) porque o 207 ficou publicamente
-- reservado ao PR #308 (hotfix de RLS) num comentário do @devops.

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS artes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.marketing_posts.artes IS
  'Artes do post, uma por TELA do story: [{ordem,url,descricao,cta}] ordenado. arte_url espelha a de ordem=1 (retrocompat). Carrossel gera só a capa, reel nenhuma. Story 75-255.';

-- BACKFILL (AC4) — post que já tem arte_url ganha a entrada de ordem 1, para que
-- nenhum post existente fique sem arte na nova leitura. Só age em quem ainda está
-- com a lista vazia, então reaplicar é no-op.
UPDATE public.marketing_posts
SET artes = jsonb_build_array(
      jsonb_build_object(
        'ordem', 1,
        'url', arte_url,
        'descricao', arte_descricao,
        'cta', arte_cta
      )
    )
WHERE arte_url IS NOT NULL
  AND jsonb_array_length(artes) = 0;

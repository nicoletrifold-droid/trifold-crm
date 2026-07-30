-- 203_marketing_posts_formato_pedido.sql
-- Story 75-239 — "Pedir à Lídia": o post ganha FORMATO (a cadência do briefing
-- é 2 reels + 1 estático + story diário e o modelo não sabia diferenciar),
-- o PEDIDO original de quem solicitou (base do futuro "Refazer") e o ROTEIRO
-- (reel = a Lídia entrega roteiro de gravação + legenda; o vídeo é humano).
-- Idempotente.

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS formato text
    CHECK (formato IN ('estatico', 'reel', 'story', 'carrossel')),
  ADD COLUMN IF NOT EXISTS pedido text,
  ADD COLUMN IF NOT EXISTS roteiro text;

COMMENT ON COLUMN public.marketing_posts.formato IS
  'Formato do post: estatico | reel | story | carrossel (NULL = legado pré-239). Story 75-239.';
COMMENT ON COLUMN public.marketing_posts.pedido IS
  'Pedido/diretriz original de quem solicitou à Lídia ("story do Vind pra investidor…") — insumo do refazer. Story 75-239.';
COMMENT ON COLUMN public.marketing_posts.roteiro IS
  'Roteiro de gravação (cenas, falas, texto de tela) quando formato=reel — o vídeo em si é produção humana. Story 75-239.';

-- Correção de comentário da 193: created_by passou a ser preenchido também em
-- origem='agente' quando o post nasce de um PEDIDO humano (rota /pedir) — o
-- autor fica rastreável; /generate (autônomo) segue com NULL.
COMMENT ON COLUMN public.marketing_posts.created_by IS
  'Autor humano: cadastro manual OU quem fez o pedido à Lídia (75-239). NULL = geração autônoma (Gerar sugestões).';

-- 205_marketing_posts_arte_cta.sql
-- Story 75-248 — o CTA da arte deixa de ser DESENHADO pelo modelo de imagem e
-- passa a ser COMPOSTO pelo código (pílula com a cor de destaque do Kit).
--
-- Por que coluna nova, e não anexar na arte_descricao (como a 75-241 fez com a
-- direção do humano): a arte_descricao VAI DENTRO DO PROMPT, e o modelo agora é
-- proibido de desenhar CTA. Guardar o texto do CTA ali entregaria a ele
-- exatamente o que ele não pode ver — e reintroduziria o CTA duplo.
--
-- Sem a coluna, o "Refazer arte" perderia o CTA (a rota de refazer não chama o
-- Sonnet; ela relê o que foi persistido).
--
-- Idempotente.

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS arte_cta text;

COMMENT ON COLUMN public.marketing_posts.arte_cta IS
  'Texto EXATO do call-to-action composto sobre a arte (pílula na cor do Kit). NUNCA entra no prompt do modelo de imagem — ele é proibido de desenhar CTA. NULL = arte sem CTA. Story 75-248.';

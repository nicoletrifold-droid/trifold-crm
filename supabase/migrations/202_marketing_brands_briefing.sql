-- 202_marketing_brands_briefing.sql
-- Story 75-238 — Briefing Mestre no Kit de Marcas: o marketing respondeu o
-- questionário (30/07) e as respostas viram conhecimento editável POR MARCA,
-- consumido pela Lídia no "Gerar sugestões" (e depois no "Gerar arte").
-- Idempotente.

ALTER TABLE public.marketing_brands
  ADD COLUMN IF NOT EXISTS briefing text;

COMMENT ON COLUMN public.marketing_brands.briefing IS
  'Briefing da marca (produto, público, argumentos, concorrência, provas sociais…) — texto livre editável na aba Agente; a Lídia lê junto de voz_da_marca/diretrizes. Story 75-238.';

-- Story 75-259 (AC6) — remove linhas DUPLICADAS de marketing_brand_assets.
--
-- Não é migration de schema: é limpeza de dado. Fica em scripts/ porque pode
-- precisar rodar de novo se o cadastro duplicar outra vez (o formulário não tem
-- UNIQUE que impeça).
--
-- ⚠️ NÃO adicionamos UNIQUE (brand_id, file_name) aqui de propósito: duas marcas
-- podem legitimamente ter arquivos de mesmo nome, e dentro da MESMA marca um
-- rótulo diferente para o mesmo arquivo pode ser intencional (ex.: a mesma foto
-- catalogada como "fachada" e como "capa"). Constraint exigiria decisão de
-- produto sobre o que é duplicata legítima — fora do escopo desta story.
--
-- MEDIDO EM PRODUÇÃO em 2026-08-03, antes de rodar:
--   Vind Residence | Montserrat-Light.ttf             | 2
--   Vind Residence | VIND_RENDER_FACHADA_DIA_FEED.png | 2
--
-- Consequência do duplicado (o que motivou a story): a `selectFonteAsset` antiga
-- pegava o PRIMEIRO asset de tipo='fonte' que o Postgres devolvesse, e ter a
-- Light duas vezes dobrava a chance de o título de ~100px sair fino.
--
-- Idempotente: rodar de novo com zero duplicados não apaga nada.
--
-- ⚠️ O QUE ESTE SCRIPT **NÃO** FAZ, e foi descoberto no dry-run: as linhas
-- duplicadas apontam para OBJETOS DIFERENTES no bucket `marketing-brands` —
-- foram dois uploads do mesmo arquivo, com 10s e 19s de diferença, cada um
-- gerando um path próprio:
--
--   Montserrat-Light.ttf             17:25:45 …abe8eeb7f580.ttf  (mantida)
--                                    17:25:55 …17e06f1ebaa0.ttf  (linha apagada)
--   VIND_RENDER_FACHADA_DIA_FEED.png 18:44:54 …7557d2bbccc4.png  (mantida)
--                                    18:45:13 …0714098a52fe.png  (linha apagada)
--
-- Ou seja: apagar a linha deixa o ARQUIVO órfão no bucket. Não é vazamento (o
-- bucket já é público e o arquivo é asset de marca, não PII) nem quebra nada — o
-- código resolve asset por `file_name` a partir da tabela, nunca varrendo o
-- bucket. Fica como resíduo de armazenamento, e limpá-lo exigiria confrontar
-- bucket × tabela, que é uma varredura de outra natureza.
--
-- Registrado aqui em vez de silenciado porque "removi os duplicados" sem esta
-- ressalva daria a impressão de limpeza completa.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY org_id, brand_id, tipo, file_name
      -- Mantém a MAIS ANTIGA: é a que os posts já existentes referenciaram.
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.marketing_brand_assets
)
DELETE FROM public.marketing_brand_assets a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- Verificação (esperado: ZERO linhas depois de rodar):
--
-- SELECT b.nome, a.tipo, a.file_name, count(*)
--   FROM public.marketing_brand_assets a
--   JOIN public.marketing_brands b ON b.id = a.brand_id
--  GROUP BY 1, 2, 3
-- HAVING count(*) > 1
--  ORDER BY 1, 3;

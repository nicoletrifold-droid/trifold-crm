-- 198_marketing_brands_v2.sql
-- Story 75-230 — Kit de Marcas v2 (paridade com o Brand Hub do Canva):
--   cores: array de objetos {hex, nome} (papel da cor: Primária, Secundária…)
--   fontes: text → jsonb, array de {papel, nome} (Título, Subtítulo, Corpo…)
-- Tabela estava vazia na virada (verificado 29/07), mas a conversão PRESERVA
-- dados por segurança: fontes text vira [{"papel":"Geral","nome":<texto>}] e
-- cores em formato v1 (strings) viram objetos {hex, nome:null}.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'marketing_brands'
       AND column_name = 'fontes' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.marketing_brands
      ALTER COLUMN fontes DROP DEFAULT,
      ALTER COLUMN fontes TYPE jsonb USING (
        CASE
          WHEN fontes IS NULL OR btrim(fontes) = '' THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object('papel', 'Geral', 'nome', btrim(fontes)))
        END
      ),
      ALTER COLUMN fontes SET DEFAULT '[]'::jsonb,
      ALTER COLUMN fontes SET NOT NULL;
  END IF;
END $$;

-- Normaliza cores gravadas no formato v1 (array de strings) para {hex, nome}.
UPDATE public.marketing_brands
   SET cores = (
     SELECT COALESCE(
       jsonb_agg(
         CASE
           WHEN jsonb_typeof(item) = 'string'
             THEN jsonb_build_object('hex', item #>> '{}', 'nome', NULL)
           ELSE item
         END
       ), '[]'::jsonb)
       FROM jsonb_array_elements(cores) AS item
   )
 WHERE jsonb_typeof(cores) = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(cores) AS item
      WHERE jsonb_typeof(item) = 'string'
   );

COMMENT ON COLUMN public.marketing_brands.cores IS
  'Array de {hex, nome} — nome = papel da cor (Primária, Secundária, Fundo…). Story 75-230.';
COMMENT ON COLUMN public.marketing_brands.fontes IS
  'Array de {papel, nome} — papel tipográfico (Título, Subtítulo, Corpo…) e nome da fonte. Story 75-230.';

-- Story 75-65 — Nicole: copy de lançamento p/ empreendimento com poucas vendas
--
-- Continuação da 75-64. Acrescenta à seção ESCASSEZ E EXCLUSIVIDADE (agent_prompts, slug
-- 'property-presentation') o bullet para lançamento/baixa venda: não usar "já vendemos X" nem citar
-- quantas restam (soaria abundância) — enquadrar como oportunidade de lançamento.
--
-- O prompt que roda em prod é o do banco (bank-with-fallback / Story 53-1), não o .ts.
-- Idempotente: guard "content NOT LIKE '%EMPREENDIMENTO EM LANCAMENTO%'" evita duplicar.
-- Mantém paridade com packages/ai/src/prompts/property-presentation.ts (mesmo texto).

UPDATE agent_prompts
SET content = content
  || E'\n- EMPREENDIMENTO EM LANCAMENTO / POUCAS VENDAS: NAO use "ja vendemos X" (nao faz sentido) nem cite quantas unidades restam (soa abundancia). Enquadre como OPORTUNIDADE DE LANCAMENTO: entrar cedo, escolher as melhores plantas/andares, condicoes especiais de lancamento, exclusividade e potencial de valorizacao.',
    updated_at = now()
WHERE slug = 'property-presentation'
  AND content LIKE '%ESCASSEZ E EXCLUSIVIDADE%'
  AND content NOT LIKE '%EMPREENDIMENTO EM LANCAMENTO%';

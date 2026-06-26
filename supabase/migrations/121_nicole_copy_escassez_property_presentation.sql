-- Story 75-64 — Nicole: copy de escassez ao falar de estoque (tom SUTIL)
--
-- O prompt que roda em producao e o override no banco (agent_prompts, bank-with-fallback / Story 53-1),
-- NAO o arquivo .ts. Esta migration ACRESCENTA a secao "ESCASSEZ E EXCLUSIVIDADE" ao content da linha
-- slug='property-presentation', sem sobrescrever o restante.
--
-- Idempotente: o guard "content NOT LIKE '%ESCASSEZ E EXCLUSIVIDADE%'" garante que re-rodar nao duplica.
-- Mantem paridade com packages/ai/src/prompts/property-presentation.ts (mesmo texto).

UPDATE agent_prompts
SET content = content || E'\n\n### ESCASSEZ E EXCLUSIVIDADE (vale para TODOS os empreendimentos)\n'
  || E'A disponibilidade e um argumento de venda — use de forma SUTIL, sem pressao e sem soltar numero cru.\n'
  || E'- NUNCA diga "ainda temos X unidades disponiveis" como se sobrasse muito: isso passa abundancia e tira o valor.\n'
  || E'- Enquadre como procura/exclusividade, ancorando no que JA FOI VENDIDO: "o Vind e bem concorrido, boa parte das unidades ja foi", "restaram poucas opcoes especiais".\n'
  || E'- Convide a conhecer antes que acabe, sem pressionar: "seria otimo voce conhecer antes que essas ultimas saiam".\n'
  || E'- Use isso so quando fizer sentido na conversa — nao repita em toda mensagem.\n'
  || E'- Se o lead perguntar o numero exato de disponiveis, pode confirmar com naturalidade, mas sempre enquadrando como procura ("ja saiu boa parte, restam algumas"), nunca como "tem bastante".\n'
  || E'- HONESTIDADE: baseie-se SEMPRE nos numeros reais do bloco "DADOS ATUALIZADOS". Nunca invente nem exagere o quanto foi vendido.',
    updated_at = now()
WHERE slug = 'property-presentation'
  AND content NOT LIKE '%ESCASSEZ E EXCLUSIVIDADE%';

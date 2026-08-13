# Story 75-320 — Funil: nível do líquido proporcional ao volume

**Story ID:** 75-320 · **Status:** InReview · **Estimativa:** XS (~1 pt)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Pedido do Marcos (13/08, "agora uma pro agente ux")

## O pedido

Com todos os andares quase cheios, o líquido era só enfeite. Marcos: se o topo tem 31,
a base zerada "deveria estar quase zerada sem cor — não deixaria zerada pra não ficar
feio, mas seguir uma proporcionalidade mesmo que não tão fiel".

## A regra (função pura, testada)

`liquidFillFraction(count, maxCount)` em `lib/analytics/funnel-tiers.ts`:
- piso **10%** (andar zerado mantém um fio de cor) · teto **88%** (crista da onda dentro do andar)
- escala **√** entre piso e teto ("mesmo que não tão fiel"): 4/31 rende ~38% em vez de
  um fiapo de 13% — o nível vira encoding de volume sem esmagar os valores pequenos.
- Referência = o MAIOR andar do próprio funil (fica "cheio"; os demais proporcionais).

`ConversionFunnel` passa `fill` a cada `LiquidTier`; `surface = y + h*(1-fill)`
(antes fixo em 82%). Ondas/brilho/reduced-motion intactos.

## Evidências

- vitest: 9/9 em funnel-tiers.test.ts (5 novos: teto, piso, max=0 sem div/0, monotônica
  acima da linear, clamp acima do max) · tsc 0 · eslint 0 · build 0.
- Prévia visual (mesma geometria/fórmula, dados reais 7d 31/4/1/0/0): topo cheio,
  VA ~38%, Visitou ~24%, zerados com fio de cor na base — exatamente o pedido.

## QA — PASS (95)

Decisão extraída p/ função pura com testes (convenção da casa, projeto sem jsdom);
componente só consome a fração. Sem risco de dados — mudança 100% visual.

# Story 75-231 — Lídia: nome da agente de marketing

**Status:** Done
**Tipo:** UX (rename)
**Epic:** Agente de Marketing
**Complexidade:** XS

## Contexto
Pedido do Marcos (29/07): dar nome à agente de marketing, em linha com a Nicole
(SDR) e com a base cristã da empresa (empreendimentos com referência bíblica —
Yarden = rio Jordão). Escolhido: **Lídia** — Atos 16, a vendedora de púrpura,
primeira empresária citada no NT; cor + comércio = o ofício exato da agente.

## Escopo
- Aba "Agente" → "Lídia" (3 telas do módulo Campanhas); subtítulo, badge
  "Agente IA" → "Lídia", "Por que o agente sugeriu" → "a Lídia", textos auxiliares.
- Persona no prompt de geração (`marketing-suggestions.ts`): "Voce e Lidia, ...".
- Rota `/dashboard/campaigns/agente` e nomes internos (marketingGuard, tabelas)
  INALTERADOS — rename é de apresentação, zero risco.

## QA Results
Rename textual puro; suíte 1270/1270, tsc/eslint/build limpos. Sem gate formal
(XS, sem lógica); conferido por grep que não restou "Agente IA"/"o agente" nas
telas do módulo.

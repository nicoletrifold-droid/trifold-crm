# Story 75-324 — Visão Executiva respeita os filtros · janela do período em BRT

**Story ID:** 75-324 · **Status:** Done · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Origem: auditoria do Analytics (17/08), itens 5 e 9

## O relato e o diagnóstico

### 1. A Visão Executiva ignorava 11 dos 12 filtros

`ExecutiveCharts` recebia só `propertyId`, e `/api/analytics/executive` só lia `property`.
Com filtro de corretor, calor ou perfil ativo, o Funil e os KPIs mostravam o recorte e os
seis gráficos executivos mostravam a org inteira — **na mesma tela, um ao lado do outro**.
Ninguém que olha para dois números lado a lado supõe que eles têm recortes diferentes.

### 2. A janela do período era montada no fuso do servidor

`resolvePeriod` fazia `new Date("2026-08-09T00:00:00")`, que vale o fuso do **processo** —
UTC na Vercel, BRT na máquina de quem desenvolve. Pedir 09/08 → 16/08 recortava de
**08/08 21:00 a 16/08 20:59 BRT**. O gráfico de Visitas agrupa em BRT (`dayKey`, UTC-3
fixo), então ganhava uma coluna fantasma de 08/08 e perdia as três últimas horas do
último dia. Na janela auditada isso não moveu nenhum número — verifiquei: zero leads e
zero visitas nas bordas — mas é o tipo de erro que aparece sozinho, e o mesmo período
dava recortes diferentes em produção e no ambiente local.

## O que mudou

- **`serializeAnalyticsFilters`** (filters.ts) — filtros ativos viram querystring,
  derivada do mesmo `FILTER_SPEC` que o resto do módulo. A página manda todos para o
  endpoint; o endpoint lê com o mesmo `parseAnalyticsFilters` e aplica com o mesmo
  `applyLeadFilters`. `property` (nome antigo do parâmetro) segue aceito, para não
  quebrar link salvo.
- **Card de Visitas** — `appointments` conhece **duas** das doze dimensões
  (empreendimento e corretor, que agora são aplicadas de verdade). As outras vivem em
  `leads`. Com uma delas ativa, o card é **omitido** e diz qual filtro o tirou do ar,
  em vez de exibir um número que ignora o recorte ao lado de números que o respeitam —
  mesmo princípio que o PDF já seguia (75-271), agora também na tela.
- **`resolvePeriod`** — offset `-03:00` explícito nas duas pontas do Custom. Fixo, como
  o `brtShift` do resto do analytics: o Brasil não tem horário de verão desde 2019.

## Efeito colateral esperado (e desejado)

A janela em BRT desloca o recorte em 3 horas, então números de períodos *Custom* podem
mudar levemente em relação ao que a tela mostrava ontem. É a correção, não um desvio: o
usuário pede um dia do calendário brasileiro e agora recebe o dia do calendário
brasileiro. Presets (7d/30d/90d) são janelas móveis a partir de agora e não mudam.

## Evidências

Gates: `tsc` 0 · `eslint` 0 erros / 23 warnings (baseline) · `build` 5/5 · vitest 149
passed (12 arquivos), +6 casos novos em `period.test.ts` — o arquivo **não existia**:
00:00 BRT = 03:00Z, 23:59:59.999 BRT do último dia = 02:59:59.999Z do dia seguinte, dias
inclusivos nas duas pontas (8, não 7), datas cruas preservadas para os inputs, intervalo
invertido caindo no preset padrão e presets intactos.

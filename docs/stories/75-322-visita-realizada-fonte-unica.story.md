# Story 75-322 — "Visitas realizadas": uma definição só (tela = PDF)

**Story ID:** 75-322 · **Status:** Done · **Estimativa:** XS (~2 pts)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Origem: auditoria do Analytics (17/08), item 1

## O relato e o diagnóstico

A mesma pergunta — "quantas visitas aconteceram no período?" — estava implementada duas
vezes, em arquivos diferentes, e as duas discordavam. Medido em prod na janela 09→16/08/2026:

| | Regra | Resultado |
|---|---|---|
| Tela (`/api/analytics/executive`) | `status = 'completed'` + `team = 'house'` | **3** |
| PDF (`analytics-report-data.ts`) | `status NOT IN (cancelled, no_show)` | **4** |

As duas diferenças do PDF eram silenciosas e ambas contavam a mais:

1. `scheduled` e `confirmed` entravam como realizadas — visita que ainda não aconteceu.
2. Sem filtro de `team`, vinha a agenda do IMOB, que o Analytics principal exclui em todo
   o resto (75-98 / Epic 81).

A quarta "visita realizada" do PDF naquela janela era, literalmente, um compromisso do
IMOB ainda por acontecer. Isso viola a regra da casa de que o relatório segue a tela.

Achado colateral no mesmo card: o cabeçalho tinha **dois denominadores sem avisar** —
"3 realizadas de 6" incluía as canceladas, e "25% no-show" não (1 de 4). Os dois estavam
certos; ninguém tinha como saber qual era qual.

## O que mudou

- **`lib/analytics/visits-rule.ts`** (novo) — a regra e nada mais:
  `REALIZED_VISIT_STATUS`, `ANALYTICS_APPOINTMENT_TEAM`, `isRealizedVisit()` (decisão pura,
  usada na classificação em memória) e `applyRealizedVisitFilter()` (mesma regra em query
  PostgREST). Tela, PDF e relatório semanal importam daqui — divergir volta a ser
  impossível, não apenas improvável.
- **PDF** — o `.not("status","in",…)` foi substituído por `applyRealizedVisitFilter`.
- **Tela** — `buildVisits` usa `isRealizedVisit`; a rota executiva usa a constante de equipe.
- **Cabeçalho do card** — passa a mostrar a composição inteira
  ("6 visitas no período: 3 realizadas · 1 no-show · 2 canceladas") e a taxa diz sobre o que
  ela é ("25% no-show (1 de 4 com desfecho)"). As `encerradas` da 75-321 aparecem só quando
  existem.

### Nota de tipagem (para não re-tropeçar)

`applyRealizedVisitFilter` tem genérico **irrestrito** e faz cast para uma interface mínima
de `.eq()`. Restringir `T` a "algo com `.eq()` que devolve `T`" faz o compilador instanciar
o tipo recursivo do builder do supabase-js e estourar `TS2589` — aconteceu na primeira
versão. Mesmo padrão do `RangeableQuery` em `fetch-all-leads.ts`.

## Evidências

Gates: `tsc` 0 · vitest 136 passed nos testes de analytics (10 arquivos), +2 casos novos em
`visits-rule.test.ts` cobrindo exatamente os dois desvios do PDF (status a mais e equipe
faltando).

Depende da **75-321** (é ela que introduz o status `closed`, já tratado pela regra nova).

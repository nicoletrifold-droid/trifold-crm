# Story 75-342 — "Leads por Período" conta entradas, não sobreviventes

**Status:** Done — gate PASS · **PR #452 mergeado em 18/08** (squash `bc09c3fa`) · deploy de produção `success` às 20:35 UTC
**Tipo:** Bug fix (definição divergente) — mesma família da auditoria 75-321..326
**Epic:** 75 — CRM Trifold
**Story ID:** 75-342
**Complexidade:** S (~2 pts — 1 query, 1 rótulo, 1 arquivo de teste novo, 0 migrations)
**Fluxo:** @sm → @dev → @qa → @devops (executado 18/08)
**Migrations:** **nenhuma**.

## O pedido (Marcos, 18/08)

> *"Quando leads entram no período: na régua falou que entraram 62, no gráfico fala 52. Quem está
> certo? E por que não bate?"*

Print da tela em `?range=7d`: régua do Pipeline com "**62 entradas no período**" e, logo abaixo,
"Leads por Período" com "Total no período **52**".

## Diagnóstico — os dois números estavam certos, a base é que era outra

Mesma janela, mesmo segmento, coortes diferentes:

| Leitura | Recorte | Valor |
|---|---|---|
| Régua do Pipeline (`page.tsx:284-296`) | `segmento='principal'` + janela. **Só isso.** | 62 |
| Card **Entradas** (`page.tsx:233-241`) | idem | 62 |
| "Ritmo de Entradas" (`api/analytics/executive`, `route.ts:79-95`) | idem | 62 |
| **"Leads por Período"** (`api/analytics/leads-by-period/route.ts:125-126`) | idem **+ `is_active=true` + `lost_reason IS NULL`** | **52** |
| Card **Ativos** (`page.tsx:198-206`) | idem ao de cima (de propósito) | 52 |

A diferença de 10 são os leads que entraram nesses 7 dias e **já foram marcados como perdidos ou
desativados**. Nada de fuso, nada de IMOB, nada de paginação: `leads-by-period` é o único gráfico de
série temporal da página que mede *sobreviventes* em vez de *entradas*.

**O ponto que decide a story:** a mesma tela tem HOJE dois gráficos diários de lead — "Ritmo de
Entradas" (62) e "Leads por Período" (52) — desenhando barras diferentes para a mesma pergunta. E
o gráfico de entradas é o único que **muda o passado sozinho**: o dia 11/08 encolhe amanhã se um
corretor marcar como perdido um lead que entrou no dia 11. Volume de entrada não pode depender do
desfecho.

Convenção já fechada na 75-179: `entradas ⊇ ativos ⊇ perdidos`. Quem responde "quantos leads
entraram" é **entradas**.

## AC1 — O gráfico passa a desenhar as entradas

Remover `.eq("is_active", true)` e `.is("lost_reason", null)` da query de
`app/api/analytics/leads-by-period/route.ts` (linhas 125-126). O recorte que **fica**:
`segmento='principal'` (Story 75-98, isolamento IMOB) + janela `created_at`.

Consequências dentro da própria rota, todas desejadas e todas a conferir:

- `summary.total` passa a bater com o card **Entradas**, com a base da régua e com o total do
  "Ritmo de Entradas" — os quatro saem do mesmo universo.
- `summary.dailyAvg` e `peakCount`/`peakPeriod` sobem junto (derivam do mesmo `count`). O pico pode
  mudar de dia; é a leitura correta, não regressão.
- `summary.sources` (dropdown de Origem, Story 75-269) passa a enxergar as origens dos leads
  perdidos. Hoje uma origem que só trouxe lead ruim **some do dropdown** — isso é bug pelo mesmo
  motivo, e some junto.
- O tooltip por empreendimento (`byProperty`) passa a incluir os perdidos, coerente com a barra.

**Não muda:** card Ativos, funil, motivos de perda, RPCs, PDF. Nenhuma outra query é tocada.

## AC2 — O rótulo diz qual é a base

O rodapé do gráfico (`components/analytics/leads-chart.tsx:280`) diz "Total no período" — que é
exatamente o rótulo que fez o número parecer o total quando não era. Trocar para **"Entradas no
período"**, a mesma palavra do card. Rótulo genérico sobre número específico é como esta divergência
se reproduz: foi o mesmo defeito da 75-321..326 (número certo, definição implícita).

## AC3 — Teste que trava a volta

`app/api/analytics/leads-by-period/route.ts` **não tem teste hoje** — foi por isso que o filtro
sobreviveu a três stories de auditoria de Analytics. Criar `route.test.ts` cobrindo:

1. lead com `lost_reason` preenchido **entra** na barra do seu dia e no `total` *(o AC1)*;
2. lead com `is_active=false` **entra** também;
3. lead `segmento='imob'` **fica de fora** — o recorte que precisa continuar existindo (75-98/75-341);
4. `total` = soma das barras = nº de leads da janela (a soma tem que fechar);
5. filtro de origem e de empreendimento seguem aplicados em JS sobre a base nova.

O item 3 é o que impede que "tirar filtro" vire "tirar filtro demais".

## Decisões

- **Tirar da query, não filtrar em JS.** A rota já aplica origem e empreendimento em memória por um
  motivo específico (montar o dropdown com as origens presentes); desfecho não tem esse motivo — a
  base simplesmente muda.
- **Não vamos oferecer um toggle "só ativos" no gráfico.** Quem quer a leitura de sobreviventes tem
  o card **Ativos** e o de perdidos, na mesma tela, com a definição escrita. Um seletor a mais aqui
  recria a pergunta "qual dos dois é o certo?" em vez de respondê-la.
- **Sem migration e sem backfill:** nenhum dado muda, só o recorte da leitura.

## Blast radius (auditado antes de escrever)

- Consumidores de `/api/analytics/leads-by-period`: **um só** —
  `components/analytics/leads-chart.tsx:158`. Verificado por grep em `packages/web/src`.
- **O PDF não tem este gráfico.** `lib/analytics-report-data.ts` não monta série por período, então
  a regra "o relatório segue a tela" não gera trabalho extra aqui. (Se um dia montar, tem que
  nascer nesta base.)
- `lib/analytics/fetch-all-leads.ts` é compartilhado com `/executive` e continua igual — o comentário
  dele (linhas 11-15) cita a diferença de recorte entre as duas rotas e **precisa ser atualizado**,
  senão vira documentação mentindo.

## Verificar depois do deploy

- Em `?range=7d`, "Leads por Período" tem que mostrar o **mesmo** número do card Entradas e do
  "62 entradas no período" da régua. Se os três não baterem, a causa é outra e a story não terminou.
- Comparar com "Ritmo de Entradas" na mesma tela: os totais têm que coincidir (é o teste visual mais
  rápido dos dois gráficos que hoje discordam).
- Repetir em 30d e 90d — janela maior, mais perdidos, diferença maior. Anotar o antes/depois dos
  três presets no comentário do PR: é o registro de que a mudança fez o que dizia.
- Abrir o dropdown de Origem e conferir se apareceu alguma origem que não estava lá antes.

## Dev Agent Record

- [x] **AC1** — filtros de desfecho fora da query (`route.ts`). Recorte que ficou: `org_id` +
      `segmento='principal'` + janela `created_at`.
- [x] **AC2** — rodapé "Total no período" → "Entradas no período" (`leads-chart.tsx`).
- [x] **AC3** — `route.test.ts` novo, 10 casos.
- [x] Comentários de `fetch-all-leads.ts` e do bloco de paginação atualizados (descreviam a
      diferença de recorte que esta story eliminou).

### Fora do previsto: `org_id` explícito na query (1 linha)

O teste do lead de outra org falhou e expôs que **esta era a única query de leads do Analytics sem
`.eq("org_id", …)`** — as 17 da página, o PDF e o `/executive` todas têm. Em produção o RLS isola e a
org é uma só, então **nenhum número na tela muda**; mas uma contagem que depende só do RLS para
significar o que diz é a mesma classe de premissa implícita que esta story existe para remover.
Adicionado com o comentário explicando. **É acréscimo de escopo — sinalizado ao Marcos no PR.**

### O teste falha pelo motivo certo (verificado)

Reintroduzi `.is("lost_reason", null).eq("is_active", true)` na query de propósito: **6 dos 10 casos
quebraram**. Sem essa checagem, um teste verde não prova nada — foi a ausência de teste nenhum que
deixou o filtro atravessar três stories de auditoria.

### Validações

`npm test` 211 arquivos / 2640 testes ✅ (+6 expected fail pré-existentes) · `type-check` 8/8 ✅ ·
`lint` 0 erros (26 warnings, todos pré-existentes, nenhum nos arquivos tocados) ✅ · `build` OK ✅

### Não medido

O antes/depois em produção (7d/30d/90d) **não foi medido**: não havia PAT do Supabase nesta máquina.
A conferência é visual na tela após o deploy, e está no checklist abaixo.

## File List

- `packages/web/src/app/api/analytics/leads-by-period/route.ts` — AC1 + `org_id`
- `packages/web/src/app/api/analytics/leads-by-period/route.test.ts` *(novo)* — AC3
- `packages/web/src/components/analytics/leads-chart.tsx` — AC2
- `packages/web/src/lib/analytics/fetch-all-leads.ts` — comentário desatualizado pela mudança
- `docs/qa/gates/75-342-leads-por-periodo-conta-entradas.yml` *(novo)* — gate PASS (5 mutações)

Relacionado: 75-179 (convenção entradas/ativos) · 75-269 (paginação + dropdown de origem) ·
75-321..326 (auditoria de definições) · 75-341 (isolamento IMOB nas rotas de Analytics)

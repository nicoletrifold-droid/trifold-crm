# Story — Analytics: Gráficos Executivos (visão do diretor)

**Status:** Done (PR #273 squash-merged em d8aaf339; deploy prod Vercel OK 2026-07-23; rota nova responde 401 anônimo em prod ✓)
**Tipo:** Feature
**Epic:** Analytics / Relatórios
**Relacionado:** Story 75-31 (período global), 75-178/75-179 (métricas unificadas tela=PDF), 75-184 (Perfil dos Leads), [[project-analytics-metrica-unificada]]
**Complexidade:** M (1 API route nova, 1 lib pura + testes, 1 componente client, edição da page; sem migration)

## Pedido (Marcos, 2026-07-23)
> "Queria impressionar com estes gráficos, tipo ter gráfico de lead por dia, gráfico comparativo,
> enfim, muitos tipos de gráficos, assim o diretor da empresa abre e visualmente ele já consegue
> extrair informações sem precisar ficar lendo dados. Muito esforço em gráficos de alto impacto,
> usar vários cruzamentos."

## Escopo
Nova seção **"Visão Executiva"** em `/dashboard/analytics`, abaixo do gráfico "Leads por Período",
respeitando o período global (range/from/to da URL) e o filtro de empreendimento:

1. **Ritmo de Entradas — atual × período anterior**: linhas acumuladas dia a dia (período atual em
   laranja-marca, período anterior em cinza de contexto), com delta % no cabeçalho.
2. **Origens ao longo do tempo**: colunas empilhadas por dia (ou semana, quando a janela ≥ 42 dias),
   top 4 origens + "Outros"; legenda fixa por entidade (cor segue a origem, nunca o rank).
3. **Mapa de calor Dia × Hora**: quando os leads chegam (fuso BRT), rampa sequencial laranja.
4. **Aproveitamento por Origem**: barra 100% empilhada por origem — Fechados / Ativos / Perdidos /
   Inativos — cruzando volume × desfecho.
5. **Aproveitamento por Corretor**: mesma leitura, por corretor ativo na roleta.
6. **Visitas por período** (`appointments`, team `house`): Realizadas / Agendadas / No-show /
   Canceladas empilhadas por semana (dia quando janela = 7d), com taxa de no-show.
7. **Deltas nos cards de topo**: Entradas, Conversão e Perdidos ganham comparação com o período
   anterior de mesma duração (▲/▼ com semântica de cor; perdidos: subir = ruim).

## Convenções honradas
- Métricas dos cards continuam vindo de `deriveAnalyticsMetrics` (Story 75-179) — os deltas usam a
  MESMA RPC (`get_analytics_summary_ranged`) na janela anterior; com filtro de empreendimento, usam
  head-counts diretos (mesmo padrão dual da página). PDF **não muda** nesta story.
- Desfechos por lead (para os gráficos 4/5): `fechado` = etapa de fechamento (regex da página);
  `perdido` = `lost_reason IS NOT NULL` (idêntico ao card Perdidos/75-178); `ativo` = `is_active`
  e sem `lost_reason`; `outro` = inativo sem motivo. Somatório = Entradas.
- Todas as queries de leads filtram `segmento='principal'` e `org_id` ([[project-imob-mundo-isolado]]).
- PostgREST corta em 1000 linhas ([[project-teto-leads-regua-unica]]) → a API nova pagina com
  `.range()` em blocos de 1000.
- Dark mode: paletas separadas por modo, validadas pelo validador da skill dataviz (6 checks,
  CVD/contraste) — origens `#ea580c,#2a78d6,#199e70,#4a3aa7` (light) / `#ea580c,#3987e5,#1baf7a,#9085e9`
  (dark); desfechos `#16a34a,#3b82f6,#dc2626` (ambos); visitas `#16a34a,#3b82f6,#d97706` (ambos);
  cinza = de-ênfase ("Outros"/período anterior), nunca slot de identidade.

## Critérios de Aceite
- AC1: seção nova respeita período global E filtro de empreendimento (os dois caminhos da página).
- AC2: gráfico comparativo mostra atual × anterior alinhados por dia-índice, com delta % correto.
- AC3: origens empilhadas somam o total de entradas ativas do gráfico "Leads por Período".
- AC4: heatmap usa hora/dia em BRT (mesma convenção UTC-3 da API leads-by-period).
- AC5: barras de aproveitamento somam Entradas por linha; % visível quando o segmento comporta.
- AC6: visitas contam `team='house'` e respeitam filtro de empreendimento via `property_id`.
- AC7: deltas dos cards: base = janela anterior de mesma duração imediatamente antes.
- AC8: tudo legível em light e dark; legenda presente em todo gráfico com ≥2 séries; tooltips.
- AC9: agregações puras com testes unitários (vitest).
- AC10: `lint`, `type-check` e `vitest run` verdes.

## Correção relacionada (drive-by, mesma convenção)
- `api/analytics/leads-by-period` não filtrava `segmento='principal'` — leads IMOB inflavam o
  gráfico existente enquanto os cards (RPC) excluem IMOB. Corrigido junto (1 linha).

## File List
- `docs/stories/analytics-graficos-executivos.story.md` (esta)
- `packages/web/src/lib/analytics/executive.ts` (novo — agregações puras + tipos)
- `packages/web/src/lib/analytics/executive.test.ts` (novo)
- `packages/web/src/app/api/analytics/executive/route.ts` (novo)
- `packages/web/src/components/analytics/executive-charts.tsx` (novo — client)
- `packages/web/src/app/dashboard/analytics/page.tsx` (deltas + seção nova)
- `packages/web/src/app/api/analytics/leads-by-period/route.ts` (fix segmento)

## Tasks
- [x] Lib pura de agregação + testes (13 testes novos)
- [x] API route `/api/analytics/executive`
- [x] Componentes de gráfico (client) — 6 cards
- [x] Deltas nos cards de topo (page.tsx)
- [x] Fix segmento no leads-by-period
- [x] QA gate: vitest (1159 ✅) + lint (arquivos alterados limpos) + type-check ✅ + `next build` ✅
- [x] Inspeção visual em DARK no dev server (dados reais): 6 gráficos + tooltips + deltas ok.
      Light não inspecionado no olho (paletas validadas por script; conferir no deploy).
- [x] Fix descoberto na inspeção: `walk_in` sem rótulo em SOURCE_LABELS_SHORT → "Manual"
      (`lib/constants.ts`, vale para todas as telas que listam origem).
- [ ] @devops: push/deploy (fora desta sessão, fluxo AIOS)

## Nota de dado (não é bug)
O card "▼ -61% vs anterior" (30d) é dominado por uma IMPORTAÇÃO EM MASSA em
**08/06/2026: 868 leads num único dia** (janela anterior = 1.063 no total; sem esse dia,
~6,5/dia vs 13,9/dia atual — o volume orgânico DOBROU). Visível como degrau na linha cinza
do "Ritmo de Entradas". Se incomodar, avaliar futuramente excluir leads de importação do
comparativo (exige marcador de importação no lead).

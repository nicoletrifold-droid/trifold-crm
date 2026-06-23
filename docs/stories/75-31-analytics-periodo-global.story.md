# Story 75-31 — Analytics: filtro de período global (aplica à página inteira)

## Metadata
- **Status:** Done
- **Epic:** 75 · **Branch:** main · **Complexidade:** L (5 pontos)
- **executor:** @dev + @data-engineer · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, build]

## Story
**As a** gestor, **I want** que o filtro de período (7d/30d/90d/Custom) do Analytics aplique
à página inteira (cards, funil, por empreendimento, por origem, motivos de perda,
performance), **so that** todos os números falem do mesmo período.

## Contexto
Pedido do usuário (2026-06-23). Hoje o gráfico "Leads por Período" é um componente client
independente com filtros próprios; o resto da página é server com períodos FIXOS. O RPC
`get_analytics_summary` nem bound de tempo tem no funil/empreendimento/corretor (conta tudo).
Decisões do usuário: cards viram métricas do período; estender RPC p/ `Custom` (data final).
Esclarecido: "Dia/Semana/Mês" = granularidade (só do gráfico) ≠ "7d/30d/90d" = período.

## Escopo
**IN:**
- Migration 109: nova função `get_analytics_summary_ranged(p_org_id, p_since, p_until)` —
  espelha a original mas limita TUDO por `created_at ∈ [p_since, p_until)` (funil,
  por_property, por_broker, source, lost, totals). NÃO altera a função antiga (PDF/API intactos).
- Página server lê período da URL (`range` = 7d|30d|90d|custom + `from`/`to`), calcula
  since/until, chama o RPC ranged e recomputa todas as seções (inclusive o branch por empreendimento).
- Cards de topo viram **do período**: Total no período, Média diária, Conversão (% fechamento),
  Perdidos no período.
- Novo `<AnalyticsPeriodSelector>` (client) no topo → escreve `range`/`from`/`to` na URL.
- `<LeadsChart>` deixa de ter os botões de preset (agora no topo) e recebe `from`/`to` via props;
  mantém granularidade (renomeada "Agrupar por") + filtros secundários.

**OUT:** mudar PDF/API (usam a função antiga, all-time funnel — sem regressão); seletor de origem do gráfico.

## Acceptance Criteria
1. Selecionar 7d/30d/90d/Custom no topo recalcula funil, empreendimento, origem, perda, performance e cards.
2. RPC ranged limita todas as seções por `created_at` no período; função antiga inalterada.
3. Cards de topo refletem o período (Total/Média/Conversão/Perdidos).
4. Gráfico sincronizado ao período da URL; granularidade (Dia/Semana/Mês) segue só no gráfico, renomeada.
5. Filtro por empreendimento (tabs) continua funcionando junto com o período.
6. typecheck, lint e build limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.31-...yml`, quality_score 90)
- **migration 109:** aplicada em prod e testada (30d=770, 7d=43); função antiga intacta.
- **typecheck/lint/build:** limpos.
- **Ressalva:** render visual precisa de conferência do usuário pós-deploy.

## File List
- `supabase/migrations/109_get_analytics_summary_ranged.sql` (novo)
- `packages/web/src/app/dashboard/analytics/page.tsx`
- `packages/web/src/components/analytics/leads-chart.tsx`
- `packages/web/src/components/analytics/analytics-period-selector.tsx` (novo)

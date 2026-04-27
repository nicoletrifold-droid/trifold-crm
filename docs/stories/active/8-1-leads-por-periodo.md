# Story 8.1 — Leads por Periodo (Grafico)

## Contexto
O supervisor precisa visualizar a tendencia de entrada de leads ao longo do tempo para entender sazonalidade, impacto de campanhas e volume operacional. Um grafico de linhas/barras mostrando leads por dia, semana ou mes, com filtros por empreendimento e origem. E o analytics mais basico e mais usado.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/analytics` com tab "Leads" exibe grafico de leads por periodo
- [x] AC2: Grafico de barras com eixo X = periodo (dias/semanas/meses) e eixo Y = contagem de leads
- [x] AC3: Toggle de granularidade: Dia | Semana | Mes
- [x] AC4: Filtro por periodo: seletor de date range (ultimos 7 dias, 30 dias, 90 dias, customizado)
- [x] AC5: Filtro por empreendimento (Todos, Vind, Yarden)
- [x] AC6: Filtro por origem (Todos, WhatsApp, Meta Ads, CTWA, Manual)
- [x] AC7: Tooltip ao hover em barra: data, contagem, breakdown por empreendimento
- [x] AC8: Card de resumo abaixo do grafico: Total de leads no periodo, Media diaria, Dia com mais leads
- [x] AC9: API route `GET /api/analytics/leads-by-period?from=...&to=...&granularity=day&property=...&source=...`
- [x] AC10: Dados carregados via server-side (nao expor dados brutos no client)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/analytics/page.tsx` — Pagina de analytics (container com tabs)
- `packages/web/src/app/dashboard/analytics/leads/page.tsx` — Tab de leads (ou componente)
- `packages/web/src/components/analytics/leads-chart.tsx` — Grafico de leads
- `packages/web/src/components/analytics/period-selector.tsx` — Seletor de periodo
- `packages/web/src/components/analytics/analytics-filters.tsx` — Filtros
- `packages/web/src/app/api/analytics/leads-by-period/route.ts` — API
- `packages/db/src/queries/analytics.ts` — Queries agregadas

### Dependencia de UI:
```bash
# Lib de graficos
npm install recharts
# ou
npm install @tremor/react # (Tremor ja inclui graficos bonitos)
```

### Query agregada:
```typescript
export async function getLeadsByPeriod(params: {
  orgId: string;
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  propertyId?: string;
  source?: string;
}) {
  // Usar Supabase RPC para agregar por periodo
  const { data } = await supabase.rpc('leads_by_period', {
    p_org_id: params.orgId,
    p_from: params.from,
    p_to: params.to,
    p_granularity: params.granularity,
    p_property_id: params.propertyId,
    p_source: params.source,
  });
  return data;
}
```

### SQL function (migration):
```sql
CREATE OR REPLACE FUNCTION leads_by_period(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text DEFAULT 'day',
  p_property_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS TABLE(period text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_granularity
      WHEN 'day' THEN to_char(created_at, 'YYYY-MM-DD')
      WHEN 'week' THEN to_char(date_trunc('week', created_at), 'YYYY-MM-DD')
      WHEN 'month' THEN to_char(created_at, 'YYYY-MM')
    END as period,
    count(*)::bigint
  FROM leads
  WHERE org_id = p_org_id
    AND created_at >= p_from
    AND created_at <= p_to
    AND (p_property_id IS NULL OR property_interest_id = p_property_id)
    AND (p_source IS NULL OR source = p_source)
    AND is_active = true
  GROUP BY 1
  ORDER BY 1;
END;
$$ LANGUAGE plpgsql;
```

## Dependencias
- Depende de: 1.2 (schema), 4.4 (leads existem), 7.2 (tracking de origem)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/analytics/page.tsx` — Pagina de analytics (server component) — importa LeadsChart
- `packages/web/src/app/api/analytics/route.ts` — API de analytics com dados agregados de leads por periodo
- `packages/web/src/app/api/analytics/leads-by-period/route.ts` — API de leads por periodo com filtros (NEW)
- `packages/web/src/components/analytics/leads-chart.tsx` — Client component: grafico de barras + filtros AC3-AC7 (NEW)

## Status: Ready for Review

## QA Results

**Verdict: PASS** | Reviewer: Quinn (@qa) | 2026-04-27 | Iteração 1

Todos os 10 ACs verificados. Typecheck 0 erros, Lint 0 erros.

**Concerns não-bloqueantes:**
- `CHART-LIMIT-001` (MEDIUM): sem `.limit()` no query de leads — aceitável no volume atual, tech debt para escala futura
- `CHART-PEAK-002` (LOW): `peakPeriod` empty string em edge case não alcançável via UI

Gate file: `docs/qa/gates/8.1-leads-por-periodo.yml`

**Aprovada para push via @devops.**

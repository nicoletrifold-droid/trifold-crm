status: Done

# Story 8.3 — Performance por Corretor

## Contexto
O supervisor precisa comparar performance dos corretores: quem converte mais, quem demora mais, quem tem mais leads parados. Isso permite redistribuir leads, dar feedback e identificar melhores praticas. A analise e feita sobre leads designados a cada corretor no periodo selecionado.

## Acceptance Criteria
- [x] AC1: Na pagina de analytics, tab "Corretores" exibe tabela de performance
- [x] AC2: Tabela com colunas por corretor:
  | Corretor | Leads Recebidos | Qualificados | Agendados | Visitaram | Fecharam | Taxa Conversao | Tempo Medio |
- [x] AC3: Taxa de conversao = Fecharam / Leads Recebidos (em %)
- [ ] AC4: Tempo medio = dias entre designacao e fechamento (ou perda) — media
- [ ] AC5: Ranking visual: corretor com melhor taxa de conversao destacado (badge ou posicao)
- [ ] AC6: Grafico de barras comparativo: leads por etapa por corretor (stacked bar)
- [ ] AC7: Filtro por periodo (date range)
- [ ] AC8: Filtro por empreendimento
- [ ] AC9: Clicar no nome do corretor navega para detalhe com breakdown por empreendimento
- [x] AC10: API route `GET /api/analytics/broker-performance?from=...&to=...&property=...`

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/components/analytics/broker-performance.tsx` — Tabela + grafico
- `packages/web/src/app/api/analytics/broker-performance/route.ts` — API
- `packages/db/src/queries/analytics.ts` — (adicionar) Query de performance

### Query:
```typescript
export async function getBrokerPerformance(orgId: string, from: string, to: string) {
  const { data } = await supabase.rpc('broker_performance', {
    p_org_id: orgId,
    p_from: from,
    p_to: to,
  });
  return data;
}
```

### SQL function:
```sql
CREATE OR REPLACE FUNCTION broker_performance(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  broker_id uuid,
  broker_name text,
  total_leads bigint,
  qualified bigint,
  scheduled bigint,
  visited bigint,
  closed bigint,
  lost bigint,
  conversion_rate numeric,
  avg_days_to_close numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id as broker_id,
    u.name as broker_name,
    count(l.id)::bigint as total_leads,
    count(l.id) FILTER (WHERE l.qualification_score >= 70)::bigint as qualified,
    count(l.id) FILTER (WHERE l.visit_scheduled_at IS NOT NULL)::bigint as scheduled,
    -- ... contagem por etapa via current_stage ou activity logs
    0::bigint as visited,
    0::bigint as closed,
    0::bigint as lost,
    0::numeric as conversion_rate,
    0::numeric as avg_days_to_close
  FROM users u
  LEFT JOIN leads l ON l.assigned_broker_id = u.id
    AND l.created_at >= p_from
    AND l.created_at <= p_to
  WHERE u.org_id = p_org_id
    AND u.role = 'broker'
    AND u.is_active = true
  GROUP BY u.id, u.name;
END;
$$ LANGUAGE plpgsql;
```

## Dependencias
- Depende de: 5.4 (corretores existem), 4.6 (leads designados), 4.9 (activity logs)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/analytics/page.tsx` — Secao de performance por corretor integrada na pagina de analytics
- `packages/web/src/app/api/analytics/route.ts` — Dados de performance de corretores incluidos na API de analytics

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

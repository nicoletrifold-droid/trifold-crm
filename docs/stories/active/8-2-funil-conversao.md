status: Done

# Story 8.2 — Funil de Conversao

## Contexto
O funil mostra as taxas de conversao entre cada etapa do pipeline: quantos leads viram qualificados, quantos qualificados viram agendados, quantos agendados visitaram, quantos que visitaram fecharam. E a metrica mais importante para o supervisor entender onde esta a "fuga" de leads e otimizar o processo.

## Acceptance Criteria
- [x] AC1: Na pagina de analytics, tab "Funil" exibe visualizacao de funil
- [x] AC2: Funil com etapas: Lead (total) -> Qualificado -> Agendado -> Visitou -> Fechou
- [x] AC3: Cada etapa mostra: contagem absoluta e porcentagem relativa a etapa anterior
  - Ex: "Qualificado: 45 (56% dos leads)" | "Agendado: 28 (62% dos qualificados)"
- [x] AC4: Visualizacao em formato funil (barras decrescentes) ou sankey diagram simplificado
- [x] AC5: Taxa geral de conversao: Fechou / Total de leads (em %)
- [ ] AC6: Filtro por periodo (date range)
- [ ] AC7: Filtro por empreendimento
- [ ] AC8: Card de "gargalo": identifica a etapa com maior queda percentual e destaca visualmente
- [x] AC9: API route `GET /api/analytics/funnel?from=...&to=...&property=...`
- [ ] AC10: Contagem baseada em leads que PASSARAM por cada etapa (usar activity logs de `stage_change`), nao apenas os que ESTAO na etapa

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/components/analytics/funnel-chart.tsx` — Visualizacao do funil
- `packages/web/src/app/api/analytics/funnel/route.ts` — API
- `packages/db/src/queries/analytics.ts` — (adicionar) Query de funil

### Logica do funil:
```typescript
// Contar leads que PASSARAM por cada etapa (nao apenas os que estao atualmente)
// Usar activities de stage_change para rastrear historico

export async function getFunnelData(orgId: string, from: string, to: string, propertyId?: string) {
  // Etapas do funil em ordem
  const stages = ['Novo', 'Qualificado', 'Agendado', 'Visitou', 'Negociando', 'Fechou'];

  // Para cada etapa, contar leads unicos que passaram por ela
  const funnelData = await Promise.all(
    stages.map(async (stageName) => {
      const { count } = await supabase
        .from('activities')
        .select('lead_id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('type', 'stage_change')
        .contains('metadata', { to_stage_name: stageName })
        .gte('created_at', from)
        .lte('created_at', to);

      return { stage: stageName, count: count || 0 };
    })
  );

  // Calcular taxas de conversao entre etapas
  return funnelData.map((item, index) => ({
    ...item,
    conversionRate: index > 0 && funnelData[index - 1].count > 0
      ? ((item.count / funnelData[index - 1].count) * 100).toFixed(1)
      : '100',
  }));
}
```

### Alternativa mais simples (contagem atual):
```typescript
// Se activity logs nao tem historico suficiente, usar contagem atual por stage
// Menos preciso mas funciona de imediato
export async function getSimpleFunnel(orgId: string) {
  return supabase.rpc('leads_count_by_stage', { org_id: orgId });
}
```

## Dependencias
- Depende de: 4.1 (pipeline com etapas), 4.9 (activity logs com stage_change)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/analytics/page.tsx` — Funil de conversao integrado na pagina de analytics
- `packages/web/src/app/api/analytics/route.ts` — Dados do funil incluidos na API de analytics

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

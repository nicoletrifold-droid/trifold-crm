status: Done

# Story 8.4 — Performance por Campanha (Meta Ads)

## Contexto
A Trifold investe em Meta Ads e precisa saber qual campanha/criativo gera mais leads qualificados (nao apenas leads, mas leads que convertem). Pos-integracao com Meta Ads (Story 7.1) e CTWA (Story 7.4), o sistema tem dados de origem de cada lead. Esta story cruza origem com pipeline para mostrar ROI por campanha.

## Acceptance Criteria
- [ ] AC1: Na pagina de analytics, tab "Campanhas" exibe tabela de performance por campanha
- [ ] AC2: Tabela com colunas:
  | Campanha | Leads | Qualificados | Agendados | Fecharam | Taxa Conversao | Custo/Lead* |
- [ ] AC3: Campanhas identificadas pelo campo `leads.utm_campaign` ou `metadata.referral.campaign_id`
- [ ] AC4: Se nome da campanha nao esta disponivel, exibir campaign_id como fallback
- [ ] AC5: Taxa de conversao = Fecharam / Leads da campanha
- [ ] AC6: Grafico de barras: top 5 campanhas por volume de leads
- [ ] AC7: Grafico de barras: top 5 campanhas por taxa de conversao
- [ ] AC8: Filtro por periodo (date range)
- [ ] AC9: Filtro por tipo de origem: Meta Ads (formulario) vs CTWA Ads vs Todos
- [ ] AC10: API route `GET /api/analytics/campaign-performance?from=...&to=...`
- [ ] AC11: *Custo/Lead e informativo apenas se admin inserir custo manualmente (futuro — nao obrigatorio agora)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/components/analytics/campaign-performance.tsx` — Tabela + graficos
- `packages/web/src/app/api/analytics/campaign-performance/route.ts` — API
- `packages/db/src/queries/analytics.ts` — (adicionar) Query de campanhas

### Query:
```typescript
export async function getCampaignPerformance(orgId: string, from: string, to: string) {
  const { data } = await supabase
    .from('leads')
    .select(`
      id,
      utm_campaign,
      source,
      metadata,
      qualification_score,
      current_stage:kanban_stages(name, is_final, final_type)
    `)
    .eq('org_id', orgId)
    .in('source', ['meta_ads', 'ctwa'])
    .gte('created_at', from)
    .lte('created_at', to);

  // Agrupar por campanha e calcular metricas
  const grouped = groupByCampaign(data);
  return grouped;
}

function groupByCampaign(leads: Lead[]) {
  const campaigns = new Map<string, CampaignMetrics>();

  for (const lead of leads) {
    const campaignKey = lead.utm_campaign || lead.metadata?.referral?.campaign_id || 'unknown';
    // Agrupar e contar por etapa
  }

  return Array.from(campaigns.values());
}
```

## Dependencias
- Depende de: 7.1 (Meta Ads webhook), 7.2 (tracking de origem), 7.4 (CTWA referral data)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- (nenhum arquivo implementado ainda)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

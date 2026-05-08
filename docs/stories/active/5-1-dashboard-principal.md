status: Done

# Story 5.1 — Dashboard Principal (Metricas Chave)

## Contexto
O dashboard e a primeira pagina que o admin/supervisor ve ao logar. Precisa dar uma visao rapida do estado do negocio: quantos leads entraram hoje, quantos estao qualificados, quantas visitas agendadas, como esta o pipeline. Nao e analytics completo (Bloco 7) — e um painel operacional para decisoes do dia-a-dia.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard` renderiza dashboard com metricas e graficos
- [x] AC2: **Cards de metricas** (4 cards no topo):
  - Leads hoje (total de leads criados hoje)
  - Leads qualificados (score >= 70, esta semana)
  - Visitas agendadas (esta semana)
  - Taxa de qualificacao (qualificados / total, este mes, em %)
- [x] AC3: **Pipeline resumido**: Mini-bar chart horizontal com contagem de leads por etapa (Novo: 12, Qualificado: 8, etc.)
- [x] AC4: **Leads sem corretor**: Contagem + lista dos 5 leads mais recentes sem `assigned_broker_id` — link rapido para designar
- [ ] AC5: **Ultimas conversas ativas**: Lista das 5 conversas mais recentes com: nome do lead, ultima mensagem (truncada), timestamp, status (agente/corretor/aguardando)
- [x] AC6: **Leads por empreendimento**: Mini-donut chart ou badges: Vind (X), Yarden (Y), Nao definido (Z)
- [ ] AC7: Metricas calculadas via API route `GET /api/dashboard/metrics` (server-side)
- [ ] AC8: Periodo selecionavel: Hoje, Esta semana, Este mes (altera todas as metricas)
- [ ] AC9: Dados atualizados a cada 30 segundos (polling) ou via Realtime
- [x] AC10: Loading skeletons enquanto carrega

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/page.tsx` — Pagina do dashboard
- `packages/web/src/app/api/dashboard/metrics/route.ts` — API de metricas
- `packages/web/src/components/dashboard/metrics-cards.tsx` — Cards de metricas
- `packages/web/src/components/dashboard/pipeline-summary.tsx` — Pipeline resumido
- `packages/web/src/components/dashboard/unassigned-leads.tsx` — Leads sem corretor
- `packages/web/src/components/dashboard/recent-conversations.tsx` — Conversas recentes
- `packages/web/src/components/dashboard/property-distribution.tsx` — Leads por empreendimento
- `packages/web/src/hooks/use-dashboard.ts` — Hook de dados

### API de metricas:
```typescript
// GET /api/dashboard/metrics?period=today|week|month
export async function GET(request: Request) {
  const period = getPeriodFromQuery(request);
  const dateFrom = getDateFrom(period);

  const [leadsToday, qualifiedLeads, scheduledVisits, totalLeads, leadsByStage, unassigned, recentConversations, leadsByProperty] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', dateFrom),
    supabase.from('leads').select('id', { count: 'exact' }).gte('qualification_score', 70).gte('created_at', dateFrom),
    supabase.from('leads').select('id', { count: 'exact' }).not('visit_scheduled_at', 'is', null).gte('visit_scheduled_at', dateFrom),
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', dateFrom),
    supabase.rpc('leads_count_by_stage', { org_id: orgId }),
    supabase.from('leads').select('id, name, created_at, property_interest:properties(name)').is('assigned_broker_id', null).limit(5),
    supabase.from('conversations').select('id, lead:leads(name), messages(content, created_at)').order('updated_at', { ascending: false }).limit(5),
    supabase.rpc('leads_count_by_property', { org_id: orgId }),
  ]);

  return Response.json({ ... });
}
```

### Referencia agente-linda:
- Adaptar dashboard de `~/agente-linda/packages/web/src/app/dashboard/page.tsx`
- Reusar componentes de metricas e graficos
- Adicionar metricas imobiliarias (empreendimento, visitas)

## Dependencias
- Depende de: 1.2 (schema), 1.5 (auth), 4.1 (pipeline), 4.4 (leads)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

- `packages/web/src/app/dashboard/page.tsx` — Pagina principal do dashboard com cards de metricas, pipeline resumido e distribuicao por empreendimento

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

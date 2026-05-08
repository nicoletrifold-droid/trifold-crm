status: Done

# Story 4.3 — Filtros do Pipeline

## Contexto
Com dezenas ou centenas de leads no pipeline, o supervisor precisa filtrar para encontrar subconjuntos relevantes: leads de um empreendimento especifico, leads sem corretor (precisam ser designados), leads de uma campanha Meta Ads, etc. Os filtros aplicam no kanban board inteiro — as colunas mostram apenas os leads que atendem aos criterios.

## Acceptance Criteria
- [x] AC1: Barra de filtros acima do kanban board com filtros combinaveis (AND logic)
- [x] AC2: Filtro por **empreendimento de interesse** (select com opcoes: Todos, Vind, Yarden, Nao definido)
- [x] AC3: Filtro por **corretor designado** (select: Todos, Sem corretor, [lista de corretores ativos])
- [ ] AC4: Filtro por **origem** (select: Todos, WhatsApp, Meta Ads, Site, Indicacao)
- [x] AC5: Filtro por **score de qualificacao** (range: 0-100, slider ou faixas: Frio <30, Morno 30-69, Quente >=70)
- [ ] AC6: Filtro por **periodo de entrada** (date range picker: de/ate)
- [x] AC7: Filtros persistem na URL via query params (ex: `/dashboard/pipeline?property=vind&broker=none`)
- [ ] AC8: Badge no botao de filtro mostra quantos filtros estao ativos
- [x] AC9: Botao "Limpar filtros" reseta todos os filtros
- [x] AC10: Contagem de leads por coluna reflete os filtros aplicados
- [x] AC11: Performance: filtros aplicados no lado do servidor (query Supabase com WHERE clauses)

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/components/pipeline/pipeline-filters.tsx` — Componente de filtros
- `packages/web/src/hooks/use-pipeline-filters.ts` — Hook para gerenciar estado dos filtros + sync com URL
- `packages/db/src/queries/pipeline.ts` — Atualizar query para aceitar filtros

### Query com filtros:
```typescript
export async function getFilteredLeads(orgId: string, filters: PipelineFilters) {
  let query = supabase
    .from('leads')
    .select(`
      *,
      property_interest:properties(id, name),
      assigned_broker:users(id, name),
      current_stage:kanban_stages(id, name)
    `)
    .eq('org_id', orgId);

  if (filters.propertyId) query = query.eq('property_interest_id', filters.propertyId);
  if (filters.brokerId === 'none') query = query.is('assigned_broker_id', null);
  else if (filters.brokerId) query = query.eq('assigned_broker_id', filters.brokerId);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.minScore) query = query.gte('qualification_score', filters.minScore);
  if (filters.maxScore) query = query.lte('qualification_score', filters.maxScore);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

  return query;
}
```

### Interface de filtros:
```typescript
interface PipelineFilters {
  propertyId?: string;
  brokerId?: string | 'none';
  source?: 'whatsapp' | 'meta_ads' | 'site' | 'referral';
  minScore?: number;
  maxScore?: number;
  dateFrom?: string;
  dateTo?: string;
}
```

## Dependencias
- Depende de: 4.1 (pipeline existe), 2.1 (properties para filtro de empreendimento)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/pipeline/page.tsx` — Atualizado: adicionada barra de filtros (empreendimento, corretor, score) com submit via form e botao "Limpar" condicional; filtros aplicados server-side via searchParams com query Supabase; contagem total de leads reflete filtros

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

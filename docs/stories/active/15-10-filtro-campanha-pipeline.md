# Story 15.10 — Filtro de Campanha no Pipeline (Kanban)

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "ui-review"]

## Story
**As a** admin da Trifold,
**I want** filtrar o pipeline Kanban por campanha,
**so that** eu consiga ver no funil de vendas apenas os leads que vieram de uma acao especifica.

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

O pipeline existente ja tem filtros por Empreendimento, Corretor e Score. Esta story adiciona o filtro "Campanha".

**Decisao D10 da arquitetura:** Pipeline central com filtro de campanha, NAO pipeline separado. O lead e um so.

**Referencia:** Arquitetura secao 4.6.1

**Dependencias:** Story 15.1 (tabela campaign_entries com lead_id)

## Acceptance Criteria

1. [ ] AC1: Select "Campanha" adicionado ao filter bar existente em `/dashboard/pipeline/page.tsx`, ao lado dos filtros Empreendimento, Corretor e Score
2. [ ] AC2: Select lista todas as campanhas da org (query `campaigns` ordenado por created_at DESC)
3. [ ] AC3: Ao selecionar uma campanha, o Kanban filtra para mostrar apenas leads vinculados a essa campanha (via join com campaign_entries.lead_id)
4. [ ] AC4: Filtro funciona em combinacao com os filtros existentes (empreendimento + corretor + score + campanha simultaneamente)
5. [ ] AC5: URL reflete o filtro: `?campaign_id=UUID` (mesmo padrao dos outros filtros)
6. [ ] AC6: Botao "Limpar" reseta todos os filtros incluindo campanha
7. [ ] AC7: `pnpm run type-check` passa sem erros

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [x] Task 1: Adicionar filtro de campanha (AC1-AC6)
  - [x] 1.1: Editar `packages/web/src/app/dashboard/pipeline/page.tsx`
  - [x] 1.2: Query `campaigns` para popular o select
  - [x] 1.3: Adicionar select "Campanha" no filter bar
  - [x] 1.4: Implementar filtragem: buscar lead_ids de campaign_entries WHERE campaign_id = X, filtrar leadsQuery com .in("id", leadIds)
  - [x] 1.5: Incluir campaign_id no botao "Limpar"

- [x] Task 2: Validacao (AC7)
  - [x] 2.1: type-check

## Dev Notes

### Source Tree Relevante

- `packages/web/src/app/dashboard/pipeline/page.tsx` — pagina do pipeline com filtros existentes (linhas 47-75 para filtros, 86-155 para filter bar)

### Implementacao do Filtro

```typescript
// Junto com a query de stages, properties, brokers:
const { data: campaigns } = await supabase
  .from("campaigns")
  .select("id, name")
  .order("created_at", { ascending: false })

// Aplicar filtro:
if (filters.campaign_id) {
  const { data: campaignLeadIds } = await supabase
    .from("campaign_entries")
    .select("lead_id")
    .eq("campaign_id", filters.campaign_id)
    .not("lead_id", "is", null)
  
  const ids = (campaignLeadIds ?? []).map(e => e.lead_id).filter(Boolean)
  if (ids.length > 0) {
    leadsQuery = leadsQuery.in("id", ids)
  } else {
    // Nenhum lead vinculado — retornar vazio
    leadsQuery = leadsQuery.eq("id", "00000000-0000-0000-0000-000000000000")
  }
}
```

### Testing

- `pnpm run type-check`
- Pipeline sem filtro → todos os leads
- Pipeline com filtro campanha → apenas leads da campanha
- Pipeline com filtro campanha + empreendimento → intersecao

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
| 2026-05-06 | QA PASS — Filtro campaign_id no pipeline Kanban com URL param + combinável com outros filtros. Story fechada. | Pax (@po) |

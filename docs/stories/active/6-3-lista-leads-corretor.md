status: Done

# Story 6.3 — Lista de Leads Designados ao Corretor

## Contexto
Alem do pipeline kanban, o corretor precisa de uma lista tabular dos seus leads com ordenacao e busca rapida. A lista e util para encontrar um lead especifico sem navegar o kanban. Reusar componentes da Story 4.4 (lead management) com filtro fixo pelo broker logado.

## Acceptance Criteria
- [x] AC1: Pagina `/broker/leads` lista leads designados ao corretor logado
- [x] AC2: Tabela com colunas: nome, empreendimento, etapa (badge com cor), score, ultimo contato, data de entrada
- [x] AC3: Ordenacao por colunas (clicar no header ordena)
- [x] AC4: Busca por nome ou telefone
- [x] AC5: Filtro por empreendimento (se corretor atende mais de 1)
- [x] AC6: Filtro por etapa do pipeline
- [x] AC7: Clicar em lead navega para `/broker/leads/[id]`
- [ ] AC8: Badge de "novo" para leads designados nas ultimas 24h
- [x] AC9: Contagem total: "X leads designados"
- [x] AC10: Empty state se nao ha leads

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/broker/leads/page.tsx` — Pagina de listagem do corretor
- `packages/web/src/hooks/use-broker-leads.ts` — Hook com filtro por broker_id

### Reuso de componentes:
```typescript
// Reusar de Story 4.4:
// - leads-table.tsx (passar prop brokerMode)
// - lead-search.tsx

// Query filtrada:
export async function getBrokerLeads(orgId: string, brokerId: string, options?: ListOptions) {
  return supabase
    .from('leads')
    .select(`
      id, name, phone, qualification_score, created_at, updated_at,
      property_interest:properties(id, name),
      current_stage:kanban_stages(id, name, color)
    `)
    .eq('org_id', orgId)
    .eq('assigned_broker_id', brokerId)
    .eq('is_active', true)
    .order(options?.orderBy || 'updated_at', { ascending: false });
}
```

## Dependencias
- Depende de: 6.1 (login corretor), 4.4 (componentes de leads)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1 hora (reusar 90% da Story 4.4)

## File List

- `packages/web/src/app/broker/page.tsx` — Pagina inicial do corretor com tabela de leads filtrados, busca, ordenacao e filtros por empreendimento e etapa

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

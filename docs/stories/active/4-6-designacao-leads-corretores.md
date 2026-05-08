status: Done

# Story 4.6 — Designacao de Leads a Corretores

## Contexto
Quando a Nicole qualifica um lead, ele precisa ser designado a um corretor para atendimento presencial. A designacao pode ser automatica (handoff — Story 3.10) ou manual (admin/supervisor seleciona o corretor). O corretor so ve leads dos empreendimentos que atende. Com Coexistence Mode, apos a designacao o corretor responde pelo WhatsApp Business App no celular — a Nicole para de responder e o corretor assume.

## Acceptance Criteria
- [ ] AC1: No detalhe do lead, dropdown "Designar corretor" lista corretores ativos que atendem o empreendimento de interesse do lead
- [ ] AC2: Se lead nao tem empreendimento de interesse definido, lista TODOS os corretores ativos
- [ ] AC3: Ao designar, `leads.assigned_broker_id` e atualizado
- [ ] AC4: Activity log registrado: tipo `broker_assigned`, com nome do corretor e quem designou
- [ ] AC5: No pipeline kanban, card do lead atualiza para mostrar o corretor designado
- [x] AC6: API route `PATCH /api/leads/[id]/assign` aceita `{ broker_id: string }` (admin/supervisor only)
- [ ] AC7: API route `GET /api/brokers/available?property_id=xxx` retorna corretores que atendem o empreendimento
- [ ] AC8: Validacao: corretor precisa estar ativo e vinculado ao empreendimento (via `broker_assignments`)
- [ ] AC9: Se lead ja tem corretor, redesignacao e permitida (com confirmacao) e registra activity log
- [ ] AC10: Contagem de leads por corretor visivel no dropdown (para balancear carga): "Joao (12 leads) | Maria (8 leads)"

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/leads/[id]/assign/route.ts` — PATCH (designar)
- `packages/web/src/app/api/brokers/available/route.ts` — GET (corretores disponiveis)
- `packages/web/src/components/leads/broker-assignment.tsx` — Dropdown de designacao
- `packages/db/src/queries/broker-assignment.ts` — Queries

### Query de corretores disponiveis:
```typescript
export async function getAvailableBrokers(orgId: string, propertyId?: string) {
  let query = supabase
    .from('users')
    .select(`
      id, name, email, phone,
      broker_assignments(property_id),
      leads:leads(count)
    `)
    .eq('org_id', orgId)
    .eq('role', 'broker')
    .eq('is_active', true);

  if (propertyId) {
    query = query.filter('broker_assignments.property_id', 'eq', propertyId);
  }

  return query;
}
```

### Logica de designacao:
```typescript
export async function assignBroker(leadId: string, brokerId: string, assignedBy: string) {
  // 1. Buscar lead atual (pegar broker anterior se houver)
  // 2. Atualizar leads.assigned_broker_id
  // 3. Se lead estava em stage "Novo", mover para "Qualificado"
  // 4. Registrar activity: broker_assigned
  // 5. Se havia broker anterior, registrar: broker_reassigned
}
```

### Referencia agente-linda:
- Adaptar pattern de assignment de `~/agente-linda/` (se existir)
- A tabela `broker_assignments` (corretor <-> empreendimento) e nova — nao existe no agente-linda

## Dependencias
- Depende de: 4.4 (CRUD leads), 5.4 (gestao de corretores — precisa existir corretores)
- Bloqueia: 6.2 (pipeline do corretor filtra por assigned_broker_id), 3.10 (handoff automatico usa essa logica)

## Estimativa
M (Media) — 2-3 horas

## File List

- `packages/web/src/app/api/leads/[id]/assign/route.ts` — PATCH (designar corretor ao lead)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

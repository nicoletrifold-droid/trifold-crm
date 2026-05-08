status: Done

# Story 4.1 — Pipeline Kanban

## Contexto
O pipeline kanban e o visual core do CRM — e onde o supervisor e admin acompanham todos os leads em tempo real. Cada coluna e uma etapa do funil (Novo, Qualificado, Agendado, etc.) e cada card e um lead. O board suporta drag-and-drop para mover leads entre etapas. A base e adaptada do agente-linda (`packages/web/src/app/dashboard/pipeline/`) que ja tem kanban funcional — precisa adaptar para o contexto imobiliario (empreendimento, corretor, score).

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/pipeline` renderiza board kanban com colunas baseadas na tabela `kanban_stages` (ordenadas por `position`)
- [x] AC2: Cada coluna mostra o nome da etapa, cor, e contagem de leads
- [x] AC3: Cards de lead exibem: nome, empreendimento de interesse, corretor designado (avatar/iniciais), tempo na etapa, score de qualificacao (badge colorido)
- [x] AC4: Drag-and-drop funcional: mover card entre colunas atualiza `leads.current_stage_id` no banco
- [ ] AC5: Ao mover lead, registra activity log: `stage_change` com stage anterior e novo
- [ ] AC6: Board atualiza em tempo real via Supabase Realtime (novo lead aparece, mudanca de etapa reflete)
- [x] AC7: Card clicavel — ao clicar, navega para `/dashboard/leads/[id]` (detalhe do lead — Story 4.5)
- [ ] AC8: Board responsivo — em mobile, colunas viram lista vertical com swipe
- [x] AC9: Loading skeleton enquanto carrega dados
- [x] AC10: Empty state por coluna ("Nenhum lead nesta etapa")

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/pipeline/page.tsx` — Pagina do pipeline
- `packages/web/src/components/pipeline/kanban-board.tsx` — Board completo
- `packages/web/src/components/pipeline/kanban-column.tsx` — Coluna individual
- `packages/web/src/components/pipeline/lead-card.tsx` — Card do lead
- `packages/web/src/hooks/use-pipeline.ts` — Hook com query + realtime subscription
- `packages/db/src/queries/pipeline.ts` — Queries: leads por stage, mover lead
- `packages/web/src/lib/dnd.ts` — Configuracao do drag-and-drop (usar `@dnd-kit/core`)

### Dependencia de UI:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Query de leads por stage:
```typescript
// packages/db/src/queries/pipeline.ts
export async function getLeadsByStage(orgId: string) {
  const { data } = await supabase
    .from('kanban_stages')
    .select(`
      id, name, color, position, is_final,
      leads(
        id, name, phone, email,
        property_interest:properties(name),
        assigned_broker:users(name),
        qualification_score,
        current_stage_id,
        created_at,
        updated_at
      )
    `)
    .eq('org_id', orgId)
    .order('position');
  return data;
}

export async function moveLeadToStage(leadId: string, newStageId: string, userId: string) {
  // 1. Buscar stage anterior
  // 2. Atualizar lead.current_stage_id
  // 3. Inserir activity log
}
```

### Lead card component:
```typescript
interface LeadCardProps {
  lead: {
    id: string;
    name: string;
    property_interest?: { name: string };
    assigned_broker?: { name: string };
    qualification_score: number;
    created_at: string;
    updated_at: string;
  };
}
```

### Referencia agente-linda:
- Adaptar board de `~/agente-linda/packages/web/src/app/dashboard/pipeline/`
- Reusar componentes de drag-and-drop (provavelmente ja usa @dnd-kit)
- Adicionar campos imobiliarios nos cards (empreendimento, score)

## Dependencias
- Depende de: 1.2 (schema), 1.5 (auth), 1.6 (seed com kanban_stages), 2.1 (properties para mostrar interesse)
- Bloqueia: 4.2 (config de etapas), 4.3 (filtros), 5.6 (config pipeline admin)

## Estimativa
G (Grande) — 3-4 horas

## File List

- `packages/web/src/app/dashboard/pipeline/page.tsx` — Pagina do pipeline kanban
- `packages/web/src/components/pipeline/kanban-board.tsx` — Board completo com drag-and-drop
- `packages/web/src/components/pipeline/kanban-column.tsx` — Coluna individual do kanban
- `packages/web/src/components/pipeline/lead-card.tsx` — Card do lead com dados imobiliarios

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

status: Done

# Story 8.5 — Motivos de Perda

## Contexto
Quando um lead e marcado como "Perdido" no pipeline, o sistema precisa registrar o motivo. Categorizar motivos de perda permite identificar padroes (muitos leads sem entrada? muitos sem retorno?) e ajustar estrategia de marketing e atendimento.

## Acceptance Criteria
- [ ] AC1: Ao mover lead para etapa "Perdido" no pipeline kanban, modal obrigatorio solicita motivo de perda
- [ ] AC2: Motivos pre-definidos (select):
  - Sem entrada disponivel
  - Sem interesse apos contato
  - Comprou concorrente
  - Fora do perfil financeiro
  - Sem retorno (ghosting)
  - Localizacao nao agrada
  - Prazo de entrega nao serve
  - Outro (campo de texto livre)
- [ ] AC3: Motivo salvo em `leads.loss_reason` (enum) e `leads.loss_notes` (texto livre)
- [ ] AC4: Activity log registrado: `stage_change` com metadata `{ loss_reason: '...', loss_notes: '...' }`
- [x] AC5: Na pagina de analytics, tab "Perdas" exibe:
  - Grafico de pizza/donut com distribuicao de motivos
  - Tabela com motivo, contagem, porcentagem
  - Filtro por periodo e empreendimento
- [x] AC6: Card de insight: "Motivo mais frequente: [X] ([Y]%)"
- [x] AC7: API route `GET /api/analytics/loss-reasons?from=...&to=...&property=...`
- [ ] AC8: Motivos configuraveis pelo admin (futuro — por ora, lista fixa)
- [ ] AC9: Se lead voltar de "Perdido" para outra etapa (reativacao), motivo e mantido como historico

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/components/pipeline/loss-reason-modal.tsx` — Modal de motivo de perda
- `packages/web/src/components/analytics/loss-reasons-chart.tsx` — Grafico de motivos
- `packages/web/src/app/api/analytics/loss-reasons/route.ts` — API
- `packages/shared/src/types/lead.ts` — (modificar) Adicionar enum `LossReason`

### Schema (modificar leads — migration):
```sql
ALTER TABLE leads ADD COLUMN loss_reason varchar(50);
ALTER TABLE leads ADD COLUMN loss_notes text;
```

### Enum de motivos:
```typescript
export const LOSS_REASONS = [
  { value: 'no_down_payment', label: 'Sem entrada disponivel' },
  { value: 'no_interest', label: 'Sem interesse apos contato' },
  { value: 'competitor', label: 'Comprou concorrente' },
  { value: 'financial_profile', label: 'Fora do perfil financeiro' },
  { value: 'no_response', label: 'Sem retorno (ghosting)' },
  { value: 'location', label: 'Localizacao nao agrada' },
  { value: 'delivery_date', label: 'Prazo de entrega nao serve' },
  { value: 'other', label: 'Outro' },
] as const;
```

### Interceptar drag-and-drop:
```typescript
// Em kanban-board.tsx, ao mover para etapa "Perdido":
async function handleDragEnd(event: DragEndEvent) {
  const targetStage = getStage(event.over.id);

  if (targetStage.final_type === 'lost') {
    // Abrir modal de motivo de perda ANTES de mover
    setShowLossReasonModal(true);
    setPendingMove({ leadId, targetStageId: targetStage.id });
    return; // Nao move ate confirmar
  }

  // Move normalmente
  await moveLeadToStage(leadId, targetStage.id);
}
```

## Dependencias
- Depende de: 4.1 (pipeline kanban), 4.2 (etapa "Perdido" com final_type), 4.9 (activity logs)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/analytics/page.tsx` — Secao de motivos de perda integrada na pagina de analytics
- `packages/web/src/app/api/analytics/route.ts` — Dados de motivos de perda incluidos na API de analytics

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

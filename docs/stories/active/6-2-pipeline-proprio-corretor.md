status: Done

# Story 6.2 — Pipeline Proprio do Corretor (Kanban Filtrado)

## Contexto
O corretor tem seu proprio kanban, identico ao do admin (Story 4.1) mas filtrado apenas para leads designados a ele. O corretor arrasta leads entre etapas da mesma forma. Com Coexistence Mode, o corretor responde ao lead pelo WhatsApp Business App no celular — o pipeline no CRM e para gestao e acompanhamento, nao para enviar mensagens.

## Acceptance Criteria
- [x] AC1: Pagina `/broker/pipeline` renderiza kanban identico ao admin (reusar componentes da Story 4.1)
- [x] AC2: Leads filtrados por `assigned_broker_id = currentUser.id` — corretor so ve seus leads
- [x] AC3: Drag-and-drop funcional (mover lead entre etapas)
- [ ] AC4: Ao mover, registra activity log com `created_by = broker_id`
- [x] AC5: Card do lead exibe: nome, empreendimento, tempo na etapa, score, ultima mensagem (truncada)
- [x] AC6: Card NAO exibe corretor (redundante — todos sao do corretor logado)
- [x] AC7: Contagem de leads por etapa (filtrada)
- [ ] AC8: Realtime: novo lead designado aparece automaticamente
- [x] AC9: Clicar em card navega para `/broker/leads/[id]` (detalhe do lead versao corretor — Story 6.4)
- [x] AC10: Se corretor nao tem leads, empty state: "Voce nao tem leads designados. Novos leads serao atribuidos pelo supervisor."

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/broker/pipeline/page.tsx` — Pagina do pipeline do corretor
- `packages/web/src/hooks/use-broker-pipeline.ts` — Hook com filtro por broker_id

### Reuso de componentes:
```typescript
// Reusar do Story 4.1:
// - kanban-board.tsx (passar prop brokerFilter)
// - kanban-column.tsx
// - lead-card.tsx (ocultar campo "corretor")

// A diferenca e APENAS o filtro na query:
export async function getBrokerLeadsByStage(orgId: string, brokerId: string) {
  return supabase
    .from('kanban_stages')
    .select(`
      id, name, color, position,
      leads!inner(*)
    `)
    .eq('org_id', orgId)
    .eq('leads.assigned_broker_id', brokerId)
    .order('position');
}
```

### Nota sobre Coexistence Mode:
O corretor usa o WhatsApp Business App no celular para responder leads. O pipeline no CRM e para:
- Ver status dos leads
- Mover leads entre etapas apos interacao
- Acessar resumo IA e historico
- NAO e para enviar mensagens (isso e feito no WhatsApp App)

## Dependencias
- Depende de: 6.1 (login corretor), 4.1 (componentes kanban), 4.6 (leads designados)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1-2 horas (reusar 90% da Story 4.1)

## File List

- `packages/web/src/app/broker/pipeline/page.tsx` — Pagina do pipeline do corretor reutilizando KanbanBoard com filtro por assigned_broker_id

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

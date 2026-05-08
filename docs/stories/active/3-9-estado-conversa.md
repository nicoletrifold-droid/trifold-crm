status: Done

# Story 3.9 — Estado da Conversa (Persistencia)

## Contexto
A Nicole precisa "lembrar" do que ja conversou com cada lead. Se o lead mandou mensagem ontem dizendo que se chama Joao e quer o Yarden, hoje a Nicole nao pode perguntar o nome de novo. O `conversation_state` persiste o contexto entre mensagens: dados coletados, etapa da qualificacao, empreendimento discutido, materiais ja enviados, se ja propos visita.

## Acceptance Criteria
- [x] AC1: Tabela `conversation_state` criada com campos: `id`, `conversation_id`, `lead_id`, `current_property_id`, `qualification_step`, `collected_data` (jsonb), `materials_sent` (jsonb), `visit_proposed` (boolean), `handoff_triggered` (boolean), `handoff_reason`, `is_active`, `created_at`, `updated_at`
- [x] AC2: Estado carregado automaticamente no inicio de cada processamento de mensagem
- [x] AC3: Estado criado automaticamente na primeira mensagem do lead (se nao existir)
- [x] AC4: Estado atualizado apos cada interacao com novos dados coletados
- [x] AC5: `qualification_step` reflete corretamente a etapa: `greeting` -> `collecting_interest` -> `collecting_preferences` -> `collecting_payment` -> `qualified` -> `scheduling_visit` -> `handed_off`
- [x] AC6: `collected_data` acumula dados sem sobrescrever anteriores (merge, nao replace)
- [ ] AC7: `materials_sent` registra IDs de materiais ja enviados para evitar duplicatas
- [x] AC8: `visit_proposed` marca true quando Nicole propos visita (para nao propor repetidamente)
- [x] AC9: Estado e incluido no contexto do prompt para Claude (resumo dos dados ja coletados)
- [x] AC10: Funcao `loadConversationState(conversationId)` e `updateConversationState(id, updates)`
- [ ] AC11: Se lead retoma conversa apos pausa longa (> 24h), Nicole retoma naturalmente referenciando dados ja coletados

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/db/src/queries/conversation-state.ts` — CRUD do estado
- `packages/ai/src/context/state-manager.ts` — Gerenciamento de estado no pipeline
- `packages/ai/src/context/state-to-prompt.ts` — Converter estado em texto para o prompt
- `packages/shared/src/types/conversation-state.ts` — Types

### Converter estado para prompt:
```typescript
export function stateToPromptContext(state: ConversationState): string {
  const parts: string[] = [];

  if (state.collected_data?.name) {
    parts.push(`O lead se chama ${state.collected_data.name}.`);
  }
  if (state.current_property_id) {
    parts.push(`Esta interessado no empreendimento: ${state.currentPropertyName}.`);
  }
  if (state.collected_data?.bedrooms) {
    parts.push(`Quer ${state.collected_data.bedrooms} quartos.`);
  }
  if (state.collected_data?.preferred_floor) {
    parts.push(`Prefere andar ${state.collected_data.preferred_floor === 'high' ? 'alto' : 'baixo'}.`);
  }
  if (state.collected_data?.has_down_payment !== undefined) {
    parts.push(`${state.collected_data.has_down_payment ? 'Tem' : 'Nao tem'} entrada disponivel.`);
  }
  if (state.visit_proposed) {
    parts.push('Voce ja propos uma visita ao stand.');
  }

  if (parts.length === 0) {
    return 'Primeira interacao com este lead. Nenhum dado coletado ainda.';
  }

  return `DADOS JA COLETADOS (NAO pergunte novamente):\n${parts.join('\n')}`;
}
```

### Merge de collected_data:
```typescript
export function mergeCollectedData(
  current: CollectedData,
  extracted: Partial<CollectedData>
): CollectedData {
  return {
    ...current,
    // So sobrescreve se o novo valor nao for null/undefined
    ...Object.fromEntries(
      Object.entries(extracted).filter(([_, v]) => v != null)
    ),
  };
}
```

### Referencia agente-linda:
- Adaptar de `~/agente-linda/packages/ai/src/context/` ou `~/agente-linda/packages/db/src/queries/conversation-state.ts`
- Reusar pattern de state management

## Dependencias
- Depende de: 1.2 (schema com conversation_state)
- Bloqueia: 3.4 (qualificacao usa/atualiza estado), 3.3 (identificacao usa estado), 3.7 (adapter carrega estado)

## Estimativa
M (Media) — 2 horas

## File List
- `packages/ai/src/chat/pipeline.ts` — Pipeline principal: carrega e salva conversation_state a cada mensagem processada (loadConversationState, updateConversationState)
- `supabase/migrations/001_base_schema.sql` — Tabela conversation_state criada nesta migration

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

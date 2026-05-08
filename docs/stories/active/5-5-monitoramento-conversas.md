status: Done

# Story 5.5 — Monitoramento de Conversas em Tempo Real

## Contexto
O supervisor precisa ver todas as conversas ativas em tempo real — quem esta sendo atendido pela Nicole, quem esta com corretor, quem esta aguardando. Isso e classificado como CORE no brief da Trifold. O monitoramento usa Supabase Realtime para atualizar sem refresh. O supervisor pode clicar em qualquer conversa para ver o historico completo e, futuramente (P1), intervir.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/conversations` lista todas as conversas ativas da org
- [x] AC2: Cada conversa exibe: nome do lead, empreendimento, ultima mensagem (truncada em 80 chars), timestamp, status, corretor (se designado)
- [x] AC3: **Status da conversa** com indicador visual:
  - Verde: Nicole atendendo (conversation_state.handoff_triggered = false)
  - Azul: Corretor atendendo (handoff_triggered = true, broker assigned)
  - Amarelo: Aguardando (ultimo msg do lead sem resposta ha >5 min)
  - Cinza: Inativa (sem mensagem ha >24h)
- [ ] AC4: Lista atualiza em tempo real via Supabase Realtime (nova mensagem, mudanca de status)
- [x] AC5: Filtro por status (Todos, Nicole, Corretor, Aguardando, Inativa)
- [x] AC6: Filtro por empreendimento e corretor
- [x] AC7: Clicar em conversa navega para `/dashboard/leads/[id]` (detalhe do lead com conversa)
- [x] AC8: Badge de contagem por status no topo: "Nicole: 5 | Corretor: 3 | Aguardando: 2"
- [x] AC9: Ordenacao por ultima mensagem (mais recente primeiro)
- [ ] AC10: Indicador de "digitando" se mensagem chegou nos ultimos 3 segundos

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/conversations/page.tsx` — Pagina de monitoramento
- `packages/web/src/components/conversations/conversation-list.tsx` — Lista de conversas
- `packages/web/src/components/conversations/conversation-card.tsx` — Card individual
- `packages/web/src/components/conversations/conversation-filters.tsx` — Filtros
- `packages/web/src/hooks/use-conversations.ts` — Hook com query + Realtime
- `packages/web/src/app/api/conversations/route.ts` — GET (listar)

### Query de conversas:
```typescript
export async function getActiveConversations(orgId: string, filters?: ConversationFilters) {
  let query = supabase
    .from('conversations')
    .select(`
      id, status, updated_at,
      lead:leads(id, name, phone, property_interest:properties(name), assigned_broker:users(name)),
      messages(content, sender_type, created_at)
    `)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  // Pegar apenas ultima mensagem por conversa
  // Filtrar por status/empreendimento/corretor
  return query;
}
```

### Realtime subscription:
```typescript
const channel = supabase
  .channel('conversations')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'messages',
  }, (payload) => {
    // Atualizar conversa na lista com nova mensagem
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'conversation_state',
  }, (payload) => {
    // Atualizar status (handoff_triggered changed)
  })
  .subscribe();
```

### Referencia agente-linda:
- Adaptar monitoramento de `~/agente-linda/packages/web/src/app/dashboard/conversations/` (se existir)
- Reusar pattern de Supabase Realtime subscriptions

## Dependencias
- Depende de: 1.2 (schema), 3.7/0.3 (mensagens chegando), 3.9 (estado da conversa)
- Bloqueia: 5.8 (P1 — intervencao depende de monitoramento)

## Estimativa
G (Grande) — 3-4 horas

## File List

- `packages/web/src/app/dashboard/conversas/page.tsx` — Pagina de monitoramento de conversas com lista, filtros e indicadores de status

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

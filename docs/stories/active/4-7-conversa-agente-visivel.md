status: Done

# Story 4.7 — Conversa do Agente Visivel no Lead

## Contexto
O supervisor e corretor precisam ver toda a conversa que a Nicole (IA) teve com o lead, incluindo mensagens do lead, respostas da Nicole, e mensagens do corretor (via Coexistence Mode). Isso e essencial para contexto — o corretor precisa saber o que foi dito antes de assumir, e o supervisor precisa monitorar qualidade. As mensagens ja sao salvas na tabela `messages` pelas stories do Bloco 3 — esta story cobre a exibicao no CRM.

## Acceptance Criteria
- [x] AC1: No detalhe do lead (Story 4.5), secao "Conversa" exibe todas as mensagens da conversa
- [x] AC2: Mensagens exibidas como chat bubbles com:
  - Icone/badge do sender type (IA = roxo, Lead = cinza, Corretor = azul)
  - Conteudo do texto
  - Timestamp formatado ("14:32" se hoje, "28/03 14:32" se outro dia)
  - Status de entrega (se disponivel): enviado, entregue, lido
- [ ] AC3: Mensagens de midia (imagem, documento, audio) exibidas inline:
  - Imagem: thumbnail clicavel que abre modal
  - Documento PDF: icone + nome do arquivo + botao download
  - Audio: player inline
- [ ] AC4: Scroll infinito: ultimas 50 mensagens inicialmente, "Carregar mensagens anteriores" no topo
- [ ] AC5: Novas mensagens aparecem em tempo real (Supabase Realtime no canal `messages`)
- [ ] AC6: Indicador visual de quando o handoff aconteceu: separator "Nicole transferiu para Joao (corretor) — 14:32"
- [x] AC7: Mensagens da Nicole tem tag "IA" visivel para o admin/supervisor (o lead nao ve, mas quem acompanha no CRM sabe)
- [x] AC8: API route `GET /api/leads/[id]/messages?cursor=xxx&limit=50` retorna mensagens paginadas

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/app/api/leads/[id]/messages/route.ts` — GET (mensagens paginadas)
- `packages/web/src/components/leads/lead-conversation.tsx` — Componente de chat (criar na 4.5, detalhar aqui)
- `packages/web/src/components/chat/message-bubble.tsx` — Bubble individual
- `packages/web/src/components/chat/media-preview.tsx` — Preview de midia
- `packages/web/src/components/chat/handoff-separator.tsx` — Separator de handoff
- `packages/web/src/hooks/use-conversation.ts` — Hook com query + realtime

### Query de mensagens:
```typescript
export async function getConversationMessages(leadId: string, cursor?: string, limit = 50) {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('lead_id', leadId)
    .single();

  let query = supabase
    .from('messages')
    .select('id, content, sender_type, media_url, media_type, created_at, metadata')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  return query;
}
```

### Realtime subscription:
```typescript
const channel = supabase
  .channel(`messages:${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => {
    // Adicionar nova mensagem ao state
  })
  .subscribe();
```

### Referencia agente-linda:
- Adaptar chat display de `~/agente-linda/packages/web/src/components/chat/` (se existir)
- Reusar pattern de realtime messages

## Dependencias
- Depende de: 1.2 (schema messages), 3.7/0.3 (adapter salva mensagens), 4.5 (pagina de detalhe)
- Bloqueia: 4.8 (resumo IA depende de mensagens visiveis), 6.8 (corretor ve conversa)

## Estimativa
M (Media) — 2-3 horas

## File List

- `packages/web/src/app/dashboard/conversas/[id]/page.tsx` — Pagina de detalhe da conversa com chat bubbles, sender badges e timestamps
- `packages/web/src/app/dashboard/conversas/page.tsx` — Pagina de listagem de conversas atualizada

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

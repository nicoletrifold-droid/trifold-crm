status: Done

# Story 8.6 — Jornada Completa do Lead (Timeline Desde Anuncio ate Fechamento)

## Contexto
A jornada completa mostra todo o caminho do lead: desde o clique no anuncio (ou primeira mensagem), passando por qualificacao, agendamento, visita, ate fechamento ou perda. E uma visualizacao longitudinal que combina dados de origem (Meta Ads), conversas (Nicole), pipeline (CRM) e feedback (corretor) em uma unica timeline visual. Util para analise individual de cases de sucesso e para entender o ciclo de venda.

## Acceptance Criteria
- [ ] AC1: No detalhe do lead (Story 4.5), nova tab "Jornada" exibe timeline visual completa
- [ ] AC2: Timeline inclui eventos de TODAS as fontes:
  - **Origem:** Clique no anuncio (campanha, criativo) ou primeira mensagem
  - **Conversa:** Marcos da conversa com Nicole (primeira mensagem, qualificacao iniciada, preferencias coletadas)
  - **Pipeline:** Mudancas de etapa (com timestamp e quem moveu)
  - **Handoff:** Momento da transferencia para corretor (motivo)
  - **Corretor:** Designacao, notas adicionadas
  - **Visita:** Agendamento, comparecimento, feedback
  - **Fechamento/Perda:** Resultado final com motivo
- [ ] AC3: Cada evento na timeline tem: icone, titulo, descricao, timestamp, duracao entre eventos
- [ ] AC4: Duracao entre eventos chave destacada: "3 dias entre qualificacao e visita"
- [ ] AC5: Card de resumo no topo: "Jornada de X dias | Y mensagens trocadas | Score final: Z"
- [ ] AC6: Timeline e cronologica (de cima pra baixo, mais antigo primeiro)
- [ ] AC7: Eventos agrupados por dia (separator de data)
- [ ] AC8: API route `GET /api/leads/[id]/journey` retorna todos os eventos ordenados
- [ ] AC9: Se lead ainda esta ativo (nao fechou/perdeu), timeline mostra "Em andamento" no final
- [ ] AC10: Exportar jornada como PDF (botao, futuro — por ora apenas visual)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/components/leads/lead-journey.tsx` — Timeline visual
- `packages/web/src/components/leads/journey-event.tsx` — Evento individual
- `packages/web/src/app/api/leads/[id]/journey/route.ts` — API

### Query de jornada:
```typescript
export async function getLeadJourney(leadId: string) {
  // Combinar dados de multiplas fontes em uma timeline unica

  const [lead, activities, messages, conversations] = await Promise.all([
    supabase.from('leads').select('*').eq('id', leadId).single(),
    supabase.from('activities').select('*').eq('lead_id', leadId).order('created_at'),
    supabase.from('messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at'),
    supabase.from('conversation_state').select('*').eq('lead_id', leadId).single(),
  ]);

  // Construir eventos da jornada
  const events: JourneyEvent[] = [];

  // 1. Evento de origem
  events.push({
    type: 'origin',
    title: `Lead chegou via ${lead.source}`,
    description: lead.utm_campaign ? `Campanha: ${lead.utm_campaign}` : '',
    timestamp: lead.created_at,
    icon: 'target',
  });

  // 2. Marcos da conversa (primeira msg, qualificacao, etc.)
  // 3. Activity logs (stage changes, broker assignments, etc.)
  // 4. Handoff
  // 5. Visita
  // 6. Resultado

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
```

### Tipos:
```typescript
interface JourneyEvent {
  type: 'origin' | 'message' | 'stage_change' | 'handoff' | 'broker_assigned' | 'visit' | 'result';
  title: string;
  description: string;
  timestamp: string;
  icon: string;
  metadata?: Record<string, unknown>;
}
```

## Dependencias
- Depende de: 4.9 (activity logs), 4.7 (mensagens), 7.2 (tracking de origem), 8.5 (motivos de perda)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- (nenhum arquivo implementado ainda)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

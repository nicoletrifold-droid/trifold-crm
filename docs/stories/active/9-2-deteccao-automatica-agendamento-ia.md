status: Done

# Story 9.2 — Deteccao Automatica de Agendamento por IA

## Contexto
O corretor conversa com o lead pelo WhatsApp Business App no celular. Todas as mensagens chegam no backend via Messaging Echoes (Story 7.3). A IA monitora essas conversas em background e, quando detecta que combinaram uma visita (ex: "amanha as 14h", "pode ser segunda de manha"), extrai os dados e cria o agendamento automaticamente. O corretor recebe uma notificacao confirmando. Isso elimina o trabalho manual de registrar visitas no sistema — a Nicole faz por ele.

## Acceptance Criteria
- [ ] AC1: Apos cada mensagem processada no pipeline (tanto do lead quanto do corretor via echo), a IA avalia se houve confirmacao de agendamento
- [ ] AC2: IA extrai com confianca: data/hora, lead (ja vinculado a conversa), corretor (ja vinculado), empreendimento (se mencionado na conversa)
- [ ] AC3: Deteccao funciona com linguagem natural: "amanha as 14h", "pode ser segunda de manha", "te espero no stand as 10", "vamos marcar pra sexta as 15h", "combinado entao, sabado 9h"
- [ ] AC4: IA NAO cria agendamento para frases ambiguas ou hipoteticas ("talvez semana que vem", "ainda nao sei quando posso")
- [ ] AC5: Appointment criado com `status: 'scheduled'` e `created_by: 'nicole'`
- [ ] AC6: Notificacao enviada ao corretor via PWA push (Story 10.2) ou fallback in-app: "Agendamento detectado: [Lead] em [data] as [hora] no [local]"
- [ ] AC7: Se ja existe agendamento para o mesmo lead com status scheduled/confirmed, IA atualiza o existente em vez de criar duplicado
- [ ] AC8: Activity log registra: `appointment_auto_detected` com source_message_id
- [ ] AC9: Confidence score minimo de 0.8 para criar agendamento automaticamente (abaixo disso, apenas sugere ao corretor)
- [ ] AC10: Data/hora parseada corretamente considerando timezone America/Sao_Paulo e referencias relativas ("amanha", "segunda", "semana que vem")

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/ai/src/tools/create-appointment.ts` — Tool call para o agent-engine
- `packages/ai/src/flows/appointment-detector.ts` — Logica de deteccao
- `packages/bot/src/handlers/echo-handler.ts` — Adicionar trigger de deteccao apos salvar echo
- `packages/bot/src/handlers/message-handler.ts` — Adicionar trigger de deteccao apos mensagem do lead

### Tool call no agent-engine:
```typescript
// Tool disponivel para o Claude no pipeline de processamento
const CREATE_APPOINTMENT_TOOL = {
  name: 'create_appointment',
  description: 'Cria um agendamento de visita quando detectar que corretor e lead combinaram data/hora para visita ao empreendimento.',
  input_schema: {
    type: 'object',
    properties: {
      scheduled_at: { type: 'string', description: 'Data e hora no formato ISO 8601. Converter referencias relativas para data absoluta.' },
      duration_minutes: { type: 'number', description: 'Duracao em minutos. Default 30.' },
      property_id: { type: 'string', description: 'ID do empreendimento se identificado na conversa. Nullable.' },
      location: { type: 'string', description: 'Local da visita. Default: Stand Trifold' },
      notes: { type: 'string', description: 'Contexto extraido da conversa' },
      confidence: { type: 'number', description: 'Nivel de confianca de 0 a 1' }
    },
    required: ['scheduled_at', 'confidence']
  }
};
```

### Fluxo de deteccao:
```typescript
// Apos cada mensagem no pipeline (lead ou echo do corretor)
async function detectAppointment(conversationId: string, recentMessages: Message[]) {
  // Pegar ultimas 10 mensagens da conversa
  const context = recentMessages.slice(-10);

  // Chamar Claude com tool call
  const result = await claude.messages.create({
    model: 'claude-haiku-4-20250414', // Haiku para custo baixo
    max_tokens: 200,
    system: `Voce analisa conversas entre corretor imobiliario e lead.
Sua UNICA tarefa: detectar se combinaram data/hora para visita.
So use a tool se tiver CERTEZA (confidence >= 0.8).
Hoje e ${format(new Date(), 'yyyy-MM-dd', { timeZone: 'America/Sao_Paulo' })}.
Dia da semana: ${format(new Date(), 'EEEE', { locale: ptBR })}.`,
    tools: [CREATE_APPOINTMENT_TOOL],
    messages: [{ role: 'user', content: formatMessagesForAnalysis(context) }]
  });

  if (result.stop_reason === 'tool_use') {
    const toolCall = result.content.find(c => c.type === 'tool_use');
    if (toolCall.input.confidence >= 0.8) {
      await createOrUpdateAppointment(conversationId, toolCall.input);
    }
  }
}
```

### Deduplicacao:
```typescript
async function createOrUpdateAppointment(conversationId: string, data: AppointmentInput) {
  const conversation = await getConversation(conversationId);
  const existing = await supabase
    .from('appointments')
    .select('id')
    .eq('lead_id', conversation.lead_id)
    .in('status', ['scheduled', 'confirmed'])
    .single();

  if (existing.data) {
    // Atualizar existente
    await supabase.from('appointments').update({
      scheduled_at: data.scheduled_at,
      property_id: data.property_id,
      location: data.location,
      notes: data.notes,
      updated_at: new Date()
    }).eq('id', existing.data.id);
  } else {
    // Criar novo
    await supabase.from('appointments').insert({
      organization_id: conversation.organization_id,
      lead_id: conversation.lead_id,
      broker_id: conversation.broker_id,
      property_id: data.property_id,
      scheduled_at: data.scheduled_at,
      duration_minutes: data.duration_minutes || 30,
      location: data.location || 'Stand Trifold',
      notes: data.notes,
      status: 'scheduled',
      created_by: 'nicole'
    });
  }
}
```

## Dependencias
- Depende de: 9.1 (schema appointments), 7.3 (Messaging Echoes — mensagens do corretor), 3.9 (estado conversa — contexto)
- Bloqueia: nenhuma (enrichment automatico)

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

status: Done

# Story 7.3 — Cloud API Coexistence Mode (Messaging Echoes)

## Contexto
Coexistence Mode e o diferencial da arquitetura: o numero oficial da Trifold roda Cloud API (Nicole) E WhatsApp Business App (corretores) simultaneamente. Quando o corretor responde pelo App no celular, a Meta envia um webhook de Messaging Echoes para o backend. O CRM captura essas mensagens e exibe no historico, mantendo tudo centralizado. Sem isso, mensagens do corretor seriam invisiveis no CRM.

Gap identificado pelo PO (Gap 3 e Gap 6):
- Como detectar que o corretor respondeu?
- Como diferenciar mensagem da Nicole vs corretor?
- Como evitar que Nicole e corretor respondam ao mesmo tempo?

## Acceptance Criteria
- [ ] AC1: Webhook `POST /api/whatsapp/webhook` processa eventos de Messaging Echoes (mensagens enviadas pelo WhatsApp Business App)
- [ ] AC2: Mensagens de Messaging Echoes identificadas pelo campo `entry.changes[0].value.statuses` ou `message.from` sendo o proprio numero
- [ ] AC3: Mensagem do corretor salva na tabela `messages` com `sender_type = 'broker'`
- [ ] AC4: Lead identificado pelo `to` (destinatario da mensagem echo) — match com `leads.phone`
- [ ] AC5: Se `conversation_state.handoff_triggered = true`, mensagens do lead NAO sao processadas pela Nicole — vao direto para o historico
- [ ] AC6: Se `conversation_state.handoff_triggered = false` e o corretor envia mensagem (echo detectado), sistema automaticamente:
  - Seta `handoff_triggered = true`
  - Registra activity log: `handoff` com reason `broker_initiated`
  - Nicole para de responder
- [ ] AC7: Mensagens do corretor exibidas no CRM com sender_type `broker` (bolha azul — Story 4.7)
- [ ] AC8: Controle de concorrencia: se Nicole esta processando resposta e Messaging Echo chega, cancelar resposta da Nicole
- [ ] AC9: Mensagens echo sao gratuitas (ja enviadas pelo App) — nao geram custo adicional na Cloud API
- [ ] AC10: Log de todos os eventos de Messaging Echoes para debugging

## Detalhes Tecnicos

### Arquivos a modificar:
- `packages/web/src/app/api/whatsapp/webhook/route.ts` — Adicionar handler para Messaging Echoes
- `packages/bot/src/handlers/message-handler.ts` — Logica de routing (Nicole vs passthrough)
- `packages/bot/src/handlers/echo-handler.ts` — (criar) Handler especifico para echoes

### Payload de Messaging Echoes:
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5544999999999",
          "phone_number_id": "..."
        },
        "messages": [{
          "from": "5544999999999",
          "id": "wamid...",
          "timestamp": "...",
          "type": "text",
          "text": { "body": "Ola, sou o Joao da Trifold..." }
        }]
      }
    }]
  }]
}
```

**Nota:** Messaging Echoes aparecem como mensagens onde o `from` e o PROPRIO numero (nao o lead). Isso diferencia de mensagens do lead.

### Logica de routing:
```typescript
export async function handleWebhookMessage(payload: WhatsAppWebhook) {
  const message = extractMessage(payload);
  const ownPhoneNumber = payload.entry[0].changes[0].value.metadata.display_phone_number;

  // Detectar se e Messaging Echo (mensagem do corretor via App)
  const isEcho = message.from === ownPhoneNumber;

  if (isEcho) {
    // Mensagem do corretor — salvar como sender_type: 'broker'
    await handleEchoMessage(message, payload);
    return;
  }

  // Mensagem do lead
  const state = await getConversationState(message.from);

  if (state?.handoff_triggered) {
    // Handoff ativo — salvar mensagem do lead mas NAO processar com Nicole
    await saveMessageOnly(message, 'lead');
    return;
  }

  // Handoff nao ativo — processar com Nicole normalmente
  await processWithNicole(message);
}
```

### Controle de concorrencia:
```typescript
// Usar um mutex/lock por conversa
// Se Nicole esta processando e echo chega, sinalizar para cancelar
const PROCESSING_LOCK = new Map<string, AbortController>();

async function processWithNicole(message: ParsedMessage) {
  const controller = new AbortController();
  PROCESSING_LOCK.set(message.from, controller);

  try {
    // Processar com Nicole...
    if (controller.signal.aborted) {
      // Corretor respondeu enquanto Nicole processava — cancelar
      return;
    }
    // Enviar resposta da Nicole
  } finally {
    PROCESSING_LOCK.delete(message.from);
  }
}

async function handleEchoMessage(message: ParsedMessage) {
  // Se Nicole esta processando para este lead, cancelar
  const controller = PROCESSING_LOCK.get(leadPhone);
  if (controller) controller.abort();

  // Salvar mensagem do corretor
  // Ativar handoff se nao estava ativo
}
```

### Habilitar Coexistence Mode:
Coexistence Mode precisa ser habilitado via Meta Business Manager. Requisitos:
- WhatsApp Business App versao 2.24.17+
- Cloud API configurada no mesmo numero
- Habilitado nas configuracoes do WABA

## Dependencias
- Depende de: 3.7 (WhatsApp Cloud API adapter), 3.10 (handoff — estado da conversa), 3.9 (estado da conversa)
- Bloqueia: Nenhuma (e o ultimo elo da cadeia de comunicacao)

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

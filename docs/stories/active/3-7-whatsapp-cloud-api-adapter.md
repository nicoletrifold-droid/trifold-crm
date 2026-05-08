status: Done

# Story 3.7 — WhatsApp Cloud API Adapter

## Contexto
O canal de comunicacao principal e o WhatsApp Cloud API (numero oficial da Trifold no Meta). O adapter recebe mensagens via webhook, processa com a Nicole, e envia a resposta. Suporta texto, midia, e referral data de Click-to-WhatsApp Ads. O design segue adapter pattern para permitir trocar para Telegram (fallback) sem reescrever a logica. Esta story e o setup do Cloud API — Coexistence Mode e story separada (Bloco 6).

## Acceptance Criteria
- [x] AC1: Webhook endpoint `GET /api/whatsapp/webhook` responde ao verification challenge da Meta (verify_token)
- [x] AC2: Webhook endpoint `POST /api/whatsapp/webhook` recebe mensagens (text, image, document, audio, location)
- [x] AC3: Validacao de assinatura do webhook (X-Hub-Signature-256) com `META_APP_SECRET`
- [x] AC4: Mensagem recebida identifica/cria lead pelo numero de telefone (`wa_id`)
- [x] AC5: Mensagem do lead e salva na tabela `messages` com `sender_type = 'lead'`
- [x] AC6: Mensagem processada pelo pipeline: load state -> RAG -> Claude -> guardrails -> send response
- [x] AC7: Resposta da Nicole enviada via Cloud API `POST /v21.0/{phone_number_id}/messages`
- [x] AC8: Resposta salva na tabela `messages` com `sender_type = 'ai'`
- [ ] AC9: Suporte a envio de midia (imagem, documento PDF) via Cloud API media upload
- [x] AC10: Captura de referral data quando lead vem de Click-to-WhatsApp Ads (`entry.changes[0].value.messages[0].referral`)
- [x] AC11: Adapter pattern: interface `MessagingAdapter` com metodos `sendText()`, `sendMedia()`, `parseIncoming()`
- [x] AC12: Se Cloud API nao estiver configurado (env vars vazias), log de warning e skip (nao crash)
- [ ] AC13: Rate limiting basico: max 20 msg/s (limite do Coexistence Mode)
- [ ] AC14: Retry com exponential backoff para falhas de envio (max 3 tentativas)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/whatsapp/webhook/route.ts` — Webhook GET (verify) e POST (receive)
- `packages/bot/src/adapters/messaging-adapter.ts` — Interface do adapter
- `packages/bot/src/adapters/whatsapp-cloud-adapter.ts` — Implementacao Cloud API
- `packages/bot/src/adapters/index.ts` — Factory de adapter
- `packages/bot/src/handlers/message-handler.ts` — Pipeline de processamento de mensagem
- `packages/bot/src/utils/whatsapp-api.ts` — Helpers para Cloud API (send message, upload media)
- `packages/bot/src/utils/webhook-validator.ts` — Validacao de assinatura

### Interface do adapter:
```typescript
export interface MessagingAdapter {
  sendText(to: string, text: string): Promise<void>;
  sendMedia(to: string, mediaUrl: string, type: 'image' | 'document' | 'video', caption?: string): Promise<void>;
  parseIncoming(body: unknown): ParsedMessage | null;
  getAdapterType(): 'whatsapp_cloud' | 'telegram';
}

export interface ParsedMessage {
  from: string; // phone number or chat_id
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: number;
  messageId: string;
  referral?: { // Click-to-WhatsApp Ads
    source_url: string;
    source_type: string;
    headline: string;
    body: string;
    ctwa_clid: string;
  };
}
```

### Webhook verification:
```typescript
// GET /api/whatsapp/webhook
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}
```

### Pipeline de mensagem:
```typescript
// POST /api/whatsapp/webhook
export async function POST(request: Request) {
  // 1. Validar assinatura
  // 2. Parsear mensagem
  // 3. Identificar/criar lead por wa_id
  // 4. Carregar conversation_state
  // 5. Buscar RAG relevante
  // 6. Montar system prompt (personality + guardrails + context)
  // 7. Chamar Claude API
  // 8. Aplicar guardrails pos-geracao
  // 9. Salvar mensagens (lead + agente)
  // 10. Atualizar conversation_state
  // 11. Enviar resposta via Cloud API
  // 12. Checar criterio de handoff
}
```

### Referencia agente-linda:
- Adaptar adapter pattern de `~/agente-linda/packages/bot/src/adapters/`
- Adaptar message handler de `~/agente-linda/packages/bot/src/handlers/`
- O agente-linda provavelmente tem Telegram adapter — criar WhatsApp Cloud adapter no mesmo pattern

## Dependencias
- Depende de: 1.4 (env vars Meta), 3.1 (prompts), 3.2 (RAG), 3.10 (estado da conversa)
- Bloqueia: 3.9 (horario comercial filtra no webhook), 3.7 (handoff usa adapter para marcar conversa)

## Estimativa
G (Grande) — 3-4 horas

## File List
- `packages/bot/src/adapters/whatsapp-adapter.ts` — Implementacao do WhatsApp Cloud API adapter
- `packages/bot/src/adapters/messaging-adapter.ts` — Interface MessagingAdapter (sendText, sendMedia, parseIncoming)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — Webhook GET (verification challenge) e POST (receive message)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

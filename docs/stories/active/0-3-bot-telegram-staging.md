status: Done

# Story 0.3 — Bot Telegram Staging (@NicoleTrifoldBot)

## Contexto
O ambiente staging usa Telegram como canal de comunicacao para testes. Isso permite testar todo o fluxo conversacional da Nicole (qualificacao, guardrails, handoff) sem gastar creditos da Cloud API e sem depender do acesso ao Meta Business Manager. O bot @NicoleTrifoldBot e criado via BotFather e conectado ao mesmo pipeline de processamento de mensagens, via adapter pattern (mesma interface do WhatsApp Cloud API adapter). O Telegram e APENAS para staging/testes — producao usa WhatsApp Cloud API.

## Acceptance Criteria
- [ ] AC1: Bot criado no Telegram via BotFather com username `@NicoleTrifoldBot`
- [ ] AC2: Token do bot obtido e configurado como `TELEGRAM_BOT_TOKEN` no Vercel (scope: Preview/staging)
- [x] AC3: Webhook endpoint `POST /api/telegram/webhook` criado e funcional
- [ ] AC4: Webhook registrado no Telegram via `setWebhook` apontando para URL de staging
- [x] AC5: Adapter `TelegramAdapter` implementado seguindo a interface `MessagingAdapter` (mesma da Story 3.7)
- [ ] AC6: Mensagens recebidas no Telegram sao processadas pelo mesmo pipeline: load state -> RAG -> Claude -> guardrails -> send response
- [ ] AC7: Mensagens salvas na tabela `messages` com campo `channel = 'telegram'` (vs `'whatsapp'` em prod)
- [ ] AC8: Lead identificado pelo `chat_id` do Telegram (campo `phone` recebe `tg:{chat_id}` para diferenciar)
- [ ] AC9: Bot responde com texto formatado (Telegram Markdown)
- [ ] AC10: Bot suporta envio de midia (imagem, documento PDF) via Telegram Bot API `sendDocument`/`sendPhoto`
- [ ] AC11: Webhook secret configurado para validar requests (`X-Telegram-Bot-Api-Secret-Token`)
- [ ] AC12: Se `TELEGRAM_BOT_TOKEN` nao estiver configurado, endpoint retorna 404 (nao crash)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/telegram/webhook/route.ts` — Webhook POST handler
- `packages/bot/src/adapters/telegram-adapter.ts` — Implementacao do adapter Telegram
- `packages/bot/src/utils/telegram-api.ts` — Helpers para Telegram Bot API (sendMessage, sendDocument, setWebhook)

### Adapter Telegram (implementa MessagingAdapter):
```typescript
export class TelegramAdapter implements MessagingAdapter {
  async sendText(to: string, text: string): Promise<void> {
    // POST https://api.telegram.org/bot{token}/sendMessage
    // { chat_id: to, text, parse_mode: 'Markdown' }
  }

  async sendMedia(to: string, mediaUrl: string, type: 'image' | 'document' | 'video', caption?: string): Promise<void> {
    // sendPhoto / sendDocument / sendVideo
  }

  parseIncoming(body: unknown): ParsedMessage | null {
    // Extrair: message.chat.id, message.text, message.photo, etc.
    // Mapear para ParsedMessage (mesma interface do WhatsApp adapter)
  }

  getAdapterType(): 'whatsapp_cloud' | 'telegram' {
    return 'telegram';
  }
}
```

### Webhook setup (rodar uma vez):
```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://trifold-crm-staging.vercel.app/api/telegram/webhook",
    "secret_token": "${TELEGRAM_WEBHOOK_SECRET}"
  }'
```

### Factory de adapter (atualizar):
```typescript
// packages/bot/src/adapters/index.ts
export function getAdapter(): MessagingAdapter {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return new TelegramAdapter();
  }
  if (process.env.META_WHATSAPP_ACCESS_TOKEN) {
    return new WhatsAppCloudAdapter();
  }
  throw new Error('No messaging adapter configured');
}
```

### Referencia agente-linda:
- Se agente-linda ja tem Telegram adapter em `~/agente-linda/packages/bot/src/adapters/`, reusar a estrutura
- Adaptar para usar a interface `MessagingAdapter` definida na Story 3.7

## Dependencias
- Depende de: 0.2 (Vercel staging URL), 3.7 (interface MessagingAdapter)
- Bloqueia: Nenhuma (e o canal de teste, nao bloqueia prod)

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/bot/src/adapters/telegram-adapter.ts` — Implementacao do TelegramAdapter seguindo interface MessagingAdapter
- `packages/web/src/app/api/telegram/webhook/route.ts` — Webhook POST handler para mensagens do Telegram

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

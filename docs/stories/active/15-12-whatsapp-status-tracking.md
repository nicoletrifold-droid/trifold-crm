# Story 15.12 — WhatsApp Status Tracking no Webhook Existente

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** admin da Trifold,
**I want** que o sistema atualize automaticamente o status das mensagens WhatsApp enviadas (entregue, lido, falhou),
**so that** o painel de campanhas mostre metricas reais de engagement por WhatsApp e valide se o telefone e real.

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

A Meta envia status updates no mesmo webhook do WhatsApp (`/api/webhook/whatsapp`). O webhook existente ja recebe esses payloads mas NAO os processa. Esta story adiciona o processamento de statuses para campaign_entries.

**Referencia:** Arquitetura secao 4.5

**Dependencias:** Stories 15.1 (tabelas) e webhook WhatsApp existente

## Acceptance Criteria

1. [ ] AC1: Webhook WhatsApp (`/api/webhook/whatsapp/route.ts`) detecta `entry.changes[0].value.statuses` no payload
2. [ ] AC2: Para cada status update, extrai `recipient_id` (telefone) e `status` (sent/delivered/read/failed)
3. [ ] AC3: Busca campaign_entries pelo phone (normalizado, sem prefixo 55) + whatsapp_status != 'read' (evita regredir status)
4. [ ] AC4: Atualiza campaign_entries.whatsapp_status para o novo status
5. [ ] AC5: Se status = 'delivered' ou 'read', marca is_valid_phone = true
6. [ ] AC6: Se status = 'failed', marca is_valid_phone = false
7. [ ] AC7: Insere evento em campaign_events (channel='whatsapp', event_type=status)
8. [ ] AC8: Para mensagens incoming (lead respondeu): se lead tem campaign_entries com has_responded=false, atualiza has_responded=true e insere evento 'replied'
9. [ ] AC9: Processamento de status NAO interfere no fluxo existente de mensagens (adicionado como bloco separado)
10. [ ] AC10: `pnpm run type-check` passa sem erros

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [x] Task 1: Processar status updates (AC1-AC7, AC9)
  - [x] 1.1: Editar `packages/web/src/app/api/webhook/whatsapp/route.ts`
  - [x] 1.2: Adicionar bloco de deteccao de `statuses` no payload (separado do bloco de messages)
  - [x] 1.3: Para cada status: extrair recipient_id, normalizar phone (remover 55 prefix se 13 digitos)
  - [x] 1.4: Buscar campaign_entries pelo phone onde whatsapp_status nao e 'read'
  - [x] 1.5: Atualizar whatsapp_status + is_valid_phone
  - [x] 1.6: Inserir campaign_events
  - [x] 1.7: Try/catch isolado — erros nao afetam processamento de mensagens

- [x] Task 2: Detectar respostas (AC8)
  - [x] 2.1: No bloco de mensagens incoming (ja existente), apos processar a mensagem
  - [x] 2.2: Buscar campaign_entries pelo phone do lead + has_responded=false
  - [x] 2.3: Se encontrou, atualizar has_responded=true
  - [x] 2.4: Inserir campaign_events com event_type='replied'

- [x] Task 3: Validacao (AC10)
  - [x] 3.1: type-check

## Dev Notes

### Source Tree Relevante

- `packages/web/src/app/api/webhook/whatsapp/route.ts` — webhook atual. Processar statuses ANTES de processar messages no POST handler.

### WhatsApp Status Payload

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "statuses": [{
          "id": "wamid.xxx",
          "status": "delivered",
          "timestamp": "1713312000",
          "recipient_id": "5544999999999"
        }]
      }
    }]
  }]
}
```

### Phone Normalization para Busca

O `recipient_id` da Meta vem com prefixo 55 (ex: 5544999999999). O `campaign_entries.phone` armazena sem o 55 (ex: 44999999999). Normalizar antes de buscar:

```typescript
const phone = recipientId.startsWith("55") && recipientId.length === 13
  ? recipientId.slice(2)
  : recipientId
```

### Status Progression

Status so avanca:
- pending → sent (no envio, story 15.5)
- sent → delivered (webhook)
- delivered → read (webhook)
- qualquer → failed (webhook)

Para nao regredir: buscar entries WHERE whatsapp_status NOT IN ('read', 'failed')

### Testing

- `pnpm run type-check`
- Simular webhook status: payload com statuses[0].status='delivered' → verificar update
- Verificar que mensagens incoming continuam funcionando normalmente

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
| 2026-05-06 | QA PASS — Webhook WhatsApp atualiza whatsapp_status em campaign_entries + has_responded em after(). Story fechada. | Pax (@po) |

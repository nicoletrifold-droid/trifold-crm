# Story 15.11 — Webhook Resend: Email Open/Bounce Tracking

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** admin da Trifold,
**I want** que o sistema atualize automaticamente o status dos e-mails enviados (entregue, aberto, bounced),
**so that** o painel de campanhas mostre metricas reais de engagement por e-mail.

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

O Resend envia webhooks com status updates dos e-mails. Esta story cria o endpoint receptor que atualiza campaign_entries e campaign_events.

**Referencia:** Arquitetura secao 4.4 (webhook Resend)

**Dependencias:** Stories 15.1 (tabelas) e 15.4 (email service com tags)

## Acceptance Criteria

1. [ ] AC1: Rota `POST /api/webhook/resend` criada
2. [ ] AC2: Validacao do webhook via `svix` signature ou `RESEND_WEBHOOK_SECRET` header
3. [ ] AC3: Processa evento `email.delivered` — atualiza campaign_entries.email_status='delivered' e insere campaign_events(channel='email', event_type='delivered')
4. [ ] AC4: Processa evento `email.opened` — atualiza campaign_entries.email_status='opened', marca is_valid_email=true, insere campaign_events
5. [ ] AC5: Processa evento `email.bounced` — atualiza campaign_entries.email_status='bounced', marca is_valid_email=false, insere campaign_events
6. [ ] AC6: Identifica o entry correto usando tags (entry_id) enviadas no momento do disparo (story 15.4/15.5)
7. [ ] AC7: Se entry_id nao encontrado nas tags, skip silencioso com log
8. [ ] AC8: `pnpm run type-check` passa sem erros
9. [ ] AC9: Nenhum secret hardcoded

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [ ] Task 1: Criar webhook route (AC1, AC2)
  - [ ] 1.1: Criar `packages/web/src/app/api/webhook/resend/route.ts`
  - [ ] 1.2: Validar webhook signature (Resend usa Svix — verificar documentacao)
  - [ ] 1.3: Usar service_role Supabase client

- [ ] Task 2: Processar eventos (AC3-AC7)
  - [ ] 2.1: Extrair event type do payload: `email.delivered`, `email.opened`, `email.bounced`
  - [ ] 2.2: Extrair entry_id das tags do payload
  - [ ] 2.3: Buscar campaign_entry pelo entry_id
  - [ ] 2.4: Atualizar email_status e is_valid_email conforme evento
  - [ ] 2.5: Inserir evento em campaign_events

- [ ] Task 3: Env vars e validacao (AC8, AC9)
  - [ ] 3.1: Adicionar RESEND_WEBHOOK_SECRET ao .env.local
  - [ ] 3.2: type-check

## Dev Notes

### Resend Webhook Payload

```json
{
  "type": "email.opened",
  "created_at": "2026-04-16T15:30:00.000Z",
  "data": {
    "email_id": "re_xxxxx",
    "to": ["lead@email.com"],
    "from": "contato@trifold.eng.br",
    "subject": "Cadastro confirmado",
    "tags": {
      "campaign_id": "uuid-campanha",
      "entry_id": "uuid-entry"
    }
  }
}
```

### Resend Webhook Verification

O Resend usa Svix para assinar webhooks. O pacote `svix` pode ser instalado ou a verificacao feita manualmente com o secret. Para MVP, verificar via RESEND_WEBHOOK_SECRET no header `svix-signature`.

Alternativa simples: verificar `svix-id` + `svix-timestamp` + `svix-signature` headers.

### Status Progression

Email status so avanca (nao regride):
- pending → sent (no envio, story 15.5)
- sent → delivered (webhook)
- delivered → opened (webhook)
- sent → bounced (webhook)

### Source Tree Relevante

- `packages/web/src/app/api/webhook/whatsapp/route.ts` — referencia de webhook com signature validation
- `packages/web/src/lib/logger.ts` — logEvent
- `supabase/migrations/013_campaign_engine.sql` — schema campaign_entries, campaign_events

### Testing

- `pnpm run type-check`
- Simular webhook: POST com payload de email.opened → verificar que entry.email_status mudou para 'opened'

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |

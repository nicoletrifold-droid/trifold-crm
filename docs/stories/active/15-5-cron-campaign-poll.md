# Story 15.5 — Cron: Campaign Poll (Google Forms API + Processamento + Confirmacoes)

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation", "integration-test"]

## Story
**As a** admin da Trifold,
**I want** que o sistema busque automaticamente novas respostas dos Google Forms vinculados as campanhas ativas,
**so that** cada novo cadastro seja processado, salvo no CRM, e receba confirmacao via WhatsApp e e-mail sem nenhuma intervencao manual.

## Contexto

**Epic 15 — Campaign Engine + Google Forms Integration (Fase 1 MVP)**

Esta e a story central do epic. O cron roda a cada 2-3 minutos, consulta a Google Forms API para cada campanha ativa, processa novas respostas e dispara confirmacoes.

**Decisao D2:** Google Forms API polling (nao Apps Script). O admin so cola o link do Forms — zero config manual.
**Decisao D3:** Cron polling 2-3min (nao Pub/Sub). Latencia aceitavel para PDV.

**Referencia:** Arquitetura secoes 4.2.2 (cron flow) e 4.2.3 (UX)

**Dependencias:**
- Story 15.1 (migration — tabelas campaigns, campaign_entries, campaign_events)
- Story 15.2 (Google OAuth2 — tokens salvos em organizations.google_oauth_tokens)
- Story 15.3 (sendTemplate — envio WhatsApp)
- Story 15.4 (email service — envio Resend)

## Acceptance Criteria

### Cron Route

1. [ ] AC1: Rota `GET /api/cron/campaign-poll` criada em `packages/web/src/app/api/cron/campaign-poll/route.ts`
2. [ ] AC2: Autenticacao via `CRON_SECRET` no header Authorization (mesmo padrao do followup cron)
3. [ ] AC3: Busca todas as campanhas com `status = 'active'` e `type = 'google_forms'` e `ends_at > now()`

### Google Forms API Polling

4. [ ] AC4: Para cada campanha, busca tokens OAuth2 da org (`organizations.google_oauth_tokens`)
5. [ ] AC5: Faz refresh do token automaticamente se expirado (usando `refreshTokenIfNeeded` da story 15.2)
6. [ ] AC6: Chama `forms.responses.list({ formId: google_form_id, filter: "timestamp > {last_polled_at}" })` para buscar apenas respostas novas
7. [ ] AC7: Se nao ha novas respostas, atualiza `last_polled_at` e pula para proxima campanha

### Processamento de Respostas

8. [ ] AC8: Para cada resposta nova, extrai campos usando `campaigns.field_mapping`: campos mapeados para "name", "phone", "email" vao para colunas fixas; campos com prefixo "custom:" vao para `custom_data` JSONB
9. [ ] AC9: Normaliza telefone: remove tudo que nao e digito, valida 11 chars (DDD + 9 digitos)
10. [ ] AC10: Checa duplicidade por `phone + campaign_id` E por `google_response_id + campaign_id`. Se duplicado, skip silencioso
11. [ ] AC11: Se lead nao existe na tabela `leads` (por phone + org_id), cria novo lead com: source='google_forms', stage_id=STAGE_IDS.novo, channel='google_forms', utm_source=campaign.slug, utm_campaign=campaign.name
12. [ ] AC12: Se lead ja existe, atualiza nome e email se estavam vazios
13. [ ] AC13: Insere em `campaign_entries` com lead_id vinculado, custom_data, google_response_id, raw_payload

### Confirmacoes Automaticas

14. [ ] AC14: Se `campaigns.whatsapp_template_name` preenchido, envia template WhatsApp via `sendTemplate()` com variaveis extraidas do custom_data. Atualiza `whatsapp_status` para 'sent' ou 'failed'. Insere evento em `campaign_events`
15. [ ] AC15: Se `campaigns.email_enabled = true` e email_subject + email_body_html preenchidos, envia e-mail via `sendEmail()`. Atualiza `email_status` para 'sent' ou 'failed'. Insere evento em `campaign_events`
16. [ ] AC16: Confirmacoes sao fire-and-forget: falha no envio nao impede o processamento da proxima resposta

### Finalizacao

17. [ ] AC17: Atualiza `campaigns.last_polled_at` e `last_response_at` ao final do processamento de cada campanha
18. [ ] AC18: Retorna JSON com `{ processed: N, skipped: N, errors: N }`
19. [ ] AC19: Erros sao logados via `logEvent()` sem interromper o cron

### Qualidade

20. [ ] AC20: `pnpm run type-check` passa sem erros
21. [ ] AC21: Nenhum secret/token hardcoded no codigo

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [x] Task 1: Criar cron route (AC1, AC2)
  - [x] 1.1: Criar `packages/web/src/app/api/cron/campaign-poll/route.ts`
  - [x] 1.2: Implementar GET handler com validacao CRON_SECRET
  - [x] 1.3: Usar service_role Supabase client (mesmo padrao de followup cron)

- [x] Task 2: Buscar campanhas ativas (AC3)
  - [x] 2.1: Query: `campaigns WHERE status = 'active' AND type = 'google_forms' AND ends_at > now()`

- [x] Task 3: Google Forms API polling (AC4, AC5, AC6, AC7)
  - [x] 3.1: Para cada campanha, buscar tokens OAuth2 da org
  - [x] 3.2: Refresh token se expirado
  - [x] 3.3: Chamar `forms.responses.list` com filtro de timestamp
  - [x] 3.4: Se sem respostas novas, atualizar last_polled_at e skip

- [x] Task 4: Processar respostas (AC8, AC9, AC10, AC11, AC12, AC13)
  - [x] 4.1: Extrair campos via field_mapping
  - [x] 4.2: Normalizar telefone
  - [x] 4.3: Checar duplicidade (phone + campaign_id, google_response_id)
  - [x] 4.4: Criar/atualizar lead na tabela leads
  - [x] 4.5: Inserir em campaign_entries

- [x] Task 5: Disparar confirmacoes (AC14, AC15, AC16)
  - [x] 5.1: Enviar WhatsApp template se configurado
  - [x] 5.2: Enviar e-mail se habilitado
  - [x] 5.3: Inserir eventos em campaign_events
  - [x] 5.4: Fire-and-forget com try/catch

- [x] Task 6: Finalizacao e validacao (AC17, AC18, AC19, AC20, AC21)
  - [x] 6.1: Atualizar last_polled_at e last_response_at
  - [x] 6.2: Retornar JSON de resultado
  - [x] 6.3: Logging de erros
  - [x] 6.4: type-check

- [x] Task 7: Configurar Vercel Cron
  - [x] 7.1: Adicionar entry em `vercel.json` para `/api/cron/campaign-poll` a cada 3 minutos

## Dev Notes

### Source Tree Relevante

- `packages/web/src/app/api/cron/followup/route.ts` — padrao de cron existente (GET handler, CRON_SECRET, service_role)
- `packages/web/src/lib/google.ts` — servico OAuth2 (story 15.2)
- `packages/bot/src/adapters/whatsapp-adapter.ts` — sendTemplate (story 15.3)
- `packages/web/src/lib/email.ts` — sendEmail (story 15.4)
- `packages/web/src/lib/logger.ts` — logEvent para erros
- `packages/shared/src/constants/stages.ts` — STAGE_IDS.novo
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — referencia de lead creation pattern

### Google Forms API Response Structure

```json
{
  "responses": [
    {
      "responseId": "ACYDBNhXxx",
      "createTime": "2026-04-16T15:30:00.000Z",
      "lastSubmittedTime": "2026-04-16T15:30:00.000Z",
      "answers": {
        "question_id_abc": {
          "questionId": "question_id_abc",
          "textAnswers": {
            "answers": [{ "value": "João Silva" }]
          }
        }
      }
    }
  ]
}
```

### Field Mapping Usage

```typescript
// field_mapping: { "q1": { "target": "name", "label": "Nome" }, "q2": { "target": "phone", "label": "WhatsApp" }, ... }
for (const [questionId, mapping] of Object.entries(fieldMapping)) {
  const answer = response.answers?.[questionId]?.textAnswers?.answers?.[0]?.value
  if (!answer) continue
  
  if (mapping.target === 'name') entry.name = answer
  else if (mapping.target === 'phone') entry.phone = normalizePhone(answer)
  else if (mapping.target === 'email') entry.email = answer.toLowerCase().trim()
  else if (mapping.target.startsWith('custom:')) {
    const key = mapping.target.replace('custom:', '')
    entry.custom_data[key] = answer
  }
}
```

### Vercel Cron Config

Adicionar ao `vercel.json`:
```json
{ "path": "/api/cron/campaign-poll", "schedule": "*/3 * * * *" }
```

### Testing

- `pnpm run type-check`
- Testar com campanha ativa + Forms com respostas
- Testar duplicidade (mesma resposta processada 2x)
- Testar campanha expirada (ends_at no passado — deve ser ignorada)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
| 2026-05-06 | QA PASS — Cron 513 linhas — polling Google Forms, normalização, dedup, WhatsApp+email. Fix .maybeSingle() aplicado. Story fechada. | Pax (@po) |

status: Done

# Story 7.1 — Meta Ads Webhook Receiver (Lead Import Automatico)

## Contexto
A Trifold investe pesado em Meta Ads (Facebook/Instagram). Quando um lead preenche um formulario de anuncio (Lead Form Ad), a Meta envia os dados via webhook. Este endpoint recebe os dados, cria o lead automaticamente no pipeline (etapa "Novo"), e captura UTM params e dados da campanha. E a fonte principal de leads da Trifold — sem isso, leads de Meta Ads precisariam ser importados manualmente.

## Acceptance Criteria
- [ ] AC1: Webhook endpoint `POST /api/webhooks/meta-ads` recebe payloads de Lead Forms do Facebook/Instagram
- [ ] AC2: Verificacao do webhook: validar assinatura `X-Hub-Signature-256` com `META_APP_SECRET`
- [ ] AC3: Parsear dados do lead do payload: nome, email, telefone, campos customizados
- [ ] AC4: Criar lead automaticamente na tabela `leads` com:
  - `source = 'meta_ads'`
  - `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` extraidos dos dados da campanha
  - `current_stage_id = stage "Novo"`
  - `metadata.form_id`, `metadata.ad_id`, `metadata.campaign_id`
- [ ] AC5: Se lead com mesmo telefone ja existe, atualizar `source` e `metadata` (nao duplicar)
- [ ] AC6: Activity log registrado: `lead_created` com `source: meta_ads, campaign: [nome]`
- [ ] AC7: Endpoint `GET /api/webhooks/meta-ads` para verificacao do webhook (hub.verify_token)
- [ ] AC8: Endpoint retorna 200 rapidamente (processamento async para nao timeout o webhook da Meta)
- [ ] AC9: Log de todos os webhooks recebidos para debugging (tabela `webhook_logs` ou logs estruturados)
- [ ] AC10: Se dados incompletos (sem telefone), salvar com flag `incomplete = true` e notificar admin

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — GET (verify) + POST (receive)
- `packages/bot/src/handlers/meta-ads-handler.ts` — Processamento do lead
- `packages/db/src/queries/webhook-logs.ts` — Logging de webhooks
- `packages/shared/src/types/meta-ads.ts` — Types do payload Meta

### Payload do Meta Lead Form:
```typescript
interface MetaLeadWebhook {
  object: 'page';
  entry: [{
    id: string; // page_id
    time: number;
    changes: [{
      field: 'leadgen';
      value: {
        form_id: string;
        leadgen_id: string;
        created_time: number;
        page_id: string;
        ad_id?: string;
        adgroup_id?: string;
        campaign_id?: string;
      };
    }];
  }];
}
```

### Fluxo de processamento:
```typescript
export async function POST(request: Request) {
  // 1. Validar assinatura (X-Hub-Signature-256)
  // 2. Parsear payload
  // 3. Logar webhook recebido
  // 4. Retornar 200 imediatamente
  // 5. Processamento async:
  //    a. Buscar dados completos do lead via Meta Graph API
  //       GET /v21.0/{leadgen_id}?access_token=...
  //    b. Extrair: nome, email, telefone, campos customizados
  //    c. Buscar dados da campanha via Graph API (nome, UTMs)
  //    d. Criar ou atualizar lead no banco
  //    e. Registrar activity log
}
```

### Buscar dados do lead via Graph API:
```typescript
// O webhook so envia leadgen_id — dados completos precisam ser buscados
async function fetchLeadData(leadgenId: string): Promise<MetaLeadData> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${META_PAGE_ACCESS_TOKEN}`
  );
  return response.json();
  // Retorna: { field_data: [{ name: 'email', values: ['...'] }, ...] }
}
```

### Environment variables necessarias:
```bash
META_APP_SECRET=         # Para validar assinatura do webhook
META_PAGE_ACCESS_TOKEN=  # Para buscar dados do lead via Graph API
META_VERIFY_TOKEN=       # Para verificacao do webhook (pode ser o mesmo do WhatsApp)
```

## Dependencias
- Depende de: 1.2 (schema leads), 1.4 (env vars Meta), 4.2 (stage "Novo" existe)
- Bloqueia: 7.2 (tracking de origem), 8.4 (performance por campanha)

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

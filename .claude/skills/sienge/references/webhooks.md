# Sienge Webhooks — Catálogo e Padrões de Implementação

## Mecânica Geral

- Sienge chama o endpoint do Trifold via HTTP POST quando algo muda
- Payload contém **apenas o ID do recurso** — Trifold busca os dados completos via REST
- Retry automático: 5 tentativas em janela de ~10h (10min → 30min → 60min → 180min → 300min)
- Webhooks **NÃO consomem** as 200 req/min de rate limit (são inbound)
- O **REST fetch após receber** o webhook conta no rate limit

## Headers Recebidos

```
x-sienge-tenant:   subdomain do cliente (ex: "construtora")
x-sienge-event:    tipo do evento (ex: "CUSTOMER_UPDATED")
x-sienge-hook-id:  ID único do evento — usar para idempotência
x-sienge-id:       ID do recurso afetado
```

## Endpoint no Trifold

```
POST /api/webhooks/sienge
```

**Implementação obrigatória:**
1. Validar `x-sienge-tenant` (allowlist de tenants cadastrados)
2. Retornar **200 imediatamente** — nunca processar de forma síncrona
3. Verificar `x-sienge-hook-id` no banco para idempotência
4. Enfileirar processamento em background

```typescript
// packages/web/src/app/api/webhooks/sienge/route.ts
export async function POST(request: Request) {
  const tenant = request.headers.get('x-sienge-tenant')
  const event = request.headers.get('x-sienge-event')
  const hookId = request.headers.get('x-sienge-hook-id')
  const resourceId = request.headers.get('x-sienge-id')

  // 1. Validar tenant
  if (!isValidTenant(tenant)) return new Response('Forbidden', { status: 403 })

  // 2. Retornar 200 imediato
  // 3. Processar em background (não await)
  processWebhookAsync({ tenant, event, hookId, resourceId })

  return new Response('OK', { status: 200 })
}
```

## Tabela de Idempotência (Supabase)

```sql
CREATE TABLE sienge_webhook_events (
  id              TEXT PRIMARY KEY,  -- x-sienge-hook-id
  tenant          TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

## Catálogo de Eventos Relevantes

### Clientes

| Evento | Ação no Trifold |
|--------|----------------|
| `CUSTOMER_CREATED` | Upsert em `sienge_customers` |
| `CUSTOMER_UPDATED` | Atualizar registro + lead/cliente vinculado |
| `CUSTOMER_DISABLED` | Marcar como inativo |
| `CUSTOMER_ENABLED` | Reativar |
| `CUSTOMER_REMOVED` | Soft delete |

Payload: `{ customerId: int }`

### Contratos de Venda

| Evento | Ação no Trifold |
|--------|----------------|
| `SALES_CONTRACT_CREATED` | Criar em `sienge_contracts` + notificar corretor |
| `SALES_CONTRACT_UPDATED` | Atualizar contrato |
| `SALES_CONTRACT_ISSUED` | Contrato emitido — notificar cliente no Portal |
| `SALES_CONTRACT_CANCELED` | Marcar cancelado + alertar |
| `SALES_CONTRACT_REMOVED` | Soft delete |

Payload: `{ salesContractId: int }`

### Unidades

| Evento | Ação no Trifold |
|--------|----------------|
| `UNIT_CREATED` | Adicionar ao estoque |
| `UNIT_UPDATED` | Atualizar status/preço (ex: Disponível → Vendida) |
| `UNIT_REMOVED` | Remover do estoque |

Payload: `{ unitId: int }`

### Parcelas / Financeiro

| Evento | Ação no Trifold |
|--------|----------------|
| `RECEIVABLE_INSTALLMENT_CREATED` | Adicionar parcela |
| `RECEIVABLE_INSTALLMENT_UPDATED` | Atualizar status |
| `RECEIPT_PROCESSED` | Baixa realizada — atualizar status no Portal do Cliente |

### Outros Relevantes

| Evento | Ação no Trifold |
|--------|----------------|
| `KEYS_HANDOVER_CREATED` | Entrega de chaves — gatilho NPS |
| `BUILDING_STATUS_UPDATED` | Status da obra mudou |
| `SALES_COMMISSION_INSTALLMENTS_AUTHORIZED` | Comissão liberada — notificar corretor |
| `CONSTRUCTION_DAILY_REPORT_TYPE_UPDATED` | Diário de obra — atualizar Portal do Cliente |

## Configurar Webhook no Sienge

Via API de gerenciamento:
```typescript
await fetch(`${baseUrl}/webhooks`, {
  method: 'POST',
  headers: { Authorization: `Basic ${credentials}` },
  body: JSON.stringify({
    events: ['CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'UNIT_UPDATED', 'SALES_CONTRACT_CREATED'],
    url: 'https://trifold-crm.vercel.app/api/webhooks/sienge',
  })
})
```

## Padrão de Processamento Assíncrono

```typescript
async function processWebhookAsync({ tenant, event, hookId, resourceId }) {
  const supabase = createAdminClient()

  // Idempotência
  const { data: existing } = await supabase
    .from('sienge_webhook_events')
    .select('id')
    .eq('id', hookId)
    .single()

  if (existing) return // já processado

  // Registrar
  await supabase.from('sienge_webhook_events').insert({
    id: hookId, tenant, event_type: event, resource_id: resourceId
  })

  // Buscar dados completos via REST
  const data = await fetchResourceFromSienge(event, resourceId, tenant)

  // Upsert no Supabase
  await upsertResource(event, data)

  // Marcar processado
  await supabase
    .from('sienge_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', hookId)
}
```

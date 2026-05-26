# Sienge ↔ Trifold — Arquitetura de Integração

## Decisão Central: Cache no Supabase

Com 100+ funcionários e clientes simultâneos, **queries diretas ao Sienge são inviáveis** — 200 req/min seriam esgotados em minutos. Todo dado de leitura frequente deve ser cacheado no Supabase.

```
Sienge API
    │
    ├── Webhooks (push, tempo real, não consome rate limit) ──────┐
    │                                                             │
    └── Polling agendado (fallback + reconciliação) ─────────────┤
                                                                  ▼
                                                          Supabase (cache)
                                                                  │
                                                   ┌──────────────┴──────────────┐
                                              Funcionários                   Clientes
                                              (100 users)                  (100+ users)
```

## Tabelas Supabase

```sql
-- Espelho de empreendimentos
CREATE TABLE sienge_enterprises (
  id                  SERIAL PRIMARY KEY,
  sienge_enterprise_id INT UNIQUE NOT NULL,
  tenant              TEXT NOT NULL,
  name                TEXT,
  address             TEXT,
  city                TEXT,
  total_units         INT,
  available_units     INT,
  raw                 JSONB,  -- payload completo do Sienge
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Espelho de unidades
CREATE TABLE sienge_units (
  id                  SERIAL PRIMARY KEY,
  sienge_unit_id      INT UNIQUE NOT NULL,
  sienge_enterprise_id INT REFERENCES sienge_enterprises(sienge_enterprise_id),
  tenant              TEXT NOT NULL,
  block               TEXT,
  floor               INT,
  number              TEXT,
  status              TEXT,  -- available, sold, reserved
  area                NUMERIC,
  total_price         NUMERIC,
  raw                 JSONB,
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Espelho de clientes
CREATE TABLE sienge_customers (
  id                  SERIAL PRIMARY KEY,
  sienge_customer_id  INT UNIQUE NOT NULL,
  tenant              TEXT NOT NULL,
  name                TEXT,
  cpf                 TEXT,
  email               TEXT,
  phone               TEXT,
  trifold_lead_id     UUID REFERENCES leads(id),  -- vínculo com lead Trifold
  raw                 JSONB,
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Espelho de contratos de venda
CREATE TABLE sienge_contracts (
  id                  SERIAL PRIMARY KEY,
  sienge_contract_id  INT UNIQUE NOT NULL,
  tenant              TEXT NOT NULL,
  contract_number     TEXT,
  sienge_customer_id  INT,
  sienge_unit_id      INT,
  status              TEXT,
  total_value         NUMERIC,
  signature_date      DATE,
  raw                 JSONB,
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Extrato financeiro do cliente (parcelas + recibos)
-- Fonte: GET /customer-financial-statements?customerId={id}
CREATE TABLE sienge_installments (
  id                    SERIAL PRIMARY KEY,
  sienge_installment_id INT UNIQUE NOT NULL,       -- installmentId
  sienge_customer_id    INT NOT NULL,              -- customerId (chave de consulta)
  bill_receivable_id    INT,                       -- billReceivableId
  document_id           TEXT,                      -- ex: "VIND-101"
  tenant                TEXT NOT NULL,
  installment_number    TEXT,                      -- installmentNumber
  due_date              DATE,                      -- dueDate
  condition_type        TEXT,                      -- AT | PI | PM | CH
  original_value        NUMERIC,                   -- originalValue
  current_balance       NUMERIC,                   -- currentBalance (0 = pago)
  interest_percent      NUMERIC,                   -- interestPercent da parcela
  fine_percent          NUMERIC,                   -- finePercent (do billReceivable)
  generated_billet      BOOLEAN DEFAULT FALSE,     -- generatedBillet
  status                TEXT,                      -- pago | boleto_gerado | em_aberto (computado)
  paid_date             DATE,                      -- receiptDate do primeiro receipt
  net_receipt_value     NUMERIC,                   -- netReceiptValue (valor pago líquido)
  receipts              JSONB,                     -- array completo de receipts
  raw                   JSONB,                     -- payload completo da parcela
  synced_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Controle de sync
CREATE TABLE sienge_sync_log (
  id                  SERIAL PRIMARY KEY,
  tenant              TEXT NOT NULL,
  resource            TEXT NOT NULL,  -- enterprises, units, customers, contracts
  last_offset         INT DEFAULT 0,
  last_run_at         TIMESTAMPTZ,
  status              TEXT,           -- running, completed, error
  error               TEXT,
  UNIQUE(tenant, resource)
);

-- Idempotência de webhooks
CREATE TABLE sienge_webhook_events (
  id                  TEXT PRIMARY KEY,  -- x-sienge-hook-id
  tenant              TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  resource_id         TEXT NOT NULL,
  processed_at        TIMESTAMPTZ,
  error               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

## Frequência de Sync por Recurso

| Recurso | Mecanismo | Frequência | Justificativa |
|---------|-----------|-----------|---------------|
| Empreendimentos | Polling | 1x/dia (off-peak) | Muda raramente |
| Unidades | Webhook + polling 6h | Tempo real | Status muda com vendas |
| Clientes | Webhook + polling 6h | Tempo real | Dados críticos |
| Contratos | Webhook + polling 4h | Tempo real | Crítico para pipeline |
| Parcelas | Polling por cliente | 4x/dia | Endpoint é `?customerId=X` — sem listagem global |
| Comissões | Polling | 2x/dia | Não é tempo real |

## Exceções: Direct Query ao Sienge

Só ir direto ao Sienge quando:

1. **Preview de antecipação** — cálculo financeiro on-demand, 1 req por ação do usuário
2. **Download de anexo/documento** — binário, não faz sentido cachear no Supabase
3. **Confirmação de disponibilidade antes de reservar** — garantir que unidade ainda está disponível no exato momento da ação

## Credenciais por Tenant

Cada cliente Trifold tem suas próprias credenciais Sienge:

```sql
-- Tabela de credenciais (valores criptografados)
CREATE TABLE sienge_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id),
  subdomain       TEXT NOT NULL,
  username        TEXT NOT NULL,
  password_enc    TEXT NOT NULL,  -- criptografado com chave do Vault
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);
```

**NUNCA** expor credenciais em logs ou responses de API.

## Gotchas Críticos

1. **Timezone**: Sienge não retorna timezone em datas — assumir BRT (UTC-3) e converter para UTC ao salvar
2. **subdomain ≠ org_slug do Trifold** — manter mapeamento explícito na tabela `sienge_credentials`
3. **CV CRM conflict**: se cliente usa CV CRM, evitar `POST /customers` (duplicação). Trifold só lê, CV escreve
4. **N+1 após webhook**: batch os fetches quando múltiplos webhooks chegam juntos
5. **Paginação serial**: sem Bulk Data, carga inicial de 5.000 clientes = 25 requests seriais (não paralelos — rate limit)
6. **Reconciliação**: webhooks podem ser perdidos se endpoint ficou offline. Polling de 6h como fallback é obrigatório
7. **`/accounts-receivable` não existe**: a doc oficial do Sienge cita este endpoint, mas ele retorna 404 no tenant `construtoraexpansao`. Usar `/customer-financial-statements?customerId=X` como substituto validado em produção
8. **Sync de parcelas é por cliente**: não existe listagem global de parcelas — é obrigatório iterar pelos `sienge_customer_id` conhecidos e fazer 1 request por cliente. Respeitar rate limit (200 req/min)
9. **Boleto via `/payment-slip-notification`**: o campo `generatedBillet: true` indica que existe boleto. Para obter o PDF, chamar `GET /payment-slip-notification?billReceivableId={id}&installmentId={id}`. Só funciona se a parcela tiver cobrança registrada no Sienge E saldo > 0. Retorna 422 caso contrário
10. **`customer-income-tax` não habilitado**: informe de rendimentos retorna 404 no tenant `construtoraexpansao`. Módulo separado — solicitar ao suporte Sienge para habilitar. Endpoint existe na doc oficial

## Padrão de Polling com Cursor

```typescript
async function syncResource(tenant: string, resource: string, fetchFn: Function) {
  const supabase = createAdminClient()

  // Pegar cursor atual
  const { data: log } = await supabase
    .from('sienge_sync_log')
    .upsert({ tenant, resource, status: 'running' }, { onConflict: 'tenant,resource' })
    .select()
    .single()

  let offset = log?.last_offset ?? 0
  const limit = 200

  while (true) {
    const items = await fetchFn(tenant, { offset, limit })

    if (items.length === 0) break

    // Upsert no Supabase
    await supabase.from(`sienge_${resource}`).upsert(
      items.map(item => mapSiengeToTrifold(item, tenant)),
      { onConflict: `sienge_${resource.slice(0, -1)}_id` }
    )

    offset += items.length
    await supabase
      .from('sienge_sync_log')
      .update({ last_offset: offset })
      .match({ tenant, resource })

    if (items.length < limit) break

    // Respeitar rate limit
    await new Promise(resolve => setTimeout(resolve, 400))
  }

  await supabase
    .from('sienge_sync_log')
    .update({ status: 'completed', last_run_at: new Date().toISOString(), last_offset: 0 })
    .match({ tenant, resource })
}
```

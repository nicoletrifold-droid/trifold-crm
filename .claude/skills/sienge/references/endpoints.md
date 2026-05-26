# Sienge API — Endpoints Relevantes para o Trifold CRM

Todos os endpoints usam base URL:
```
https://api.sienge.com.br/{subdomain}/public/api/v1/
```

## Prioridade Alta

### Clientes (`/customers`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/customers` | Lista clientes (paginado, max 200) |
| GET | `/customers/{id}` | Detalhe do cliente |
| POST | `/customers` | Cria cliente (lead qualificado → Sienge) |
| PUT | `/customers/{id}` | Atualiza cliente |
| PATCH | `/customers/{id}` | Atualização parcial |
| PUT | `/customers/{id}/spouse` | Dados do cônjuge |
| GET | `/customer-types` | Tipos: PF, PJ, Investidor |

**Campos-chave:** `id`, `name`, `cpf`, `email`, `phone`, `customerTypeId`

### Contratos de Venda (`/sales-contracts`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/sales-contracts` | Lista contratos |
| GET | `/sales-contracts/{id}` | Detalhe + parcelas |
| POST | `/sales-contracts` | Cria contrato |
| PATCH | `/sales-contracts/{id}` | Atualiza contrato |
| GET | `/sales-contracts/{id}/attachments` | Lista anexos |
| POST | `/sales-contracts/{id}/attachments` | Adiciona anexo |
| GET | `/sales-contracts/{id}/commissions` | Comissões do contrato |

**Campos-chave:** `id`, `contractNumber`, `customerId`, `unitId`, `status`, `totalValue`, `signatureDate`

### Unidades (`/units`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/units` | Lista unidades (com filtros) |
| GET | `/units/{id}` | Detalhe: área, preço, status, andar |
| PUT | `/units/{id}` | Atualiza características |

**Campos-chave:** `id`, `enterpriseId`, `block`, `floor`, `number`, `status` (Disponível/Vendida/Reservada), `area`, `totalPrice`

**Filtros úteis:** `?enterpriseId=123&status=available`

### Empreendimentos (`/enterprises`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/enterprises` | Lista empreendimentos |
| GET | `/enterprises/{id}` | Detalhe |

**Campos-chave:** `id`, `name`, `address`, `city`, `totalUnits`, `availableUnits`

## Prioridade Alta — Financeiro

### Contas a Receber (`/accounts-receivable`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/accounts-receivable/installments` | Parcelas a receber |
| GET | `/accounts-receivable/installments/{id}` | Detalhe da parcela |
| GET | `/accounts-receivable/{id}/anticipation` | Preview de antecipação (DIRECT QUERY — não cachear) |

**Campos-chave:** `id`, `contractId`, `customerId`, `dueDate`, `value`, `status`, `paidDate`

## Prioridade Média

### Comissões de Vendas (`/sales-commissions`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/sales-commissions` | Lista comissões |
| POST | `/sales-commissions` | Registra comissão |

### Entrega de Chaves (`/keys-handover`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/keys-handover` | Lista entregas |
| GET | `/keys-handover/{id}` | Detalhe |

**Uso no Trifold:** gatilho para NPS pós-venda e notificação ao cliente no Portal.

### Acompanhamento de Obra

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/construction-daily-report` | Diário de obra |
| GET | `/building-cost-estimations` | Orçamento de obra |

**Uso no Trifold:** exibir progresso da obra no Portal do Cliente (Epic 20).

## Bulk Data (apenas plano Ultimate)

```
https://api.sienge.com.br/{subdomain}/public/api/bulk-data/v1/
```

| Endpoint | Uso |
|----------|-----|
| `/bulk-data/customers` | Carga inicial completa de clientes |
| `/bulk-data/sales-contracts` | Carga inicial de contratos |
| `/bulk-data/accounts-receivable` | Histórico financeiro completo |

**Quando usar:** carga inicial ou reconciliação completa. Na operação normal, usar REST + webhooks.

## Parâmetros de Paginação (REST)

```
GET /customers?offset=0&limit=200
```

- `limit`: máximo 200
- `offset`: posição de início
- Iterar até retornar menos que `limit`

## Download de Anexos

Retorna stream binário — tratar `Content-Type` adequadamente:
```typescript
const response = await fetch(`${baseUrl}/sales-contracts/${id}/attachments/${attachmentId}/download`, options)
const blob = await response.blob()
// Upload para Supabase Storage
```

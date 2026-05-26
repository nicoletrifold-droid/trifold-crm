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

### Extrato Financeiro do Cliente (`/customer-financial-statements`)

> ⚠️ **ATENÇÃO:** O endpoint `/accounts-receivable/installments` documentado na doc oficial do Sienge **NÃO EXISTE** no tenant `construtoraexpansao` (retorna 404). O endpoint real validado em produção é `/customer-financial-statements`.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/customer-financial-statements?customerId={id}` | Extrato completo do cliente (parcelas + recibos) |

**Parâmetro obrigatório:** `customerId` (Integer) — sem ele retorna 400.

**Estrutura da resposta:**

```json
{
  "resultSetMetadata": { "count": 1, "offset": 0, "limit": 1 },
  "results": [
    {
      "billsReceivable": [
        {
          "billReceivableId": 11045,
          "costCenterId": 8,
          "finePercent": 2.0,
          "interestPercent": 1.0,
          "documentId": "VIND-101",
          "documentCode": "CT",
          "subJudice": false,
          "installments": [
            {
              "installmentId": 1,
              "installmentNumber": "1",
              "dueDate": "2026-04-27",
              "conditionType": "AT",
              "originalValue": 10000.0,
              "currentBalance": 0.0,
              "interestPercent": 0.0,
              "generatedBillet": true,
              "receipts": [
                {
                  "calculationDate": "2026-03-01",
                  "receiptDate": "2026-04-29",
                  "receiptValue": 10000.0,
                  "interestValue": 0.0,
                  "additionalValue": 0.0,
                  "discountValue": 0.0,
                  "administrativeFee": 0.0,
                  "netReceiptValue": 10000.0,
                  "receiptType": "Recebimento",
                  "insuranceAmount": 0.0,
                  "bankMovements": [],
                  "accountNumber": "QITECHCOB",
                  "creditDate": null
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Campos do nível `billsReceivable`:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `billReceivableId` | Int | ID da conta a receber |
| `documentId` | String | Número do contrato (ex: `VIND-101`) |
| `documentCode` | String | Tipo do documento |
| `finePercent` | Float | % de multa por atraso |
| `interestPercent` | Float | % de juros mensais |
| `costCenterId` | Int | Centro de custo |
| `subJudice` | Bool | Contrato em processo judicial |

**Campos do nível `installments`:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `installmentId` | Int | ID da parcela |
| `installmentNumber` | String | Número sequencial da parcela |
| `dueDate` | Date | Data de vencimento |
| `conditionType` | String | `AT`=Ato, `PI`=Intermediária, `PM`=Mensal, `CH`=Chaves |
| `originalValue` | Float | Valor original sem juros |
| `currentBalance` | Float | Saldo atual (com juros/correção) — `0.0` = pago |
| `interestPercent` | Float | Juros aplicados à parcela |
| `generatedBillet` | Bool | `true` = boleto foi gerado (sem URL do PDF aqui) |
| `receipts` | Array | Registros de pagamento — vazio = não pago |

**Campos dentro de `receipts` (parcela paga):**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `receiptDate` | Date | Data do recebimento |
| `receiptValue` | Float | Valor recebido |
| `netReceiptValue` | Float | Valor líquido (descontando taxas) |
| `discountValue` | Float | Desconto aplicado |
| `interestValue` | Float | Juros cobrados |
| `creditDate` | Date\|null | Data de crédito na conta |
| `accountNumber` | String | Conta de crédito (ex: `QITECHCOB`) |

**Lógica de status da parcela:**
- `receipts.length > 0` → **PAGO**
- `receipts.length === 0 && generatedBillet === true` → **BOLETO GERADO / AGUARDANDO**
- `receipts.length === 0 && generatedBillet === false` → **EM ABERTO**

> **Lacuna conhecida:** `generatedBillet: true` indica que existe boleto, mas o endpoint **não retorna URL nem código de barras** do PDF. Investigar endpoint separado para download do boleto quando necessário.

### Boleto — Segunda Via (`/payment-slip-notification`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/payment-slip-notification?billReceivableId={id}&installmentId={id}` | Gera segunda via do boleto |

**Parâmetros obrigatórios:** `billReceivableId` (Integer) + `installmentId` (Integer)

- `billReceivableId` vem do campo `billReceivableId` dentro de `billsReceivable[]` no extrato
- `installmentId` vem do campo `installmentId` dentro de `installments[]` no extrato

**Pré-requisito:** a parcela precisa ter uma cobrança registrada no Sienge (`generatedBillet: true`) e saldo devedor maior que zero (`currentBalance > 0`). Se não tiver cobrança cadastrada retorna 422:
```json
{ "status": 422, "clientMessage": "Não foram encontradas parcelas aptas para geração da segunda via..." }
```

**Lógica de uso no Portal do Cliente:**
```typescript
// Só mostrar botão "Ver Boleto" quando:
const podeGerarBoleto = installment.generatedBillet === true && installment.currentBalance > 0

// Se true → chamar:
GET /payment-slip-notification?billReceivableId={bill.billReceivableId}&installmentId={inst.installmentId}
```

**Fluxo completo:**
```
GET /customer-financial-statements?customerId={id}
  → billsReceivable[].billReceivableId         (ex: 11045)
  → billsReceivable[].installments[].installmentId  (ex: 4)
  → billsReceivable[].installments[].generatedBillet (true/false)
  → billsReceivable[].installments[].currentBalance  (> 0 = em aberto)
       ↓
GET /payment-slip-notification?billReceivableId=11045&installmentId=4
  → PDF / link do boleto
```

### Informe de Rendimentos (`/customer-income-tax`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/customer-income-tax?customerId={id}&year={ano}` | Informe de rendimentos IRPF |

> ⚠️ **Status no tenant `construtoraexpansao`:** retorna **404** — módulo não habilitado no plano atual. Solicitar ao suporte Sienge a habilitação do recurso `customer-income-tax`. Endpoint existe na doc oficial e em outros tenants.

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

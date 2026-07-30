# ADR-006: Cobrança Atrás de Abstração, sem Gateway na Fase 1

- **Status:** **Accepted** — a ausência de gateway na fase 1 é decisão do dono do produto (Gabriel, 2026-07-29); o desenho da abstração é do @architect (Aria)
- **Data:** 2026-07-29
- **Documento pai:** `docs/architecture/saas-multi-tenant.md` §1.5, §2.6
- **Código afetado:** `packages/web/src/lib/revenue/**` (novo)

---

## Contexto

Decisão de produto: **nesta fase não há gateway de pagamento**. O sistema controla planos, módulos contratados, limites e registro de consumo; a cobrança acontece fora (contrato e boleto manual). Mas a arquitetura precisa permitir plugar Asaas ou Stripe depois **sem refactor amplo**.

Há também um risco de nomenclatura concreto. Já existe `packages/web/src/lib/billing/` e as tabelas `platform_services`, `service_billing_reminders`, `service_billing_*` (Epic 78, `supabase/migrations/164_platform_services_billing.sql`). Esse domínio é o **custo operacional da própria Trifold** — a conta Anthropic, o time Vercel, o Supabase, o Resend. A própria migration 164 documenta a decisão de não ter `org_id` porque "não existe serviço Anthropic da org X — é recurso único compartilhado por toda a instância".

Se o domínio novo se chamar "billing" também, os dois viram um só na cabeça de quem lê o código, e a chance de alguém somar custo de fornecedor com receita de cliente é alta.

## Decisão

### 1. Convenção de nomes que separa os dois domínios

| Domínio | Significado | Código | Tabelas |
|---|---|---|---|
| Custo de plataforma (Epic 78, existente) | o que a Trifold **paga** | `lib/billing/` | `platform_services`, `service_billing_*` |
| Tenancy (novo) | quem é o tenant, o que contratou | `lib/tenancy/` | `plans`, `plan_modules`, `org_subscriptions`, `org_module_grants`, … |
| Revenue (novo) | o que a Trifold **recebe** | `lib/revenue/` | `tenant_invoices`, `tenant_invoice_lines`, `ai_usage_*`, `org_billing_periods` |

Regra: prefixo `platform_*` = coisa da Trifold-plataforma; prefixo `tenant_*`/`org_*` = relação comercial com um cliente. A palavra "billing" fica **reservada** para o Epic 78. Comentário de referência cruzada obrigatório em `lib/billing/subscriptions/price-table.ts` ↔ `lib/revenue/ai-price-table.ts`, que são os dois arquivos com maior chance de confusão.

### 2. `tenant_invoices` é o modelo canônico, já na fase manual

A fatura interna existe **antes** de existir gateway, e não é redundância: é o que torna o gateway um espelho em vez de uma fonte de verdade. Toda a matemática (plano + add-ons + excedente de IA − desconto) vive em `buildInvoiceForPeriod(orgId, period)`, uma função pura sobre `org_billing_periods` + `plans` + `org_module_grants`, cujo resultado é persistido em `tenant_invoices` + `tenant_invoice_lines`.

Regra: **nunca gravar linha de fatura direto de uma tela.** Só via `buildInvoiceForPeriod`. Isso mantém a fatura reproduzível e auditável — dá para recalcular um período de seis meses atrás e comparar.

Colunas de extensão já nascem na tabela, nulas na fase manual: `provider`, `provider_invoice_id`, `provider_status`, `provider_payload`, `provider_synced_at`. Em `org_subscriptions`: `billing_provider` (default `'manual'`), `provider_customer_id`, `provider_subscription_id`.

### 3. A interface

```ts
// packages/web/src/lib/revenue/billing-provider/types.ts
export interface TenantBillingProvider {
  readonly id: string   // 'manual' | 'asaas' | 'stripe'
  ensureCustomer(org: OrgBillingProfile): Promise<{ providerCustomerId: string }>
  createSubscription(input: CreateSubscriptionInput): Promise<{ providerSubscriptionId: string }>
  issueInvoice(invoice: TenantInvoice): Promise<{ providerInvoiceId: string; hostedUrl?: string }>
  syncInvoiceStatus(providerInvoiceId: string): Promise<InvoiceStatusSnapshot>
  cancelSubscription(providerSubscriptionId: string): Promise<void>
}

export function getBillingProvider(id: string): TenantBillingProvider
```

`ManualBillingProvider` (fase 1): `ensureCustomer` e `createSubscription` são no-ops que devolvem um id sintético; `issueInvoice` marca `status='issued'`, gera PDF interno e dispara e-mail; `syncInvoiceStatus` devolve o que o operador marcou no `/platform`; `cancelSubscription` só muda o status local.

### 4. Fronteira do que o provider sabe

O provider sabe: cliente, valor, vencimento, status de pagamento.

O provider **não** sabe: o que é entitlement, como se calcula excedente de IA, o que acontece em `suspended`, quais módulos o plano inclui. Toda regra de negócio consome **status da assinatura e da fatura**, nunca a API do gateway. É essa fronteira, e não a interface em si, que evita o refactor amplo.

Corolário: a transição para `past_due`/`suspended` é decidida por `api/cron/subscription-lifecycle` lendo `tenant_invoices.status`, não por webhook do gateway. Quando o gateway entrar, o webhook dele só faz uma coisa: atualizar `tenant_invoices.status`. Nada mais.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Sem modelo de fatura na fase 1** (só `org_subscriptions` + planilha) | quando o gateway entrar, seria preciso criar o modelo, retroalimentar o histórico e reescrever a matemática de excedente. É exatamente o refactor amplo que a decisão de produto pede para evitar |
| **Integrar Asaas já agora** | decisão de produto é não. E integrar antes de saber o volume/modelo comercial real gastaria esforço em algo que pode não ser o gateway escolhido |
| **Espelhar o modelo de dados do Stripe** (products/prices/subscriptions/invoices) | acopla o schema a um provider antes de escolhê-lo; e o modelo do Stripe é mais complexo do que o necessário (proration, múltiplos itens, trials com regras próprias) |
| **Reusar `lib/billing/` do Epic 78** | domínios opostos (o que se paga vs. o que se recebe); a colisão semântica é o principal risco identificado neste ADR |
| Cálculo de fatura na tela do `/platform` | fatura não reproduzível; impossível recalcular um período antigo ou auditar uma divergência |

## Consequências

**Positivas:** a fase manual já produz histórico financeiro estruturado (útil para contabilidade e para decidir o gateway com dados reais); trocar/adicionar provider é uma classe nova + um registro no factory; nenhuma regra de negócio sabe qual provider está ativo; o `/platform` opera cobrança sem SQL manual desde a Onda 6.

**Negativas e aceitas:**
- Constrói-se infra de faturamento antes de haver receita recorrente automática. Trabalho aparentemente redundante na fase 1 — é o preço explícito de não fazer refactor depois.
- `ManualBillingProvider` é quase todo no-op, o que pode parecer over-engineering em code review. O ADR existe em parte para responder a essa objeção quando ela aparecer.
- Baixa de pagamento é manual, logo sujeita a erro humano e a atraso: uma org pode ficar `past_due` porque alguém esqueceu de marcar a fatura como paga. Mitigação (e é por isso que a recomendação em Q5 é suspensão **manual**, não automática): nenhuma suspensão acontece sem decisão humana.
- Ainda faltam definir, do lado comercial: preço por 1.000 créditos excedentes e faixas (Q2b). Sem isso `ai_overage_tiers` fica vazio e o excedente não é faturável, mesmo com toda a medição funcionando.

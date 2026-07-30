# Arquitetura: Trifold CRM → SaaS Multi-Tenant com Cobrança Modular

- **status:** proposto (em revisão pelo dono do produto)
- **autor:** Aria (@architect)
- **data:** 2026-07-29
- **depende de:** `docs/audits/rls-multi-tenant-audit.md` (auditoria tabela-por-tabela das 218 policies — produzida em paralelo pelo @data-engineer). Este documento **não** repete a auditoria: consome o resultado dela como entrada da Onda 1.
- **ADRs:** `docs/architecture/adr/adr-002-...` a `adr-007-...` (ver §12)

## Índice

1. [Contexto e objetivo](#1-contexto-e-objetivo)
2. [Modelo de dados de plataforma](#2-modelo-de-dados-de-plataforma)
3. [Camadas de autorização](#3-camadas-de-autorização)
4. [Modelo de entitlements](#4-modelo-de-entitlements)
5. [Medição e cobrança de IA](#5-medição-e-cobrança-de-ia)
6. [Painel super-admin (`/platform`)](#6-painel-super-admin-platform)
7. [Provisionamento de nova org](#7-provisionamento-de-nova-org)
8. [Hardening de segurança e o CI gate](#8-hardening-de-segurança-e-o-ci-gate)
9. [Análise de impacto](#9-análise-de-impacto)
10. [Faseamento](#10-faseamento)
11. [Riscos, trade-offs e decisões abertas](#11-riscos-trade-offs-e-decisões-abertas)
12. [ADRs](#12-adrs)

---

## 1. Contexto e objetivo

### 1.1 Onde estamos

O Trifold CRM já é **multi-tenant no esqueleto e single-tenant na prática**.

Fatos verificados no código:

| Fato | Evidência |
|---|---|
| `organizations` existe desde o dia 1 | `supabase/migrations/001_base_schema.sql:58-67` (id, name, slug, logo_url, settings jsonb, is_active) |
| Todo usuário pertence a uma org | `users.org_id NOT NULL REFERENCES organizations` (mesma migration) |
| `org_id` está espalhado por quase tudo | 121 migrations, 357 arquivos TS/TSX (fora testes) |
| Helper de isolamento existe | `public.user_org_id()` em `supabase/migrations/004_rls_policies.sql:10-13` |
| RBAC por módulo é maduro | `roles`, `role_permissions`, `user_permission_exceptions`, sub-módulos com `.`, cache `unstable_cache` — `packages/web/src/lib/permissions.ts` (621 linhas) |
| 26 módulos catalogados | `packages/web/src/lib/permissions-modules.ts` — `ALL_MODULES` |
| 108 tabelas, 192 migrations | `supabase/migrations/` |

E o que falta:

| Lacuna | Evidência |
|---|---|
| **Não existe camada de entitlement** — só permissão intra-org | `permissions.ts` só resolve "este usuário pode?", nunca "esta empresa contratou?" |
| **RLS tem buracos reais** | ~98 de 195 cláusulas `USING` mencionam `org_id`; detalhamento em `docs/audits/rls-multi-tenant-audit.md` |
| **RLS não é a camada de enforcement efetiva** | **166 dos 285 route handlers usam `createAdminClient()`** (service-role, bypassa RLS). O isolamento real hoje depende de `.eq("org_id", …)` escrito à mão em cada query |
| **UUIDs de uma org vazados em constantes** | `lib/leads/default-stage.ts`, `lib/leads/stage-filters.ts`, `lib/appointments/locations.ts`, `lib/sla/waiting.ts`, `app/broker/page.tsx`, `app/dashboard/pipeline/page.tsx`, `api/leads/[id]/{tasks,notes,mark-lost}`, `api/imob/leads`, `api/webhooks/landing-page`, `api/cron/supremo-sync`, `api/cron/daily-report` (`DEFAULT_ORG_ID`), `components/leads/lead-detail-drawer.tsx` |
| **37 crons assumem uma única org** | `packages/web/src/app/api/cron/*` |
| **Credenciais de integração são globais (env)** | `WHATSAPP_PHONE_NUMBER_ID`, `META_PAGE_ACCESS_TOKEN`, `SIENGE_*`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SUPREMO_API_TOKEN`, `CLICKSIGN_API_TOKEN` |
| **Não existe CI** | `.github/` contém apenas `agents/` — **nenhum workflow**. O gate de RLS exigido precisa ser criado do zero |
| **Não existe staging** | O Supabase de dev aponta para produção (`project_supabase_prod_only`). Não há rede de proteção para testar isolamento |
| **Consumo de IA não é medido por org** | Nenhuma tabela com `input_tokens`/`output_tokens` em 192 migrations |

### 1.2 Objetivo

Transformar o sistema em SaaS multi-tenant com **venda modular escalonada** (do CRM ao sistema completo), **provisionamento pela Trifold** (sem signup público) e **cobrança recorrente com cota de IA + excedente**, sem interromper a operação real da Trifold Engenharia, que roda em produção.

### 1.3 O que muda de single → multi-tenant

Cinco mudanças estruturais, em ordem de risco:

1. **Isolamento deixa de ser convenção e passa a ser invariante verificada.** Hoje o isolamento é uma prática (escrever `.eq("org_id", …)`); passa a ser um contrato com gate automatizado em CI (§8) e testes cross-tenant.
2. **Nasce a camada de entitlement**, ortogonal ao RBAC. Acesso efetivo = `entitlement da org ∧ permissão do usuário` (§4).
3. **Constantes viram dados por org.** Stages, imóveis default, org default — tudo resolvido por chave semântica (§7).
4. **Consumo de IA passa a ser atribuído, medido e limitado por org** (§5).
5. **Nasce um plano de controle** (`/platform`) separado do plano do cliente (`/dashboard`), com trilha de auditoria (§3, §6).

### 1.4 Princípios de projeto (restrições auto-impostas)

| # | Princípio | Consequência prática |
|---|---|---|
| P1 | **Trifold é apenas mais um tenant.** | Nenhum `if (orgId === TRIFOLD)` no código. A Trifold recebe o plano "Completo" e passa pelos mesmos caminhos. É o melhor teste de regressão que existe: se a Trifold não perceber nada, a camada está correta. |
| P2 | **Toda onda é deployável sozinha e reversível.** | Sem produção paralela, sem big bang. Expand → migrate → contract em tudo que toca dado existente. |
| P3 | **Entitlement nunca destrói dado.** | Downgrade bloqueia acesso; nunca apaga. |
| P4 | **Cobrança é plugável, não acoplada.** | Nenhuma regra de negócio sabe se o pagamento é boleto manual ou Asaas (§2.6, ADR-006). |
| P5 | **A medição de IA falha aberta.** | Se a telemetria de consumo cair, a Nicole continua respondendo. Métrica perdida é prejuízo pequeno; conversa perdida é prejuízo grande. |
| P6 | **Isolamento antes de monetização.** | Nenhuma feature de venda entra antes de o gate de RLS estar verde e ratcheted. |
| P7 | **RLS é a rede, não o piso.** | Como 166 arquivos usam service-role, RLS sozinha não protege. O piso é o filtro explícito de org + lint; RLS é a rede que pega o que passar. Ambos são obrigatórios. |

### 1.5 Convenção de nomes — separar dois domínios de "billing"

Já existe `packages/web/src/lib/billing/` e as tabelas `platform_services`, `service_billing_reminders`, `service_billing_*` (Epic 78, `supabase/migrations/164_platform_services_billing.sql`). **Esse domínio é o custo operacional da própria Trifold** (a conta Anthropic, o time Vercel, o Supabase) — não é cobrança de cliente. A própria migration 164 documenta a decisão de não ter `org_id`.

Para não criar ambiguidade, esta arquitetura fixa a seguinte convenção:

| Domínio | Significado | Código | Tabelas |
|---|---|---|---|
| **Custo de plataforma** (existente, Epic 78) | O que a Trifold **paga** aos fornecedores | `packages/web/src/lib/billing/` | `platform_services`, `service_billing_*` |
| **Tenancy** (novo) | Quem é o tenant, o que contratou, o que pode acessar | `packages/web/src/lib/tenancy/` | `sellable_modules`, `plans`, `plan_modules`, `org_subscriptions`, `org_module_grants`, `org_limit_overrides`, `org_integrations` |
| **Revenue** (novo) | O que a Trifold **recebe** dos clientes | `packages/web/src/lib/revenue/` | `tenant_invoices`, `tenant_invoice_lines`, `ai_usage_*`, `org_billing_periods` |

Regra mnemônica: prefixo `platform_*` = coisa da Trifold-plataforma (serviços dela, staff dela, auditoria dela); prefixo `tenant_*`/`org_*` = relação comercial com um cliente. A palavra "billing" no código fica **reservada** para o Epic 78 — o domínio novo usa "revenue"/"faturamento".

Os dois domínios se cruzam em exatamente um ponto, e é um ponto valioso: o coletor `api/cron/billing-collect-anthropic` conhece o **gasto real total** da Trifold na Anthropic. A soma de `ai_usage_events.cost_micro_usd` por período tem que reconciliar com esse número. Isso dá um oráculo gratuito para validar a medição antes de cobrar ninguém (§5.7).

---

## 2. Modelo de dados de plataforma

DDL em alto nível. O @data-engineer detalha tipos, índices, constraints e escreve as migrations.

Numeração: as migrations novas começam em **193** (a última é `192_stamp_primeiro_atendimento_ignora_sdr.sql`). Convenção de 3 dígitos e `_remote_only.sql` para operações não transacionais permanece.

### 2.1 Catálogo comercial de módulos

```sql
-- Projeção COMERCIAL de ALL_MODULES. A fonte de verdade dos identificadores
-- continua sendo packages/web/src/lib/permissions-modules.ts (ALL_MODULES).
-- Um teste de CI (gate R6, §8) garante que esta tabela cobre 100% de ALL_MODULES.
CREATE TABLE sellable_modules (
  key            text PRIMARY KEY,          -- 'leads', 'obras', 'configuracoes.integracoes'
  label          text NOT NULL,
  description    text,
  is_core        boolean NOT NULL DEFAULT false, -- sempre entitled, independe de plano
  min_tier_order integer,                   -- tier a partir do qual é vendido (para upsell)
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

**Módulos core** (`is_core = true`, nunca bloqueáveis): `dashboard`, `chamados`, `configuracoes`. Sem eles o admin do cliente ficaria trancado fora das próprias configurações e sem canal de suporte — bloquear seria um tiro no pé. (Questão aberta Q7: `chamados` pode ser add-on pago.)

### 2.2 Planos

```sql
CREATE TABLE plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,      -- 'crm', 'crm-obras', 'completo'
  name                text NOT NULL,
  description         text,
  tier_order          integer NOT NULL,          -- 10, 20, 30 — ordena upsell
  monthly_price_cents integer NOT NULL,          -- referência contratual; cobrança acontece fora
  setup_fee_cents     integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'BRL',
  -- Cota de IA
  ai_quota_credits      numeric NOT NULL,        -- unidade: ver §5.3
  ai_overage_tiers      jsonb NOT NULL DEFAULT '[]',  -- [{ up_to: 5000, price_cents_per_1k: 900 }, …]
  ai_overage_policy     text NOT NULL DEFAULT 'overage'
                        CHECK (ai_overage_policy IN ('overage','degrade','hard_stop')),
  ai_hard_cap_multiplier numeric NOT NULL DEFAULT 3.0,  -- válvula de segurança da Trifold
  is_active           boolean NOT NULL DEFAULT true,
  is_internal         boolean NOT NULL DEFAULT false,   -- plano 'completo-interno' da Trifold
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_modules (
  plan_id    uuid NOT NULL REFERENCES plans ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES sellable_modules ON DELETE RESTRICT,
  PRIMARY KEY (plan_id, module_key)
);

CREATE TABLE plan_limits (
  plan_id     uuid NOT NULL REFERENCES plans ON DELETE CASCADE,
  limit_key   text NOT NULL,   -- 'max_users','max_leads','max_properties','max_whatsapp_numbers'
  limit_value bigint,          -- NULL = ilimitado
  PRIMARY KEY (plan_id, limit_key)
);
```

`ai_overage_tiers` como JSONB e não tabela: é uma lista curta, sempre lida junto com o plano, e nunca consultada isoladamente. Trade-off aceito (perde validação relacional, ganha simplicidade); a validação vira um CHECK de shape + validação em TypeScript com Zod no `/platform`.

### 2.3 Assinatura da org

```sql
CREATE TABLE org_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organizations ON DELETE RESTRICT,
  plan_id              uuid NOT NULL REFERENCES plans ON DELETE RESTRICT,
  status               text NOT NULL DEFAULT 'trial'
                       CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
  billing_day          smallint NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  current_period_start date NOT NULL,
  current_period_end   date NOT NULL,
  trial_ends_at        date,
  past_due_since       date,
  suspended_at         timestamptz,
  cancelled_at         timestamptz,
  cancel_reason        text,
  contract_ref         text,           -- nº do contrato/pasta física
  -- Ponto de extensão para gateway (ADR-006) — NULL na fase manual
  billing_provider         text NOT NULL DEFAULT 'manual',
  provider_customer_id     text,
  provider_subscription_id text,
  notes                text,
  created_by           uuid REFERENCES users,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Uma org só pode ter UMA assinatura viva
CREATE UNIQUE INDEX org_subscriptions_one_live
  ON org_subscriptions (org_id)
  WHERE status <> 'cancelled';
```

Add-ons e exceções comerciais, sem precisar criar um plano novo para cada negociação:

```sql
CREATE TABLE org_module_grants (
  org_id     uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES sellable_modules ON DELETE RESTRICT,
  granted    boolean NOT NULL,     -- true = add-on; false = revogação explícita
  reason     text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, module_key)
);

CREATE TABLE org_limit_overrides (
  org_id      uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  limit_key   text NOT NULL,
  limit_value bigint,
  reason      text NOT NULL,
  created_by  uuid REFERENCES users,
  PRIMARY KEY (org_id, limit_key)
);
```

### 2.4 Entitlement efetivo — derivado, não materializado

Decisão (ADR-003): **não existe tabela `org_entitlements`.** O entitlement é sempre derivado de `org_subscriptions` + `plan_modules` + `org_module_grants` + `status`. Motivo: uma tabela materializada cria a pior classe de bug possível neste domínio — divergência silenciosa entre "o que o cliente pagou" e "o que o cliente acessa", em qualquer direção (perda de receita ou vazamento de módulo).

```sql
CREATE OR REPLACE FUNCTION public.org_entitled_modules(p_org_id uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sub AS (
    SELECT plan_id, status FROM org_subscriptions
    WHERE org_id = p_org_id AND status <> 'cancelled'
    LIMIT 1
  ),
  core AS (SELECT key FROM sellable_modules WHERE is_core),
  from_plan AS (
    SELECT pm.module_key AS key
    FROM plan_modules pm JOIN sub ON sub.plan_id = pm.plan_id
    WHERE sub.status IN ('trial','active','past_due')      -- suspended/cancelled ⇒ só core
  ),
  add_ons AS (
    SELECT module_key AS key FROM org_module_grants
    WHERE org_id = p_org_id AND granted
      AND (expires_at IS NULL OR expires_at > now())
      AND EXISTS (SELECT 1 FROM sub WHERE status IN ('trial','active','past_due'))
  ),
  revoked AS (
    SELECT module_key AS key FROM org_module_grants
    WHERE org_id = p_org_id AND NOT granted
  )
  SELECT key FROM (
    SELECT key FROM core
    UNION SELECT key FROM from_plan
    UNION SELECT key FROM add_ons
  ) u
  WHERE key NOT IN (SELECT key FROM revoked WHERE key NOT IN (SELECT key FROM core));
$$;
```

Precedência: `core` > `revoked` > `add_on` > `plan`. Uma revogação explícita não consegue derrubar um módulo core (senão o admin do cliente se tranca fora).

### 2.5 Medição e cota de IA

```sql
-- Evento bruto — alto volume, particionado por mês
CREATE TABLE ai_usage_events (
  id                bigint GENERATED ALWAYS AS IDENTITY,
  org_id            uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  provider          text NOT NULL,        -- 'anthropic' | 'openai'
  model             text NOT NULL,
  feature           text NOT NULL,        -- 'nicole.chat','enrich','behavior-analysis',…
  input_tokens      integer NOT NULL DEFAULT 0,
  output_tokens     integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_micro_usd    bigint  NOT NULL,     -- custo real calculado pela price table
  billable_credits  numeric NOT NULL,     -- unidade de cota (§5.3)
  -- atribuição opcional, para o cliente auditar o próprio consumo
  lead_id           uuid,
  conversation_id   uuid,
  user_id           uuid,
  provider_request_id text,               -- idempotência
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE UNIQUE INDEX ai_usage_events_req_uniq
  ON ai_usage_events (provider, provider_request_id, occurred_at)
  WHERE provider_request_id IS NOT NULL;
```

Retenção: 13 meses de detalhe (permite comparação ano-a-ano do mesmo mês), depois só o rollup.

```sql
-- Rollup diário — o que a UI do cliente e o /platform leem
CREATE TABLE ai_usage_daily (
  org_id           uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  usage_date       date NOT NULL,
  feature          text NOT NULL,
  model            text NOT NULL,
  events           integer NOT NULL DEFAULT 0,
  input_tokens     bigint  NOT NULL DEFAULT 0,
  output_tokens    bigint  NOT NULL DEFAULT 0,
  cost_micro_usd   bigint  NOT NULL DEFAULT 0,
  billable_credits numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, usage_date, feature, model)
);

-- Contador quente do ciclo — 1 linha por org por período. É o que o gate de cota lê.
CREATE TABLE org_billing_periods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  subscription_id   uuid REFERENCES org_subscriptions,
  plan_id           uuid REFERENCES plans,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  quota_credits     numeric NOT NULL,
  consumed_credits  numeric NOT NULL DEFAULT 0,
  overage_credits   numeric NOT NULL DEFAULT 0,
  overage_amount_cents integer NOT NULL DEFAULT 0,
  cost_micro_usd    bigint  NOT NULL DEFAULT 0,   -- custo real, para margem
  alert_80_at       timestamptz,
  alert_100_at      timestamptz,
  degraded_at       timestamptz,
  hard_capped_at    timestamptz,
  closed_at         timestamptz,
  invoice_id        uuid,
  UNIQUE (org_id, period_start)
);
```

A separação `ai_usage_events` (append-only, particionada) / `ai_usage_daily` (rollup) / `org_billing_periods` (contador de 1 linha) existe para que o **caminho quente da Nicole leia exatamente uma linha** para decidir se pode chamar o modelo. Sem isso, cada mensagem viraria um `SUM()` sobre a partição do mês.

### 2.6 Faturas internas — o ponto de extensão de cobrança (ADR-006)

```sql
CREATE TABLE tenant_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations ON DELETE RESTRICT,
  subscription_id uuid REFERENCES org_subscriptions,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','issued','paid','overdue','void')),
  subtotal_plan_cents    integer NOT NULL DEFAULT 0,
  subtotal_overage_cents integer NOT NULL DEFAULT 0,
  subtotal_addons_cents  integer NOT NULL DEFAULT 0,
  discount_cents         integer NOT NULL DEFAULT 0,
  total_cents            integer NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'BRL',
  due_date        date,
  issued_at       timestamptz,
  paid_at         timestamptz,
  payment_method  text,          -- 'boleto','pix','transferencia','gateway'
  -- Extensão: preenchidos quando billing_provider <> 'manual'
  provider           text NOT NULL DEFAULT 'manual',
  provider_invoice_id text,
  provider_status     text,
  provider_payload    jsonb,
  provider_synced_at  timestamptz,
  created_by      uuid REFERENCES users,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_start)
);

CREATE TABLE tenant_invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES tenant_invoices ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('plan','module_addon','ai_overage','setup','discount','adjustment')),
  description text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 0
);
```

A abstração em código (`packages/web/src/lib/revenue/billing-provider/`):

```ts
export interface TenantBillingProvider {
  readonly id: string                                  // 'manual' | 'asaas' | 'stripe'
  ensureCustomer(org: OrgBillingProfile): Promise<{ providerCustomerId: string }>
  createSubscription(input: CreateSubscriptionInput): Promise<{ providerSubscriptionId: string }>
  issueInvoice(invoice: TenantInvoice): Promise<{ providerInvoiceId: string; hostedUrl?: string }>
  syncInvoiceStatus(providerInvoiceId: string): Promise<InvoiceStatusSnapshot>
  cancelSubscription(providerSubscriptionId: string): Promise<void>
}
```

`ManualBillingProvider` é a implementação da fase 1: `ensureCustomer` é no-op, `issueInvoice` só marca `status='issued'` e dispara e-mail com PDF gerado internamente, `syncInvoiceStatus` lê o que o operador marcou no `/platform`. Trocar por Asaas depois é registrar outra implementação no factory `getBillingProvider(subscription.billing_provider)` — nenhuma regra de negócio (cálculo de excedente, entitlement, suspensão) sabe qual provider está ativo. **É por isso que `tenant_invoices` existe já nesta fase mesmo sem gateway**: a fatura interna é o modelo canônico, o gateway é só um espelho dela.

O que NÃO fazer: gravar linha de fatura direto de uma tela. Todo cálculo passa por `buildInvoiceForPeriod(orgId, period)` — função pura sobre `org_billing_periods` + `plans` + `org_module_grants` — e o resultado é persistido. Isso mantém a fatura reproduzível e auditável.

### 2.7 Plano de controle: super-admin e auditoria

```sql
CREATE TABLE platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  level      text NOT NULL CHECK (level IN ('owner','operator','support')),
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE platform_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users,
  actor_email   text NOT NULL,          -- desnormalizado: sobrevive à exclusão do usuário
  action        text NOT NULL,          -- 'org.create','plan.change','module.grant','impersonation.start',…
  target_org_id uuid,
  target_table  text,
  target_id     text,
  before        jsonb,
  after         jsonb,
  reason        text,
  ip            inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_impersonation_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid NOT NULL REFERENCES users,
  target_org_id  uuid NOT NULL REFERENCES organizations,
  target_user_id uuid REFERENCES users,
  reason         text NOT NULL,
  write_enabled  boolean NOT NULL DEFAULT false,
  started_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  ended_at       timestamptz,
  revoked_by     uuid REFERENCES users,
  client_notified_at timestamptz
);
```

`platform_audit_log` é append-only: `REVOKE UPDATE, DELETE ON platform_audit_log FROM authenticated, service_role` e escrita apenas via função `SECURITY DEFINER` `platform_audit(...)`. Sem isso, a trilha não vale nada — quem consegue apagar a auditoria não está auditado.

### 2.8 Integrações por tenant

```sql
CREATE TABLE org_integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  provider     text NOT NULL,     -- 'whatsapp','meta_ads','sienge','resend','google','telegram','supremo','clicksign'
  status       text NOT NULL DEFAULT 'disconnected'
               CHECK (status IN ('disconnected','pending','connected','error')),
  config       jsonb NOT NULL DEFAULT '{}',   -- SÓ identificadores públicos (phone_id, waba_id, page_id, subdomain, from_domain)
  secret_ref   text,                          -- ponteiro para o Vault. NUNCA o segredo.
  connected_at timestamptz,
  last_error   text,
  last_check_at timestamptz,
  created_by   uuid REFERENCES users,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

-- Índices de roteamento reverso de webhook: identificador externo → org
CREATE UNIQUE INDEX org_integrations_whatsapp_phone
  ON org_integrations ((config->>'phone_number_id'))
  WHERE provider = 'whatsapp' AND config ? 'phone_number_id';
CREATE UNIQUE INDEX org_integrations_meta_page
  ON org_integrations ((config->>'page_id'))
  WHERE provider = 'meta_ads' AND config ? 'page_id';
```

Segredos ficam no **Supabase Vault** (`secret_ref` = id do secret), lidos só por service-role (ADR-005). Não vão para `config`, não vão para env por org (o gotcha de `vercel env add` gravando valor vazio já causou dois incidentes, e uma variável por cliente exigiria redeploy a cada venda).

### 2.9 RLS das tabelas novas

Aplicando o padrão de `supabase/migrations/131_imobiliarias.sql` (tabela sem policy permissiva + acesso só por service-role em rota gated):

| Tabela | RLS | Policy |
|---|---|---|
| `sellable_modules`, `plans`, `plan_modules`, `plan_limits` | ON | SELECT `TO authenticated USING (true)` para o catálogo ativo — o cliente precisa ver os planos para o upsell. Escrita só service-role. |
| `org_subscriptions`, `org_billing_periods`, `ai_usage_daily` | ON | SELECT `USING (org_id = public.user_org_id() AND public.is_admin())`. Escrita só service-role. |
| `ai_usage_events` | ON | **Nenhuma policy** (deny-all). Volume alto e contém atribuição a lead/usuário; o cliente consome via `ai_usage_daily`. |
| `tenant_invoices`, `tenant_invoice_lines` | ON | SELECT `USING (org_id = public.user_org_id() AND public.is_admin())` — o cliente vê as próprias faturas. Escrita só service-role. |
| `org_module_grants`, `org_limit_overrides` | ON | Deny-all. É informação comercial da negociação (inclui `reason` e `price_cents`); o cliente vê o efeito, não a planilha. |
| `platform_admins`, `platform_audit_log`, `platform_impersonation_sessions` | ON | Deny-all absoluto. |
| `org_integrations` | ON | SELECT `USING (org_id = public.user_org_id() AND public.is_admin())` com **`config` filtrado por view** (`org_integrations_public`) que remove `secret_ref`. Escrita só service-role. |

Todas essas tabelas entram na **allowlist de tenancy** do gate (§8) — as `platform_*`/`plans`/`sellable_modules` porque legitimamente não têm `org_id`, com `reason` obrigatório no arquivo.

---

## 3. Camadas de autorização

### 3.1 Três planos, não dois papéis

Hoje existe um único plano de autorização: dentro da org. Passa a existir três, e a confusão entre eles é a principal fonte de vulnerabilidade de qualquer SaaS B2B.

| Plano | Quem | Onde vive | Fonte da verdade | Escopo |
|---|---|---|---|---|
| **Platform** | Staff da Trifold | `/platform`, `/api/platform/**` | `platform_admins.level` | Cross-org, mas **só metadados** (§3.3) |
| **Org** | Admin do cliente | `/dashboard/configuracoes`, `/dashboard/sistema` | `users.role = 'admin'` + `is_admin()` | Uma org |
| **Usuário** | Qualquer usuário | Todo o `/dashboard`, `/broker` | `roles` + `role_permissions` + `user_permission_exceptions` | Uma org, subset de módulos |

Regras de fronteira, não negociáveis:

- **`platform_admins` não concede nada dentro de `/dashboard`.** Um platform admin logado é, dentro do `/dashboard`, apenas um usuário da própria org dele. Sem isso, o menor bug de layout vira um vazamento cross-tenant.
- **`users.role = 'admin'` não concede nada em `/platform`.** O admin de um cliente é admin da org dele, ponto. Hoje o código usa `role === 'admin'` como se fosse superpoder (ver `updatePermission`, `createRole`, `deleteRole` em `packages/web/src/lib/permissions.ts`) — isso está correto e continua correto, porque esses handlers já validam `appUser.org_id === orgId`. Nada muda; só não podemos estender `role='admin'` para o plano de plataforma.
- **A Trifold é um tenant.** Os platform admins da Trifold são usuários da org Trifold com uma linha em `platform_admins`. Não existe "usuário sem org".

### 3.2 A fórmula do acesso efetivo

```
acessoEfetivo(user, módulo) =
      assinaturaViva(org)                          -- status ∈ {trial, active, past_due} OU módulo é core
  AND orgEntitled(org, módulo)                     -- NOVO — camada de entitlement (§4)
  AND rbacPermite(user, módulo)                    -- existente, inalterado
```

Implementação com o menor raio de explosão possível: a interseção acontece **dentro de `getUserPermissions()`**, em `packages/web/src/lib/permissions.ts`, como um passo 5 depois da aplicação das exceções por usuário.

```ts
// packages/web/src/lib/permissions.ts — getUserPermissions, novo passo 5
// 5. Interseção com o entitlement da ORG (sempre por último: uma exceção de
//    usuário NÃO pode conceder um módulo que a empresa não contratou).
const entitled = await getOrgEntitlements(orgId)      // Set<string>, cache 300s
for (const key of Object.keys(finalPerms)) {
  if (!entitled.has(key)) finalPerms[key] = false
}
```

Por que aqui e não em cada rota: **70 arquivos chamam `canAccess()`** e 2 layouts chamam `getUserPermissions()` (`app/dashboard/layout.tsx`, `app/broker/layout.tsx`). Um único ponto de composição cobre todos eles, inclusive a navegação da sidebar (`NAV_MODULE_MAP` em `dashboard/layout.tsx`), sem tocar em nenhum dos 70.

Dois detalhes que são fáceis de errar:

1. **`fullMatrix()` também precisa ser interseccionado.** Hoje `userRole === 'admin'` recebe `fullMatrix()` (acesso a tudo, inclusive módulos futuros). Se o entitlement fosse aplicado antes desse ramo, o admin do cliente veria módulos não contratados. Aplicando no passo 5, o ramo `admin` também é filtrado — correto.
2. **A ordem é entitlement por último.** As exceções por usuário (`user_permission_exceptions`) têm "prioridade absoluta sobre o perfil base" (comentário atual no código), e isso continua verdade **dentro** do que a org contratou. Entitlement é um teto, não um voto.

### 3.3 Motivo vs. permissão: a informação que não pode ser perdida

Um mapa `Record<string, boolean>` não distingue "seu perfil não permite" (→ 403) de "sua empresa não contratou" (→ tela de upsell). Sem essa distinção, o entitlement fica invisível comercialmente — o cliente vê um erro em vez de uma oferta.

Solução: um resolver novo ao lado do existente, sem quebrar assinatura nenhuma.

```ts
// packages/web/src/lib/tenancy/access.ts
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'no_permission' }                          // RBAC
  | { allowed: false; reason: 'not_entitled'; upsellTier: number | null } // plano
  | { allowed: false; reason: 'subscription_suspended' }                 // inadimplência

export async function resolveAccess(userId: string, orgId: string, module: string): Promise<AccessDecision>
```

E `canAccess()` continua existindo como wrapper booleano (`(await resolveAccess(...)).allowed`), preservando os 70 call sites. As telas que precisam de UX de upsell (páginas de módulo em `app/dashboard/**/page.tsx`) migram para `resolveAccess` gradualmente.

### 3.4 Acesso cross-org do super-admin

O que o `/platform` **pode** ver de outra org (agregados e metadados):

- Identidade da org: nome, slug, `is_active`, data de criação.
- Assinatura: plano, status, período, valor, faturas.
- Consumo: `ai_usage_daily`/`org_billing_periods` — crédito consumido, custo, features mais usadas.
- Saúde: contagens (nº de usuários, nº de leads, nº de conversas nos últimos 7d), status das integrações (`org_integrations.status`, `last_error`), última atividade.
- Configuração estrutural: roles, permissões, stages do Kanban (nomes/posições), horário comercial.

O que o `/platform` **não** pode ver, nunca, sem impersonation auditada:

| Proibido | Por quê |
|---|---|
| PII de lead: nome, telefone, e-mail, `leads.metadata` | Dado pessoal de terceiro (o lead não é cliente da Trifold) |
| Conteúdo de mensagem (`messages`, conversas WhatsApp/Telegram, `chat`) | Comunicação privada; LGPD |
| Documentos e uploads (portal do cliente, `pastas`, obras, termos) | Documento contratual de terceiro |
| Dados financeiros do Sienge (contratos, boletos, extratos) | Financeiro do cliente do cliente |
| Memória e prompts da Nicole com conteúdo de lead | Contém PII derivada |

Como isso é imposto tecnicamente, não só por disciplina: **as rotas de `/api/platform/**` só consultam uma lista fechada de tabelas.** A lista vive em código e é verificada por teste:

```ts
// packages/web/src/lib/tenancy/platform-readable.ts
export const PLATFORM_READABLE_TABLES = [
  'organizations','users','roles','role_permissions','org_subscriptions','plans','plan_modules',
  'org_module_grants','org_limit_overrides','org_billing_periods','ai_usage_daily',
  'tenant_invoices','tenant_invoice_lines','org_integrations','kanban_stages','platform_audit_log',
] as const
```

Mais um helper obrigatório `platformQuery(table, orgId)` que rejeita em runtime qualquer tabela fora da lista, e um teste que varre `app/api/platform/**` procurando `.from("…")` com string fora da lista. Colunas sensíveis de `users` (por exemplo telefone pessoal) são filtradas por `select` explícito — nunca `select('*')` no plano de plataforma.

### 3.5 Impersonation — sim, com cinto e suspensório

**Decisão: sim.** Suporte a cliente B2B sem impersonation degenera em "me manda um print" ou, pior, em alguém pedindo a senha do cliente. O risco de não ter é maior que o de ter, desde que auditada.

Regras (ADR-004):

| Controle | Regra |
|---|---|
| Autorização | apenas `platform_admins.level ∈ {owner, operator}` |
| Justificativa | `reason` obrigatório, mínimo 20 caracteres, gravado em `platform_impersonation_sessions` e `platform_audit_log` |
| Duração | máximo 60 minutos, `expires_at` no registro; expiração verificada em cada request |
| Escrita | **read-only por padrão.** `write_enabled = true` exige `level = 'owner'` e um segundo confirm explícito |
| Visibilidade | banner fixo, vermelho, em todas as páginas: "Você está vendo o ambiente de {Org} como suporte. Sessão expira em {mm:ss}." |
| Notificação | e-mail automático ao admin da org no início da sessão (`client_notified_at`) |
| Trilha | toda query feita durante a sessão registra `action='impersonation.read'` com a tabela acessada; toda escrita registra before/after |
| Encerramento | botão "Encerrar sessão" + expiração + `revoked_by` para corte forçado |

**O problema técnico honesto:** o RLS deriva a org de `auth.uid()` via `public.user_org_id()` (`004_rls_policies.sql:10-13`). Durante impersonation o `auth.uid()` continua sendo o do platform admin, então uma leitura pelo client autenticado retornaria a org **da Trifold**, não a do cliente. Três caminhos foram considerados:

1. **Emitir sessão Supabase do usuário alvo** — rejeitado. Cria credencial real de outra pessoa, indistinguível de invasão nos logs, e permite escrita sem controle.
2. **GUC/claim de impersonation lido por `user_org_id()`** — elegante no papel: `begin_impersonation()` faz `set_config('app.impersonated_org', …)` e `user_org_id()` passa a preferir o GUC. Rejeitado nesta fase: o PostgREST do Supabase usa conexões pooled e o ciclo de vida do GUC por request não é confiável o suficiente para ser a base de um controle de segurança. Se vazar entre requests, é vazamento cross-tenant silencioso — exatamente o cenário catastrófico.
3. **Service-role com filtro de org forçado** — escolhido. `createImpersonationClient(session)` retorna um client service-role embrulhado em um proxy que **injeta `.eq('org_id', session.target_org_id)` em toda query** e lança se a tabela não tiver `org_id`. Fica fora do escopo do RLS (que é o custo), mas é determinístico e testável.

O custo do caminho 3 é explícito: perde-se o RLS como rede durante impersonation. Mitigação: o wrapper é ~80 linhas, tem teste dedicado por tabela, é o único ponto do código com essa capacidade, e a sessão é curta, justificada, notificada e auditada. Registrado como risco residual em §11.

Ponto de integração: `getServerUser()` em `packages/web/src/lib/auth.ts` ganha overlay de impersonation — se houver cookie de sessão válido e o caller for platform admin, retorna `AppUser` com `orgId`/`role` do alvo mais `impersonation: { sessionId, expiresAt, writeEnabled }`. **Nunca mutar `users.org_id`** para impersonar (seria irreversível em caso de crash e apareceria como dado real).

---

## 4. Modelo de entitlements

### 4.1 Resolução

```ts
// packages/web/src/lib/tenancy/entitlements.ts
export interface OrgEntitlements {
  modules: Set<string>                 // módulos liberados agora
  planSlug: string
  planTierOrder: number
  status: SubscriptionStatus
  limits: Record<string, number|null>  // plan_limits + org_limit_overrides
  ai: { quotaCredits: number; consumedCredits: number; degraded: boolean }
}

export async function getOrgEntitlements(orgId: string): Promise<OrgEntitlements>
```

Uma única RPC (`public.org_entitlement_snapshot(p_org_id uuid) RETURNS jsonb`) devolve tudo em uma ida ao banco: chama `org_entitled_modules()`, junta `plan_limits`+`org_limit_overrides`, e lê a linha atual de `org_billing_periods`. O padrão de RPC JSONB com CTEs já é usado no projeto e tem performance conhecida.

### 4.2 Cache e invalidação

| Item | Valor | Razão |
|---|---|---|
| Mecanismo | `unstable_cache` com tag `entitlements-${orgId}` | Mesmo mecanismo já usado em `permissions.ts` — nada novo para operar |
| TTL | **300s** (5 min) | Entitlement muda raríssimo (só a Trifold muda plano), diferente de permissões (60s, editáveis pela UI do cliente) |
| Invalidação explícita | `revalidateOrgEntitlements(orgId)` → `revalidateTag('entitlements-'+orgId, 'max')` | Chamada obrigatória em **toda** mutação de `/platform` sobre plano/módulo/status |
| Invalidação por evento | cron diário `api/cron/subscription-lifecycle` | Vence trial, marca `past_due`, suspende — e invalida |
| Campo volátil fora do cache | `ai.consumedCredits` | Muda a cada chamada de IA. O gate de cota (§5.5) lê `org_billing_periods` com cache de 30s, separado do snapshot de 5 min |

Consequência aceita: até 5 minutos entre a Trifold liberar um módulo e o cliente ver. Mitigação: o botão de salvar em `/platform` invalida na hora; o TTL só cobre o caso de mudança feita direto no banco.

### 4.3 Efeito do status da assinatura

| status | Módulos liberados | IA | Crons/automação da org | UX |
|---|---|---|---|---|
| `trial` | do plano | cota do plano, política `hard_stop` | ativos | banner "X dias restantes" |
| `active` | do plano | cota + excedente | ativos | normal |
| `past_due` | do plano | cota + excedente até `hard_cap` | ativos | banner de cobrança, escalando por dias |
| `suspended` | **só core** | bloqueada | **pausados** | tela de suspensão com contato da Trifold; dados intactos |
| `cancelled` | só core, read-only | bloqueada | pausados | janela de export (§11 Q10) |

`suspended` não é logout. O usuário entra, vê a tela de suspensão, o admin vê as faturas em aberto e o contato. Deslogar o cliente inadimplente é a forma mais rápida de transformar uma cobrança atrasada em um chargeback e um cliente perdido.

### 4.4 Downgrade: dados preservados, acesso bloqueado

**P3 é absoluto: entitlement nunca destrói dado.** Quando um módulo sai do plano:

1. As linhas continuam no banco, com RLS de org intacta.
2. As rotas do módulo passam a renderizar `<ModuleLockedScreen module="obras" />` em vez de 404 — a diferença importa: 404 parece bug, tela de bloqueio parece produto.
3. O item de navegação continua visível **com cadeado** se `sellable_modules.min_tier_order > planTierOrder` (ou seja: é um módulo de um plano superior, logo é oportunidade de venda). Se o módulo foi revogado por `org_module_grants.granted = false`, some da navegação — foi uma decisão comercial específica, não um upsell.
4. Crons e automações do módulo pulam a org (§4.6).
5. Webhooks de entrada relacionados ao módulo continuam **aceitando e persistindo** (nunca perder dado de origem externa), mas não disparam automação. Ex.: lead do Meta continua entrando; a roleta não distribui se `roleta` não está entitled.
6. Reativação é instantânea e sem migração: o dado nunca saiu.

O upsell (`ModuleLockedScreen`) mostra o label e a descrição do módulo (já existem em `MODULE_LABELS`/`MODULE_DESCRIPTIONS` em `permissions-modules.ts` — reaproveitar, não duplicar), o plano mínimo que o inclui, e um CTA que abre um `chamado` do tipo `upgrade_request`. Aproveita o módulo `chamados`, que é core: a Trifold recebe a intenção de compra no fluxo que já usa, sem construir um funil novo.

### 4.5 Composição com o RBAC existente — o que muda em `permissions.ts`

| Função | Muda? | Como |
|---|---|---|
| `getOrgRoles` | não | — |
| `getRolePermissions` | não | — |
| `getOrgPermissionsMatrix` | sim, leve | interseccionar com entitlement para a UI de perfis de acesso não mostrar módulos não contratados |
| `getUserPermissions` | sim | novo passo 5 (§3.2) |
| `canAccess` | não (assinatura) | passa a herdar o filtro via `getUserPermissions` |
| `updatePermission` / `createRole` / `deleteRole` | sim, leve | `createRole` semeia `role_permissions` para `ALL_MODULES`; manter assim (o entitlement filtra na leitura). Não semear só o que está contratado — senão um upgrade futuro deixaria roles sem linha |
| `getHardcodedPermissions` (fallback) | não | continua sendo o fallback de RBAC; o entitlement é aplicado depois dele |

Ponto sutil e importante: **o entitlement filtra na leitura, não na escrita.** `role_permissions` continua tendo linha para todos os 26 módulos. Isso significa que, ao contratar um módulo novo, as permissões que o cliente já configurou para ele passam a valer imediatamente, sem migração de dados. É a diferença entre um upgrade que é um UPDATE de uma linha e um upgrade que é um projeto.

### 4.6 Entitlement no lado servidor (crons, webhooks, service-role)

Este é o buraco que quase todo SaaS deixa: a UI respeita o plano, o backend não. Com **37 crons** e **166 arquivos usando service-role**, é onde o vazamento aconteceria.

```ts
// packages/web/src/lib/tenancy/guard.ts
export async function assertOrgEntitled(orgId: string, module: string): Promise<void>
export async function forEachEntitledOrg(module: string, fn: (org: OrgRef) => Promise<void>): Promise<void>
```

`forEachEntitledOrg` é o substituto canônico do `DEFAULT_ORG_ID`: o cron itera só as orgs com assinatura viva e o módulo liberado, isolando erro por org (uma org que falha não aborta as outras) e logando por org.

Mapeamento cron → módulo requerido (amostra do que precisa ser anotado nos 37):

| Cron | Módulo | Observação |
|---|---|---|
| `roleta-retry`, `bolsao-rebalance` | `roleta`, `bolsao` | pular org sem o módulo |
| `enrich-leads`, `followup` | `leads` + cota de IA | também respeita `ai.degraded` |
| `meta-ads-intelligence`, `meta-sync-*`, `campaign-poll` | `campanhas` | precisa de `org_integrations` de `meta_ads` |
| `obras-approval-reminder`, `aprovacoes-digest` | `obras` | |
| `analytics-report`, `daily-report` | `analytics`/`dashboard` | `daily-report` hoje tem `DEFAULT_ORG_ID` hardcoded |
| `sienge-customer-sync`, `boleto-scan`, `supremo-*` | `fluxo`/`imob` | precisa de credencial por org |
| `billing-*` (Epic 78) | — | **não** são por org: são custo da plataforma. Não tocar |
| `keep-alive`, `webhook-health`, `purge-rejected-uploads` | — | infraestrutura, cross-org por natureza |

---

## 5. Medição e cobrança de IA

### 5.1 O ponto de interceptação (a boa notícia)

Existe **um único choke point** e ele já está centralizado:

```ts
// packages/ai/src/client/anthropic.ts
export function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}
```

Verificado: `new Anthropic(` aparece **apenas** neste arquivo em todo o código-fonte. Os 12 consumidores reais passam todos por `createAnthropicClient()`:

```
packages/web/src/app/api/agent/chat/route.ts
packages/web/src/app/api/cron/enrich-leads/route.ts
packages/web/src/app/api/cron/followup/route.ts
packages/web/src/app/api/cron/roleta-retry/route.ts
packages/web/src/app/api/leads/[id]/behavior-analysis/route.ts
packages/web/src/app/api/leads/[id]/handoff/route.ts
packages/web/src/app/api/leads/[id]/summary/route.ts
packages/web/src/app/api/messages/review/route.ts
packages/web/src/app/api/telegram/webhook/route.ts
packages/web/src/app/api/webhook/whatsapp/route.ts
packages/web/src/lib/appointments/visit-feedback-core.ts
packages/web/src/lib/pastas/termo/extract.ts
```

E 9 arquivos em `packages/ai/src/**` chamam `messages.create` (pipeline, flows, memory/writer, prompts). Como todos recebem o client de fora, **envolver a fábrica captura 100% do consumo Anthropic**. Isso é uma sorte arquitetural que a Story 82-1 (centralização das strings de modelo) já preparou.

Para OpenAI (embeddings do RAG, `OPENAI_API_KEY` em 8 pontos, `packages/ai/src/rag/embeddings.ts`) cria-se a fábrica equivalente `createOpenAIClient(ctx)`. Embeddings são baratos mas são consumo per-org e entram na conta.

### 5.2 Desenho da interceptação

`packages/ai` não pode depender de `packages/web` (nem do Supabase). Então a medição usa **sink injetado**:

```ts
// packages/ai/src/usage/types.ts
export interface AiUsageContext {
  orgId: string
  feature: string                 // 'nicole.chat' | 'enrich' | 'behavior-analysis' | …
  leadId?: string
  conversationId?: string
  userId?: string
}

export interface AiUsageEvent extends AiUsageContext {
  provider: 'anthropic' | 'openai'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  providerRequestId?: string
  occurredAt: string
}

export interface AiUsageSink { record(e: AiUsageEvent): void | Promise<void> }
export function setAiUsageSink(sink: AiUsageSink): void
export function getAiUsageSink(): AiUsageSink        // default: no-op + console.debug
```

```ts
// packages/ai/src/client/anthropic.ts (nova forma)
export function createAnthropicClient(ctx?: AiUsageContext): Anthropic {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  if (!ctx) return client                       // compat: sem contexto, sem medição
  return withUsageMetering(client, ctx)         // Proxy sobre messages.create
}
```

`withUsageMetering` é um `Proxy` que embrulha `messages.create`, lê `response.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) e `response.id`, e chama o sink. Suporte a streaming: quando `stream: true`, o `usage` vem no evento `message_delta`/`message_stop` — o proxy acumula e registra no final do stream.

`ctx` opcional é deliberado: torna a migração dos 12 call sites incremental e **não quebra nada** se um deles for esquecido (P5 — falha aberta). O gate de CI cobre a lacuna: teste que verifica que nenhum arquivo em `packages/web/src/app/api/**` chama `createAnthropicClient()` sem argumento (regra R7, §8).

O sink real:

```ts
// packages/web/src/lib/revenue/ai-usage-sink.ts
export const supabaseAiUsageSink: AiUsageSink = {
  async record(e) {
    try {
      const priced = priceEvent(e)              // → cost_micro_usd + billable_credits
      await createAdminClient().rpc('record_ai_usage', { p_event: priced })
    } catch (err) {
      console.error('[ai-usage] falha ao registrar consumo', { orgId: e.orgId, feature: e.feature, err })
      // NUNCA relançar — P5
    }
  },
}
```

Registrado uma vez no boot do servidor (`packages/web/src/instrumentation.ts` ou um módulo importado pelo layout raiz).

**Gotcha de serverless conhecido:** promise soltas com `void` são mortas quando a Vercel encerra a função após a resposta (já mordeu o projeto na Story 75-139). Portanto:
- rotas request-scoped (`/api/leads/[id]/summary`, `/api/agent/chat`): usar `after()` do `next/server` para o flush pós-resposta;
- webhooks e crons (`/api/webhook/whatsapp`, `/api/cron/*`): já são assíncronos por natureza e podem `await` o insert — é um INSERT único, custo desprezível ao lado de uma chamada de LLM.

### 5.3 A unidade de cota: crédito = custo real

**Decisão: `1 crédito = US$ 0,001 de custo real do provider`** (`billable_credits = cost_micro_usd / 1000`).

Alternativas descartadas:

| Unidade | Por que não |
|---|---|
| Tokens | Não são comparáveis: Sonnet custa ~15× Haiku por token. Um cliente que usa mais análise de comportamento consumiria "menos tokens" e custaria mais. E qualquer troca de modelo quebraria a cota. |
| "Interações"/mensagens | Esconde variância enorme (uma conversa longa com contexto grande custa 20× uma curta) e incentiva o pior comportamento do cliente. |
| Custo real em BRL | Amarra a cota à variação do dólar dentro do ciclo. |

Crédito-sobre-custo mantém a matemática estável quando trocamos de modelo, quando ligamos prompt cache (`ANTHROPIC_PROMPT_CACHE_ENABLED` já existe, e cache hit é ~10× mais barato — o cliente **se beneficia** automaticamente), e quando adicionamos provider novo.

Para o cliente, a UI traduz: "Você usou 4.200 de 10.000 créditos (~340 atendimentos)", onde "atendimentos" vem da média móvel de créditos por conversa dos últimos 30 dias da própria org. Número honesto e derivado, não inventado.

Price table: `packages/web/src/lib/revenue/ai-price-table.ts`, versionada por data de vigência (`effective_from`), para que um evento antigo continue precificado com a tabela da época. **Não confundir** com `packages/web/src/lib/billing/subscriptions/price-table.ts`, que é do Epic 78 (custo interno) — comentário cruzado obrigatório nos dois arquivos.

### 5.4 Agregação

```
messages.create ──▶ sink ──▶ RPC record_ai_usage()
                                 │
                                 ├─▶ INSERT ai_usage_events (partição do mês)
                                 ├─▶ UPSERT ai_usage_daily (+= tokens, custo, créditos)
                                 └─▶ UPDATE org_billing_periods
                                        SET consumed_credits = consumed_credits + X,
                                            cost_micro_usd  = cost_micro_usd + Y,
                                            alert_80_at  = COALESCE(alert_80_at,  CASE WHEN … THEN now() END),
                                            alert_100_at = COALESCE(alert_100_at, CASE WHEN … THEN now() END),
                                            degraded_at  = COALESCE(degraded_at,  CASE WHEN … THEN now() END)
                                        WHERE org_id = … AND CURRENT_DATE BETWEEN period_start AND period_end
```

Uma única RPC `SECURITY DEFINER` faz as três escritas na mesma transação. Os `COALESCE(…, CASE …)` marcam os cruzamentos de limiar **de forma idempotente** (só grava o timestamp na primeira vez), sem trigger extra e sem race: o `UPDATE` pega row lock na linha do período.

A RPC **não envia notificação** — banco não faz I/O externo. O cron `api/cron/ai-quota-notify` (a cada 15 min) varre `org_billing_periods` onde `alert_80_at IS NOT NULL AND alert_80_notified_at IS NULL` e dispara. Mesmo padrão que os lembretes do Epic 78 já usam (`service_billing_reminders_last_alerted`), então há precedente no projeto.

Contenção: uma linha por org por mês, ~1 UPDATE por chamada de LLM. Ordem de grandeza atual da Trifold é de centenas a poucos milhares de chamadas/dia — irrelevante. Se algum tenant chegar a dezenas de req/s no mesmo segundo, a mitigação é agregar em janelas (buffer de 10s no processo) antes de tocar o contador; não é necessário agora e está registrado como decisão diferida.

### 5.5 Gate de cota no caminho quente

```ts
// packages/web/src/lib/revenue/quota.ts
export type QuotaVerdict =
  | { mode: 'normal' }
  | { mode: 'warn'; pct: number }          // >= 80%
  | { mode: 'degrade' }                    // >= 100% e política 'degrade'
  | { mode: 'overage'; credits: number }   // >= 100% e política 'overage'
  | { mode: 'blocked'; reason: 'hard_stop' | 'hard_cap' | 'suspended' }

export async function checkAiQuota(orgId: string): Promise<QuotaVerdict>
```

Leitura de 1 linha de `org_billing_periods`, cache de 30s (`unstable_cache`, tag `quota-${orgId}`). 30s porque o valor precisa acompanhar consumo em tempo quase real, mas não vale uma query por mensagem.

Comportamento por veredito:

| Veredito | Nicole (chat) | Flows opcionais (behavior-analysis, memory-extraction, post-visit-followup, enrich) | Modelo |
|---|---|---|---|
| `normal` | responde | rodam | como hoje |
| `warn` | responde | rodam | como hoje + alerta ao admin |
| `overage` | responde | rodam | como hoje; excedente acumula e vai para a fatura |
| `degrade` | responde | **desligados** | Sonnet → Haiku onde a qualidade tolera |
| `blocked` | **não chama LLM**; envia mensagem estática de handoff e cria alerta para o corretor | desligados | — |

A degradação Sonnet→Haiku é possível porque as strings de modelo já são centralizadas em `ANTHROPIC_MODELS` (`packages/ai/src/client/anthropic.ts`). O seletor passa a ser uma função do veredito: `pickModel(tier, verdict)`.

### 5.6 Política no 100% — recomendação

**Default `overage` para `active`; `hard_stop` para `trial` e `past_due` prolongado.**

Racional: cortar a Nicole no meio de uma conversa com um lead do cliente é o pior resultado possível para todos — o cliente perde uma venda por causa de uma cobrança de dezenas de reais, e culpa a Trifold. Excedente é a política comercialmente saudável para cliente pagante. Trial é diferente: lá o corte é o mecanismo de conversão.

**Válvula de segurança independente da política comercial:** `plans.ai_hard_cap_multiplier` (default `3.0`). Ao atingir 3× a cota no mesmo ciclo, bloqueia mesmo em `overage` e alerta a Trifold com urgência. Isso não é regra de venda, é proteção contra loop de bug (o cenário real: uma automação em recursão gerando milhares de chamadas em uma hora — a chave é da Trifold, a fatura é da Trifold).

### 5.7 Como não quebrar a Nicole em produção

Três travas, na ordem:

**1. Rollout em modo shadow.** Env `AI_QUOTA_ENFORCEMENT` com três valores:
- `off` — sem sink, sem gate (rollback instantâneo);
- `shadow` (default inicial) — sink grava tudo, `checkAiQuota` calcula e **loga** o veredito mas sempre retorna `normal`;
- `on` — enforcement ativo.

Definir via `scripts/vercel-env-set.sh` (REST API), **nunca** `vercel env add` por stdin — o gotcha de valor vazio silencioso já causou dois incidentes no projeto e aqui um valor vazio significaria... comportamento indefinido no gate de cota. Por isso o parser trata qualquer valor não reconhecido como `off` (fail-safe explícito).

**2. Reconciliação com o oráculo do Epic 78.** O cron `api/cron/billing-collect-anthropic` já traz o gasto real da conta Anthropic. Critério de aceite para sair de `shadow`: por 14 dias consecutivos, `SUM(ai_usage_events.cost_micro_usd)` do período tem que ficar dentro de **±5%** do valor coletado. Diferença maior significa consumo não instrumentado (algum call site sem `ctx`) ou price table errada — nos dois casos, cobrar seria errado. Isso é um teste de integração de graça, contra tráfego real, sem staging.

**3. A Trifold entra com plano `is_internal = true`.** Cota alta, política `overage`, `hard_cap` generoso. Se o gate tiver bug de cálculo, a operação da Trifold não para — mas os números aparecem no `/platform` e podem ser conferidos contra o que a equipe sabe do próprio uso.

Sequência de deploy da onda de IA (cada passo é um deploy independente e reversível):
1. Tabelas + RPC (aditivo, ninguém lê).
2. Sink + `ctx` nos 12 call sites, `AI_QUOTA_ENFORCEMENT=shadow`. Nicole intocada — o único efeito é um INSERT a mais por chamada.
3. Observar 14 dias, reconciliar.
4. Cron de alerta 80% ligado (só e-mail, sem bloqueio).
5. `AI_QUOTA_ENFORCEMENT=on`, começando por uma org de teste (Trifold Sandbox), depois clientes, Trifold por último.

---

## 6. Painel super-admin (`/platform`)

### 6.1 Rota e separação

Novo segmento top-level: `packages/web/src/app/platform/`, irmão de `dashboard/`, `broker/`, `cliente/`, `portal-viewer/`, `pasta/`. **Não** um subdiretório de `/dashboard` — a separação física é o que impede que um `layout.tsx` mal configurado exponha o plano de plataforma a um usuário de cliente.

```
packages/web/src/app/platform/
├── layout.tsx                    # requirePlatformAdmin() + chrome visualmente distinto
├── page.tsx                      # overview
├── orgs/
│   ├── page.tsx                  # lista + busca
│   ├── new/page.tsx              # wizard de provisionamento
│   └── [orgId]/
│       ├── page.tsx              # resumo
│       ├── plano/page.tsx        # plano, módulos, add-ons, limites
│       ├── ia/page.tsx           # consumo, cota, excedente, histórico
│       ├── faturas/page.tsx
│       ├── usuarios/page.tsx     # lista + convidar admin + reset
│       ├── integracoes/page.tsx  # status + credenciais por tenant
│       └── auditoria/page.tsx
├── plans/                        # CRUD de planos e composição de módulos
├── invoices/                     # geração do ciclo em lote, baixa de pagamento
├── usage/                        # consumo de IA agregado, margem por org
├── audit/                        # trilha global filtrável
└── admins/                       # gestão de platform_admins (só level='owner')
```

Chrome deliberadamente diferente (barra escura, badge "PLATAFORMA", logo Trifold com selo): um operador que abre duas abas não pode confundir "estou vendo a Trifold" com "estou vendo o cliente X". Erro humano é o vetor de incidente mais provável em painel cross-org.

### 6.2 Guardas

```ts
// packages/web/src/lib/tenancy/platform-auth.ts
export async function requirePlatformAdmin(min: PlatformLevel = 'support'): Promise<PlatformAdmin>
export function withPlatformAdmin(handler, opts: { level?: PlatformLevel; action: string }): RouteHandler
```

`withPlatformAdmin` embrulha **toda** rota em `packages/web/src/app/api/platform/**` e faz, na ordem: autentica → checa `platform_admins` (não-revogado, nível suficiente) → executa → grava `platform_audit_log` com action, target, before/after em qualquer método diferente de GET. Auditoria por decorador, não por disciplina do dev: é a única forma de a trilha não ter buracos.

Níveis:

| Level | Pode |
|---|---|
| `support` | ler tudo do plano de plataforma; abrir impersonation **read-only**; não muda plano nem fatura |
| `operator` | tudo de `support` + criar org, mudar plano/módulos/limites, emitir e dar baixa em fatura |
| `owner` | tudo + gerir `platform_admins` + impersonation com escrita + editar planos |

Os handlers usam `createAdminClient()` (as tabelas de plataforma são deny-all em RLS, seguindo o padrão de `131_imobiliarias.sql`), sempre via `platformQuery()` que valida a tabela contra `PLATFORM_READABLE_TABLES` (§3.4).

### 6.3 Telas mínimas (MVP do painel)

Priorizadas pelo que é necessário para vender ao primeiro cliente:

| Prioridade | Tela | Conteúdo mínimo |
|---|---|---|
| P0 | `/platform/orgs/new` | wizard: nome, slug, plano, módulos extras, e-mail do admin → chama `provisionOrg()` |
| P0 | `/platform/orgs/[id]/plano` | plano atual, toggle por módulo (add-on/revogação com `reason`), limites, status da assinatura |
| P0 | `/platform/orgs` | lista com status, plano, % de cota consumida, última atividade |
| P1 | `/platform/orgs/[id]/ia` | gráfico diário de créditos, breakdown por feature/modelo, custo real vs. receita do plano (margem) |
| P1 | `/platform/invoices` | gerar faturas do ciclo em lote, marcar como paga, exportar CSV |
| P1 | `/platform` (overview) | nº orgs por status, MRR contratado, orgs >80% de cota, orgs `past_due`, integrações em erro |
| P2 | `/platform/plans` | CRUD de planos + composição de módulos + faixas de excedente |
| P2 | `/platform/audit` | trilha filtrável por ator/org/ação/período |
| P2 | `/platform/orgs/[id]/integracoes` | status por provider, reconectar, ver `last_error` |
| P2 | `/platform/admins` | gestão de platform admins |

### 6.4 O lado do cliente

Nasce **uma** tela nova no `/dashboard`: `packages/web/src/app/dashboard/configuracoes/plano/page.tsx` (sub-módulo `configuracoes.plano`, encaixa no `SUBMODULE_MAP` existente de `permissions-modules.ts`). Mostra plano atual, módulos inclusos, consumo de IA do ciclo com barra, faturas, e CTA de upgrade que abre um `chamado`. Só para `role='admin'` da org.

O `/dashboard` **não** importa nada de `lib/tenancy/platform-*`. A fronteira é de módulo, não só de rota.

---

## 7. Provisionamento de nova org

### 7.1 Os bloqueadores concretos

Inventário verificado dos UUIDs de uma org específica (a Trifold) vazados em constantes de código:

| Arquivo | Constante | Natureza |
|---|---|---|
| `packages/web/src/lib/leads/default-stage.ts` | `FALLBACK_STAGE_ID = "00000000-0000-0000-0001-000000000001"` | **o pior**: a função já consulta por org, mas o fallback devolve o stage de OUTRA org |
| `packages/web/src/lib/leads/stage-filters.ts` | `PERDIDO_STAGE_IDS`, `ACERVO_STAGE_IDS` — inclui `95327bd7-3e88-…` e `62075f72-1629-…` | UUIDs reais de linhas da Trifold, sem nem o padrão sequencial |
| `packages/web/src/lib/sla/waiting.ts` | stage `…0001-000000000001` | |
| `packages/web/src/lib/appointments/locations.ts` | imóveis `…0004-000000000001/2` | |
| `packages/web/src/app/api/cron/supremo-sync/route.ts` | imóveis `…0004-…` | |
| `packages/web/src/app/api/cron/daily-report/route.ts` | `DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"` | assume org única |
| `packages/web/src/app/broker/page.tsx` | stages `…0001-…` | |
| `packages/web/src/app/dashboard/pipeline/page.tsx` | stage `…0001-…` | |
| `packages/web/src/app/api/leads/[id]/tasks/route.ts` | stage `…0001-000000000008` (Perdido) | |
| `packages/web/src/app/api/leads/[id]/mark-lost/route.ts` | idem | |
| `packages/web/src/app/api/leads/[id]/notes/route.ts` | idem | |
| `packages/web/src/app/api/imob/leads/route.ts` | stage `…0001-000000000001` | |
| `packages/web/src/app/api/webhooks/landing-page/route.ts` | idem | |
| `packages/web/src/components/leads/lead-detail-drawer.tsx` | stage `…0001-000000000008` | client component |

### 7.2 A solução: chave semântica

```sql
-- Migration 193 (aditiva, nullable)
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS semantic_key text;
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS is_lost boolean NOT NULL DEFAULT false;
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS excluded_from_active boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS kanban_stages_org_semantic
  ON kanban_stages (org_id, semantic_key) WHERE semantic_key IS NOT NULL;

-- Backfill dos dados atuais da Trifold: mapeia os UUIDs hardcoded → chave semântica
UPDATE kanban_stages SET semantic_key = 'novo',              is_default = true
  WHERE id = '00000000-0000-0000-0001-000000000001';
UPDATE kanban_stages SET semantic_key = 'perdido',           is_lost = true, excluded_from_active = true
  WHERE id = '00000000-0000-0000-0001-000000000008';
UPDATE kanban_stages SET semantic_key = 'nao_qualificado',   is_lost = true, excluded_from_active = true
  WHERE id = '95327bd7-3e88-4038-aa16-250a74ab085c';
UPDATE kanban_stages SET semantic_key = 'represamento',      excluded_from_active = true
  WHERE id = '00000000-0000-0000-0001-000000000010';
UPDATE kanban_stages SET semantic_key = 'corretores_antigos', excluded_from_active = true
  WHERE id = '62075f72-1629-4d8b-a019-0fcb35e3d302';
```

Repare que `is_lost`/`excluded_from_active` transformam as duas listas de `stage-filters.ts` em **predicados de dado**, não em arrays de ID. É o que permite cada org ter seus próprios stages perdidos/acervo sem código novo.

Resolver único, cacheado por org:

```ts
// packages/web/src/lib/leads/stage-resolver.ts
export async function getOrgStages(orgId: string): Promise<OrgStageMap>   // cache 300s, tag stages-${orgId}
export async function getStageId(orgId: string, key: SemanticStageKey): Promise<string | null>
export async function getExcludedFromActiveIds(orgId: string): Promise<string[]>
export async function getLostStageIds(orgId: string): Promise<string[]>
```

Idem para imóveis default (`org_default_properties` ou `properties.semantic_key`) — decisão: coluna `semantic_key` em `properties`, pelo mesmo padrão, para `locations.ts` e `supremo-sync`.

### 7.3 Expand → migrate → contract (obrigatório: produção == dev)

Não existe staging (`project_supabase_prod_only`), então nenhuma troca pode ser atômica. Para cada constante:

| Fase | Ação | Risco |
|---|---|---|
| **Expand** | migration aditiva + backfill (§7.2). Código não muda. | ~zero (colunas nullable, `UPDATE` por PK) |
| **Migrate (dual)** | resolver novo entra atrás de flag `STAGE_RESOLVER=legacy\|both\|semantic`. Em `both`, resolve pelos dois caminhos, **usa o legacy** e loga divergência (`console.warn` + contador). Rodar 7 dias. | ~zero (comportamento é o legacy) |
| **Cutover** | `STAGE_RESOLVER=semantic`. Divergência zero observada é o critério de aceite. | baixo, reversível por env var |
| **Contract** | remover constantes e a flag em commit separado. | zero |

A fase `both` é o que substitui o staging que não existe: valida contra tráfego real de produção sem mudar comportamento. Custo: um log a mais por resolução, e duas semanas de calendário.

### 7.4 `provisionOrg` — seed determinístico e atômico

```sql
CREATE OR REPLACE FUNCTION public.provision_org(
  p_name text, p_slug text, p_plan_id uuid,
  p_admin_email text, p_admin_name text,
  p_actor_user_id uuid
) RETURNS uuid  -- org_id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ … $$;
```

Uma transação, idempotente por `slug` (re-executar retoma o que falta). Passos:

1. `organizations` (name, slug, settings default).
2. `roles` — os 4 system roles (`admin`, `supervisor`, `broker`, `obras`) + os que hoje aparecem em `getHardcodedPermissions` (`gerente-relacionamento`, `gerente-comercial`, `imob`, `consultoria`, `sdr`). **Parametrizar o seed da migration 047 por org** em vez de duplicá-lo.
3. `role_permissions` — todos os 26 `ALL_MODULES` para cada role, com os defaults que hoje estão em `getHardcodedPermissions()` (`packages/web/src/lib/permissions.ts:62-116`). Esse switch em TypeScript é hoje a fonte de verdade do default; ele precisa ser espelhado no SQL (ou o SQL lê de uma tabela `role_default_permissions` semeada uma vez — **preferido**, elimina a duplicação e permite a Trifold ajustar defaults sem deploy).
4. `kanban_stages` — os stages canônicos com `semantic_key`, `position`, `is_default`, `is_lost`, `excluded_from_active`.
5. Configurações: `roleta_config`, horário comercial, regras de follow-up, prompts da Nicole (Epic 53 já tem prompts em banco com fallback — validar que o fallback é org-agnóstico, ou semear por org).
6. `org_subscriptions` (status `trial`, período do mês corrente) + `org_billing_periods` do ciclo atual com `quota_credits` do plano.
7. `org_integrations` com uma linha `disconnected` por provider aplicável ao plano.
8. `platform_audit_log` com `action='org.create'`.

Fora da transação (efeitos externos, com retry): convite do admin via Supabase Auth + `users` row com `role='admin'` + e-mail de boas-vindas. Se falhar, a org existe e o `/platform` mostra "convite pendente" com botão de reenviar — melhor que rollback de uma org já criada.

**Teste de aceitação do provisionamento** (é o teste que prova que o multi-tenant funciona): criar org "Trifold Sandbox" em produção via `/platform`, com plano `crm`, e verificar que (a) o admin recebe convite e loga, (b) vê Pipeline/Leads/Imóveis e **não** vê Obras/Lançamentos, (c) cria um lead que cai no stage `novo` da própria org, (d) nenhuma query retorna dado da Trifold, (e) a Trifold não vê nada dessa org. Essa org fica permanentemente como canário de regressão.

### 7.5 Credenciais e integrações por tenant

Estado atual: tudo em env global — `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `META_PAGE_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`, `SIENGE_{SUBDOMAIN,USERNAME,PASSWORD}`, `SIENGE_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SUPREMO_API_TOKEN`, `CLICKSIGN_API_TOKEN`.

Estratégia por provider — não é tudo igual:

| Provider | Modelo | Ação |
|---|---|---|
| **WhatsApp Cloud API** | número/WABA por cliente | `org_integrations.config.phone_number_id` + token no Vault. Roteamento reverso do webhook por `phone_number_id` (§2.8). Depende de Q11 (cliente traz o número ou a Trifold revende) |
| **Meta Lead Ads** | app da Trifold, página do cliente | `META_APP_SECRET` continua global (é o app "Ações Trifold"); `page_id`/`form_id`/`page_access_token` por org. Webhook roteia por `page_id` |
| **Sienge** | credencial do cliente | 100% por org no Vault. Cliente sem Sienge não tem a integração |
| **Resend** | conta da Trifold, domínio por org | `RESEND_API_KEY` global; `org_integrations.config.from_domain` + verificação de domínio por org |
| **Telegram** | staging/teste da Trifold | continua global. Não é canal de cliente |
| **Supremo / ClickSign** | específicos da Trifold hoje | manter global até um cliente precisar; `org_integrations` já modela |
| **Anthropic / OpenAI** | chave da Trifold, custo repassado | **sempre global** — é a premissa do modelo de cota (§5) |
| **Google OAuth** | app da Trifold | global; escopo por usuário |

Regra de resolução: `resolveIntegration(orgId, provider)` retorna a credencial do tenant se `status='connected'`, senão cai no env global **apenas se o provider estiver marcado como `platform_shared`**. Isso mantém a Trifold funcionando sem migração de credencial no dia 1 e força credencial própria onde faz sentido. O fallback é explícito por provider, nunca implícito.

Roteamento de webhook (mudança de comportamento, precisa cuidado): hoje `api/webhook/whatsapp/route.ts` e `api/webhooks/meta-ads/route.ts` assumem uma org. Passam a resolver a org pelo identificador do payload e **rejeitar com 200 + log** se não encontrarem (nunca 4xx/5xx para a Meta — ela desabilita o webhook após falhas repetidas). Idempotência e persistência do evento bruto antes do processamento continuam valendo (padrão já estabelecido no projeto).

---

## 8. Hardening de segurança e o CI gate

### 8.1 Fato inconveniente: não existe CI

`.github/` contém apenas `agents/`. Não há `workflows/`. Não há husky (`.husky` ausente). `package.json` tem `lint`, `type-check`, `test`, mas nada roda automaticamente. O gate de RLS exigido não é "adicionar um job" — é **criar a esteira de CI**, e isso é pré-requisito da Onda 1.

```yaml
# .github/workflows/ci.yml (novo)
name: CI
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  static:       # pnpm install → type-check → lint → test
  tenancy-gate: # pnpm gate:tenancy  (R1..R7)
  isolation:    # testes cross-tenant em branch Supabase efêmero (depende de Q6)
```

### 8.2 O gate de tenancy — regras

`scripts/gate-tenancy.ts` (`pnpm gate:tenancy`). Fonte da verdade do schema: introspecção via **Supabase Management API** com `SUPABASE_MANAGEMENT_PAT` (padrão já usado no projeto para SQL ad-hoc em QA gates), com fallback para um snapshot versionado `docs/audits/schema-snapshot.json` regenerado por `scripts/sync-schema.sh` (já existe). Isso evita parsear 192 arquivos SQL — o schema efetivo é o que importa, não o que as migrations dizem.

| Regra | Verificação | Severidade |
|---|---|---|
| **R1** | Toda tabela de `public` com coluna `org_id` tem `rowsecurity = true` | FAIL |
| **R2** | Para cada tabela com `org_id`, existe, para **cada** comando (SELECT/INSERT/UPDATE/DELETE), pelo menos uma policy cujo `qual`/`with_check` referencia `user_org_id()` ou um predicado equivalente sobre `org_id` | FAIL |
| **R3** | Toda tabela nova de `public` tem `org_id NOT NULL`, salvo se listada em `docs/audits/tenancy-allowlist.yml` com `reason:` preenchido | FAIL |
| **R4** | Funções `SECURITY DEFINER` têm `SET search_path`; funções que recebem `p_org_id` validam contra `user_org_id()` ou estão na allowlist de service-role | WARN → FAIL na Onda 2 |
| **R5** | Views sobre tabelas com `org_id` têm `security_invoker = on` | FAIL |
| **R6** | `sellable_modules.key` ⊇ `ALL_MODULES` de `permissions-modules.ts` (drift do catálogo comercial) | FAIL |
| **R7** | Nenhum arquivo em `packages/web/src/app/api/**` chama `createAnthropicClient()`/`createOpenAIClient()` sem `AiUsageContext` | FAIL (a partir da Onda 4) |

**Baseline com catraca (ratchet).** A auditoria vai apontar ~97 cláusulas `USING` sem `org_id`. Ligar o gate bloqueando no dia 1 travaria todo desenvolvimento. Então:

- `docs/audits/rls-gate-baseline.json` registra as violações conhecidas com contagem por regra.
- O gate falha se: (a) a contagem total **aumentar**, ou (b) qualquer violação **nova** aparecer em tabela que não está no baseline, ou (c) **qualquer** violação de R3 (tabela nova sem `org_id`) — essa é FAIL absoluto desde o dia 1, sem baseline, porque é a que cria dívida nova.
- Cada correção da Onda 1 abaixa o baseline. Ele nunca pode subir. Onda 1 termina quando o baseline chega a zero.

Saída dupla: tabela legível para humano + JSON para o PR comment. Exit code 1 em qualquer FAIL.

### 8.3 Testes de isolamento cross-tenant

`tests/tenancy/cross-tenant.spec.ts`, data-driven pelo `schema-snapshot.json` (novas tabelas entram na cobertura automaticamente, sem alguém lembrar):

```
setup:  cria org A e org B, um usuário em cada, dois clients com ANON key (não service-role)
para cada tabela T com org_id:
  1. seed 1 linha em T para A e 1 para B (via service-role)
  2. como usuário de A: SELECT em T ⇒ nenhuma linha de B          [leitura]
  3. como usuário de A: UPDATE na linha de B ⇒ 0 linhas afetadas  [escrita cega]
  4. como usuário de A: DELETE na linha de B ⇒ 0 linhas afetadas
  5. como usuário de A: INSERT com org_id = B ⇒ erro de policy    [forjar org]
  6. RPCs que recebem org_id: chamar com org_id = B ⇒ erro/vazio
teardown: apaga as duas orgs
```

O passo 5 é o mais importante e o mais esquecido: policies que só têm `USING` e não `WITH CHECK` permitem inserir linha com `org_id` alheio.

**Este teste não pode rodar em produção.** Ele cria e apaga orgs. Como o Supabase de dev aponta para prod (`project_supabase_prod_only`), isso é um **bloqueador**: precisa de um projeto Supabase separado ou de Supabase Branching (Q6). Enquanto não houver, o teste roda manualmente contra um projeto descartável e o job de CI fica `continue-on-error` — o que é uma proteção bem mais fraca e está registrado como risco.

### 8.4 O risco maior que o RLS não cobre

**166 dos 285 route handlers usam `createAdminClient()`** (service-role, bypassa RLS completamente). Corrigir 100% das policies não protege essas rotas. O isolamento real nelas depende de alguém ter escrito `.eq("org_id", orgId)`.

Duas linhas de defesa:

1. **`createOrgScopedAdminClient(orgId)`** — mesmo mecanismo do wrapper de impersonation (§3.5): proxy service-role que injeta o filtro de org em toda query e lança se a tabela tiver `org_id` e o filtro não puder ser aplicado. Rotas novas usam este; rotas existentes migram por onda, começando pelas que leem tabelas com PII (leads, messages, conversas, documentos).
2. **Regra de ESLint custom `aios/no-unscoped-admin-client`** — sinaliza `createAdminClient()` em arquivos sob `app/api/**` que não passam por `withOrgScope`/`createOrgScopedAdminClient` nem estão numa allowlist justificada (webhooks pré-resolução de org, crons cross-org, rotas de plataforma). Warn primeiro, error depois.

Sem isso, o gate de RLS dá uma falsa sensação de segurança: o banco fica correto e a aplicação continua podendo vazar.

### 8.5 Outros itens de hardening

| Item | Ação |
|---|---|
| Segredos de tenant | Supabase Vault; nunca em `jsonb` legível, nunca em env por cliente (ADR-005) |
| Auditoria imutável | `REVOKE UPDATE, DELETE ON platform_audit_log`; escrita só por função `SECURITY DEFINER` |
| PII no plano de plataforma | `PLATFORM_READABLE_TABLES` + `select` explícito de colunas + teste que varre `app/api/platform/**` |
| Storage buckets | verificar que as policies de bucket são org-scoped (documentos de obra, portal do cliente, pastas). O gate cobre tabelas, **não** cobre Storage — item explícito para o @data-engineer |
| RPCs e views | R4/R5 do gate; hoje há RPCs `_remote_only` (dashboards, ROAS) que precisam de revisão de `security_invoker` |
| Rate limit por org | `plan_limits` com `max_requests_per_min`; não é da Onda 1, mas a coluna nasce junto |
| Convite de usuário | validar que o convite só pode criar usuário na org de quem convida (hoje `createRole`/`updatePermission` já validam `org_id`; replicar no fluxo de convite) |
| LGPD | contrato de operador de dados por tenant; a Trifold é operadora do dado do cliente. Fora do escopo técnico, mas bloqueia a venda |

---

## 9. Análise de impacto

### 9.1 Superfície medida

| Métrica | Valor |
|---|---|
| Tabelas em `public` | 108 |
| Migrations existentes | 192 (próxima: 193) |
| Policies RLS | 218 em 59 migrations; ~98/195 cláusulas `USING` citam `org_id` |
| Route handlers (`app/api/**/route.ts`) | 285 |
| Handlers usando `createAdminClient()` | **166** |
| Páginas do dashboard | 87 |
| Arquivos que citam `org_id` (fora testes) | 357 |
| Arquivos que chamam `canAccess()` | 70 |
| Call sites de `createAnthropicClient()` | 12 |
| Crons | 37 |
| Arquivos com UUID de org hardcoded | 14 |

### 9.2 Impacto por categoria

| # | Área | Arquivos/objetos | Esforço | Risco | Onda |
|---|---|---|---|---|---|
| A | **Esteira de CI (do zero)** | `.github/workflows/ci.yml`, `scripts/gate-tenancy.ts`, `docs/audits/tenancy-allowlist.yml`, `rls-gate-baseline.json` | M | baixo | 0 |
| B | **Fechar lacunas de RLS** | ~N policies (N vem de `docs/audits/rls-multi-tenant-audit.md`); migrations 194+ | **G** | **alto** — policy errada quebra a operação | 1 |
| C | **Testes cross-tenant** | `tests/tenancy/*`, projeto Supabase descartável | M | baixo (mas bloqueado por Q6) | 1 |
| D | **Escopo de org em service-role** | 166 handlers; `createOrgScopedAdminClient`, ESLint rule | **G** | médio | 1-2 (incremental) |
| E | **Chaves semânticas de stage/imóvel** | 14 arquivos + migrations 193/195; `stage-resolver.ts` | M | médio (mitigado por dual-run) | 2 |
| F | **Crons por org** | 37 crons; `forEachEntitledOrg` | M | médio (isolar erro por org) | 2 |
| G | **`provision_org()` + wizard** | função SQL + `lib/tenancy/provision.ts` + `/platform/orgs/new` | M | baixo (só cria dado novo) | 2 |
| H | **Modelo de dados de tenancy/revenue** | migrations 196-198 (~15 tabelas), aditivas | M | **baixo** (ninguém lê ainda) | 3 |
| I | **Entitlements + composição no RBAC** | `lib/tenancy/{entitlements,access,guard}.ts` + ~15 linhas em `permissions.ts` + `ModuleLockedScreen` | **P** em código, **alto** em consequência | alto (erro tranca cliente fora) | 3 |
| J | **Medição de IA** | `packages/ai/src/{client,usage}/*`, 12 call sites, sink, RPC | M | médio (mitigado por shadow) | 4 |
| K | **Cota, alertas, degradação** | `lib/revenue/quota.ts`, `pickModel`, cron `ai-quota-notify` | M | **alto** (pode calar a Nicole) | 5 |
| L | **Painel `/platform`** | ~20 páginas + `app/api/platform/**` + guards | **G** | baixo (área nova, isolada) | 2 (mínimo) / 6 (completo) |
| M | **Faturas internas + BillingProvider** | `lib/revenue/{invoice,billing-provider}/*` | M | baixo | 6 |
| N | **Impersonation** | `platform-auth.ts`, wrapper de client, banner, e-mail | M | **alto** (é uma backdoor por design) | 6 |
| O | **Credenciais por tenant + roteamento de webhook** | `org_integrations`, Vault, `api/webhook/whatsapp`, `api/webhooks/meta-ads` | **G** | **alto** (webhook quebrado = lead perdido) | 7 |
| P | **Gateway de pagamento** | implementação de `TenantBillingProvider` | M | baixo (abstração pronta) | 8 |

Escala: P = pequeno (<1 dia-agente), M = médio (2-5), G = grande (>5).

### 9.3 O que NÃO é impactado (bom saber)

- `packages/web/src/lib/billing/**` e as tabelas `platform_services`/`service_billing_*` (Epic 78) — domínio diferente, ficam como estão. Só ganham um comentário de referência cruzada.
- `packages/video`, `packages/shared` — nada de tenancy.
- Portal do cliente (`app/cliente`, `app/portal-viewer`, `app/pasta`) — já é fora do `/dashboard` e escopado por token/lead. Precisa de revisão de RLS (entra em B) mas não de mudança arquitetural.
- `packages/bot` (Telegram) — canal de staging da Trifold, permanece single-tenant.
- Toda a lógica de negócio de leads, roleta, obras, Sienge — o entitlement é um filtro por cima, não uma reescrita.

### 9.4 Concentração de risco

Três arquivos concentram a maior parte do risco de regressão:

1. `packages/web/src/lib/permissions.ts` — 15 linhas novas que decidem se **todo mundo** vê **qualquer coisa**. Se `getOrgEntitlements` lançar exceção e o código não tratar, o dashboard inteiro fica vazio. Regra: falha na resolução de entitlement ⇒ **fail-open** (assume tudo entitled) + alerta crítico. É o oposto do default-deny do RBAC, e é proposital: default-deny aqui derruba a operação de todos os clientes de uma vez.
2. `packages/ai/src/client/anthropic.ts` — se o proxy de medição lançar, a Nicole para. `try/catch` em volta de tudo (P5).
3. `packages/web/src/lib/auth.ts` (`getServerUser`) — o overlay de impersonation mexe na função por onde passa 100% das requests autenticadas.

Esses três exigem revisão de QA reforçada e teste unitário do caminho de falha, não só do caminho felizardo.

---

## 10. Faseamento

Cada onda é deployável, reversível e não quebra a operação atual da Trifold. Ordenação por risco: **isolamento e segurança antes de qualquer feature de venda** (P6).

### Onda 0 — Esteira e observabilidade (sem mudança funcional)

**Entrega:** CI existe; o schema é introspectável; o gate roda em modo relatório.

- `.github/workflows/ci.yml` com `type-check`, `lint`, `test`.
- `scripts/gate-tenancy.ts` + `pnpm gate:tenancy`, rodando **não-bloqueante**, publicando o relatório no PR.
- `docs/audits/tenancy-allowlist.yml` e `rls-gate-baseline.json` gerados a partir do estado atual.
- Snapshot de schema versionado.

**Critério de saída:** o número de violações está medido e visível em todo PR. Zero mudança de comportamento em produção.
**Reversão:** apagar o workflow.

### Onda 1 — Isolamento (a onda mais importante e a mais chata)

**Entrega:** o banco realmente isola os tenants.

- Corrigir as policies apontadas por `docs/audits/rls-multi-tenant-audit.md`, em lotes por domínio (leads → conversas/mensagens → agenda → obras → financeiro → storage), cada lote com migration própria e QA gate.
- Adicionar `WITH CHECK` onde só existe `USING` (evita forjar `org_id` no INSERT).
- Revisar `security_invoker` das views e `search_path` das funções `SECURITY DEFINER`.
- Policies de Storage bucket por org.
- `createOrgScopedAdminClient` + migração das rotas que tocam PII.
- Testes cross-tenant (requer Q6).
- Baixar o baseline do gate a **zero** e tornar o gate **bloqueante**.

**Critério de saída:** gate bloqueante e verde; testes cross-tenant passando; nenhuma tabela com `org_id` sem policy org-scoped nas 4 operações.
**Risco a gerenciar:** policy nova mais restritiva pode quebrar uma tela da Trifold. Mitigação: por lote, não por big bang; QA gate por lote; a Trifold é usuária ativa e detecta rápido; toda migration de policy vem com o `DROP/CREATE` reverso documentado no arquivo.
**Reversão:** por lote, migration inversa.

### Onda 2 — Multi-org de verdade (sem venda ainda)

**Entrega:** é possível criar uma segunda org e ela funciona.

- Chaves semânticas (`kanban_stages.semantic_key`, `properties.semantic_key`) com expand → dual-run → cutover → contract (§7.3).
- `role_default_permissions` semeada; `provision_org()`.
- 37 crons migrados para `forEachActiveOrg` (ainda sem entitlement — só iteração).
- Roteamento de webhook resolvendo org por identificador (com fallback para a org única enquanto houver só uma).
- **Mínimo do `/platform`:** `layout.tsx` + guard + `/platform/orgs` + `/platform/orgs/new`. Sem plano, sem fatura.
- Criar a org **"Trifold Sandbox"** em produção como canário permanente.

**Critério de saída:** o teste de aceitação de §7.4 passa; nenhuma constante de UUID de org resta no código; a operação da Trifold segue idêntica.
**Reversão:** flag `STAGE_RESOLVER=legacy` volta o comportamento antigo sem deploy de código.

### Onda 3 — Entitlements (a camada que habilita a venda)

**Entrega:** módulos podem ser ligados/desligados por contrato.

- Migrations de `sellable_modules`, `plans`, `plan_modules`, `plan_limits`, `org_subscriptions`, `org_module_grants`, `org_limit_overrides` + `org_entitled_modules()` + `org_entitlement_snapshot()`.
- Seed dos planos (depende de Q8) e do catálogo de módulos.
- `lib/tenancy/{entitlements,access,guard}.ts`; passo 5 em `getUserPermissions`; `resolveAccess`.
- `ModuleLockedScreen` + cadeado na sidebar + CTA de upgrade via `chamados`.
- `assertOrgEntitled` nos crons.
- `/platform/orgs/[id]/plano` + `/dashboard/configuracoes/plano`.
- **Trifold recebe o plano `completo-interno`.**

**Critério de saída:** a Trifold não percebe **nenhuma** diferença (P1 verificado); a Trifold Sandbox com plano `crm` vê exatamente os módulos do plano; downgrade e re-upgrade preservam dados e configuração de permissão.
**Reversão:** flag `ENTITLEMENTS_ENFORCEMENT=off` faz `getOrgEntitlements` retornar todos os módulos (fail-open, §9.4).

### Onda 4 — Medição de IA em shadow

**Entrega:** sabemos quanto cada org consome, sem cobrar nem bloquear.

- `ai_usage_events` (particionada), `ai_usage_daily`, `org_billing_periods`, RPC `record_ai_usage`.
- `AiUsageSink` + proxy de medição; `ctx` nos 12 call sites; `createOpenAIClient`.
- Price table versionada.
- `/platform/orgs/[id]/ia` e `/platform/usage`.
- `AI_QUOTA_ENFORCEMENT=shadow`; regra R7 do gate ligada.

**Critério de saída:** reconciliação de ±5% contra `billing-collect-anthropic` por 14 dias consecutivos.
**Reversão:** `AI_QUOTA_ENFORCEMENT=off`.

### Onda 5 — Cota, alertas e enforcement

**Entrega:** a cota vale.

- `checkAiQuota` + `pickModel(tier, verdict)` + desligamento de flows opcionais.
- Cron `ai-quota-notify` (80%, 100%, hard cap) com e-mail + notificação in-app + alerta interno da Trifold.
- Barra de consumo em `/dashboard/configuracoes/plano`.
- `AI_QUOTA_ENFORCEMENT=on`, primeiro na Trifold Sandbox, depois clientes, Trifold por último.

**Critério de saída:** alerta de 80% disparado e recebido em teste real; simulação de 100% em `degrade` e em `hard_stop` sem exceção não tratada no caminho da Nicole.
**Reversão:** env var.

### Onda 6 — Painel completo, faturamento interno e auditoria

**Entrega:** a Trifold opera o SaaS sem SQL manual.

- `/platform` completo (planos, faturas, auditoria, admins, integrações, overview com MRR).
- `tenant_invoices` + `tenant_invoice_lines` + `buildInvoiceForPeriod` + `ManualBillingProvider` + PDF/CSV.
- `platform_audit_log` append-only + `withPlatformAdmin` em todas as rotas.
- Impersonation completa (ADR-004).
- Cron `subscription-lifecycle` (vence trial, marca `past_due`, suspende).

**Critério de saída:** um ciclo de faturamento fechado de ponta a ponta para a Trifold Sandbox, sem intervenção em banco.

### Onda 7 — Credenciais e integrações por tenant

**Entrega:** o primeiro cliente com WhatsApp/Meta/Sienge próprios.

Só necessária quando existir esse cliente. Escopo em §7.5. É a onda de maior risco operacional (webhook quebrado = lead perdido), então: dual-run de roteamento, `org_integrations` com `platform_shared` fallback, e monitoramento por `webhook-health` (cron já existe).

### Onda 8 — Gateway de pagamento

Implementar `AsaasBillingProvider` (ou Stripe) contra a interface já existente. Nenhuma regra de negócio muda. Disparador: volume de clientes que torne a cobrança manual custosa.

### Resumo do caminho crítico

```
0 (CI) → 1 (isolamento) → 2 (multi-org real) → 3 (entitlements) → 4 (medir IA) → 5 (cota) → 6 (painel/fatura)
                                                    └── 7 (integrações por tenant) e 8 (gateway) sob demanda
```

O primeiro cliente pagante é vendável ao fim da **Onda 3** (com cobrança de IA ainda no olhômetro) e cobrável corretamente ao fim da **Onda 5**. Vender antes da Onda 1 é o único erro irrecuperável da lista: um vazamento cross-tenant no primeiro cliente encerra o produto.

---

## 11. Riscos, trade-offs e decisões abertas

### 11.1 Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | **Vazamento cross-tenant por rota service-role** (166 handlers bypassam RLS) | **alta** | **crítico** | `createOrgScopedAdminClient` + ESLint rule + migração priorizada por PII (§8.4). É o risco nº 1 do projeto |
| R2 | **Sem staging**: testes de isolamento não têm onde rodar | **alta** | alto | Q6 — Supabase branching ou projeto descartável. Sem isso a Onda 1 fica sem prova |
| R3 | Policy nova mais restritiva quebra tela da Trifold em produção | média | alto | lotes pequenos, QA gate por lote, migration inversa documentada, Trifold como detector rápido |
| R4 | Entitlement mal resolvido tranca clientes fora do sistema | média | alto | fail-open + flag de kill switch + alerta crítico (§9.4) |
| R5 | Medição de IA quebra a Nicole em produção | média | **crítico** | proxy com try/catch, `ctx` opcional, shadow mode, reconciliação (§5.7) |
| R6 | Corte de cota mata conversa de lead de cliente pagante | média | alto | política default `overage`; `hard_stop` só em trial/past_due (§5.6) |
| R7 | Impersonation vira backdoor | baixa | **crítico** | read-only default, 60 min, justificativa, notificação ao cliente, auditoria imutável, wrapper único (ADR-004) |
| R8 | Webhook roteado para org errada (WhatsApp/Meta) | média | **crítico** | índices UNIQUE em `phone_number_id`/`page_id`, dual-run, rejeitar-e-logar em vez de adivinhar |
| R9 | Reconciliação de custo de IA não fecha ⇒ cobrança errada | média | médio | gate de ±5% como critério de saída da Onda 4; não cobrar antes |
| R10 | Onda 1 vira poço sem fundo (218 policies) e o projeto perde momento | **alta** | médio | baseline com catraca permite trabalho paralelo; lotes por domínio com valor visível; Onda 2 pode começar em paralelo às policies de domínios já fechados |
| R11 | Deriva entre `getHardcodedPermissions()` (TS) e o seed de provisionamento (SQL) | média | médio | `role_default_permissions` como fonte única + teste de paridade |
| R12 | Cota de IA não cobre o custo real (margem negativa) | média | médio | `org_billing_periods.cost_micro_usd` ao lado de `overage_amount_cents` no `/platform` — margem por org visível desde a Onda 4 |
| R13 | LGPD: Trifold como operadora de dado de terceiro sem contrato | média | alto | jurídico, fora do escopo técnico, mas bloqueia a venda |

### 11.2 Trade-offs assumidos

| Decisão | Ganha | Perde | Por que aceitar |
|---|---|---|---|
| Shared DB + RLS (imposto) | custo, simplicidade operacional, migrations únicas | isolamento físico; um bug de policy afeta todos | é decisão do dono do produto; mitigado por gate + testes + wrapper de escopo |
| Entitlement na aplicação, **não** em RLS (ADR-003) | RLS fica com uma responsabilidade só (isolamento); downgrade não bloqueia leitura administrativa; políticas simples e auditáveis | um bug de aplicação pode expor módulo não contratado | expor módulo não pago é perda de receita; RLS complexa demais é perda de dado. Prioriza-se o dado |
| Entitlement derivado, sem tabela materializada | zero divergência silenciosa | uma RPC por resolução (mitigada por cache de 5 min) | divergência entre pago e acessado é o pior bug deste domínio |
| Crédito = custo real | estável a troca de modelo e a prompt cache | menos intuitivo comercialmente | UI traduz para "atendimentos" com média da própria org |
| Fatura interna antes de gateway | modelo canônico pronto; gateway é espelho | trabalho aparentemente redundante na fase manual | é exatamente o que evita o refactor amplo quando o Asaas entrar |
| Impersonation via service-role com filtro forçado | determinístico, testável | perde RLS como rede durante a sessão | alternativas eram pior (sessão real do usuário) ou frágil (GUC em conexão pooled) |
| Fail-open no entitlement, fail-closed no RBAC | não derruba a operação de todos por um bug | janela de exposição de módulo não pago | assimetria de custo: minutos de módulo extra vs. todos os clientes parados |
| `ctx` opcional em `createAnthropicClient` | migração incremental, Nicole nunca quebra | risco de call site esquecido | coberto pela regra R7 do gate |

### 11.3 Perguntas objetivas para o Gabriel

Ordenadas por quanto bloqueiam o trabalho.

**Bloqueiam a Onda 1:**

1. **Q6 — Staging.** Autoriza criar um projeto Supabase descartável (ou habilitar Branching) para rodar os testes de isolamento cross-tenant? Sem isso, a Onda 1 termina sem prova automatizada de que o isolamento funciona, e o gate de CI só valida o schema, não o comportamento. Custo estimado: um projeto Supabase adicional no plano atual.

**Bloqueiam a Onda 3:**

2. **Q8 — Composição dos planos.** Preciso da lista de módulos por tier para semear `plan_modules`. Sugestão de partida (confirmar/corrigir):
   - **CRM** (`tier_order 10`): dashboard, pipeline, leads, imoveis, conversas, agenda, alertas, atividades, corretores, chamados, configuracoes
   - **CRM + Marketing** (`20`): + campanhas, analytics, roleta, bolsao, mensagens, materiais, treinamento
   - **Completo** (`30`): + obras, lancamentos, brindes, chat, imob, fluxo, pastas, sistema
3. **Q7 — Módulos core.** Concorda que `dashboard`, `chamados` e `configuracoes` sejam sempre inclusos (nunca bloqueáveis)? Alternativa: `chamados` como add-on de suporte pago — nesse caso preciso de outro canal para o CTA de upgrade.
4. **Q9 — Um usuário em várias orgs.** É requisito (ex.: grupo com duas empresas, ou um corretor que atende dois clientes)? Hoje `users.org_id` é 1:1 e mudar isso é caro (toca `user_org_id()`, 218 policies e a sessão). **Assumo NÃO** até você dizer o contrário.
5. **Q5 — Suspensão por inadimplência.** Quantos dias em `past_due` antes de `suspended`? E é automático (cron) ou sempre decisão manual da Trifold no `/platform`? Sugestão: 10 dias com alerta interno, suspensão **manual** (uma empresa suspensa por engano é um cliente perdido).

**Bloqueiam a Onda 5:**

6. **Q1 — Unidade de cota.** Confirma crédito = US$0,001 de custo real, com tradução para "≈ N atendimentos" na UI? Ou você prefere vender explicitamente em "atendimentos/mês" (mais simples de vender, mais arriscado de precificar)?
7. **Q2 — Política no 100%.** Confirma `overage` (Nicole nunca para, excedente na fatura) para orgs `active`, e `hard_stop` para `trial`? E o hard cap de 3× a cota como proteção da Trifold contra loop de bug?
8. **Q2b — Faixas de excedente.** Preciso dos valores: preço por 1.000 créditos excedentes, e se há faixas decrescentes. Sem isso `ai_overage_tiers` fica vazio e o excedente não é faturável.

**Bloqueiam a Onda 6:**

9. **Q3 — Impersonation.** Aprovado nos termos do ADR-004 (justificativa obrigatória, 60 min, read-only por padrão, e-mail automático ao admin do cliente, auditoria imutável)? O e-mail ao cliente é o ponto mais sensível comercialmente — dá transparência mas expõe que a Trifold entrou no ambiente dele.
10. **Q4 — PII no suporte.** O super-admin pode ver conteúdo de conversa ou PII de lead em **nenhuma** hipótese fora de impersonation? Existe algum caso de suporte real que exija (ex.: "a Nicole respondeu errado, me mostra a conversa")? Se existir, prefiro modelá-lo como um pedido explícito de acesso com aprovação do cliente do que abrir por padrão.
11. **Q10 — Retenção pós-cancelamento.** 90 dias de janela de export e depois o quê: exclusão definitiva, ou arquivamento indefinido (com custo de storage)? Precisa constar em contrato.

**Bloqueiam a Onda 7:**

12. **Q11 — WhatsApp.** Cada cliente traz o próprio número/WABA, ou a Trifold revende números sob a própria WABA? Muda completamente o escopo: número próprio do cliente = onboarding de integração por cliente; revenda = a Trifold gerencia N números numa WABA e o roteamento é interno.

**Não bloqueia, mas quero seu aval:**

13. **Q12 — Nomes.** Confirma `lib/tenancy/` (quem é o tenant e o que contratou) e `lib/revenue/` (o que a Trifold recebe), mantendo `lib/billing/` reservado para o custo interno do Epic 78? Se você preferir outro par de nomes, é agora — depois vira renomeação de 30 arquivos.
14. **Q13 — Trial.** Existe trial no modelo comercial ou toda venda começa com contrato assinado? O status `trial` está modelado; se não houver trial, ele nasce sem uso (e o `hard_stop` de IA perde o principal caso).

---

## 12. ADRs

| ADR | Título | Decisão |
|---|---|---|
| [ADR-002](adr/adr-002-shared-db-rls-tenant-isolation.md) | Isolamento por Shared DB + RLS endurecida | Um banco, `org_id` em toda tabela de tenant, gate de CI com catraca, wrapper de escopo para service-role |
| [ADR-003](adr/adr-003-entitlements-layer-vs-rbac.md) | Entitlement como camada distinta do RBAC, aplicada na aplicação | Derivado (sem materialização), interseccionado em `getUserPermissions`, fora do RLS, fail-open |
| [ADR-004](adr/adr-004-platform-admin-impersonation.md) | Impersonation auditada para suporte cross-org | Sim, read-only/60min/justificada/notificada, via service-role com filtro forçado |
| [ADR-005](adr/adr-005-tenant-secrets-storage.md) | Segredos de integração por tenant | Supabase Vault com `secret_ref`; nunca env por cliente, nunca `jsonb` legível |
| [ADR-006](adr/adr-006-billing-provider-abstraction.md) | Cobrança atrás de abstração, sem gateway na fase 1 | `tenant_invoices` como modelo canônico + `TenantBillingProvider`; `manual` agora, Asaas/Stripe depois |
| [ADR-007](adr/adr-007-ai-usage-metering-unit.md) | Unidade de cota de IA = crédito sobre custo real | `1 crédito = US$0,001`; interceptação em `createAnthropicClient`; shadow mode + reconciliação com Epic 78 |

Nota: o ADR existente do projeto é `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` — daí a numeração começar em 002.


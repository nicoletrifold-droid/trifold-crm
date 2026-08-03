# ADR-005: Armazenamento de Segredos de Integração por Tenant

- **Status:** **Proposed** — depende de confirmar disponibilidade do Supabase Vault no plano atual
- **Data:** 2026-07-29
- **Decisor técnico:** @architect (Aria)
- **Documento pai:** `docs/architecture/saas-multi-tenant.md` §2.8, §7.5
- **Relacionado:** questão Q11 (modelo de WhatsApp) em §11.3

---

## Contexto

Hoje **todas** as credenciais de integração são globais, em variáveis de ambiente da Vercel:

```
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, META_APP_SECRET,
META_PAGE_ACCESS_TOKEN, META_WHATSAPP_VERIFY_TOKEN,
SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD, SIENGE_WEBHOOK_TOKEN,
RESEND_API_KEY, RESEND_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN,
SUPREMO_API_TOKEN, CLICKSIGN_API_TOKEN, ANTHROPIC_API_KEY, OPENAI_API_KEY
```

No SaaS, parte disso passa a ser por cliente (WhatsApp, Meta page, Sienge, domínio de e-mail) e parte permanece da Trifold (Anthropic, OpenAI, o app Meta, a conta Resend).

Três restrições concretas do ambiente:

1. **Gotcha documentado da Vercel CLI:** `vercel env add` via stdin/pipe grava **valor vazio** silenciosamente. Já causou dois incidentes no projeto (VAPID key na Story 75-40; `PORTAL_NOTIF_PAUSED=""` na Story 75-66). O contorno é a REST API (`scripts/vercel-env-set.sh`).
2. **Mudança de env var só vale após `vercel redeploy`.** Uma variável por cliente significaria redeploy a cada venda e a cada rotação de credencial.
3. Já existe backlog de segurança sobre segredo exposto (`SUPREMO_TOKEN`, 2026-06-08, rotação pendente) — sinal de que "segredo em lugar errado" é um problema real e recorrente aqui, não hipotético.

## Decisão

### 1. Separação estrutural: identificador vs. segredo

`org_integrations.config` (jsonb, legível por RLS pelo admin da org) guarda **só identificadores públicos**: `phone_number_id`, `waba_id`, `page_id`, `form_id`, `subdomain`, `from_domain`. `org_integrations.secret_ref` (text) guarda **um ponteiro**, nunca o segredo.

Uma view `org_integrations_public` remove `secret_ref` para consumo do `/dashboard`.

### 2. Segredos no Supabase Vault

`secret_ref` = id de um secret criado com `vault.create_secret(...)`. Leitura apenas por service-role, dentro de `resolveIntegration(orgId, provider)` — o único ponto do código autorizado a materializar uma credencial de tenant.

Fallback se o Vault não estiver disponível no plano: envelope encryption na aplicação (AES-256-GCM) com uma única `TENANT_SECRET_KEY` em env, ciphertext em `org_integrations.secret_cipher`. Pior que o Vault (a chave-mestra fica em env e a rotação é manual), mas melhor que texto claro em `jsonb`. A decisão entre os dois é operacional, não arquitetural: o contrato `resolveIntegration()` é o mesmo.

### 3. Fallback global explícito por provider

```ts
resolveIntegration(orgId, provider):
  1. org_integrations com status='connected' → credencial do tenant
  2. senão, se o provider está marcado platform_shared → env global
  3. senão → erro "integração não configurada"
```

O passo 2 é **por provider, explícito**, nunca implícito. Isso mantém a Trifold funcionando no dia 1 sem migrar credencial nenhuma, e força credencial própria onde faz sentido:

| Provider | Modelo | `platform_shared` |
|---|---|---|
| Anthropic, OpenAI | chave da Trifold, custo repassado por cota (ADR-007) | **sim, sempre** |
| Meta App (`META_APP_SECRET`) | app "Ações Trifold" | **sim** (page/form são por org) |
| Resend (API key) | conta da Trifold, `from_domain` por org | **sim** |
| Google OAuth | app da Trifold, escopo por usuário | **sim** |
| Telegram | canal de staging/teste da Trifold | **sim** |
| WhatsApp Cloud API | depende de Q11 | não (se cliente traz número) |
| Sienge | credencial do ERP do cliente | **não** |
| Supremo, ClickSign | hoje específicos da Trifold | sim até um cliente precisar |

### 4. Nunca env var por cliente

Descartado por três motivos independentes: exige redeploy por venda e por rotação; multiplica a superfície do gotcha de valor vazio; e não tem trilha de auditoria de quem alterou o quê.

### 5. Roteamento reverso de webhook por identificador, não por segredo

Índices UNIQUE parciais em `org_integrations ((config->>'phone_number_id'))` e `((config->>'page_id'))`. Webhook resolve a org pelo identificador do payload e, se não achar, **responde 200 e loga** — nunca 4xx/5xx para a Meta, que desabilita o webhook após falhas repetidas. Persistir o evento bruto antes de processar continua valendo.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Segredo em `org_integrations.config` (jsonb) | legível por qualquer policy de leitura da org; um erro de policy vira vazamento de credencial do ERP do cliente |
| Env var por org (`SIENGE_PASSWORD__ACME`) | redeploy por venda; gotcha do valor vazio; sem auditoria; limite prático de env vars |
| Cofre externo (AWS Secrets Manager, Doppler) | dependência e custo novos para um problema que o Supabase já resolve; mais um provider na conta do Epic 78 |
| `pgsodium` direto nas colunas | Supabase está desencorajando em favor do Vault; a API de Vault é mais simples e já é o caminho recomendado |

## Consequências

**Positivas:** rotação de credencial de um cliente é um UPDATE, sem deploy; segredo nunca trafega para o browser nem aparece em log de query; onboarding de integração fica auto-serviço no `/platform`; a superfície do gotcha da Vercel CLI não cresce com o número de clientes.

**Negativas e aceitas:**
- `resolveIntegration()` vira ponto crítico único: bug ali derruba a integração de todos os tenants. Exige teste por provider e cache curto com invalidação explícita.
- Acopla o projeto ao Vault do Supabase (ou à chave-mestra em env, no fallback). Mitigado por a interface `resolveIntegration` ser a única consumidora.
- Migrar as credenciais atuais da Trifold de env para Vault é trabalho sem valor visível. Por isso o fallback `platform_shared` existe: a Trifold pode continuar em env indefinidamente, e a migração acontece só se/quando fizer sentido.
- Roteamento de webhook por identificador muda comportamento de rotas que hoje funcionam (`api/webhook/whatsapp`, `api/webhooks/meta-ads`). Risco R8 do documento pai (impacto crítico: webhook errado = lead no tenant errado, ou lead perdido). Exige dual-run e monitoramento via o cron `webhook-health` já existente.

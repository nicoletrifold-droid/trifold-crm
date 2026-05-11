---
epic: 18
story: 18.9
title: Configurações de Email + Envio Rápido
status: Draft
priority: P1-ALTO
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [ui_accessibility, rbac_validation, settings_persistence, send_validation]
complexity: G
estimated_hours: 6
depends_on: [18.1, 18.2, 18.4]
---

# Story 18.9 — Configurações de Email + Envio Rápido

## Contexto

O Epic 18 entregou monitoramento, templates, automações e disparos em massa. Dois gaps permanecem na "central de gerenciamento":

1. **Configurações hardcoded** — remetente (`"Trifold <contato@trifold.com.br>"`), quota diária (100) e thresholds de alerta (95%, 5% bounce) estão fixos no código (`lib/email.ts`). Não há como o admin ajustar sem deploy.

2. **Sem envio rápido** — para mandar um email avulso para um destinatário específico, o admin precisa criar um blast inteiro. Falta um formulário simples de envio pontual.

Esta story adiciona:
- Tabela `email_settings` por org (migration 026)
- Página de configurações em `/dashboard/sistema/email-configuracoes`
- Página de envio rápido em `/dashboard/sistema/email-envio-rapido`
- Atualização do sub-nav layout para incluir as 2 novas tabs
- `sendTemplateEmail()` e `sendEmail()` passam a ler as configurações da org do banco

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** uma página de configurações para ajustar remetente, quotas e alertas de email, e um formulário de envio rápido para mandar emails avulsos,
**Para que** eu tenha controle total sobre o sistema de email sem precisar de deploy e possa enviar emails pontuais diretamente da interface.

## Acceptance Criteria

### Configurações

- [ ] **AC1:** Migration `026_email_settings.sql` criada com tabela `email_settings`:
  ```sql
  email_settings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
    sender_name text NOT NULL DEFAULT 'Trifold',
    sender_email text NOT NULL DEFAULT 'contato@trifold.com.br',
    reply_to    text NULL,
    daily_quota int NOT NULL DEFAULT 100 CHECK (daily_quota BETWEEN 1 AND 1000),
    quota_alert_pct int NOT NULL DEFAULT 95 CHECK (quota_alert_pct BETWEEN 50 AND 99),
    bounce_alert_pct int NOT NULL DEFAULT 5 CHECK (bounce_alert_pct BETWEEN 1 AND 50),
    telegram_alerts_enabled boolean NOT NULL DEFAULT true,
    unsubscribe_base_url text NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  )
  ```
  - RLS por `org_id` (leitura e escrita apenas pela própria org)
  - Service role bypassa RLS (para leitura pelo engine de envio)
  - Índice em `email_settings(org_id)` (lookup frequente pelo engine)

- [ ] **AC2:** API Routes em `packages/web/src/app/api/admin/email-settings/`:
  - `GET /api/admin/email-settings` — retorna config da org ou defaults se não existir
  - `PUT /api/admin/email-settings` — upsert (cria ou atualiza) config da org
  - Ambas restritas a `role = 'admin'` (403 para outros roles)

- [ ] **AC3:** Página `/dashboard/sistema/email-configuracoes` com formulário de configurações:

  **Seção "Remetente":**
  - Campo: Nome do remetente (text, max 50 chars)
  - Campo: Email do remetente (email, validação de formato)
  - Campo: Reply-to (email, opcional)
  - Informação: "Certifique-se que o domínio está verificado no Resend"

  **Seção "Limites e Quotas":**
  - Campo: Quota diária (número, 1–1000, hint "Plano Free Resend: 100/dia")
  - Campo: Alerta de quota em % (slider ou número, 50–99, default 95)
  - Preview: "Alerta quando atingir X emails (Y%)"

  **Seção "Alertas":**
  - Campo: Bounce alert % (número, 1–50, default 5)
  - Toggle: Alertas via Telegram (on/off)
  - Info: status atual do Telegram (mostra se `TELEGRAM_BOT_TOKEN` está configurado)

  **Seção "Descadastro":**
  - Campo: URL base de descadastro (opcional, ex: `https://app.trifold.com.br/unsubscribe`)

  **Ações:**
  - Botão "Salvar configurações" — chama `PUT /api/admin/email-settings`
  - Toast de sucesso "Configurações salvas" / toast de erro em caso de falha
  - Estado de loading no botão durante o save

- [ ] **AC4:** `sendTemplateEmail()` e `sendEmail()` passam a ler `email_settings` da org antes de enviar:
  - `sender_name` e `sender_email` substituem os valores hardcoded
  - `daily_quota` substitui o valor hardcoded 100
  - `quota_alert_pct` substitui o 95 hardcoded
  - Se `email_settings` não existir para a org, usa os defaults da tabela (fallback seguro)
  - Leitura via service role (sem impacto de RLS no flow de envio)

### Envio Rápido

- [ ] **AC5:** Página `/dashboard/sistema/email-envio-rapido` com formulário de envio avulso:

  **Passo 1 — Destinatário:**
  - Campo: Email do destinatário (email, obrigatório)
  - Campo: Nome do destinatário (text, opcional)

  **Passo 2 — Template e conteúdo:**
  - Select: Template (dropdown com templates `is_active = true` da org, obrigatório)
  - Ao selecionar template: carrega variáveis definidas em `template.variables`
  - Para cada variável obrigatória: campo de preenchimento com label e tipo
  - Campo opcional: Override do assunto (usa o do template se vazio)

  **Passo 3 — Preview e envio:**
  - Botão "Pré-visualizar" — chama `POST /api/admin/email-templates/[id]/preview` com as variáveis preenchidas, exibe resultado em modal
  - Botão "Enviar agora" — chama `POST /api/admin/email-send-quick`
  - Alerta se quota restante for baixa (< 10 emails): "Atenção: apenas X emails restantes hoje"
  - Confirmação com toast: "Email enviado para fulano@exemplo.com"

- [ ] **AC6:** API Route `POST /api/admin/email-send-quick`:
  - Body: `{ templateSlug, to: { email, name }, variables, subjectOverride? }`
  - Chama `sendTemplateEmail()` com `triggeredBy: 'manual:quick-send'` e `priority: 1`
  - Retorna `{ logId, queued }` — se `queued: true`, mostra aviso "Email na fila (quota atingida)"
  - Restrita a `role = 'admin'` (403 para outros roles)

### Sub-nav e integração

- [ ] **AC7:** Layout `/dashboard/sistema/layout.tsx` atualizado com 2 novas tabs:
  - "Envio Rápido" → `/dashboard/sistema/email-envio-rapido`
  - "Configurações" → `/dashboard/sistema/email-configuracoes`
  - Ordem final das tabs: Monitoramento | Templates | Automações | Disparos | Envio Rápido | Configurações
  - Ambas as novas rotas ativam o sub-nav (adicionadas ao array `EMAIL_TABS`)

- [ ] **AC8:** Card hub na `sistema/page.tsx` atualizado — adicionar os 2 novos itens ao grid (passa de 4 para 6 cards)

- [ ] **AC9:** `npm run type-check` passa sem erros

## Dev Notes

### Stack e padrões
- **Migration:** seguir padrão de `018_email_central.sql`, numeração `026_email_settings.sql`
- **Upsert:** usar `supabase.from('email_settings').upsert({ org_id, ...fields }, { onConflict: 'org_id' })`
- **Leitura no engine:** `createServiceClient()` já existe em `lib/email.ts` — usar para ler `email_settings` sem RLS
- **Formulário:** seguir padrão de `email-automacoes/_components/automation-form.tsx` (useState + fetch, sem lib de form)
- **Toast:** seguir padrão existente no dashboard (verificar componente toast/sonner em uso)
- **Layout update:** arquivo em `packages/web/src/app/dashboard/sistema/layout.tsx` (criado na story anterior)

### Fallback de configurações
```typescript
// lib/email.ts — helper a criar
async function getEmailSettings(orgId: string): Promise<EmailSettings> {
  const { data } = await supabase
    .from('email_settings')
    .select('*')
    .eq('org_id', orgId)
    .single()

  return data ?? {
    sender_name: 'Trifold',
    sender_email: 'contato@trifold.com.br',
    reply_to: null,
    daily_quota: 100,
    quota_alert_pct: 95,
    bounce_alert_pct: 5,
    telegram_alerts_enabled: true,
    unsubscribe_base_url: null,
  }
}
```

### Sender format
```typescript
const from = `${settings.sender_name} <${settings.sender_email}>`
// ex: "Trifold <contato@trifold.com.br>"
```

### Verificar toast existente
```bash
grep -r "toast\|sonner\|Toaster" packages/web/src --include="*.tsx" -l | head -5
```

## Tasks

- [ ] **Task 1 — Migration `026_email_settings.sql`** (AC: 1)
  - Criar `supabase/migrations/026_email_settings.sql`
  - Tabela `email_settings` com todas as colunas, CHECK constraints, RLS, índice
  - Aplicar com `supabase db push`

- [ ] **Task 2 — API Routes de configurações** (AC: 2)
  - `GET /api/admin/email-settings/route.ts`
  - `PUT /api/admin/email-settings/route.ts`
  - Proteção `role = 'admin'`, upsert no PUT

- [ ] **Task 3 — Helper `getEmailSettings()` no engine** (AC: 4)
  - Adicionar função `getEmailSettings(orgId)` em `lib/email.ts`
  - Atualizar `sendTemplateEmail()` e `sendEmail()` para usar settings da org
  - Manter fallback para defaults

- [ ] **Task 4 — Página de configurações** (AC: 3)
  - `app/dashboard/sistema/email-configuracoes/page.tsx`
  - Componente `_components/email-settings-form.tsx`
  - 4 seções: Remetente, Limites, Alertas, Descadastro

- [ ] **Task 5 — API Route de envio rápido** (AC: 6)
  - `app/api/admin/email-send-quick/route.ts`
  - Chama `sendTemplateEmail()` com `priority: 1`

- [ ] **Task 6 — Página de envio rápido** (AC: 5)
  - `app/dashboard/sistema/email-envio-rapido/page.tsx`
  - Componente `_components/quick-send-form.tsx`
  - 3 passos: destinatário → template + variáveis → preview + envio

- [ ] **Task 7 — Atualizar sub-nav e hub** (AC: 7, 8)
  - Editar `app/dashboard/sistema/layout.tsx` — adicionar 2 tabs
  - Editar `app/dashboard/sistema/page.tsx` — adicionar 2 cards ao grid

- [ ] **Task 8 — Qualidade** (AC: 9)
  - `npm run type-check` sem erros
  - Verificar lint nos arquivos criados

## Pre-Commit Checklist (@dev)
- [ ] Pre-Commit (@dev): Testar GET settings sem registro existente (deve retornar defaults)
- [ ] Pre-Commit (@dev): Testar PUT settings → GET → confirmar persistência
- [ ] Pre-Commit (@dev): Testar envio rápido com quota alta (> 95) — deve retornar `queued: true`
- [ ] Pre-PR (@devops): Testar acesso 403 para non-admin

## File List

_Preenchido pelo @dev durante implementação_

## Dev Agent Record

### Agent Model Used
_A ser preenchido_

### Debug Log
_A ser preenchido_

### Completion Notes
_A ser preenchido_

### Change Log
_A ser preenchido_

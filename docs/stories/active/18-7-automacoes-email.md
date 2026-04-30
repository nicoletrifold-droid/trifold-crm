---
epic: 18
story: 18.7
title: Automações de Email
status: Ready for Review
priority: P2-MÉDIO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [trigger_reliability, queue_integration, duplicate_prevention, scheduler_correctness]
complexity: G
estimated_hours: 5
depends_on: [18.1, 18.3, 18.4]
---

# Story 18.7 — Automações de Email

## Contexto

Com templates (18.3) e engine de envio (18.4) funcionando, esta story adiciona a camada de automação: triggers configuráveis por admin que disparam emails automaticamente com base em eventos do CRM.

MVP com 3 triggers:
1. `lead.created` — boas-vindas automático ao novo lead
2. `lead.status_changed` — follow-up ao qualificar ou mover o lead
3. `cron.daily` — follow-up de leads sem contato há N dias

Automações com `delay_minutes = 0` são disparadas na hora; automações com delay usam a `email_sends_queue` de 18.4.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** configurar automações de email que disparam automaticamente com base em eventos de lead,
**Para que** leads recebam comunicações relevantes no momento certo sem intervenção manual.

## Acceptance Criteria

- [x] **AC1:** Página `/dashboard/sistema/email-automacoes` criada (somente admin):
  - Tabela de automações: Nome, Trigger, Template, Delay, Status (Ativa/Inativa)
  - Botão "Nova Automação"
  - Toggle de ativar/desativar por automação
  - Ação "Editar" e "Excluir" (com confirmação)

- [x] **AC2:** Formulário de criação/edição de automação:
  - **Nome:** texto livre
  - **Trigger:** select com opções: "Lead criado", "Lead mudou status", "Follow-up diário"
  - **Filtro de trigger** (condicional ao trigger selecionado):
    - Para "Lead mudou status": select de status alvo (ex: "Qualificado", "Visita agendada")
  - **Template:** select de templates ativos da org (categoria: automação)
  - **Delay:** select (Imediato / 1 hora / 24 horas / 48 horas / 72 horas)
  - **Ativo:** toggle

- [x] **AC3:** API Routes em `packages/web/src/app/api/admin/email-automations/`:
  - `GET /api/admin/email-automations` — lista automações da org
  - `POST /api/admin/email-automations` — cria automação
  - `PUT /api/admin/email-automations/[id]` — edita automação
  - `DELETE /api/admin/email-automations/[id]` — exclui automação
  - Proteção: somente admin

- [x] **AC4:** Trigger `lead.created` — disparado quando novo lead é criado:
  - Chamada a `sendTemplateEmail()` logo após `INSERT INTO leads` nas rotas que criam leads
  - Rotas a verificar: `/api/webhooks/meta-ads`, `/api/webhook/whatsapp`, criação manual de lead
  - Verifica automações ativas com `trigger_event = 'lead.created'`
  - Variáveis automáticas do lead: `{{nome}}`, `{{email}}`, `{{telefone}}`

- [x] **AC5:** Trigger `lead.status_changed` — disparado quando `leads.stage` é alterado:
  - Verificar automações com `trigger_event = 'lead.status_changed'` e `trigger_filter->>'status' = novo_status`
  - Disparar apenas para automações cujo filtro corresponde ao novo status

- [x] **AC6:** Trigger `cron.daily` — cron diário às 08h BRT:
  - Rota `POST /api/cron/email-automations`
  - Busca leads sem `last_contact_at` (ou `last_contact_at < now() - delay configurado`) para a org
  - Registrar em `vercel.json`: `{"path": "/api/cron/email-automations", "schedule": "0 11 * * *"}` (08h BRT = 11h UTC)
  - Protegido por `CRON_SECRET`

- [x] **AC7:** Deduplication — mesmo lead não recebe o mesmo email de automação 2x na janela configurável:
  - Verificar em `email_logs` se já existe registro com `triggered_by LIKE 'automation:{automation_id}%'` e `to_email = lead.email` nas últimas 24h
  - Se já enviado: pular sem criar novo log

- [x] **AC8:** Automações com `delay_minutes > 0` usam a fila existente (18.4):
  - `sendTemplateEmail({ scheduledFor: new Date(Date.now() + delay_minutes * 60000) })`
  - Fila processada pelo cron `email-queue` de 18.4

- [x] **AC9:** `npm run type-check` passa sem erros

## Scope

### IN
- CRUD de automações via UI admin
- 3 triggers: `lead.created`, `lead.status_changed`, `cron.daily`
- Deduplication por automação + destinatário por 24h
- Integração com fila de 18.4 para delays

### OUT
- Trigger `email.replied` (fora do MVP — Resend não fornece este evento)
- Sequências/fluxos de automação (múltiplas etapas — fora do MVP)
- Variáveis customizadas além das do lead (fora do MVP)
- A/B testing de templates (fora do MVP)

## Dev Notes

### Função auxiliar de disparo de automações

Criar `packages/web/src/lib/email-automations.ts`:

```typescript
import { SupabaseClient } from "@supabase/supabase-js"
import { sendTemplateEmail } from "@web/lib/email"

export async function triggerAutomations(
  supabase: SupabaseClient,
  eventType: 'lead.created' | 'lead.status_changed',
  lead: { id: string; email: string; name: string; phone?: string; org_id: string },
  filter?: Record<string, string>  // ex: { status: 'Qualificado' }
): Promise<void> {
  // 1. Buscar automações ativas para o trigger e filtro
  const query = supabase
    .from('email_automations')
    .select('*, email_templates(*)')
    .eq('org_id', lead.org_id)
    .eq('trigger_event', eventType)
    .eq('is_active', true)

  const { data: automations } = await query

  for (const automation of automations ?? []) {
    // 2. Verificar filtro de trigger (ex: status específico)
    if (automation.trigger_filter && filter) {
      const matchesFilter = Object.entries(automation.trigger_filter).every(
        ([key, value]) => filter[key] === value
      )
      if (!matchesFilter) continue
    }

    // 3. Deduplication check
    const alreadySent = await checkRecentSend(supabase, automation.id, lead.email)
    if (alreadySent) continue

    // 4. Disparar email
    const scheduledFor = automation.delay_minutes > 0
      ? new Date(Date.now() + automation.delay_minutes * 60000)
      : undefined

    await sendTemplateEmail({
      templateSlug: automation.email_templates.slug,
      to: { email: lead.email, name: lead.name },
      variables: { nome: lead.name, email: lead.email, telefone: lead.phone ?? '' },
      triggeredBy: `automation:${automation.id}`,
      orgId: lead.org_id,
      scheduledFor,
      priority: 5
    })
  }
}

async function checkRecentSend(
  supabase: SupabaseClient,
  automationId: string,
  toEmail: string
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .like('triggered_by', `automation:${automationId}%`)
    .eq('to_email', toEmail)
    .gte('created_at', since)

  return (count ?? 0) > 0
}
```

### Onde chamar `triggerAutomations` para `lead.created`

Verificar as rotas que criam leads e adicionar chamada após INSERT bem-sucedido:
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` (já usa `after()` para async)
- `packages/web/src/app/api/webhook/whatsapp/route.ts`

Usar `waitUntil()` ou `after()` para não bloquear o response:
```typescript
// Não bloquear o response principal
after(() => triggerAutomations(supabase, 'lead.created', leadData))
```

### Cron de automações — arquivo a criar

`packages/web/src/app/api/cron/email-automations/route.ts`

```typescript
// GET /api/cron/email-automations
// Roda diariamente às 11h UTC (08h BRT)
// Busca automações tipo 'cron.daily' ativas
// Para cada automação: busca leads sem contato recente e dispara template
```

### Estrutura de arquivos

```
packages/web/src/
  lib/email-automations.ts           -- triggerAutomations helper
  app/
    dashboard/sistema/email-automacoes/
      page.tsx                       -- Lista de automações
      novo/page.tsx                  -- Criar automação
      [id]/page.tsx                  -- Editar automação
    api/
      admin/email-automations/
        route.ts                     -- GET + POST
        [id]/route.ts               -- PUT + DELETE
      cron/email-automations/
        route.ts                     -- Cron diário
```

### Testing

- Testar `triggerAutomations` com lead mock — verifica se email é criado em `email_logs`
- Testar deduplication — segundo trigger para mesmo lead + automação não cria segundo email
- Testar automação inativa — não deve disparar
- Testar filtro de status — automação com filtro `{ status: 'Qualificado' }` só dispara para esse status
- Testar automação com delay — cria item na `email_sends_queue`
- `npm run type-check` deve passar

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: API + Integration
- Secondary Type(s): Frontend (UI de automações)
- Complexity: High (triggers em múltiplos pontos do sistema, deduplication, cron)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @architect (quality gate)
- Supporting Agents: —

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar deduplication — mesmo lead não recebe 2x em 24h
- [ ] Pre-PR (@devops): Testar trigger `lead.created` em staging com lead real

**CodeRabbit Focus Areas:**
- Primary: Deduplication funcional (24h window por automation_id + email)
- Primary: `triggerAutomations` não bloqueia response (usa after/waitUntil)
- Secondary: Filtros de trigger aplicados corretamente (status específico)
- Secondary: Automação inativa não dispara

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [x] **Task 1 — Helper `email-automations.ts`** (AC: 7, 8)
  - [x] Função `triggerAutomations(supabase, eventType, lead, filter?)`
  - [x] Função `checkRecentSend(supabase, automationId, email)` — deduplication
  - [x] Integração com `sendTemplateEmail()` para delays

- [x] **Task 2 — API Routes** (AC: 3)
  - [x] CRUD completo em `/api/admin/email-automations`
  - [x] Proteção admin em todas as rotas

- [x] **Task 3 — UI admin** (AC: 1, 2)
  - [x] Lista de automações com toggle ativar/desativar
  - [x] Formulário de criação/edição

- [x] **Task 4 — Trigger `lead.created`** (AC: 4)
  - [x] Adicionar `triggerAutomations` nos handlers que criam leads
  - [x] Usar `void` (fire-and-forget) para não bloquear response

- [x] **Task 5 — Trigger `lead.status_changed`** (AC: 5)
  - [x] Identificar onde `leads.stage` é atualizado no código
  - [x] Adicionar trigger após UPDATE bem-sucedido

- [x] **Task 6 — Cron `email-automations`** (AC: 6)
  - [x] Criar `api/cron/email-automations/route.ts`
  - [x] Lógica de follow-up de leads sem contato
  - [x] Registrar em `vercel.json`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
| 2026-04-30 | 1.1 | Implementação completa — todos os ACs concluídos | Dex (@dev) |

---
epic: 18
story: 18.8
title: Campanhas Manuais — Email Blast
status: Ready for Review
priority: P2-MÉDIO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [blast_safety, rate_limit_integration, preview_accuracy, audience_segmentation]
complexity: G
estimated_hours: 5
depends_on: [18.1, 18.3, 18.4, 18.6]
---

# Story 18.8 — Campanhas Manuais (Email Blast)

## Contexto

Com toda a infraestrutura do Epic 18 no lugar (schema, templates, engine de envio, monitoramento), esta story adiciona a capacidade de disparar emails em massa para segmentos de leads. É a última story do epic e a mais complexa do ponto de vista de segurança (evitar blast acidental).

O blast é enfileirado na `email_sends_queue` com prioridade 10 (baixa), respeitando o limite de 100 emails/dia automaticamente.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** disparar emails em massa para segmentos de leads selecionados usando templates,
**Para que** eu possa fazer comunicações de marketing ou informativas sem ferramentas externas.

## Acceptance Criteria

- [x] **AC1:** Página `/dashboard/sistema/email-blasts` com histórico de blasts:
  - Tabela: Nome da campanha, Template, Audiência, Enviados/Total, Taxa abertura, Status, Criado em
  - Status badge: Rascunho / Agendado / Em andamento / Concluído / Cancelado
  - Botão "Novo Blast"
  - Botão "Cancelar" para blasts com status `agendado` ou `em_andamento` (apenas se 0 emails enviados)

- [x] **AC2:** Wizard de criação de blast em 3 passos:

  **Passo 1 — Audiência:**
  - Seleção de segmento (select):
    - Todos os leads ativos da org
    - Por status de lead (multi-select de stages)
    - Por origem (meta_ads / whatsapp / manual)
    - Por empreendimento (property_id)
  - Contagem de destinatários após seleção do segmento (query em tempo real)
  - Alerta se contagem > quota diária restante: "X leads selecionados — quota restante: Y. O blast será distribuído em Z dias."
  - Exclusão de leads com `is_valid_email = false` ou sem email

  **Passo 2 — Conteúdo:**
  - Select de template (lista de templates ativos da org)
  - Preview do email renderizado com dados do primeiro lead da audiência
  - Campo "Nome da campanha" (identificação interna)
  - Campo "Assunto" (pré-preenchido com o do template, editável)

  **Passo 3 — Agendamento e Confirmação:**
  - Opção: "Enviar agora" ou "Agendar para data/hora específica"
  - Se audiência > quota diária: exibir estimativa de distribuição (ex: "100 hoje, 100 amanhã, 50 depois de amanhã")
  - **Resumo de confirmação:** "Enviar para X leads | Template: Y | Agendado para: Z"
  - Botão "Confirmar e Enviar" (exige clicar duas vezes se audiência > 50 leads)

- [x] **AC3:** Schema para blasts em `email_blasts` (nova tabela na migration 018 ou migration 019):
  ```sql
  email_blasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
    name TEXT NOT NULL
    template_id UUID NOT NULL REFERENCES email_templates(id)
    subject_override TEXT         -- NULL = usar subject do template
    segment_filter JSONB NOT NULL -- Critérios de segmentação usados
    total_recipients INT NOT NULL DEFAULT 0
    sent_count INT NOT NULL DEFAULT 0
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled'))
    scheduled_for TIMESTAMPTZ
    started_at TIMESTAMPTZ
    completed_at TIMESTAMPTZ
    created_by UUID REFERENCES auth.users(id)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
  ```

- [x] **AC4:** API Routes em `packages/web/src/app/api/admin/email-blasts/`:
  - `GET /api/admin/email-blasts` — lista blasts da org com métricas agregadas
  - `POST /api/admin/email-blasts` — cria blast e enfileira emails
  - `DELETE /api/admin/email-blasts/[id]` — cancela blast (apenas se não iniciado)
  - `GET /api/admin/email-blasts/[id]/stats` — métricas do blast específico (enviados, abertos, clicados)

- [x] **AC5:** Na criação do blast (`POST`), o backend:
  - Valida segmento e busca destinatários (leads com email válido, excluindo `is_valid_email = false`)
  - Para cada destinatário: chama `sendTemplateEmail()` com `priority: 10` e `scheduledFor` distribuído
  - Distribuição automática: se N > 100, distribui em grupos de até 95/dia com 1 dia de intervalo
  - Cria registro em `email_blasts` com `status = 'scheduled'` ou `'in_progress'`
  - Retorna imediatamente (não espera todos os emails serem enviados)

- [x] **AC6:** Métricas do blast calculadas via join com `email_logs` (filtro por `triggered_by LIKE 'blast:{id}%'`):
  - Total enviados, entregues, abertos, clicados, bounced

- [x] **AC7:** Cancelamento de blast:
  - Remove itens da `email_sends_queue` com `status='pending'` para o blast
  - Atualiza `email_blasts.status = 'cancelled'`
  - Emails já enviados não são afetados

- [x] **AC8:** Double-click protection no botão "Confirmar e Enviar" para audiências > 50:
  - Primeiro clique: muda botão para "Clique novamente para confirmar" (3 segundos)
  - Segundo clique dentro de 3s: confirma
  - Após 3s sem segundo clique: volta ao estado original

- [x] **AC9:** Acesso restrito a `role = 'admin'`

- [x] **AC10:** `npm run type-check` passa sem erros

## Scope

### IN
- Wizard de 3 passos para criação de blast
- Segmentação por status, origem, empreendimento
- Distribuição automática respeitando 100/dia
- Histórico de blasts com métricas
- Cancelamento de blasts pendentes
- Double-click protection

### OUT
- Editor de template dentro do wizard (usar template pré-criado em 18.3)
- Personalização HTML customizado no blast (usar templates)
- Agendamento recorrente (blast único)
- Unsubscribe automático (fora do MVP)
- A/B testing (fora do MVP)

## Dev Notes

### Distribuição automática em múltiplos dias

```typescript
function distributeOverDays(
  recipients: Lead[],
  quotaPerDay: number,
  startDate: Date
): Array<{ lead: Lead; scheduledFor: Date }> {
  return recipients.map((lead, index) => {
    const dayOffset = Math.floor(index / quotaPerDay)
    const scheduledFor = new Date(startDate)
    scheduledFor.setDate(scheduledFor.getDate() + dayOffset)
    // Distribuir horários dentro do dia para não disparar tudo às 00:00
    const minuteOffset = (index % quotaPerDay) * Math.floor(14 * 60 / quotaPerDay)
    scheduledFor.setHours(8, minuteOffset % 60, 0, 0) // Horário comercial BRT
    return { lead, scheduledFor }
  })
}
```

### Query de audiência — busca de leads

```typescript
async function fetchAudienceLeads(
  supabase: SupabaseClient,
  orgId: string,
  filter: SegmentFilter
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('id, name, email, phone, stage, source, property_id')
    .eq('org_id', orgId)
    .not('email', 'is', null)
    .neq('is_valid_email', false) // Excluir emails inválidos

  if (filter.stages?.length) {
    query = query.in('stage', filter.stages)
  }
  if (filter.sources?.length) {
    query = query.in('source', filter.sources)
  }
  if (filter.property_id) {
    query = query.eq('property_id', filter.property_id)
  }

  const { data } = await query
  return data ?? []
}
```

### `triggered_by` para rastreamento do blast

Formato: `blast:{blast_id}:{recipient_index}` para rastrear qual envio pertence a qual blast.

### Estrutura de arquivos

```
packages/web/src/
  app/
    dashboard/sistema/email-blasts/
      page.tsx                     -- Histórico de blasts
      novo/
        page.tsx                   -- Wizard 3 passos
        _components/
          step-audience.tsx        -- Passo 1
          step-content.tsx         -- Passo 2
          step-schedule.tsx        -- Passo 3
    api/admin/email-blasts/
      route.ts                     -- GET lista + POST cria
      [id]/
        route.ts                   -- DELETE cancela
        stats/route.ts             -- GET métricas do blast
```

### Tabela `email_blasts` — localização decidida

**Decisão @po (validação 2026-04-29):** Tabela `email_blasts` incluída em `018_email_central.sql` (Story 18.1). Esta story **não** precisa criar migration adicional — apenas verificar que 18.1 foi aplicada.

### Testing

- Testar wizard passo a passo com 3 leads mock
- Testar distribuição automática com audiência > 100
- Testar cancelamento — remove da fila sem afetar emails enviados
- Testar double-click protection (segundo click necessário para > 50 leads)
- Testar acesso 403 para não-admin
- `npm run type-check` deve passar

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Frontend + API
- Secondary Type(s): Integration (queue, engine de envio)
- Complexity: High (wizard multi-step, distribuição, segmentação, cancelamento)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @qa (quality gate)
- Supporting Agents: @architect (revisar distribuição e segmentação)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar double-click protection
- [ ] Pre-PR (@devops): Testar blast com 5 leads reais em staging

**CodeRabbit Focus Areas:**
- Primary: Blast safety — double-click protection e confirmação para > 50 leads
- Primary: Distribuição correta em múltiplos dias (não ultrapassa 100/dia)
- Secondary: Cancelamento remove apenas itens `pending` da fila (não `processing`)
- Secondary: Acesso admin 403 para não-admins

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [x] **Task 1 — Schema `email_blasts`** (AC: 3)
  - [x] ⚠️ Tabela `email_blasts` já incluída em `018_email_central.sql` (Story 18.1 — decisão @po)
  - [x] Verificar que migration 018 foi aplicada antes de iniciar esta story
  - [x] Índices em `018_email_central.sql` já incluídos

- [x] **Task 2 — API Routes** (AC: 4, 5, 6, 7)
  - [x] `GET /api/admin/email-blasts` com métricas agregadas
  - [x] `POST /api/admin/email-blasts` — cria blast, distribui e enfileira
  - [x] `DELETE /api/admin/email-blasts/[id]` — cancela
  - [x] `GET /api/admin/email-blasts/[id]/stats` — métricas do blast
  - [x] `GET /api/admin/email-blasts/count` — contagem de audiência em tempo real
  - [x] Proteção admin em todas as rotas

- [x] **Task 3 — Wizard componentes** (AC: 2)
  - [x] `step-audience.tsx` — seleção de segmento + contagem em tempo real
  - [x] `step-content.tsx` — seleção de template + nome da campanha
  - [x] `step-schedule.tsx` — agendamento + resumo + double-click protection

- [x] **Task 4 — Páginas** (AC: 1, 2)
  - [x] `email-blasts/page.tsx` — histórico com status e progresso
  - [x] `email-blasts/novo/page.tsx` — orquestra o wizard (BlastWizard)

- [x] **Task 5 — Distribuição automática** (AC: 5)
  - [x] Função `distributeOverDays(recipients, startDate, dailyQuota=95)`
  - [x] Enfileiramento com `sendTemplateEmail({ priority: 10, scheduledFor })`

- [x] **Task 6 — Qualidade e segurança** (AC: 8, 10)
  - [x] Double-click protection com timer de 3s para audiências > 50
  - [x] `npm run type-check` sem erros

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
| 2026-04-30 | 1.1 | Implementação completa — wizard 3 passos, 5 API routes, distribuição automática, cancelamento, double-click protection, type-check OK | Dex (@dev) |

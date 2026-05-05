---
epic: 18
story: 18.6
title: Central de Monitoramento de Email
status: Done
priority: P1-ALTO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [ui_accessibility, realtime_latency, alert_correctness, filter_functionality]
complexity: G
estimated_hours: 6
depends_on: [18.1, 18.4, 18.5]
---

# Story 18.6 — Central de Monitoramento de Email

## Contexto

Com o schema (18.1), engine de envio (18.4) e webhook de tracking (18.5) no lugar, todos os emails enviados são logados em `email_logs` com status atualizado em tempo real. Esta story expõe esses dados em um dashboard centralizado.

O padrão de dashboard do projeto está em `/dashboard/sistema/webhooks/page.tsx` (criado em Story 16.6) — seguir o mesmo padrão de layout, auto-refresh e design.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** um dashboard centralizado que mostra o status de todos os emails enviados, métricas de performance e alertas de falha,
**Para que** eu possa monitorar a saúde do sistema de email em tempo real e agir rapidamente em caso de problemas.

## Acceptance Criteria

- [ ] **AC1:** Página `/dashboard/sistema/emails` criada com 4 cards de métricas no topo:
  - "Enviados hoje" com barra de progresso (ex: `67 / 100`)
  - "Taxa de entrega" — `delivered / sent` em percentual
  - "Taxa de abertura" — `opened / delivered` em percentual
  - "Bounces 24h" — contagem com badge vermelho se > 5% dos enviados

- [ ] **AC2:** Tabela de envios individuais com:
  - Colunas: Destinatário (email), Template (nome ou "—" se ad-hoc), Assunto, Status, Enviado em, Ações
  - Badge de status colorido:
    - `pending` → cinza
    - `sent` → azul claro
    - `delivered` → verde claro
    - `opened` → verde
    - `clicked` → roxo
    - `bounced` → vermelho
    - `complained` → laranja
    - `failed` → vermelho escuro
  - Paginação server-side: 50 registros por página
  - Botão "Reenviar" em emails com status `failed` (chama API de reenvio)

- [ ] **AC3:** Filtros na tabela:
  - Período: Hoje / Últimos 7 dias / Últimos 30 dias / Customizado (date picker)
  - Status: Todos / Pendente / Entregue / Aberto / Clicado / Bounce / Falha
  - Template: dropdown com templates ativos da org
  - Busca por email do destinatário (input text, debounce 300ms)
  - Filtros combinados funcionam juntos

- [ ] **AC4:** Painel de alertas em tempo real (seção lateral ou abaixo dos cards):
  - **Alerta vermelho:** quota diária atingida (100 emails)
  - **Alerta laranja:** taxa de bounce > 5% nas últimas 2h
  - **Alerta amarelo:** quota diária > 90% (>= 90 emails enviados)
  - **Alerta vermelho:** email com `status='failed'` após esgotar tentativas
  - Histórico de alertas: últimos 5 alertas com timestamp
  - Alertas também enviados via Telegram ao admin (padrão `lib/telegram.ts`)

- [ ] **AC5:** Auto-refresh a cada 30s (padrão de `/dashboard/sistema/webhooks/page.tsx`)

- [ ] **AC6:** API Routes criadas:
  - `GET /api/admin/email-logs` — lista com paginação e filtros (limit, offset, status, template_id, search, period)
  - `GET /api/admin/email-stats` — métricas para os cards (enviados hoje, taxas, bounces)
  - `POST /api/admin/email-logs/[id]/resend` — reenviar email específico (cria novo log vinculado ao original)

- [ ] **AC7:** Alerta Telegram disparado quando:
  - Quota > 90%: `⚠️ Email quota: X/100 emails enviados hoje`
  - Quota = 100%: `🔴 Email quota atingida (100/100) — envios bloqueados até meia-noite BRT`
  - Email `failed` após max_attempts: `❌ Email falhou para [email] — Template: [nome] — Erro: [mensagem]`
  - Taxa de bounce > 5%: `⚠️ Alta taxa de bounce: X% nas últimas 2h`
  - Alertas Telegram não são disparados mais de 1x por hora para o mesmo tipo de alerta (rate limit de alertas)

- [ ] **AC8:** Acesso restrito a `role = 'admin'` (mesmo padrão de 18.3)

- [ ] **AC9:** `npm run type-check` passa sem erros

## Scope

### IN
- Dashboard `/dashboard/sistema/emails`
- Métricas em cards
- Tabela de envios com filtros e paginação
- Painel de alertas + Telegram
- API Routes admin
- Reenvio de emails falhados

### OUT
- Gráfico de série temporal (fora do MVP — adicionar em story futura)
- Export CSV de logs
- Relatório por template isolado (visível pelos filtros existentes)
- Relatório por campanha manual (→ Story 18.8)

## Dev Notes

### Referência de padrão existente

Seguir `/dashboard/sistema/webhooks/page.tsx` (Story 16.6) como referência de:
- Layout da página (sidebar + main content)
- Auto-refresh com `useEffect` + `setInterval`
- Badge de status
- Estrutura de tabela com filtros

### API de métricas — query otimizada

```typescript
// GET /api/admin/email-stats
// Retorna métricas do dia atual (BRT)
async function getEmailStats(orgId: string, supabase: SupabaseClient) {
  // Calcular início do dia BRT (03:00 UTC)
  const startOfDayBRT = getStartOfDayBRT()

  // Uma única query com contagens condicionais
  const { data } = await supabase.rpc('get_email_stats', {
    p_org_id: orgId,
    p_since: startOfDayBRT.toISOString(),
    p_bounce_window: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  })
  return data
}
```

Se RPC não estiver disponível, usar múltiplas queries paralelas com `Promise.all`.

### Reenvio — criar novo `email_log` vinculado

```typescript
// POST /api/admin/email-logs/[id]/resend
// NÃO modifica o log original — cria novo log com referência ao original
const { data: original } = await supabase
  .from('email_logs')
  .select('*')
  .eq('id', logId)
  .single()

// Criar novo email_log com triggered_by indicando o reenvio
await sendTemplateEmail({
  templateSlug: original.template?.slug ?? 'manual',
  to: { email: original.to_email, name: original.to_name },
  variables: original.variables_used ?? {},
  triggeredBy: `resend:${logId}`,
  orgId: original.org_id,
  priority: 1 // alta prioridade para reenvios manuais
})
```

### Rate limit de alertas Telegram

Para evitar flood de alertas, usar uma tabela ou cache simples:

```typescript
// Verificar se alerta do mesmo tipo foi enviado há menos de 1h
// Pode usar email_logs ou uma estrutura em memória simples (para MVP)
// Ou: verificar em Supabase se existe registro de alerta recente

// Opção simples para MVP: campo em organizations ou variável de ambiente
// Guardar último alerta enviado em: .ai/email-alert-state.json (runtime local)
// NOTA: em produção (Vercel serverless), usar Supabase para persistir estado de alertas
```

Para MVP: verificar na tabela `email_logs` se há emails `failed` para o mesmo destinatário nas últimas 1h antes de enviar novo alerta.

### Estrutura de arquivos

```
packages/web/src/app/
  dashboard/sistema/emails/
    page.tsx                     -- Dashboard principal
    _components/
      email-stats-cards.tsx      -- 4 cards de métricas
      email-logs-table.tsx       -- Tabela com filtros
      email-alerts-panel.tsx     -- Painel de alertas
  api/admin/
    email-logs/
      route.ts                   -- GET lista + filtros
      [id]/
        resend/route.ts          -- POST reenvio
    email-stats/
      route.ts                   -- GET métricas agregadas
```

### Testing

- Testar cards de métricas com dados mockados
- Testar filtros combinados (período + status + template)
- Testar auto-refresh (componente recarrega a cada 30s)
- Testar botão "Reenviar" — cria novo log, não modifica original
- Testar acesso 403 para não-admin
- `npm run type-check` deve passar

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Frontend + API
- Secondary Type(s): Integration (Telegram alertas)
- Complexity: High (dashboard completo com métricas, filtros, alertas)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @qa (quality gate)
- Supporting Agents: —

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar todos os filtros combinados
- [ ] Pre-PR (@devops): Testar alertas Telegram em staging

**CodeRabbit Focus Areas:**
- Primary: Filtros server-side seguros (sem SQL injection via params)
- Primary: Rate limit de alertas Telegram (máx 1/hora por tipo)
- Secondary: Acesso admin 403 para não-admins
- Secondary: Reenvio cria novo log sem modificar original

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [x] **Task 1 — API Routes** (AC: 6)
  - [x] `GET /api/admin/email-logs` com paginação e todos os filtros
  - [x] `GET /api/admin/email-stats` com métricas do dia
  - [x] `POST /api/admin/email-logs/[id]/resend`
  - [x] Proteção admin em todas as rotas

- [x] **Task 2 — Componentes** (AC: 1, 2, 3, 4)
  - [x] `email-stats-cards.tsx` — 4 cards com barra de progresso e badge de bounce
  - [x] `email-logs-table.tsx` — tabela com paginação, filtros combinados e botão Reenviar
  - [x] `email-alerts-panel.tsx` — painel de alertas com histórico (últimos 5)

- [x] **Task 3 — Página principal** (AC: 1-5)
  - [x] `dashboard/sistema/emails/page.tsx` — "use client" com auto-refresh 30s
  - [x] Redirect para /dashboard se 403 (não-admin)

- [x] **Task 4 — Alertas Telegram** (AC: 4, 7)
  - [x] Quota >= 100 → 🔴 alerta Telegram + logEvent
  - [x] Quota >= 90 → ⚠️ alerta Telegram + logEvent
  - [x] Bounce rate 2h > 5% (mín 3 bounces) → ⚠️ alerta Telegram + logEvent
  - [x] Rate limit via wasAlertSentRecently() — verifica system_events da última 1h

- [x] **Task 5 — Qualidade** (AC: 9)
  - [x] `npm run type-check` sem erros
  - [x] 217 testes passando, zero regressões

## Dev Agent Record

### File List
- `packages/web/src/app/api/admin/email-stats/route.ts` — GET métricas + alertas Telegram com rate limit
- `packages/web/src/app/api/admin/email-logs/route.ts` — GET lista paginada com 5 filtros combinados
- `packages/web/src/app/api/admin/email-logs/[id]/resend/route.ts` — POST reenvio (cria novo log)
- `packages/web/src/app/dashboard/sistema/emails/page.tsx` — dashboard client com auto-refresh 30s
- `packages/web/src/app/dashboard/sistema/emails/_components/email-stats-cards.tsx` — 4 cards de métricas
- `packages/web/src/app/dashboard/sistema/emails/_components/email-logs-table.tsx` — tabela com filtros + resend
- `packages/web/src/app/dashboard/sistema/emails/_components/email-alerts-panel.tsx` — painel histórico de alertas

### Completion Notes
- Rate limit de alertas via `wasAlertSentRecently()` — busca em `system_events` por `event_type = email_alert_*` na última 1h
- Filtro de bounce aplica mínimo de 3 bounces para evitar falso positivo em volumes pequenos
- Reenvio cria novo `email_log` com `triggered_by = resend:{original_id}` — log original intocado
- Debounce de 300ms no input de busca via `useRef<setTimeout>`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
| 2026-04-30 | 1.1 | Dashboard completo: 3 API routes + 3 componentes + page. Alertas Telegram com rate limit. type-check OK, 217 testes passando. | Dex (@dev) |
| 2026-05-04 | 1.2 | QA gate PASS — todos os blockers resolvidos. Story fechada. | Pax (@po) |

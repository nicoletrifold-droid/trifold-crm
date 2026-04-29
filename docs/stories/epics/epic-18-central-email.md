---
epic: 18
title: Central de Email — Templates, Envio e Monitoramento
status: Draft
created_at: 2026-04-29
updated_at: 2026-04-29
created_by: Morgan (@pm)
priority: High
stories_done: []
stories_next: [18.1, 18.2, 18.3]
---

# Epic 18 — Central de Email: Templates, Envio e Monitoramento

## Objetivo do Epic

Evoluir o sistema de email do Trifold CRM de um **disparo básico sem padrão visual nem rastreabilidade centralizada** para uma **central completa de configuração, templates padronizados, fila de envio com rate limiting e monitoramento em tempo real** — dando ao administrador controle total sobre todos os emails transacionais e de campanha da plataforma.

## Contexto do Sistema Existente

- **Stack:** Next.js 14 (App Router), Supabase (PostgreSQL + RLS), TypeScript, Vercel (cron + edge)
- **Provedor de email:** Resend (já configurado via `RESEND_API_KEY`)
- **Plano atual:** Resend Free — limite de **100 emails/dia**
- **Remetente fixo:** `Trifold <contato@trifold.com.br>` (configurado em `lib/email.ts`)
- **Função existente:** `sendEmail()` em `packages/web/src/lib/email.ts` — básica, sem queue, sem templates, sem log
- **Webhook existente:** `POST /api/webhook/resend` — rastreia eventos de campanha (`campaign_entries` / `campaign_events`)
- **Eventos já mapeados:** `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`
- **Story 15.13:** Fix de error handling em tracking de clicks — base estável

## Descrição da Evolução

### O que está sendo adicionado

1. **Schema de banco** — tabelas `email_templates`, `email_logs`, `email_sends_queue`
2. **Email Design System** — layout base padrão (header, footer, cores, tipografia) que todos os emails herdam
3. **Gerenciamento de Templates (Admin UI)** — CRUD com variáveis `{{nome}}`, `{{imovel}}`, preview renderizado
4. **Engine de Envio Evoluída** — fila com rate limiting (100/dia), retry, log de todos os envios
5. **Webhook Resend Expandido** — rastrear eventos de templates (não apenas `campaign_entries`)
6. **Central de Monitoramento** — dashboard com métricas globais, status individual, alertas de falha
7. **Automações de Email** — follow-up automático de leads com triggers configuráveis
8. **Campanhas Manuais (Blast)** — seleção de lista, preview, envio imediato ou agendado

### Como integra com o sistema existente

- `sendEmail()` em `lib/email.ts` será evoluída (não substituída) — retrocompatível
- Webhook `/api/webhook/resend` será expandido para suportar `email_log_id` além de `entry_id`
- `campaign_events` e `campaign_entries` continuam funcionando — sem breaking changes
- Rate limiting usa a mesma `org_id` de RLS existente
- Crons registrados em `vercel.json` (padrão existente)

### Critérios de sucesso (mensuráveis)

- [ ] Todos os emails enviados pelo sistema são logados em `email_logs` (100% de cobertura)
- [ ] Templates padronizados com layout visual consistente em 100% dos novos emails
- [ ] Rate limiting bloqueia envio quando quota diária (100) for atingida
- [ ] Dashboard mostra status individual de cada email enviado com <5s de latência
- [ ] Alertas de falha notificam admin via Telegram em <2min após detecção
- [ ] Admin consegue criar e publicar um template em <5 minutos
- [ ] Automação de follow-up dispara dentro de ±5min do trigger configurado

## Dependências e Pré-requisitos

| Dependência | Status | Observação |
|---|---|---|
| `RESEND_API_KEY` | Existe | Configurado em produção |
| `RESEND_WEBHOOK_SECRET` | Existe | Documentado em `resend-webhook-config.md` |
| `lib/email.ts` (sendEmail) | Existe | Será expandida — retrocompatível |
| Webhook `/api/webhook/resend` | Existe | Será expandido — sem breaking changes |
| Story 15.13 (fix tracking clicks) | Done | Base estável para expandir webhook |
| React Email package | **A instalar** | `@react-email/components` para layout base |

---

## Stories

### 18.1 — Schema: Infraestrutura de Email Central

- **Executor:** `@data-engineer` | **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[schema_validation, migration_review, rls_test, index_analysis]`
- **Complexidade:** M (3h)
- **Migration:** `018_email_central.sql`

**Descrição:** Criar migration com tabelas base da central de email:

```sql
-- Templates de email
email_templates (
  id uuid PK,
  org_id uuid FK,
  name text NOT NULL,           -- "Follow-up 24h", "Boas-vindas"
  slug text UNIQUE NOT NULL,    -- "followup-24h", "boas-vindas"
  subject text NOT NULL,        -- assunto com variáveis {{nome}}
  html_body text NOT NULL,      -- corpo HTML com variáveis
  variables jsonb NOT NULL,     -- [{"key": "nome", "label": "Nome", "required": true}]
  category text NOT NULL,       -- "transacional" | "campanha" | "automacao"
  is_active boolean DEFAULT true,
  created_by uuid FK auth.users,
  created_at timestamptz,
  updated_at timestamptz
)

-- Log imutável de todos os emails enviados
email_logs (
  id uuid PK,
  org_id uuid FK,
  template_id uuid FK email_templates NULL,  -- NULL se email ad-hoc
  resend_email_id text NULL,    -- ID retornado pelo Resend
  to_email text NOT NULL,
  to_name text NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending|sent|delivered|opened|clicked|bounced|failed
  error_message text NULL,
  variables_used jsonb NULL,    -- snapshot das variáveis no momento do envio
  tags jsonb NULL,              -- tags Resend para rastreamento
  triggered_by text NULL,       -- "automation:followup-24h" | "blast:campaign-123" | "manual"
  sent_at timestamptz NULL,
  delivered_at timestamptz NULL,
  opened_at timestamptz NULL,
  clicked_at timestamptz NULL,
  bounced_at timestamptz NULL,
  created_at timestamptz DEFAULT now()
)

-- Fila de envio com rate limiting
email_sends_queue (
  id uuid PK,
  org_id uuid FK,
  email_log_id uuid FK email_logs,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  priority int DEFAULT 5,       -- 1=alta, 5=normal, 10=baixa
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3,
  status text DEFAULT 'pending', -- pending|processing|done|failed|cancelled
  processed_at timestamptz NULL,
  created_at timestamptz DEFAULT now()
)
```

RLS por `org_id` em todas as tabelas. Índices em:
- `email_logs(org_id, created_at DESC)` — listagem com filtro de org
- `email_logs(resend_email_id)` — lookup por ID do Resend no webhook
- `email_logs(status, org_id)` — dashboard de status
- `email_sends_queue(status, scheduled_for)` — processamento da fila
- `email_templates(org_id, is_active)` — listagem de templates ativos

**ACs principais:**
- Migration `018_email_central.sql` aplicada sem erros
- RLS ativa em `email_templates`, `email_logs`, `email_sends_queue`
- Service role bypassa RLS para crons de processamento de fila
- Índices de performance criados
- `email_logs.resend_email_id` tem índice para lookup rápido no webhook

---

### 18.2 — Email Design System (Layout Base)

- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[html_email_compatibility, responsive_design, variable_resolution]`
- **Complexidade:** M (3h)

**Descrição:** Criar o layout visual padrão que todos os emails do sistema herdarão. **Todos os emails novos devem usar este layout** — apenas o conteúdo muda.

Implementar em `packages/web/src/lib/email-templates/`:

```
email-templates/
  base-layout.ts        -- função renderBaseLayout(content, vars)
  components/
    header.ts           -- logo Trifold + cor primária
    footer.ts           -- endereço, descadastro, social links
    button.ts           -- CTA button padronizado
    divider.ts          -- separador visual
  styles.ts             -- tokens: cores, fontes, espaçamentos
  types.ts              -- EmailVariables, EmailTemplate interfaces
```

**Estrutura do layout base:**

```html
<!-- Wrapper: max-width 600px, fundo branco, fonte Inter/system -->
[HEADER: logo + barra de cor primária]
[CONTENT: zona de conteúdo variável — renderizado pelo template]
[FOOTER: "© 2026 Trifold | Rua X, São Paulo | Descadastrar"]
```

**Tokens de design:**
- Cor primária: `#1a1a2e` (ou pegar de `org.brand_color` quando disponível)
- Cor de acento: `#4f46e5`
- Fonte: Inter, Arial, sans-serif (fallback seguro para email)
- Max-width: 600px
- Border-radius botões: 6px

**ACs principais:**
- `renderBaseLayout(content, vars)` retorna HTML completo e válido
- Layout renderiza corretamente em Gmail, Outlook, Apple Mail (teste manual com preview)
- Variáveis globais disponíveis em todos os templates: `{{org_name}}`, `{{support_email}}`, `{{unsubscribe_url}}`
- Footer com link de descadastro (URL parametrizada por `email_log_id`)
- HTML inline CSS para máxima compatibilidade com clientes de email

---

### 18.3 — Gerenciamento de Templates (Admin UI)

- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[ui_accessibility, rbac_validation, preview_rendering, variable_parsing]`
- **Complexidade:** G (6h)
- **Pré-requisito:** 18.1 + 18.2

**Descrição:** Interface admin em `/dashboard/sistema/email-templates` para criar e gerenciar templates:

**Listagem de templates:**
- Tabela com: Nome, Categoria, Status (Ativo/Rascunho), Criado em, Ações
- Filtro por categoria (`transacional` / `campanha` / `automação`)
- Badge de status colorido
- Botão "Novo Template"

**Criação/Edição de template:**
- Campo: Nome do template
- Campo: Slug (auto-gerado, editável)
- Campo: Categoria (select)
- Campo: Assunto (suporta variáveis `{{nome}}`)
- Área: Editor de corpo HTML com variáveis `{{...}}`
- Painel: Variáveis detectadas automaticamente ao digitar `{{`
- Para cada variável detectada: label, tipo (text/url/date), obrigatório (sim/não)
- Botão "Preview" — abre modal com preview renderizado usando dados fictícios
- Botão "Salvar Rascunho" / "Publicar"

**Preview do template:**
- Modal com iframe ou div renderizado
- Usa o layout base (18.2) com conteúdo do template
- Preenche variáveis com dados de exemplo configuráveis

**Permissões:** Apenas usuários com `role = 'admin'` podem acessar CRUD de templates.

**API Routes:**
- `GET /api/admin/email-templates` — lista templates da org
- `POST /api/admin/email-templates` — cria template
- `PUT /api/admin/email-templates/[id]` — edita template
- `DELETE /api/admin/email-templates/[id]` — arquiva (soft delete via `is_active = false`)
- `POST /api/admin/email-templates/[id]/preview` — renderiza preview com variáveis

**ACs principais:**
- Admin cria template com variáveis e publica em <5 minutos
- Preview reflete exatamente o email que será enviado
- Variáveis obrigatórias não preenchidas bloqueiam publicação
- Non-admin recebe 403 ao acessar qualquer rota `/api/admin/email-templates`
- Soft delete preserva histórico em `email_logs`

---

### 18.4 — Engine de Envio Evoluída + Rate Limiting

- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[rate_limit_correctness, queue_reliability, retry_logic, backwards_compatibility]`
- **Complexidade:** G (5h)
- **Pré-requisito:** 18.1

**Descrição:** Evoluir `lib/email.ts` para suportar templates, fila e rate limiting:

**Nova função principal:**
```typescript
sendTemplateEmail({
  templateSlug: string,
  to: { email: string, name?: string },
  variables: Record<string, string>,
  triggeredBy: string,           // "automation:followup-24h"
  scheduledFor?: Date,           // se omitido, envia imediatamente
  priority?: 1 | 5 | 10,
}): Promise<{ logId: string, queued: boolean }>
```

**Rate limiting (Resend Free: 100/dia):**
- Contar emails enviados hoje via `SELECT COUNT(*) FROM email_logs WHERE sent_at >= today AND status != 'failed'`
- Se count >= 95: bloquear novos envios não-urgentes (priority > 1)
- Se count >= 100: bloquear todos, logar em `email_sends_queue` com `status='pending'` para próximo dia
- Cron `POST /api/cron/email-queue` a cada hora para processar fila pendente

**Cron de processamento da fila:**
- Registrar em `vercel.json`: `{"path": "/api/cron/email-queue", "schedule": "0 * * * *"}`
- Processar até `100 - emails_hoje` emails da fila (FIFO por priority + scheduled_for)
- Marcar cada item como `processing` antes de enviar (evita double-send)
- Em caso de erro: incrementar `attempts`, status `failed` após `max_attempts`

**Retrocompatibilidade:**
- `sendEmail()` existente continua funcionando
- Internamente, `sendEmail()` passa a criar um registro em `email_logs` (não quebra callers existentes)
- Tags Resend incluem `email_log_id` para tracking via webhook

**ACs principais:**
- `sendTemplateEmail()` retorna `queued: true` quando rate limit ativo
- Rate limit bloqueia ao atingir 95 emails (alerta) e 100 (bloqueio total)
- Cron processa fila pendente a cada hora
- `sendEmail()` existente funciona sem modificações nos callers
- Retry automático em até 3 tentativas com backoff exponencial
- Todos os envios (sucesso e falha) registrados em `email_logs`

---

### 18.5 — Webhook Resend Expandido (Tracking de Templates)

- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[webhook_security, event_idempotency, backwards_compatibility]`
- **Complexidade:** P (2h)
- **Pré-requisito:** 18.1 + 18.4

**Descrição:** Expandir `/api/webhook/resend/route.ts` para rastrear eventos de emails de templates (além dos emails de campanha já existentes):

**Lógica de roteamento no webhook:**
```typescript
const tags = body.data?.tags
const entryId = tags?.entry_id      // campanha (comportamento atual — mantém)
const emailLogId = tags?.email_log_id  // template email (novo)

if (entryId) {
  // → lógica atual de campaign_entries/campaign_events (sem alteração)
} else if (emailLogId) {
  // → nova lógica: atualiza email_logs + insere em email_events (novo)
}
```

**Eventos mapeados para `email_logs`:**
- `email.delivered` → `status = 'delivered'`, `delivered_at = now()`
- `email.opened` → `status = 'opened'`, `opened_at = now()`
- `email.clicked` → `status = 'clicked'`, `clicked_at = now()`
- `email.bounced` → `status = 'bounced'`, `bounced_at = now()`
- `email.complained` → `status = 'complained'` (spam)

**Novos eventos a habilitar no painel Resend:**
- `email.complained` (spam report) — adicionar ao webhook do Resend

**ACs principais:**
- Emails com tag `entry_id` continuam com comportamento atual (zero regressão)
- Emails com tag `email_log_id` têm status atualizado em `email_logs`
- `email.complained` registrado e não reenvia para o mesmo email
- Webhook idempotente (processar mesmo evento 2x não corrompe dados)
- Svix signature validation ativa em produção

---

### 18.6 — Central de Monitoramento de Email

- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[ui_accessibility, realtime_latency, alert_correctness, filter_functionality]`
- **Complexidade:** G (6h)
- **Pré-requisito:** 18.1 + 18.4 + 18.5

**Descrição:** Dashboard centralizado em `/dashboard/sistema/emails` para monitorar todos os emails enviados pelo sistema:

**Métricas globais (cards de resumo):**
- Enviados hoje / quota restante (ex: `67 / 100`)
- Taxa de entrega (delivered / sent)
- Taxa de abertura (opened / delivered)
- Taxa de clique (clicked / opened)
- Bounces nas últimas 24h (com alerta se > 5%)

**Gráfico de série temporal:**
- Enviados / entregues / abertos por dia (últimos 30 dias)

**Tabela de envios individuais:**
- Colunas: Destinatário, Template, Assunto, Status, Enviado em, Ações
- Status badge colorido: `Pendente` (cinza), `Enviado` (azul), `Entregue` (verde), `Aberto` (verde escuro), `Clicado` (roxo), `Bounce` (vermelho), `Falha` (vermelho)
- Filtros: template, status, período (hoje/7d/30d/custom), busca por email
- Paginação server-side (50 por página)
- Botão "Reenviar" para emails com status `failed` ou `bounced`

**Central de notificações de alertas:**
- Painel lateral (ou seção) com alertas em tempo real:
  - Taxa de bounce > 5% nas últimas 2h → alerta laranja
  - Quota diária > 90% → alerta amarelo
  - Quota diária atingida (100%) → alerta vermelho
  - Email com status `failed` após 3 tentativas → alerta vermelho
- Alertas também enviados via Telegram ao admin (padrão existente em `lib/telegram.ts`)
- Histórico de alertas (últimas 24h)

**API Routes:**
- `GET /api/admin/email-logs` — lista com paginação, filtros, métricas agregadas
- `GET /api/admin/email-stats` — métricas para os cards de resumo
- `POST /api/admin/email-logs/[id]/resend` — reenviar email específico

**ACs principais:**
- Dashboard carrega métricas em <2s
- Alertas chegam via Telegram em <2min após detecção
- Filtros funcionam combinados (template + status + período)
- "Reenviar" cria novo `email_log` vinculado ao original (não duplica)
- Quota restante atualiza em tempo real (polling de 30s ou Supabase realtime)

---

### 18.7 — Automações de Email

- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[trigger_reliability, queue_integration, duplicate_prevention]`
- **Complexidade:** G (5h)
- **Pré-requisito:** 18.1 + 18.3 + 18.4

**Descrição:** Sistema de automação de email com triggers baseados em eventos do CRM:

**Triggers iniciais (MVP):**
1. `lead.created` — dispara template de "Boas-vindas" ao lead
2. `lead.status_changed` — ex: quando muda para "Qualificado", envia template de follow-up
3. `cron.daily` — follow-up automático de leads sem contato há N dias (configurável)

**Configuração de automações (Admin UI em `/dashboard/sistema/email-automacoes`):**
- Tabela de automações: Trigger, Template, Delay, Status (Ativa/Inativa)
- Criar automação: selecionar trigger, template, delay (imediato / 1h / 24h / 48h)
- Ativar/desativar automação

**Schema para automações (adicionado em 18.1 ou nova migration):**
```sql
email_automations (
  id uuid PK,
  org_id uuid FK,
  name text NOT NULL,
  trigger_event text NOT NULL,    -- "lead.created" | "lead.status_changed"
  trigger_filter jsonb NULL,      -- {"status": "Qualificado"}
  template_id uuid FK email_templates,
  delay_minutes int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz
)
```

**Execução:**
- Automações com `delay_minutes = 0`: via Supabase Edge Function triggered por DB trigger (ou Next.js API chamado após evento)
- Automações com delay: inserir em `email_sends_queue` com `scheduled_for = now() + delay`
- Deduplication: verificar se já foi enviado o mesmo `(automation_id, lead_id)` na última janela configurável

**Cron de follow-up automático:**
- `POST /api/cron/email-automations` — roda diariamente às 08h
- Registrar em `vercel.json`

**ACs principais:**
- Automação `lead.created` dispara dentro de ±5min do trigger
- Automações com delay usam a fila existente (18.4)
- Deduplication impede o mesmo lead receber o mesmo email 2x
- Admin ativa/desativa automação sem deploy
- Variáveis do template preenchidas automaticamente com dados do lead (`{{nome}}`, `{{telefone}}`)

---

### 18.8 — Campanhas Manuais (Email Blast)

- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[blast_safety, rate_limit_integration, preview_accuracy, audience_segmentation]`
- **Complexidade:** G (5h)
- **Pré-requisito:** 18.1 + 18.3 + 18.4 + 18.6

**Descrição:** Interface para disparar emails em massa para segmentos de leads:

**Fluxo de criação de blast (wizard 3 passos):**

**Passo 1 — Audiência:**
- Seleção de segmento: Todos os leads / Por status / Por origem / Por empreendimento
- Estimativa de destinatários antes de confirmar
- Alerta se contagem > quota restante (propõe agendamento para dias seguintes)

**Passo 2 — Conteúdo:**
- Seleção de template (dropdown com templates ativos)
- Preview do email com variáveis preenchidas com dados do primeiro lead da lista
- Campo para personalizar assunto (opcional — usa o do template por padrão)

**Passo 3 — Agendamento:**
- Envio imediato (se quota disponível)
- Agendamento para data/hora específica
- Estimativa de data de conclusão (considerando limite 100/dia)
- Confirmação com resumo: "Enviar para X leads — Template Y — Agendado para Z"

**Rate limiting inteligente:**
- Blast é enfileirado em `email_sends_queue` com prioridade 10 (baixa)
- Cron processa respeitando limite diário
- Se blast > 100 emails, distribui automaticamente pelos próximos dias

**Histórico de blasts:**
- Lista de campanhas manuais enviadas: template, audiência, enviados/total, taxa abertura
- Status: Rascunho / Agendado / Em andamento / Concluído / Cancelado
- Botão "Cancelar" para blasts agendados ainda não iniciados

**ACs principais:**
- Admin não consegue disparar blast que ultrapasse quota sem agendamento
- Preview mostra exatamente o email que o lead receberá (com suas variáveis)
- Blast de 500 leads distribuído automaticamente em 5 dias (100/dia)
- Histórico mostra métricas de abertura/clique por blast
- Cancelar blast pendente remove itens da fila sem enviar

---

## Sumário de Stories

| ID | Título | Executor | Qualidade Gate | Complexidade | Estimativa |
|---|---|---|---|---|---|
| **18.1** | Schema: Infraestrutura de Email Central | @data-engineer | @dev | M | 3h |
| **18.2** | Email Design System (Layout Base) | @dev | @architect | M | 3h |
| **18.3** | Gerenciamento de Templates (Admin UI) | @dev | @qa | G | 6h |
| **18.4** | Engine de Envio Evoluída + Rate Limiting | @dev | @architect | G | 5h |
| **18.5** | Webhook Resend Expandido (Tracking) | @dev | @qa | P | 2h |
| **18.6** | Central de Monitoramento de Email | @dev | @qa | G | 6h |
| **18.7** | Automações de Email | @dev | @architect | G | 5h |
| **18.8** | Campanhas Manuais (Email Blast) | @dev | @qa | G | 5h |

**Total estimado: ~35h** (~5 dias dev dedicado)

---

## Decisões Técnicas (fixadas)

| Decisão | Escolha | Justificativa |
|---|---|---|
| Layout de email | HTML inline CSS (via `renderBaseLayout`) | Máxima compatibilidade com clientes de email; sem dependência de React Email |
| Armazenamento de templates | Banco de dados (`email_templates`) | Admin pode editar sem deploy; versionável |
| Rate limiting | Contagem em DB + fila | Simples, sem Redis; adequado para 100/dia |
| Automações com delay | `email_sends_queue` com `scheduled_for` | Reutiliza infraestrutura da fila; cron hourly |
| Retrocompatibilidade | `sendEmail()` continua existindo | Não quebra callers atuais (follow-up, campaigns) |
| Descadastro | Link parametrizado por `email_log_id` | Rastreável; sem tabela separada no MVP |
| Blast distribuição | Auto-split por dias | Respeita 100/dia sem intervenção manual |

## Env Vars necessárias (novas)

```bash
# Já existentes — nenhuma env nova obrigatória para o epic
RESEND_API_KEY=           # já configurado
RESEND_WEBHOOK_SECRET=    # já documentado
TELEGRAM_BOT_TOKEN=       # já usado para alertas
TELEGRAM_ADMIN_CHAT_ID=   # já usado para alertas
```

## Compatibilidade

- [x] `sendEmail()` existente em `lib/email.ts` — retrocompatível (expande, não substitui)
- [x] Webhook `/api/webhook/resend` — expande com routing, sem breaking changes no path `entry_id`
- [x] `campaign_entries` / `campaign_events` — sem modificações
- [x] Novas tabelas isoladas (sem FK que quebre tabelas existentes)
- [x] Rollback: migration reversível com `DROP TABLE` em ordem reversa

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Quota 100/dia atingida em produção | Alta | Rate limiting em 18.4 bloqueia com 95; fila processa no dia seguinte |
| Layout quebrado em Outlook | Média | Inline CSS no `renderBaseLayout` (18.2); teste manual no preview |
| Template com variável não preenchida | Média | Validação obrigatória antes de envio em 18.3 e 18.4 |
| Blast acidental para toda a base | Alta | Confirmação explícita com resumo no passo 3 do wizard (18.8) |
| Webhook Resend sem signature | Baixa | Validation ativa em prod (já implementada) — apenas bypass em dev |
| Spam por automações duplicadas | Média | Deduplication em 18.7 por `(automation_id, lead_id)` |

## Definition of Done

- [ ] Todas as 8 stories com ACs cumpridos
- [ ] 100% dos emails enviados logados em `email_logs`
- [ ] Templates com layout visual padronizado funcionando
- [ ] Rate limiting bloqueando ao atingir 100 emails/dia
- [ ] Central de monitoramento exibindo status em tempo real
- [ ] Alertas chegando via Telegram em <2min
- [ ] Automação de follow-up disparando dentro de ±5min
- [ ] QA gate PASS em todas as stories
- [ ] @devops fez push após cada QA gate

---

## Handoff para @sm

> "Criar stories detalhadas para o **Epic 18 — Central de Email**.
>
> **Ordem de prioridade (dependências em cascata):**
> 1. Story **18.1** primeiro (schema — todas dependem)
> 2. Stories **18.2** e **18.4** em paralelo (layout e engine — independentes entre si)
> 3. Story **18.3** após 18.1 + 18.2 (UI de templates usa layout)
> 4. Story **18.5** após 18.1 + 18.4 (webhook usa email_logs)
> 5. Story **18.6** após 18.1 + 18.4 + 18.5 (dashboard usa logs)
> 6. Stories **18.7** e **18.8** após 18.3 + 18.4 (usam templates e engine)
>
> **Stack:** Next.js 14 App Router, Supabase, TypeScript, Vercel cron
> **Email provider:** Resend (já configurado em `lib/email.ts`)
> **Padrão de migration:** ver `supabase/migrations/015_meta_marketing_api.sql`
> **Padrão de cron:** ver `/api/cron/followup/route.ts` e `vercel.json`
> **RLS:** seguir padrão `org_id` existente em todas as tabelas
> **Webhook existente:** `/api/webhook/resend/route.ts` — expandir sem quebrar comportamento atual
> **Alertas:** usar `lib/telegram.ts` (padrão existente no projeto)"

— Morgan, planejando o futuro 📊

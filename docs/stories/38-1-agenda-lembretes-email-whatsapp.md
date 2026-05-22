# Story 38-1: Lembretes Automáticos de Agendamentos (E-mail ao Corretor + WhatsApp ao Lead)

## Status
Ready for Review

## Complexity
S (Small) — 2 novos arquivos de cron + 1 modificação de vercel.json

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** administrador do CRM,
**I want** que o sistema envie automaticamente lembretes de agendamentos — por e-mail ao corretor (1 dia antes, às 9h BRT) e por WhatsApp ao lead (3 horas antes do horário agendado),
**so that** nenhuma visita seja esquecida por falta de comunicação prévia, reduzindo no-shows e melhorando a experiência do lead e do corretor.

## Acceptance Criteria

1. Existe o endpoint `packages/web/src/app/api/cron/appointment-email-reminders/route.ts`:
   - Handler `GET` protegido por `Authorization: Bearer {CRON_SECRET}` (mesmo padrão de todos os outros crons do projeto)
   - Busca appointments com `status = 'scheduled'` onde `scheduled_at` cai em "amanhã" no fuso America/Sao_Paulo — janela UTC: `[tomorrow 03:00 UTC, day-after-tomorrow 02:59:59 UTC)` — e `metadata->>'email_reminded'` é `null` ou `false`
   - Para cada appointment encontrado: envia e-mail ao broker via `sendEmail` de `@web/lib/email`
     - `to`: `broker.email`
     - `subject`: `Lembrete: visita amanhã às {hora} — {nome do lead}`
     - `html`: corpo simples em português com data, hora (formatada em `pt-BR`, fuso `America/Sao_Paulo`), nome do lead e nome do imóvel
   - Após envio bem-sucedido: atualiza `metadata` do appointment fazendo merge com `{ email_reminded: true }`, preservando os demais campos do JSONB
   - Erros de envio individual não abortam o loop — capturados com `try/catch` por appointment, logados via `console.error`
   - Retorna JSON `{ sent, errors }` com contagens

2. Existe o endpoint `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts`:
   - Handler `GET` protegido por `Authorization: Bearer {CRON_SECRET}`
   - Busca appointments com `status = 'scheduled'` onde `scheduled_at` está na janela `[NOW() + 2h45m, NOW() + 3h15m]` (janela de 30 minutos centrada em 3h antes) e `metadata->>'whatsapp_reminded'` é `null` ou `false`
   - Para cada appointment encontrado:
     - Se `lead.phone` está ausente ou começa com `"tg:"`: pular silenciosamente (sem erro)
     - Buscar `whatsapp_config` da org (`phone_number_id`, `access_token`) com `.eq("status", "active").maybeSingle()`
     - Se org não tem `whatsapp_config`: pular silenciosamente
     - Enviar mensagem de texto simples via Meta WABA API: `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`
     - Mensagem: `Olá {nome}! Lembramos que você tem uma visita agendada hoje às {hora} no imóvel {nome do imóvel}. Em caso de dúvidas, entre em contato.`
     - Após envio bem-sucedido: atualiza `metadata` do appointment com `{ whatsapp_reminded: true }` (merge)
   - Erros de envio individual não abortam o loop — `try/catch` por appointment, logados via `console.error`
   - Retorna JSON `{ sent, skipped, errors }` com contagens

3. O arquivo `packages/web/vercel.json` recebe duas novas entradas no array `crons`:
   ```json
   { "path": "/api/cron/appointment-email-reminders", "schedule": "0 12 * * *" }
   { "path": "/api/cron/appointment-whatsapp-reminders", "schedule": "*/30 * * * *" }
   ```

4. A idempotência é garantida pelos flags `metadata.email_reminded` e `metadata.whatsapp_reminded`: se o cron executar duas vezes para o mesmo appointment, o segundo ciclo ignora appointments já marcados.

5. Ao executar `npm run type-check` e `npm run lint`, nenhum erro relacionado aos arquivos desta story.

## Scope

### IN
- `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` — novo arquivo
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` — novo arquivo
- `packages/web/vercel.json` — adicionar 2 entradas no array `crons`

### OUT
- Criação de migration de schema: o campo `metadata` já existe como JSONB na tabela `appointments`; nenhum campo novo é adicionado à coluna (apenas novos campos dentro do JSON)
- UI de configuração dos lembretes
- Lembrete via Telegram
- Lembrete por WhatsApp ao broker
- Lembrete por e-mail ao lead
- Personalização de conteúdo das mensagens via painel
- Re-tentativas automáticas em caso de falha de envio
- Notificação se appointment for cancelado após lembrete enviado

## Dependencies

- Tabela `appointments` (migration existente): colunas `id, org_id, scheduled_at, duration_minutes, location, status, notes, metadata (JSONB), lead_id, broker_id, property_id`
- Tabela `leads`: `id, name, phone, org_id`
- Tabela `users` (broker): `id, name, email`
- Tabela `properties`: `id, name`
- Tabela `whatsapp_config`: `org_id, phone_number_id, access_token, status`
- `sendEmail` de `@web/lib/email` — usa Resend SDK, já em uso em outros crons
- `createAdminClient` de `@web/lib/supabase/admin` — padrão para todos os crons
- `CRON_SECRET` já configurado no projeto (usado por todos os crons existentes)
- `RESEND_API_KEY` já configurado (necessário para `sendEmail`)
- Meta WABA API: credenciais em `whatsapp_config` por org (não requer env var global)

## Dev Notes

### Visão geral da arquitetura de crons existente

Todos os crons em `packages/web/src/app/api/cron/*/route.ts` seguem o mesmo padrão:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[NOME-CRON] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  // ... lógica do cron
  return NextResponse.json({ sent: 0, errors: 0 })
}
```

Referência: `packages/web/src/app/api/cron/followup/route.ts` e `packages/web/src/app/api/cron/calendly-sync/route.ts`.

---

### Cron 1 — E-mail ao Corretor (`appointment-email-reminders`)

**Schedule:** `0 12 * * *` (12:00 UTC = 09:00 BRT — Brasil não observa horário de verão desde 2019; offset fixo de -3h)

**Lógica de janela temporal (timezone SP):**

"Amanhã no fuso de São Paulo" corresponde à janela UTC `[03:00 do dia D+1, 03:00 do dia D+2)`, onde D é o dia atual em UTC:

```typescript
const now = new Date() // UTC

// Início de "amanhã" no fuso SP = meia-noite SP = 03:00 UTC do dia seguinte
const tomorrowStartUTC = new Date(now)
tomorrowStartUTC.setUTCHours(3, 0, 0, 0)
// Se já passamos das 03:00 UTC hoje (cron roda às 12:00 UTC, sempre verdade),
// "amanhã" começa em D+1 03:00 UTC
tomorrowStartUTC.setUTCDate(tomorrowStartUTC.getUTCDate() + 1)

// Fim de "amanhã" no fuso SP = 23:59:59 SP = 02:59:59 UTC do dia D+2
const tomorrowEndUTC = new Date(tomorrowStartUTC)
tomorrowEndUTC.setUTCDate(tomorrowEndUTC.getUTCDate() + 1)
// tomorrowEndUTC agora aponta para D+2 03:00 UTC (exclusive)
```

**Query Supabase:**

```typescript
const { data: appointments } = await supabase
  .from("appointments")
  .select(`
    id,
    scheduled_at,
    location,
    metadata,
    org_id,
    lead:leads!lead_id(id, name),
    broker:users!broker_id(id, name, email),
    property:properties!property_id(id, name)
  `)
  .eq("status", "scheduled")
  .gte("scheduled_at", tomorrowStartUTC.toISOString())
  .lt("scheduled_at", tomorrowEndUTC.toISOString())
  .or("metadata->>'email_reminded'.is.null,metadata->>'email_reminded'.eq.false")
```

**Formatação de data/hora em BRT:**

```typescript
const scheduledDate = new Date(appointment.scheduled_at)

const hora = scheduledDate.toLocaleTimeString("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
})

const data = scheduledDate.toLocaleDateString("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "numeric",
  month: "long",
})
```

**Envio de e-mail:**

```typescript
import { sendEmail } from "@web/lib/email"

const result = await sendEmail({
  to: broker.email,
  subject: `Lembrete: visita amanhã às ${hora} — ${lead.name}`,
  html: `
    <p>Olá, ${broker.name}!</p>
    <p>Você tem uma visita agendada para amanhã, <strong>${data}</strong>, às <strong>${hora}</strong> com <strong>${lead.name}</strong> no imóvel <strong>${property.name}</strong>.</p>
    <p><strong>Local:</strong> ${appointment.location ?? "Não informado"}</p>
    <p>Boas vendas!</p>
  `,
  orgId: appointment.org_id,
})
```

**Atualizar `metadata.email_reminded` (merge JSONB):**

Não substituir o objeto inteiro — fazer merge para preservar outros campos existentes (ex.: `whatsapp_reminded`, `reminded`, `calendly_*`):

```typescript
const currentMetadata = (appointment.metadata as Record<string, unknown>) ?? {}
await supabase
  .from("appointments")
  .update({ metadata: { ...currentMetadata, email_reminded: true } })
  .eq("id", appointment.id)
```

**Tratamento de erros por appointment:**

```typescript
let sent = 0
let errors = 0

for (const appointment of appointments ?? []) {
  try {
    const lead = Array.isArray(appointment.lead) ? appointment.lead[0] : appointment.lead
    const broker = Array.isArray(appointment.broker) ? appointment.broker[0] : appointment.broker
    const property = Array.isArray(appointment.property) ? appointment.property[0] : appointment.property

    if (!broker?.email) {
      // Sem e-mail do broker — pular silenciosamente
      continue
    }

    // ... envio + atualização de metadata
    sent++
  } catch (err) {
    console.error(`[EMAIL-REMINDERS] Erro no appointment ${appointment.id}:`, err)
    errors++
  }
}

return NextResponse.json({ sent, errors })
```

---

### Cron 2 — WhatsApp ao Lead (`appointment-whatsapp-reminders`)

**Schedule:** `*/30 * * * *` (a cada 30 minutos)

**Lógica da janela temporal (3h antes, tolerância de ±15min):**

```typescript
const now = new Date()
const windowStart = new Date(now.getTime() + (2 * 60 + 45) * 60 * 1000) // now + 2h45m
const windowEnd   = new Date(now.getTime() + (3 * 60 + 15) * 60 * 1000) // now + 3h15m
```

**Query Supabase:**

```typescript
const { data: appointments } = await supabase
  .from("appointments")
  .select(`
    id,
    scheduled_at,
    metadata,
    org_id,
    lead:leads!lead_id(id, name, phone),
    property:properties!property_id(id, name)
  `)
  .eq("status", "scheduled")
  .gte("scheduled_at", windowStart.toISOString())
  .lte("scheduled_at", windowEnd.toISOString())
  .or("metadata->>'whatsapp_reminded'.is.null,metadata->>'whatsapp_reminded'.eq.false")
```

**Filtros de pular silenciosamente:**

```typescript
// 1. Lead sem telefone ou telefone Telegram
if (!lead.phone || lead.phone.startsWith("tg:")) {
  skipped++
  continue
}

// 2. Org sem whatsapp_config ativa
const { data: waConfig } = await supabase
  .from("whatsapp_config")
  .select("phone_number_id, access_token")
  .eq("org_id", appointment.org_id)
  .eq("status", "active")
  .maybeSingle()

if (!waConfig) {
  skipped++
  continue
}
```

**Formatação da hora em BRT:**

```typescript
const hora = new Date(appointment.scheduled_at).toLocaleTimeString("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
})
```

**Construção da mensagem e envio via Meta WABA API (texto livre):**

```typescript
const message = `Olá ${lead.name}! Lembramos que você tem uma visita agendada hoje às ${hora} no imóvel ${property.name}. Em caso de dúvidas, entre em contato.`

const url = `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${waConfig.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: lead.phone, // número já no formato internacional (ex: 5511999999999)
    type: "text",
    text: { body: message },
  }),
  signal: AbortSignal.timeout(15000),
})

if (!res.ok) {
  const errText = await res.text()
  throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
}
```

**Atualizar `metadata.whatsapp_reminded` (merge JSONB):**

```typescript
const currentMetadata = (appointment.metadata as Record<string, unknown>) ?? {}
await supabase
  .from("appointments")
  .update({ metadata: { ...currentMetadata, whatsapp_reminded: true } })
  .eq("id", appointment.id)
```

**Retorno:**

```typescript
return NextResponse.json({ sent, skipped, errors })
```

---

### vercel.json — Novas entradas

Adicionar ao array `crons` existente (após as entradas atuais):

```json
{
  "path": "/api/cron/appointment-email-reminders",
  "schedule": "0 12 * * *"
},
{
  "path": "/api/cron/appointment-whatsapp-reminders",
  "schedule": "*/30 * * * *"
}
```

---

### Nota sobre o campo `metadata` existente

A tabela `appointments` já tem o campo `metadata JSONB`. Alguns registros podem ter `{ "reminded": true }` (flag legado, não utilizado por esta story). Os novos flags são `email_reminded` e `whatsapp_reminded` — independentes do `reminded` legado. O merge via spread operator preserva todos os campos existentes.

---

### Nota sobre relacionamentos no select do Supabase

O padrão de join para tabelas com múltiplos foreign keys requer o nome explícito da constraint, por exemplo `lead:leads!lead_id(...)`. Verificar os nomes das FK constraints reais no schema se o Supabase retornar erro de ambiguidade. Referência: `packages/web/src/app/api/cron/followup/route.ts` que usa `lead:leads!lead_id(...)` e `property:properties!property_id(...)`.

O Supabase retorna joined rows como arrays quando há ambiguidade ou quando a cardinalidade é incerta. O padrão de desambiguação já estabelecido no projeto é:

```typescript
const lead = Array.isArray(appointment.lead) ? appointment.lead[0] : appointment.lead
```

---

### Env vars necessárias

Nenhuma env var nova. Tudo reutiliza configurações já existentes:

| Variável | Uso |
|----------|-----|
| `CRON_SECRET` | Autenticação de ambos os crons (já configurado) |
| `RESEND_API_KEY` | Usado internamente por `sendEmail` (já configurado) |
| — | WhatsApp: credenciais em `whatsapp_config` table por org (sem env var global) |

## Tasks

- [x] 1. Criar `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` (AC: 1, 4)
  - [x] 1.1 Implementar validação de `CRON_SECRET` (padrão dos outros crons)
  - [x] 1.2 Calcular janela UTC para "amanhã no fuso SP" (D+1 03:00 UTC até D+2 03:00 UTC)
  - [x] 1.3 Query `appointments` com `status='scheduled'`, dentro da janela, `email_reminded` ausente ou false
  - [x] 1.4 Iterar com `try/catch` por appointment: desambiguar joins, checar `broker.email`, formatar hora/data em BRT, chamar `sendEmail`, fazer merge de `metadata`
  - [x] 1.5 Retornar `{ sent, errors }`

- [x] 2. Criar `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (AC: 2, 4)
  - [x] 2.1 Implementar validação de `CRON_SECRET`
  - [x] 2.2 Calcular janela `[now + 2h45m, now + 3h15m]`
  - [x] 2.3 Query `appointments` com `status='scheduled'`, dentro da janela, `whatsapp_reminded` ausente ou false
  - [x] 2.4 Iterar com `try/catch` por appointment: checar `lead.phone` (pular se ausente ou `tg:`), buscar `whatsapp_config` com `.maybeSingle()` (pular se ausente), formatar hora em BRT, construir mensagem, enviar via `fetch` na Meta WABA API com `AbortSignal.timeout(15000)`, fazer merge de `metadata`
  - [x] 2.5 Retornar `{ sent, skipped, errors }`

- [x] 3. Atualizar `packages/web/vercel.json` — adicionar as 2 novas entradas ao array `crons` (AC: 3)

- [x] 4. Executar `npm run type-check` e `npm run lint` e corrigir todos os erros (AC: 5)

## Testing

### Abordagem
Testes manuais via chamada direta ao endpoint + verificação de types/lint. Nenhum teste automatizado novo (padrão dos outros crons do projeto).

### Cenários de teste

**Cron de e-mail:**

1. **Auth inválida**: chamar sem `Authorization: Bearer {CRON_SECRET}` → deve retornar 401
2. **Sem appointments amanhã**: nenhum appointment com `status='scheduled'` para amanhã → retorna `{ sent: 0, errors: 0 }`
3. **Appointment com broker sem e-mail**: deve pular silenciosamente (sem contar como erro)
4. **Appointment elegível**: criar appointment para amanhã (UTC), chamar endpoint → verificar que e-mail é enviado ao broker e `metadata.email_reminded` passa a `true` no Supabase
5. **Idempotência**: chamar duas vezes para o mesmo appointment → segundo ciclo retorna `{ sent: 0, errors: 0 }` (já marcado)

**Cron de WhatsApp:**

1. **Auth inválida**: chamar sem header correto → deve retornar 401
2. **Lead com telefone `tg:`**: deve ser pulado (`skipped++`)
3. **Org sem `whatsapp_config`**: deve ser pulado (`skipped++`)
4. **Appointment elegível**: criar appointment para daqui a 3h, chamar endpoint manualmente → verificar que mensagem WhatsApp é enviada e `metadata.whatsapp_reminded` passa a `true`
5. **Idempotência**: chamar duas vezes → segundo ciclo não re-envia

### Verificação de tipos/lint
```bash
cd packages/web && npm run type-check
cd packages/web && npm run lint
```

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Integration (cron jobs + APIs externas: Resend + Meta WABA)
**Secondary Type(s)**: Deployment (vercel.json)
**Complexity**: Low — 2 arquivos novos independentes + 1 modificação de config

### Specialized Agent Assignment

**Primary Agent**: @dev (implementação TypeScript + chamadas a APIs externas)

**Supporting Agent**: @devops (revisão do vercel.json antes do PR)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): `npm run type-check` + `npm run lint`
- [ ] Pre-PR (@devops): revisar validação de CRON_SECRET, graceful degradation e schedule correto no vercel.json

### CodeRabbit Focus Areas

- Validação do `CRON_SECRET` — padrão consistente com os demais crons (`followup`, `calendly-sync`)
- Merge do JSONB `metadata` — confirmar que o spread operator preserva campos existentes
- Filtro `tg:` e `maybeSingle()` para WhatsApp — garantir que ausência de config não lança exceção
- `AbortSignal.timeout` nas chamadas à Meta WABA API — evitar hangs no cron
- Janela UTC do cron de e-mail — confirmar que a aritmética de datas cobre o dia completo em SP
- Desambiguação de joins Supabase — `Array.isArray()` pattern para joined rows

### Self-Healing Configuration

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL only

**Predicted Behavior**:
- CRITICAL issues: auto_fix (up to 2 iterations)
- HIGH issues: document_only (noted in Dev Notes)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-22 | 1.0.0 | Story criada — lembretes automáticos de agendamento via e-mail (broker) e WhatsApp (lead) | @sm River |
| 2026-05-22 | 1.1.0 | Validada (9.5/10 — GO). Status Draft → Ready. ACs testáveis, escopo claro, dependências mapeadas, padrão de cron verificado contra followup/route.ts. Dev Notes com exemplos de código completos facilitam implementação direta. | @po Pax |
| 2026-05-22 | 1.2.0 | Implementação completa — 4 tasks concluídas. 2 crons criados + vercel.json atualizado. type-check e lint sem novos erros. Status → Ready for Review | @dev Dex |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
Nenhum

### Completion Notes List
- Cron email: janela UTC D+1 03:00 → D+2 03:00 cobre exatamente "amanhã em SP" (UTC-3, offset fixo)
- Cron WhatsApp: janela ±15min centrada em 3h antes; `AbortSignal.timeout(15000)` evita hangs na Meta WABA API
- Ambos os crons: merge JSONB via spread operator preserva campos existentes (`reminded`, `calendly_*`, etc.)
- Desambiguação de joins: padrão `Array.isArray()` aplicado em lead, broker e property
- `sendEmail` retorna `{ id, error? }` — erros tratados via throw para contagem no `errors++`
- Erros pré-existentes (`shared/commercial-rules.ts` Cannot find 'zod', `lead-detail-drawer.tsx` ref durante render) confirmados como não relacionados a esta story

### File List

| File | Action |
|------|--------|
| `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` | CREATE |
| `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` | CREATE |
| `packages/web/vercel.json` | MODIFY |

## QA Results
_To be filled by @qa_

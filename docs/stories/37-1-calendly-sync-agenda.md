# Story 37-1: Integração Calendly → Agenda (Sync Automático Periódico)

## Status
Ready for Review

## Complexity
M (Medium) — nova migration + lib helper Calendly API + endpoint cron + vercel.json

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** administrador do CRM,
**I want** que agendamentos criados no Calendly sejam automaticamente importados para a agenda do CRM a cada 30 minutos,
**so that** não precise registrar manualmente os agendamentos feitos pelo Calendly, mantendo a agenda centralizada no CRM.

## Acceptance Criteria

1. Existe uma migration `052_appointments_calendly_uri.sql` que adiciona a coluna `calendly_event_uri text UNIQUE` na tabela `appointments`. A coluna é nullable (eventos criados manualmente continuam sem valor).

2. Existe o helper `packages/web/src/lib/calendly.ts` que encapsula chamadas à Calendly API v2:
   - `fetchScheduledEvents(pat, userUri, minStartTime, maxStartTime)` → retorna lista de eventos
   - `fetchEventInvitees(pat, eventUuid)` → retorna lista de convidados com `name` e `email`
   - Usa `fetch` nativo com header `Authorization: Bearer {PAT}`
   - Respeita paginação (campo `pagination.next_page_token`) para buscar todos os eventos da janela

3. Existe o endpoint `packages/web/src/app/api/cron/calendly-sync/route.ts`:
   - Handler `GET` protegido por `Authorization: Bearer {CRON_SECRET}` (mesmo padrão do `/api/cron/followup`)
   - Se `CALENDLY_PAT` ou `CALENDLY_USER_URI` não estiverem configurados, retorna `{ skipped: true, reason: "not_configured" }` com status 200 (graceful degradation — não bloqueia se cliente não usa Calendly)
   - Busca eventos na janela: últimos 7 dias até próximos 30 dias (`min_start_time` / `max_start_time`)
   - Para cada evento retornado pelo Calendly:
     a. Busca convidados via `fetchEventInvitees`
     b. Tenta fazer match do primeiro convidado pelo email na tabela `leads` (campo `email`, mesmo `org_id`)
     c. Se nenhum lead encontrado: ignora o evento (sem insert)
     d. Se lead encontrado: executa upsert em `appointments` usando `calendly_event_uri` como chave de deduplicação (conflict target)
   - Mapeamento de campos no upsert:
     - `org_id` ← `appUser.org_id` (do contexto auth, usando `createAdminClient`)
     - `lead_id` ← id do lead encontrado pelo email
     - `scheduled_at` ← `start_time` do evento Calendly
     - `duration_minutes` ← diferença em minutos entre `end_time` e `start_time`
     - `location` ← nome do evento Calendly (`name`) ou `"Calendly"` se vazio
     - `status` ← `"scheduled"` se evento ativo / `"cancelled"` se evento cancelado no Calendly
     - `created_by` ← `"admin"`
     - `notes` ← `"Agendado via Calendly — ${inviteeEmail}"`
     - `calendly_event_uri` ← URI completo do evento (ex: `https://api.calendly.com/scheduled_events/{uuid}`)
     - `broker_id` ← `null`
     - `property_id` ← `null`
   - Retorna JSON com `{ synced, skipped, cancelled, errors }` contando os resultados
   - Log com `console.log` dos resultados para visibilidade nos logs do Vercel

4. O arquivo `packages/web/vercel.json` recebe uma nova entrada no array `crons`:
   ```json
   { "path": "/api/cron/calendly-sync", "schedule": "*/30 * * * *" }
   ```

5. O endpoint é acessível sem autenticação de usuário (é um cron job chamado pela infraestrutura Vercel), porém valida o `CRON_SECRET` no header `Authorization`.

6. Ao executar `npm run type-check` e `npm run lint`, nenhum erro relacionado aos arquivos desta story.

## Scope

### IN
- Migration `052_appointments_calendly_uri.sql`: adicionar coluna `calendly_event_uri text UNIQUE` na tabela `appointments`
- `packages/web/src/lib/calendly.ts`: helper da API Calendly v2 (fetch events + fetch invitees, com paginação)
- `packages/web/src/app/api/cron/calendly-sync/route.ts`: endpoint cron com lógica de sync
- `packages/web/vercel.json`: adicionar cron `*/30 * * * *` para `/api/cron/calendly-sync`

### OUT
- UI de configuração do Calendly (configuração via env vars)
- Atribuição automática de `broker_id`
- Criação automática de lead se não encontrado
- Notificações ao broker sobre novo agendamento importado
- Sync reverso (CRM → Calendly)
- Suporte a múltiplos usuários Calendly por org

## Dependencies

- Tabela `appointments` (migration 006) — confirmado: colunas `id, org_id, lead_id, broker_id, property_id, scheduled_at, duration_minutes, location, status, notes, created_by, created_at, updated_at`
- `CRON_SECRET` já configurado no projeto (usado por `/api/cron/followup`)
- Env vars novas a configurar no Vercel: `CALENDLY_PAT`, `CALENDLY_USER_URI`

## Dev Notes

### Schema — coluna nova

```sql
-- 052_appointments_calendly_uri.sql
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS calendly_event_uri text UNIQUE;
```

Simples — nullable, UNIQUE para deduplicação via upsert.

### Calendly API v2 — endpoints utilizados

```
# Listar eventos agendados
GET https://api.calendly.com/scheduled_events
  ?user={CALENDLY_USER_URI}
  &min_start_time={ISO8601}
  &max_start_time={ISO8601}
  &count=100
  &page_token={token}   ← para paginação
Headers: Authorization: Bearer {CALENDLY_PAT}

# Resposta:
{
  "collection": [
    {
      "uri": "https://api.calendly.com/scheduled_events/{uuid}",
      "name": "Nome do tipo de evento",
      "start_time": "2026-05-20T14:00:00.000000Z",
      "end_time": "2026-05-20T14:30:00.000000Z",
      "status": "active" | "canceled",
      ...
    }
  ],
  "pagination": { "count": 100, "next_page_token": "..." | null }
}

# Listar convidados de um evento
GET https://api.calendly.com/scheduled_events/{uuid}/invitees
Headers: Authorization: Bearer {CALENDLY_PAT}

# Resposta:
{
  "collection": [
    {
      "name": "João Silva",
      "email": "joao@email.com",
      ...
    }
  ]
}
```

### Helper `calendly.ts` — estrutura esperada

```typescript
// packages/web/src/lib/calendly.ts

export interface CalendlyEvent {
  uri: string
  name: string
  start_time: string
  end_time: string
  status: "active" | "canceled"
}

export interface CalendlyInvitee {
  name: string
  email: string
}

export async function fetchScheduledEvents(
  pat: string,
  userUri: string,
  minStartTime: string,
  maxStartTime: string
): Promise<CalendlyEvent[]> { ... }

export async function fetchEventInvitees(
  pat: string,
  eventUri: string
): Promise<CalendlyInvitee[]> { ... }

// Extrai UUID do URI completo:
// "https://api.calendly.com/scheduled_events/abc123" → "abc123"
function extractUuid(uri: string): string {
  return uri.split("/").pop() ?? uri
}
```

### Endpoint `calendly-sync/route.ts` — estrutura esperada

```typescript
export async function GET(request: NextRequest) {
  // 1. Validar CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Graceful degradation se env vars não configuradas
  const pat = process.env.CALENDLY_PAT
  const userUri = process.env.CALENDLY_USER_URI
  if (!pat || !userUri) {
    return NextResponse.json({ skipped: true, reason: "not_configured" })
  }

  // 3. Definir janela de sync
  const now = new Date()
  const minStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const maxStart = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // 4. Buscar eventos + processar cada um
  const supabase = createAdminClient()
  // ...
}
```

### Upsert com deduplicação

```typescript
await supabase
  .from("appointments")
  .upsert(
    {
      org_id,
      lead_id,
      scheduled_at,
      duration_minutes,
      location,
      status,
      created_by: "admin",
      notes,
      calendly_event_uri: event.uri,
    },
    { onConflict: "calendly_event_uri" }
  )
```

### Env vars necessárias no Vercel

| Variável | Como obter |
|----------|-----------|
| `CALENDLY_PAT` | Calendly → Integrações → API & Webhooks → Personal Access Tokens → Gerar token |
| `CALENDLY_USER_URI` | `GET https://api.calendly.com/users/me` com o PAT → campo `resource.uri` |

### Padrão de cron existente (referência)

O arquivo `/api/cron/followup/route.ts` usa exatamente o mesmo padrão de autenticação via `CRON_SECRET`. O novo endpoint deve seguir o mesmo padrão.

### Notas de implementação

- **Sem `created_by` enum para "calendly"**: usar `"admin"` que já existe no enum `appointment_creator`
- **Paginação**: o Calendly retorna no máximo 100 eventos por página; iterar via `pagination.next_page_token` até ser `null`
- **Timeout**: usar `AbortSignal.timeout(30000)` nos fetches para evitar hangs
- **Erro por evento**: se um evento falhar (ex: API do Calendly retornar erro nos invitees), incrementar `errors` e continuar para o próximo — não abortar o sync inteiro

## Tasks

- [x] 1. Criar `supabase/migrations/052_appointments_calendly_uri.sql` com `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendly_event_uri text UNIQUE` (AC: 1)
- [x] 2. Criar `packages/web/src/lib/calendly.ts` com `fetchScheduledEvents` e `fetchEventInvitees`, suporte a paginação, `AbortSignal.timeout(30000)` (AC: 2)
- [x] 3. Criar `packages/web/src/app/api/cron/calendly-sync/route.ts` com handler GET: validação CRON_SECRET, graceful degradation, janela 7d passado / 30d futuro, loop de eventos com match por email, upsert com `onConflict: "calendly_event_uri"` (AC: 3, 5)
- [x] 4. Adicionar entrada `{ "path": "/api/cron/calendly-sync", "schedule": "*/30 * * * *" }` ao array `crons` em `packages/web/vercel.json` (AC: 4)
- [x] 5. Executar `npm run type-check` e `npm run lint` e corrigir todos os erros (AC: 6)

## Testing

### Abordagem
Testes manuais + verificação de types/lint. Não há testes automatizados novos.

### Cenários de teste

1. **Sem env vars**: chamar o endpoint sem `CALENDLY_PAT`/`CALENDLY_USER_URI` configurados → deve retornar `{ skipped: true, reason: "not_configured" }` com 200.
2. **Auth inválida**: chamar sem `Authorization: Bearer {CRON_SECRET}` → deve retornar 401.
3. **Com env vars válidas**: configurar PAT real no `.env.local` e chamar manualmente o endpoint → verificar que appointments são criados/atualizados no Supabase.
4. **Deduplicação**: chamar o endpoint duas vezes → o segundo sync não deve criar duplicatas (deve fazer update).
5. **Lead não encontrado**: evento Calendly com email que não existe em `leads` → deve ser ignorado (sem insert).
6. **Evento cancelado**: evento com `status: "canceled"` no Calendly → appointment deve ter `status = "cancelled"`.
7. **Vercel Cron**: após deploy, verificar nos logs do Vercel que o cron `/api/cron/calendly-sync` aparece e executa a cada 30 min.

### Verificação de tipos/lint
```bash
npm run type-check
npm run lint
```

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Integration (External API)
**Secondary Type(s)**: Database (migration), Infra (cron job)
**Complexity**: Medium

### Specialized Agent Assignment

**Primary Agent**: @dev (implementação TS + migration)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): `npm run type-check` + `npm run lint`
- [ ] Pre-PR (@devops): revisar graceful degradation e validação CRON_SECRET

### CodeRabbit Focus Areas

- Graceful degradation quando env vars ausentes (não deve bloquear outros crons)
- Validação do CRON_SECRET — padrão consistente com `/api/cron/followup`
- Paginação da Calendly API — garantir que todos os eventos são buscados
- Upsert conflict target correto (`calendly_event_uri`)
- Timeout nos fetches externos (`AbortSignal.timeout`)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-20 | @sm River | Story criada — integração Calendly via polling periódico |

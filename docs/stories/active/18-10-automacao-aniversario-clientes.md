---
epic: 18
story: 18.10
title: Automação de Aniversário para Clientes
status: Ready for Review
priority: P2-MÉDIO
created_at: 2026-05-18
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [trigger_reliability, deduplication_annual, birthday_query_correctness, ui_integration]
complexity: M
estimated_hours: 4
depends_on: [18.7, 33.1]
---

# Story 18.10 — Automação de Aniversário para Clientes

## Contexto

Com o módulo CRM de clientes (Epic 33) provendo a tabela `clientes` com campo `data_nascimento`, e a infraestrutura de automações de email (Story 18.7) já operacional, esta story adiciona um novo trigger de automação: `client.birthday`.

O sistema dispara automaticamente um email de feliz aniversário para cada cliente cadastrado cuja data de nascimento (dia e mês) coincida com o dia de execução do cron. O template é selecionável e editável pelo admin via a UI de templates já existente (18.3). A deduplicação garante que o mesmo cliente não receba o mesmo email de aniversário mais de uma vez por ano.

**Diferença em relação às automações de lead (18.7):**
- Origem dos dados: tabela `clientes` (CRM), não `leads`
- Campo de data: `clientes.data_nascimento` (birthday match por dia+mês)
- Janela de deduplicação: 365 dias (anual), não 24h
- Trigger de execução: sempre via `cron.daily-birthday` (sem delay configurável — email vai no dia)

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** configurar uma automação de email que dispare automaticamente no aniversário de cada cliente cadastrado,
**Para que** os clientes recebam uma mensagem personalizada de felicitações sem intervenção manual, fortalecendo o relacionamento.

## Acceptance Criteria

- [ ] **AC1:** Migration `044_email_automations_birthday_trigger.sql` criada e aplicável:
  - Altera o CHECK constraint de `email_automations.trigger_event` para incluir `'client.birthday'`
  - Antes: `CHECK (trigger_event IN ('lead.created','lead.status_changed','cron.daily'))`
  - Depois: `CHECK (trigger_event IN ('lead.created','lead.status_changed','cron.daily','client.birthday'))`
  - Migration usa `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` (sem dados a perder)

- [ ] **AC2:** Cron `GET /api/cron/email-automations` estendido para processar `client.birthday`:
  - Busca automações ativas com `trigger_event = 'client.birthday'`
  - Para cada automação, busca clientes da org com `data_nascimento` não nulo
  - Filtra clientes cujo `EXTRACT(month FROM data_nascimento) = EXTRACT(month FROM CURRENT_DATE)` **E** `EXTRACT(day FROM data_nascimento) = EXTRACT(day FROM CURRENT_DATE)`
  - Envia via `sendTemplateEmail()` com variáveis: `{{nome}}`, `{{email}}`, `{{data_nascimento}}`
  - `triggeredBy`: `automation:${automation.id}:birthday`

- [ ] **AC3:** Deduplicação anual — mesmo cliente não recebe o mesmo email de aniversário 2x no mesmo ano:
  - Verificar em `email_logs` se já existe registro com `triggered_by LIKE 'automation:{automation_id}:birthday%'` e `to_email = cliente.email` nos últimos 365 dias
  - Se já enviado: pular sem criar novo log

- [ ] **AC4:** UI `automation-form.tsx` atualizada:
  - `TRIGGER_OPTIONS` inclui `{ value: "client.birthday", label: "Aniversário de cliente" }`
  - Quando `triggerEvent === "client.birthday"`, o campo "Delay" é **ocultado** (não faz sentido delay no aniversário — email vai sempre no dia do cron)
  - Quando `triggerEvent === "client.birthday"`, exibir texto informativo:
    `"Email disparado automaticamente no dia do aniversário de cada cliente com data de nascimento cadastrada."`

- [ ] **AC5:** Clientes sem `email` cadastrado ou sem `data_nascimento` são silenciosamente ignorados (sem erro, sem log)

- [ ] **AC6:** Resposta do cron inclui contagem de aniversariantes do dia encontrados:
  - Campo `birthday_fired` no JSON de resposta (além dos `fired` e `skipped` já existentes)

- [ ] **AC7:** `npm run type-check` passa sem erros após as alterações

## Scope

### IN
- Migration 044 alterando CHECK constraint de `trigger_event`
- Extensão do cron `email-automations/route.ts` para handler `client.birthday`
- Atualização de `automation-form.tsx` (novo trigger + ocultação de delay)
- Deduplicação com janela de 365 dias para trigger birthday

### OUT
- Template de email de aniversário pré-criado — admin cria o template via UI de templates (18.3)
- Notificação via Telegram de aniversariantes do dia — fora do escopo desta story
- Birthday para `leads` (não têm `data_nascimento`) — fora do escopo
- Campo `send_time` configurável por automação — fora do escopo (cron roda às 08h BRT)
- Integração com WhatsApp de aniversário — fora do escopo

## Dev Notes

### Migration 044 — Alterar CHECK constraint

```sql
-- migration: 044_email_automations_birthday_trigger.sql
-- Adiciona 'client.birthday' ao CHECK constraint de trigger_event

ALTER TABLE email_automations
  DROP CONSTRAINT IF EXISTS email_automations_trigger_event_check;

ALTER TABLE email_automations
  ADD CONSTRAINT email_automations_trigger_event_check
  CHECK (trigger_event IN ('lead.created','lead.status_changed','cron.daily','client.birthday'));
```

> Verificar o nome exato do constraint com:
> `SELECT conname FROM pg_constraint WHERE conrelid = 'email_automations'::regclass AND contype = 'c';`
> antes de aplicar (pode ser diferente do padrão se foi criado manualmente).

### Extensão do cron — handler birthday

No arquivo `packages/web/src/app/api/cron/email-automations/route.ts`, após o loop de `cron.daily`, adicionar:

```typescript
// Birthday automations — client.birthday trigger
const { data: birthdayAutomations } = await supabase
  .from("email_automations")
  .select("id, org_id, email_templates(slug)")
  .eq("trigger_event", "client.birthday")
  .eq("is_active", true)

let birthdayFired = 0

for (const automation of birthdayAutomations ?? []) {
  const templateSlug = (automation.email_templates as unknown as { slug: string } | null)?.slug
  if (!templateSlug) continue

  // Clientes aniversariantes hoje (match dia + mês, ignorar ano)
  const { data: aniversariantes } = await supabase
    .from("clientes")
    .select("id, nome, email, data_nascimento")
    .eq("org_id", automation.org_id)
    .not("email", "is", null)
    .not("data_nascimento", "is", null)
    .filter(
      "data_nascimento",
      "not.is",
      null
    )

  // Filtrar por dia+mês no código (Supabase não suporta EXTRACT direto em filtros de cliente)
  const today = new Date()
  const todayMonth = today.getMonth() + 1  // getMonth é 0-indexed
  const todayDay = today.getDate()

  for (const cliente of aniversariantes ?? []) {
    if (!cliente.email || !cliente.data_nascimento) continue

    const bday = new Date(cliente.data_nascimento)
    if (bday.getUTCMonth() + 1 !== todayMonth || bday.getUTCDate() !== todayDay) continue

    // Deduplication anual (365 dias)
    const alreadySent = await checkBirthdaySend(supabase, automation.id, cliente.email)
    if (alreadySent) { skipped++; continue }

    await sendTemplateEmail({
      templateSlug,
      to: { email: cliente.email, name: cliente.nome ?? undefined },
      variables: {
        nome: cliente.nome ?? "",
        email: cliente.email,
        data_nascimento: cliente.data_nascimento,
      },
      triggeredBy: `automation:${automation.id}:birthday`,
      orgId: automation.org_id as string,
      priority: 5,
    })
    birthdayFired++
  }
}
```

Adicionar função `checkBirthdaySend` (janela de 365 dias):

```typescript
async function checkBirthdaySend(
  supabase: SupabaseClient,
  automationId: string,
  toEmail: string
): Promise<boolean> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .like("triggered_by", `automation:${automationId}:birthday%`)
    .eq("to_email", toEmail)
    .gte("created_at", since)
  return (count ?? 0) > 0
}
```

Atualizar o return do handler para incluir `birthday_fired`:

```typescript
return NextResponse.json({ fired, skipped, birthdayFired, automations: automations?.length ?? 0 })
```

### Atualização do form — `automation-form.tsx`

```typescript
// Adicionar na constante TRIGGER_OPTIONS:
{ value: "client.birthday", label: "Aniversário de cliente" }

// Ocultar delay quando trigger = client.birthday:
{triggerEvent !== "client.birthday" && (
  <div>
    <label ...>Delay</label>
    <select ...>...</select>
  </div>
)}

// Exibir aviso informativo quando client.birthday selecionado:
{triggerEvent === "client.birthday" && (
  <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
    <p className="text-sm text-indigo-700">
      Email disparado automaticamente no dia do aniversário de cada cliente com data de nascimento cadastrada.
      O envio ocorre diariamente às 08h (horário de Brasília).
    </p>
  </div>
)}
```

### Estrutura de arquivos modificados

```
supabase/migrations/
  044_email_automations_birthday_trigger.sql   -- novo (ALTER CHECK constraint)

packages/web/src/
  app/api/cron/email-automations/route.ts      -- modificado (handler birthday)
  app/dashboard/sistema/email-automacoes/
    _components/automation-form.tsx            -- modificado (novo trigger + ocultar delay)
```

### Consideração sobre fuso horário

O cron roda às `11h UTC` (`0 11 * * *` = 08h BRT). A filtragem de `data_nascimento` usa `getUTCMonth()` e `getUTCDate()` para consistência com o horário UTC do servidor Vercel. Clientes nascidos em datas próximas da virada (31/dez, 1/jan) são tratados corretamente.

### Testing

- Criar cliente com `data_nascimento = hoje (dia e mês)` e `email` preenchido
- Criar automação `client.birthday` ativa com um template válido
- Chamar `GET /api/cron/email-automations` com header `Authorization: Bearer ${CRON_SECRET}`
- Verificar `birthday_fired = 1` na resposta
- Verificar registro em `email_logs` com `triggered_by = 'automation:{id}:birthday'`
- Chamar o cron novamente — verificar `birthday_fired = 0` (deduplicação anual funcionando)
- Testar cliente sem `data_nascimento` — não deve aparecer no disparo
- `npm run type-check` deve passar

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Feature Extension (backend + minimal UI)
- Secondary Type: Database (migration)
- Complexity: Medium

**Specialized Agent Assignment:**
- Primary: @dev
- Quality Gate: @qa

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar deduplicação — mesmo cliente não recebe 2x no mesmo ano
- [ ] Pre-Commit (@dev): Testar que clientes sem email ou sem data_nascimento não geram erro

**CodeRabbit Focus Areas:**
- Migration segura: DROP CONSTRAINT antes de ADD (não afeta dados existentes)
- Filtro dia+mês correto em UTC (evitar off-by-one em virada de dia)
- `birthdayFired` incluído no response do cron
- Automação `client.birthday` com `delay_minutes > 0` ignorada graciosamente (campo oculto na UI)

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [x] **Task 1 — Migration 044** (AC: 1)
  - [x] Verificar nome exato do constraint existente no schema
  - [x] Criar `supabase/migrations/044_email_automations_birthday_trigger.sql`
  - [x] DROP + ADD CONSTRAINT com os 4 valores válidos

- [x] **Task 2 — Extensão do cron** (AC: 2, 3, 5, 6)
  - [x] Adicionar handler `client.birthday` em `api/cron/email-automations/route.ts`
  - [x] Função `checkBirthdaySend` com janela de 365 dias
  - [x] Filtro dia+mês com UTC correto (getUTCMonth/getUTCDate consistentes)
  - [x] Retornar `birthday_fired` no response

- [x] **Task 3 — UI automation form** (AC: 4)
  - [x] Adicionar `client.birthday` em `TRIGGER_OPTIONS`
  - [x] Ocultar campo delay quando `client.birthday` selecionado
  - [x] Exibir painel informativo quando trigger birthday ativo

- [x] **Task 4 — Type check** (AC: 7)
  - [x] `npm run type-check` passa sem erros novos (erro pré-existente em commercial-rules.ts não relacionado)

## File List

- `supabase/migrations/044_email_automations_birthday_trigger.sql` — criado (ALTER CHECK constraint trigger_event)
- `packages/web/src/app/api/cron/email-automations/route.ts` — modificado (handler client.birthday + checkBirthdaySend)
- `packages/web/src/app/dashboard/sistema/email-automacoes/_components/automation-form.tsx` — modificado (TRIGGER_OPTIONS + condicional delay + painel birthday)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-18 | 1.0 | Story criada | River (@sm) |
| 2026-05-18 | 1.1 | Validada @po (GO 9/10). Status Draft → Ready. CORREÇÕES OBRIGATÓRIAS na implementação: (1) Consistência UTC no filtro de aniversário — usar `today.getUTCMonth() + 1` e `today.getUTCDate()` (não `getMonth()`/`getDate()` que são inconsistentes com `bday.getUTCMonth()`/`bday.getUTCDate()`); (2) Remover filtro redundante `.filter("data_nascimento", "not.is", null)` que duplica o `.not("data_nascimento", "is", null)` acima. | Pax (@po) |
| 2026-05-18 | 1.2 | Implementação YOLO @dev. 4 tasks concluídas. 3 arquivos modificados/criados. Commit 68d790b. Ambas as correções obrigatórias do @po aplicadas. Erro TS pré-existente em commercial-rules.ts confirmado não-relacionado. Status Ready → Ready for Review. | Dex (@dev) |

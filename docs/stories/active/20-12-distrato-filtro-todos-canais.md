# Story 20.12: Aplicar filtro de distrato em todos os canais automáticos

## Status
Ready for Review

## Dependencies
- **Story 20.10** (`docs/stories/active/20-10-distrato-ponte-leads-sienge-helper.md`) — PREREQUISITE DONE: `isContatoDistratado()` exportado de `@web/lib/distrato/is-contato-distratado.ts`; coluna `leads.distrato` existe (migration 161 aplicada). Semântica: `isContatoDistratado` retorna `true` somente quando TODOS os vínculos do contato em `clientes_obras_vinculos` têm `distrato = true` (active-contract-wins no nível do contato — ver AC 5a de 20-10).
- **BRANCH:** implementar a partir de um branch novo criado de `origin/main` atualizado — NÃO do branch `feat/epic-76`, que está desatualizado e não contém as migrations 116–128 (incluindo as dependências 116+118 da 20-10). Usar `feat/epic-76` reintroduziria o bug da 20-9.
- **Story 20.11** (`docs/stories/active/20-11-distrato-cron-sync-sienge-propagacao.md`) — SHOULD be done: `leads.distrato` populado pelo cron diário antes do deploy desta story. Os filtros `leads.distrato = false` nos crons de lote (ACs 1-4) dependem de dados populados.
- **Nenhuma migration nova** — puramente TypeScript em 8 arquivos existentes.

## Scope
**IN:**
- **Canal 1 — `followup`:** `packages/web/src/app/api/cron/followup/route.ts` — adicionar `.eq('distrato', false)` na query de leads (~L202) para excluir leads distratados do follow-up da Nicole.
- **Canal 2 — `appointment-whatsapp-reminders`:** `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` — incluir `distrato` no join de `leads` e pular envio se `lead.distrato = true`.
- **Canal 3 — `appointment-email-reminders`:** `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` — mesmo padrão do Canal 2.
- **Canal 4 — `email-automations` (cron.daily):** query de `leads` (~L65) — adicionar `.eq('distrato', false)`.
- **Canal 5 — `email-automations` (client.birthday):** query de `clientes` (~L119) — adicionar filtro por `NOT EXISTS (clientes_obras_vinculos WHERE cliente_id = clientes.id AND distrato = true)`, ou 2-passos: buscar `cliente_ids` distratados → excluir da query de clientes.
- **Canal 6 — `campaigns/[id]/send-whatsapp`:** antes de enviar para cada `campaign_entry`, chamar `isContatoDistratado({ phone: entry.phone })` — se `true`, pular entry (log + skip, sem marcar como `failed`).
- **Canal 7 — `campaigns/[id]/send-emails`:** antes de enviar para cada `campaign_entry`, chamar `isContatoDistratado({ email: entry.email })` — se `true`, pular entry.
- **Canal 8 — webhook da Nicole (`whatsapp/route.ts`):** dentro do bloco `after()` que ativa o pipeline da Nicole (~L477), adicionar gate: `if (lead.distrato) { log + return }` — Nicole não responde a distratados. Incluir `distrato` no select de `findOrUpsertLead` (~L904) para que o campo esteja disponível.
- **Roleta (`lib/roleta/distributor.ts`):** após fetch do lead (~L74), verificar `lead.distrato === true` → retornar `{ status: 'sem_corretor_disponivel' }` (reutilizar status existente, não criar novo).

**OUT:**
- Modificar o canal de notificações de obras do portal (`notificacoes.ts`) — já filtrado pela Story 20-9 (AC 7 completo).
- Criar UI para visualizar leads bloqueados por distrato — escopo futuro.
- Notificar o corretor/admin quando um distratado tenta contato — sinalização para humano é escopo futuro; nesta story basta silenciar Nicole (log é suficiente).
- Modificar o canal de convites Sienge (`sync.ts`) — já bloqueado pela Story 20-9 (AC 4 completo).
- Modificar as campanhas com `campaign_entries` que NÃO têm phone/email — não há como identificar distrato nesses casos; skip com log de warning.

## Complexity
**Estimativa:** M-L — 8 arquivos a modificar, maioria com mudanças pequenas e sistemáticas. O canal mais complexo é o webhook da Nicole (Canal 8): requer modificar `findOrUpsertLead` local para incluir `distrato` + adicionar gate no `after()`. Canais 1-4 são triviais (1 linha cada). Canais 6-7 requerem import do helper + call síncrono extra por entry.

## Risks
| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| `leads.distrato` desatualizado para leads distratados recentes (entre runs do cron 20-11) | Médio | Médio | Canal 8 (webhook Nicole) usa `isContatoDistratado()` real-time, não `leads.distrato` — o canal mais crítico está protegido mesmo sem cron recente |
| `isContatoDistratado()` lança exceção e bloqueia envio legítimo (fail-closed indevido) | Baixo | Alto | Função deve ter try/catch → return `false` em caso de erro (fail-open); documentar na função (já está no AC 7 da Story 20-10) |
| `.eq('distrato', false)` em `leads` retorna 0 linhas antes do cron 20-11 popular a coluna | Médio | Baixo | `leads.distrato DEFAULT false` → todos os leads começam com `false`; cron não populado = zero leads filtrados = comportamento idêntico ao atual (sem regressão) |
| Campanha com entry sem phone/email ficando silenciosa sem aviso | Baixo | Baixo | Log de warning por entry sem phone/email; não bloqueia o restante dos envios |
| Modificar `findOrUpsertLead` em `whatsapp/route.ts` causando regressão no webhook | Baixo | Alto | Mudança é additive (adicionar `distrato` no select); lead novo terá `distrato = false` (default); sem regressão |

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["typecheck", "lint", "build", "manual-smoke"]
nota: "Smoke test obrigatório no Canal 8 (webhook Nicole) com lead distratado real antes de declarar Done"

---

## Story

**As a** sistema CRM Trifold,
**I want** que TODOS os canais automáticos de comunicação (follow-up Nicole, reminders de agendamento, email automations, campanhas, roleta e o próprio webhook da Nicole) verifiquem o status de distrato antes de enviar qualquer mensagem,
**so that** clientes que fizeram distrato (todos os contratos "Cancelado" no Sienge) sejam removidos completamente de TODA comunicação automática — eliminando os gaps que a Story 20-9 deixou por cobrir apenas o canal de notificações de obra.

---

## Acceptance Criteria

### Canal 1 — Follow-up Nicole (`cron/followup`)

**AC 1 — Follow-up não enviado para leads com `distrato = true`**
Dado que existem leads com `distrato = true` na tabela `leads` (populados pelo cron da Story 20-11),
quando `GET /api/cron/followup` é executado,
então esses leads são excluídos do processamento de follow-up — a query de leads inclui `.eq('distrato', false)` ou equivalente que filtra distratados.
Leads com `distrato = false` (padrão) continuam recebendo follow-up normalmente.

### Canal 2 — Reminder WhatsApp de agendamento (`cron/appointment-whatsapp-reminders`)

**AC 2 — Reminder WhatsApp não enviado para lead distratado**
Dado que um agendamento tem um lead com `distrato = true`,
quando `GET /api/cron/appointment-whatsapp-reminders` é executado,
então o reminder WhatsApp NÃO é enviado para esse lead — o campo `distrato` é incluído no join de `leads` e verificado antes do envio.
O agendamento é contabilizado em `skipped` (não em `errors`).

### Canal 3 — Reminder de email de agendamento (`cron/appointment-email-reminders`)

**AC 3 — Reminder email não enviado para lead distratado**
Dado que um agendamento tem um lead com `distrato = true`,
quando `GET /api/cron/appointment-email-reminders` é executado,
então o reminder de email NÃO é enviado para esse lead.
O agendamento é contabilizado em `errors` existente ou em um novo contador `skipped` (a critério do @dev).

### Canal 4 — Email automation cron.daily (`cron/email-automations`)

**AC 4 — Automação `cron.daily` não dispara para leads distratados**
Dado que existem leads com `distrato = true` elegíveis para uma automação `cron.daily`,
quando `GET /api/cron/email-automations` é executado,
então esses leads são excluídos da query principal de leads — a query em ~L65 inclui `.eq('distrato', false)`.
Leads com `distrato = false` continuam recebendo automações normalmente.

### Canal 5 — Email automation birthday (`cron/email-automations`)

**AC 5 — Automação `client.birthday` não dispara para clientes totalmente distratados**
Dado que existe um `cliente` na tabela `clientes` com aniversário hoje E com TODOS os seus vínculos em `clientes_obras_vinculos` com `distrato = true` (sem nenhuma obra ativa restante),
quando `GET /api/cron/email-automations` é executado (seção birthday ~L101),
então o email de aniversário NÃO é enviado para esse cliente.
Clientes sem nenhum distrato em `clientes_obras_vinculos`, OU com ao menos um vínculo `distrato = false` (obra ativa), continuam recebendo o email de aniversário normalmente (active-contract-wins — decisão de stakeholder 2026-06-30).

> **Nota de implementação:** a query de `clientes` (~L119) não tem `leads.distrato` — usar 2-passos: (1) buscar `cliente_ids` com `distrato = true` em `clientes_obras_vinculos` para a org; (2) filtrar `clientes` excluindo esses `ids`. Reutilizar o padrão já estabelecido em `notificacoes.ts` L107-L140.

### Canal 6 — Campanha send-whatsapp (`campaigns/[id]/send-whatsapp`)

**AC 6 — WhatsApp de campanha não enviado para entry de distratado**
Dado que uma `campaign_entry` tem um `phone` que coincide com o de um `cliente` com `distrato = true`,
quando `POST /api/campaigns/[id]/send-whatsapp` é executado,
então o envio de WhatsApp para essa entry é pulado com log de warning — `isContatoDistratado({ phone: entry.phone })` é chamado antes do `sendWhatsAppTemplate`.
A entry NÃO é marcada como `whatsapp_status = 'failed'` — é simplesmente pulada (o campo permanece `pending`).
O contador `skipped` aumenta (não `sent` nem `failed`).

### Canal 7 — Campanha send-emails (`campaigns/[id]/send-emails`)

**AC 7 — Email de campanha não enviado para entry de distratado**
Dado que uma `campaign_entry` tem um `email` que coincide com o de um `cliente` com `distrato = true`,
quando `POST /api/campaigns/[id]/send-emails` é executado,
então o envio de email para essa entry é pulado — `isContatoDistratado({ email: entry.email })` é chamado antes de `sendEmail`.
A entry NÃO é marcada como `email_status = 'failed'` — fica em `pending`.
O contador `skipped` aumenta (não `sent` nem `failed`).

### Canal 8 — Nicole webhook (`api/webhook/whatsapp`) [CRÍTICO]

**AC 8 — Nicole não responde a lead distratado**
Dado que um lead com `distrato = true` envia uma mensagem via WhatsApp,
quando o webhook `POST /api/webhook/whatsapp` recebe a mensagem,
então:
1. A mensagem é salva no banco de dados (fluxo sync normal — lead, conversation, message INSERT continuam).
2. HTTP 200 é retornado para a Meta imediatamente (sem delay).
3. DENTRO do bloco `after()` que ativa o pipeline da Nicole, a função detecta `lead.distrato === true` e encerra o bloco SEM ativar o pipeline.
4. Um log de warning é emitido: `[WEBHOOK] lead distratado — Nicole não ativada { leadId }`.
5. O lead NÃO recebe resposta automática da Nicole.

**AC 9 — Campo `distrato` disponível na variável `lead` dentro do `after()`**
Dado que `findOrUpsertLead` (~L884 em `route.ts`) retorna o objeto `lead`,
quando a função é modificada para incluir `distrato` no select,
então `lead.distrato` está acessível no bloco `after()` sem query adicional.
O tipo `LeadResult` (~L880) é atualizado para incluir `distrato: boolean`.
`findOrUpsertLead` contém múltiplos pontos de `.select("id, created_at")` — verificados em `origin/main` em ~L901, ~L938, ~L959, ~L983 (lead existente + 3 paths de insert/recover). O @dev deve atualizar TODOS os 4 selects para `.select("id, created_at, distrato")` OU declarar `distrato: false` como default no tipo `LeadResult` para garantir fail-open seguro (campo ausente → undefined → falsy → Nicole responde). Ambas as abordagens são aceitáveis; a abordagem de atualizar todos os 4 selects é preferível para consistência de tipos.

**AC 10 — Lead novo (recém-inserido) não é bloqueado erroneamente**
Dado que um novo lead (nunca visto antes) envia uma mensagem via WhatsApp,
quando `findOrUpsertLead` insere o lead com `distrato = false` (valor padrão da coluna),
então o gate de distrato retorna `false` e Nicole responde normalmente para o novo lead.

### Canal 9 — Roleta (`lib/roleta/distributor.ts`)

**AC 11 — Lead distratado não é distribuído pela roleta**
Dado que a roleta tenta distribuir um lead com `distrato = true`,
quando `distributeLeadToNextBroker(leadId, orgId)` é chamado,
então a função retorna `{ status: 'sem_corretor_disponivel' }` sem distribuir o lead a nenhum corretor.
O campo `distrato` deve ser incluído no select do lead (~L74: `'.select("property_interest_id, name, phone, assigned_broker_id")'`).

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Validação de qualidade via processo manual: typecheck + lint + build + smoke test nos 8 canais.

**Story Type Analysis:**
- **Primary Type:** Integration (8 canais de comunicação) + Bug Fix (canais sem proteção de distrato)
- **Secondary Type(s):** Architecture (aplicação sistemática de guard pattern)
- **Complexity:** M-L — 8 arquivos, mudanças pequenas e sistemáticas; maior risco no Canal 8 (webhook)

**Specialized Agent Assignment:**
- Primary Agents:
  - @dev (implementação de todos os 8 canais)
- Supporting Agents:
  - @qa (smoke test crítico no Canal 8 + regressão nos demais)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run typecheck` e `npm run build` — zero erros
- [ ] Smoke obrigatório (@qa): simular mensagem WhatsApp de lead distratado e verificar Nicole silenciada (Canal 8)
- [ ] Regressão (@qa): confirmar lead ativo continua recebendo follow-up, reminders e Nicole normalmente

---

## Tasks / Subtasks

### Task 1 — @dev: Canal 1 — followup cron (AC: 1)
- [x] Abrir `packages/web/src/app/api/cron/followup/route.ts`
- [x] Localizar query de `leads` (~L200-215): `.from("leads").select(...).eq("org_id", rule.org_id).eq("stage_id", rule.stage_id).eq("is_active", true)`
- [x] Adicionar `.eq("distrato", false)` antes do `.limit()` ou `.maybeSingle()` (se existir)
- [x] Verificar que `npm run typecheck` não gera erros novos neste arquivo

### Task 2 — @dev: Canais 2 e 3 — appointment reminders (AC: 2, 3)
- [x] **WhatsApp reminders** (`packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts`):
  - Localizar o join de `leads` (~L28): `lead:leads!lead_id(id, name, phone)`
  - Adicionar `distrato` ao select: `lead:leads!lead_id(id, name, phone, distrato)`
  - No loop (~L44), após resolver `const lead = ...`:
    - `if (lead?.distrato) { skipped++; continue }` (antes de qualquer envio)
- [x] **Email reminders** (`packages/web/src/app/api/cron/appointment-email-reminders/route.ts`):
  - Mesmo padrão: adicionar `distrato` ao join de `leads` (~L34)
  - No loop, verificar `lead?.distrato` → skip antes de qualquer envio (~L48); contador `skipped` adicionado à resposta

### Task 3 — @dev: Canais 4 e 5 — email-automations (AC: 4, 5)
- [x] Abrir `packages/web/src/app/api/cron/email-automations/route.ts`
- [x] **cron.daily** (~L65): adicionar `.eq("distrato", false)` à query de `leads`
- [x] **client.birthday** (~L119) — usar lógica "todos-os-vínculos-distratados" (active-contract-wins):
  - Antes do loop de `clientes`, buscar `cliente_ids` TOTALMENTE distratados (sem nenhum vínculo ativo):
    ```typescript
    // Passo A: clientes com ao menos um vínculo ATIVO (distrato=false)
    const { data: vinculosAtivos } = await supabase
      .from('clientes_obras_vinculos')
      .select('cliente_id')
      .eq('distrato', false)
    const clientesComVinculoAtivo = new Set(
      (vinculosAtivos ?? []).map(v => v.cliente_id as string)
    )

    // Passo B: clientes com ao menos um vínculo distratado (distrato=true)
    const { data: distVinculos } = await supabase
      .from('clientes_obras_vinculos')
      .select('cliente_id')
      .eq('distrato', true)

    // Totalmente distratados = têm distrato=true E NENHUM vínculo ativo
    const distratadoIds = new Set(
      (distVinculos ?? [])
        .map(v => v.cliente_id as string)
        .filter(id => !clientesComVinculoAtivo.has(id))
    )
    ```
  - No loop de `clientes`, adicionar no início: `if (distratadoIds.has(cliente.id)) { skipped++; continue }`
  - NOTA: as queries acima não filtram por `org_id` diretamente (o filtro de org vem de `clientes` já filtrado por `org_id`). Adicionar `.in('cliente_id', clientes.map(c => c.id))` no Passo B se o volume de vinculos for grande — opcional para otimização.

### Task 4 — @dev: Canais 6 e 7 — campaigns (AC: 6, 7)
> NOTA @dev: `orgId: campaign.org_id` passado ao helper em AMBOS os call-sites (SEC-001 da 20-10).
- [x] **send-whatsapp** (`packages/web/src/app/api/campaigns/[id]/send-whatsapp/route.ts`):
  - Adicionar import: `import { isContatoDistratado } from '@web/lib/distrato/is-contato-distratado'`
  - No loop de `entries` (~L80), antes de `sendWhatsAppTemplate`:
    ```typescript
    if (entry.phone && await isContatoDistratado({ phone: entry.phone })) {
      skipped++
      continue
    }
    ```
  - Adicionar `let skipped = 0` ao iniciar contadores
  - Incluir `skipped` na resposta `NextResponse.json({ sent, failed, skipped, total })`
- [x] **send-emails** (`packages/web/src/app/api/campaigns/[id]/send-emails/route.ts`):
  - Mesmo padrão: import + check `isContatoDistratado({ email: entry.email, orgId: campaign.org_id })` antes de `sendEmail`
  - Adicionar `skipped` aos contadores e à resposta

### Task 5 — @dev: Canal 8 — webhook Nicole [CRÍTICO] (AC: 8-10)
- [x] Abrir `packages/web/src/app/api/webhook/whatsapp/route.ts`
- [x] Localizar `LeadResult` type (L900): adicionar `distrato?: boolean | null` ao tipo (optional p/ fail-open seguro — Opção B)
- [x] Localizar `findOrUpsertLead` → atualizar os pontos de `.select("id, created_at")` para `.select("id, created_at, distrato")`. Confirmados **3** selects que retornam `LeadResult` (L940 lead existente, L977 upsert returning, L998 recovery). O `.select("id")` de L954 é de `kanban_stages` (NÃO retorna `LeadResult`) → intocado, conforme observação do @po.
- [x] Localizar o bloco `after()` principal que ativa o pipeline da Nicole (L511):
  - No início do bloco, após verificar `if (!asyncText && !asyncMediaBlock) return` (L596):
    ```typescript
    // Gate Story 20-12: distratado não ativa Nicole
    if (lead.distrato) {
      console.warn('[WEBHOOK] lead distratado — Nicole não ativada', { leadId: lead.id })
      return
    }
    ```
- [x] Verificar que o gate está DENTRO do `after()`, não antes do `return NextResponse.json({ status: 'ok' })` (a mensagem ainda deve ser salva no DB)
- [x] Verificar que lead novo (`distrato = false` por default) não é bloqueado (AC 10)

### Task 6 — @dev: Roleta (AC: 11)
- [x] Abrir `packages/web/src/lib/roleta/distributor.ts`
- [x] Localizar query do lead (~L74): `.select("property_interest_id, name, phone, assigned_broker_id")`
- [x] Adicionar `distrato` ao select: `.select("property_interest_id, name, phone, assigned_broker_id, distrato")`
- [x] Após verificação `if (!lead)` (~L79), adicionar:
  ```typescript
  if ((lead as { distrato?: boolean }).distrato) {
    await admin.from('lead_distribution_log').insert({
      org_id: orgId, lead_id: leadId, status: 'sem_corretor_disponivel', skipped_brokers: [],
    })
    return { status: 'sem_corretor_disponivel' }
  }
  ```

### Task 7 — QA Smoke (AC: 1-11)
- [ ] Canal 8 (crítico): simular mensagem WA de lead com `distrato = true` → verificar que Nicole não responde + mensagem salva no DB
- [ ] Canal 1: verificar em logs Vercel que lead distratado não aparece no próximo run do followup cron
- [ ] Regressão: verificar que lead ativo com `distrato = false` continua recebendo Nicole normalmente
- [ ] Canal 4/5 (email-automations): verificar que automação não dispara para lead/cliente distratado
- [ ] `npm run typecheck && npm run build` — zero erros nos 8 arquivos modificados

---

## Dev Notes

### Ordem de implementação recomendada

Implementar na ordem crescente de risco:
1. Tasks 1, 2, 3 (crons de lote) — mudanças de 1-3 linhas, sem risco de regressão
2. Task 4 (campaigns) — 1 import + 1 await extra por entry; testar com campanha pequena
3. Task 6 (roleta) — 1 select + 1 if após fetch do lead
4. Task 5 (webhook Nicole) — mais crítico; testar com lead distratado real

### Canal 1: `followup/route.ts` — ponto exato de mudança

```typescript
// ~L200-215 (packages/web/src/app/api/cron/followup/route.ts)
// ANTES:
const { data: leads } = await supabase
  .from("leads")
  .select(`id, name, phone, org_id, assigned_broker_id, property_interest_id, properties:property_interest_id(name)`)
  .eq("org_id", rule.org_id)
  .eq("stage_id", rule.stage_id)
  .eq("is_active", true)

// DEPOIS: adicionar uma linha
const { data: leads } = await supabase
  .from("leads")
  .select(`id, name, phone, org_id, assigned_broker_id, property_interest_id, properties:property_interest_id(name)`)
  .eq("org_id", rule.org_id)
  .eq("stage_id", rule.stage_id)
  .eq("is_active", true)
  .eq("distrato", false)   // <-- Story 20-12
```

### Canal 2: `appointment-whatsapp-reminders` — ponto exato de mudança

```typescript
// ~L28-31 (appointments query)
// ANTES:
lead:leads!lead_id(id, name, phone),

// DEPOIS:
lead:leads!lead_id(id, name, phone, distrato),

// ~L44 (início do loop for)
// ADICIONAR após resolver lead:
const lead = Array.isArray(appointment.lead) ? appointment.lead[0] : appointment.lead
if (lead?.distrato) { skipped++; continue }   // Story 20-12
```

### Canal 5: birthday — padrão "todos-os-vínculos-distratados" (active-contract-wins)

DECISÃO DE STAKEHOLDER 2026-06-30: bloqueio somente quando TODOS os vínculos do cliente têm `distrato=true`. Se o cliente tem ao menos um vínculo ativo (distrato=false), ele continua recebendo email de aniversário normalmente.

O embed `clientes!inner(...)` a partir de `clientes_obras_vinculos` pode gerar tipos ambíguos no TypeScript (padrão da Story 20-9, `notificacoes.ts` L120-140). Usar 3-passos:

```typescript
// Passo A: cliente_ids com ao menos um vínculo ATIVO (distrato=false) — exclui do bloqueio
const { data: vinculosAtivos } = await supabase
  .from('clientes_obras_vinculos')
  .select('cliente_id')
  .eq('distrato', false)
const clientesComAtivo = new Set((vinculosAtivos ?? []).map(v => v.cliente_id as string))

// Passo B: cliente_ids com ao menos um vínculo distratado (distrato=true)
const { data: distVinculos } = await supabase
  .from('clientes_obras_vinculos')
  .select('cliente_id')
  .eq('distrato', true)

// Passo C: totalmente distratados = têm distrato=true E NENHUM vínculo ativo
const distratadoIds = new Set(
  (distVinculos ?? [])
    .map(v => v.cliente_id as string)
    .filter(id => !clientesComAtivo.has(id))
)

// No loop de clientes:
for (const cliente of clientes ?? []) {
  if (distratadoIds.has(cliente.id)) { skipped++; continue }
  // ...resto do código existente
}
```

ATENÇÃO: as queries A e B não filtram por `org_id` diretamente — o filtro de org vem dos `clientes` já filtrados por `org_id`. Para orgs com muitos clientes, adicionar `.in('cliente_id', clientes.map(c => c.id))` nos Passos A e B para limitar o escopo (opcional, otimização).

### Canal 6/7: campaigns — `isContatoDistratado` é async, usar `await`

```typescript
// send-whatsapp/route.ts: dentro do for loop de entries (~L80)
// IMPORTAR no topo:
import { isContatoDistratado } from '@web/lib/distrato/is-contato-distratado'

// DENTRO DO LOOP:
if (entry.phone && await isContatoDistratado({ phone: entry.phone })) {
  console.warn('[CAMPAIGN-WA] entry distratada — pulando', { entryId: entry.id })
  skipped++
  continue  // NÃO marca como failed — deixa em pending
}
// ...resto do try block (sendWhatsAppTemplate, update, log)
```

A função `isContatoDistratado` tem try/catch interno que retorna `false` em caso de erro (fail-open) — não vai bloquear envios legítimos por falha de DB.

### Canal 8: webhook — `findOrUpsertLead` e `LeadResult` (~L880-990)

```typescript
// ~L880 — tipo LeadResult
// ANTES:
type LeadResult = { id: string; created_at: string }
// (ou equivalente)

// DEPOIS (opção A — preferida, consistência de tipos):
type LeadResult = { id: string; created_at: string; distrato: boolean }

// DEPOIS (opção B — fail-open seguro se não atualizar todos os selects):
type LeadResult = { id: string; created_at: string; distrato?: boolean }
// com distrato: boolean = false como default no tipo, garantindo que field ausente → false → Nicole responde

// findOrUpsertLead tem 4 pontos de `.select("id, created_at")` verificados em origin/main:
// ~L901 (lead existente via SELECT)
// ~L938 (path de insert/upsert returning)
// ~L959 (path de recovery/conflict)
// ~L983 (path adicional de recovery)
// Atualizar TODOS os 4 para `.select("id, created_at, distrato")` (Opção A)
// OU usar Opção B com default false (fail-open: campo ausente → false → Nicole responde normalmente).

// Exemplo (~L901 e os demais):
// ANTES:
.select("id, created_at")
// DEPOIS:
.select("id, created_at, distrato")
```

```typescript
// ~L477 — início do after() principal (Nicole pipeline)
after(async () => {
  const tAsync = Date.now()
  try {
    // ... download de media ...
    
    // Skip se sem texto e sem media
    if (!asyncText && !asyncMediaBlock) return

    // Gate Story 20-12: distratado não ativa Nicole
    if (lead.distrato) {
      console.warn('[WEBHOOK] lead distratado — Nicole não ativada', { leadId: lead.id })
      return  // exit after() — mensagem salva, 200 já enviado, Nicole silenciada
    }

    // ... atualizar conversation.last_message_at ...
    // ... pipeline da Nicole ...
  } catch (err) { ... }
})
```

### Canal 9: roleta — `distributor.ts` select (~L74)

```typescript
// ~L74 — query do lead em distributeLeadToNextBroker
// ANTES:
const { data: lead } = await admin
  .from("leads")
  .select("property_interest_id, name, phone, assigned_broker_id")
  .eq("id", leadId)
  .eq("org_id", orgId)
  .maybeSingle()

// DEPOIS: adicionar distrato ao select
const { data: lead } = await admin
  .from("leads")
  .select("property_interest_id, name, phone, assigned_broker_id, distrato")
  .eq("id", leadId)
  .eq("org_id", orgId)
  .maybeSingle()

// ~L79 — após verificação de !lead:
if (!lead) { /* ... existente ... */ }

// ADICIONAR APÓS:
if ((lead as { distrato?: boolean | null }).distrato) {
  await admin.from("lead_distribution_log").insert({
    org_id: orgId,
    lead_id: leadId,
    status: "sem_corretor_disponivel",
    skipped_brokers: [],
  })
  console.warn("[ROLETA] lead distratado — não distribuído", { leadId })
  return { status: "sem_corretor_disponivel" }
}
```

### Checklist de regressão para @qa

| Canal | Verificação de regressão |
|-------|------------------------|
| followup | Lead ativo recebe follow-up (cron próximo run) |
| appointment-wa | Lead ativo com agendamento recebe reminder WA |
| appointment-email | Lead ativo com agendamento recebe reminder email |
| email-automations | Lead ativo recebe automação cron.daily |
| email-automations | Cliente ativo recebe email de aniversário |
| campaigns-wa | Entry com phone ativo recebe WA da campanha |
| campaigns-email | Entry com email ativo recebe email da campanha |
| webhook Nicole | Lead ativo recebe resposta da Nicole normalmente |
| roleta | Lead ativo é distribuído para corretor |

### Testing

**Abordagem:** typecheck + build + smoke manual com lead distratado real em prod.

**Critério de done para cada canal:**
- Lead distratado = não recebe.
- Lead ativo = recebe normalmente.
- Build sem erros TypeScript.

---

## PO Validation (Pax) — 2026-06-30

**Veredito: GO** (gated por dependências) · **Readiness Score: 8/10** · **Confiança: Alta**

A story mais detalhada do conjunto. Os pontos exatos de mudança nos 9 canais foram **verificados contra `origin/main`** e estão precisos.

### Verificações de Anti-Hallucination (todas OK)
- **Todos os 8+ arquivos existem em origin/main** (followup, appointment-wa/email reminders, email-automations, campaigns send-whatsapp/send-emails, webhook/whatsapp, roleta/distributor, notificacoes). ✓
- Canal 8 (webhook): `LeadResult` em L861, `findOrUpsertLead` em L884, `.select("id, created_at")` em L901 — âncoras corretas (story diz ~L880/~L904, aproximações válidas). ✓
- Canal 9 (roleta): `.select("property_interest_id, name, phone, assigned_broker_id")` em L71, status `sem_corretor_disponivel` existe, padrão de insert em `lead_distribution_log` com `org_id`/`lead_id`/`status`/`skipped_brokers` confirmado. ✓
- Padrão 2-passos de `notificacoes.ts` (Canal 5 birthday) válido. ✓

### Should-Fix Issues (Important)
1. **Herda a ambiguidade "active-contract-wins" da Story 20-10** (ver PO Validation de 20-10, item 2). Como TODOS os 9 canais aqui consomem `leads.distrato`/`isContatoDistratado`, qualquer falso-positivo de "cliente ativo em outra obra" se propaga para **todos** os canais (incl. silenciar a Nicole — Canal 8). A semântica precisa ser fixada em 20-10 **antes** de 20-12. Sem AC novo aqui se 20-10 resolver na origem.
2. **Canal 8 / AC 9-10 — múltiplos `.select("id, created_at")`.** O `findOrUpsertLead` tem o select repetido em **L901, L938, L959, L983** (lead existente + 3 paths de insert/recover). A story só menciona explicitamente o ~L904. Funcionalmente AC 10 é seguro (campo ausente → `undefined` → falsy → Nicole responde = fail-open correto), mas o @dev deve **atualizar todos os 4 selects** ou garantir o default `distrato: false` no tipo `LeadResult` para consistência. Impacto baixo (não regride).

### Nice-to-Have
3. Números de linha (~L202 followup, ~L477 after(), ~L65/~L119 email-automations) são aproximações — o @dev localiza. Checklist de regressão por canal é excelente.

**Verificações OK:** CodeRabbit Disabled correto · Executor `@dev` ≠ quality_gate `@qa` · sem migration nova (correto) · escopo OUT correto (notificacoes.ts e sync.ts já cobertos pela 20-9).

### Dependency Gate (Sequência)
- **BLOQUEADA POR 20-10 (PREREQUISITE) + 20-11 (SHOULD).** Sequência 20-10 → 20-11 → 20-12 confirmada executável. Não pode iniciar antes de 20-10 atingir `Ready`.

**Transição de status:** mantida em `Draft`. GO confirmado; flip para `Ready` liberado quando 20-10 (e idealmente 20-11) atingirem `Ready`.

---

## PO Re-Validation (Pax) — 2026-06-30 (pós required-fixes)

**Veredito: GO** · **Readiness Score: 9/10** · **Confiança: Alta** · **Status: Draft → Ready**

### FIX 3 — Canal 5 (birthday) herda "todos-os-vínculos" / active-contract-wins (RESOLVIDO ✓)
A ambiguidade que era herdada da 20-10 foi resolvida **na origem** e propagada corretamente aqui:
- **AC 5** agora diz: email de aniversário só é bloqueado quando o cliente tem **TODOS** os vínculos `distrato = true` (sem nenhuma obra ativa); cliente com ao menos 1 vínculo `distrato = false` continua recebendo (active-contract-wins). ✓
- **Task 3 / Dev Notes Canal 5** implementam a lógica **3-passos**: (A) set de `cliente_ids` com vínculo ativo, (B) set com vínculo distratado, (C) totalmente distratados = B menos A. ✓
- A nota de dependência (linha 7) registra a semântica do `isContatoDistratado` de 20-10. ✓

### FIX 5 — Canal 8: selects em `findOrUpsertLead` (RESOLVIDO ✓, com correção menor de contagem)
AC 9 + Task 5 + Dev Notes Canal 8 instruem a atualizar **TODOS** os pontos de `.select("id, created_at")` no `findOrUpsertLead`. Verificação contra `origin/main`: existem na verdade **3** selects que produzem `LeadResult` (abs. L940 lead existente, L977 insert returning, L998 recovery) — e **não 4**; o ponto extra é um `.select("id")` em L954 que **não** retorna `LeadResult` (não precisa de `distrato`). A story cita "4 (~L901/938/959/983)", uma leve sobre-contagem de números aproximados. **Não bloqueia**, porque:
1. A instrução "atualizar TODOS os `.select('id, created_at')`" é auto-corretiva — o @dev cobre quantos existirem.
2. A Opção B (default `distrato: false` no tipo `LeadResult`) garante fail-open seguro (campo ausente → falsy → Nicole responde) — AC 10 preservado.
> Observação para o @dev: ao implementar, esperar **3** selects relevantes (não 4); o `.select("id")` intermediário não deve ganhar `distrato`.

### Anti-hallucination re-verificado contra `origin/main`
- Todos os 8 arquivos de canal + `notificacoes.ts` existem. ✓
- Canal 9 (roleta): `.select("property_interest_id, name, phone, assigned_broker_id")` em `distributor.ts` L71; status `sem_corretor_disponivel` e insert em `lead_distribution_log` (`org_id`/`lead_id`/`status`/`skipped_brokers`) confirmados. ✓
- Canal 4/5: `cron.daily` (L51/L66 `from("leads")`) e `client.birthday` (L101/L120 `from("clientes")`) confirmados. ✓

### Dependency Gate (DESTRAVADO ✓)
20-10 e 20-11 atingiram `Ready` nesta rodada. Sequência 20-10 → 20-11 → 20-12 confirmada. **20-12 é a última** — implementar após 20-10 (helper + coluna) e idealmente após 20-11 (cron popular `leads.distrato`).

**Verificações OK:** CodeRabbit Disabled correto · Executor `@dev` ≠ quality_gate `@qa` · sem migration nova · escopo OUT correto (notificacoes.ts/sync.ts já cobertos pela 20-9).

**Transição:** `Draft → Ready`.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-30 | 1.0 | Story criada — aplicar filtro de distrato em todos os 8 canais automáticos | River (@sm) |
| 2026-06-30 | 1.1 | Validação PO: GO (8/10) — arquivos/âncoras verificados em origin/main; status retido em Draft, gated por 20-10/20-11 | Pax (@po) |
| 2026-06-30 | 1.2 | @sm required-fixes: migration 121→129 na dependency (FIX 1); nota CRITICO branch origin/main em Dependencies (FIX 2); AC 5 birthday corrigido para todos-os-vínculos-distratados + Task 3 birthday + Dev Notes Canal 5 atualizados com lógica 3-passos (FIX 3); AC 9 + Task 5 + Dev Notes Canal 8 atualizados para cobrir 4 selects em findOrUpsertLead (~L901/938/959/983) (FIX 5) | River (@sm) |
| 2026-06-30 | 1.3 | Re-validação PO pós-fixes: **GO (9/10)** — FIX 3 (birthday active-contract-wins/3-passos) e FIX 5 (selects findOrUpsertLead) verificados em origin/main. Correção menor: existem **3** selects `id, created_at` (não 4) — instrução auto-corretiva + Opção B fail-open cobrem. Dependency gate destravado. **Status Draft → Ready** | Pax (@po) |
| 2026-07-01 | 1.4 | @dev: implementados os 9 canais (filtro de distrato). Canais 1-4/8/9 usam coluna `leads.distrato`; Canal 5 (birthday) usa active-contract-wins 3-passos; Canais 6-7 usam helper `isContatoDistratado` com `orgId` (SEC-001). Confirmados 3 selects em `findOrUpsertLead` (não 4). Gate da Nicole silencia (log+return, fail-open optional). typecheck 0 erros (fora `visual-editor.tsx` pré-existente) + eslint exit 0. **Status Ready → Ready for Review** | Dex (@dev) |

---

## Dev Agent Record

### Agent Model Used
Dex (@dev) — Claude Opus 4.8 (1M context)

### Debug Log References
- `cd packages/web && npx tsc --noEmit` → apenas erros pré-existentes em `visual-editor.tsx` (`react-email-editor`, fora de escopo). Zero erros nos 8 arquivos tocados.
- `npx eslint <8 arquivos>` → exit 0, sem warnings.

### Completion Notes

Filtro de distrato aplicado nos 9 canais. Dois padrões (nenhuma regra reinventada):

| # | Canal | Arquivo:âncora | Tipo de filtro |
|---|-------|----------------|----------------|
| 1 | followup cron | `cron/followup/route.ts` L208 | coluna `leads.distrato` (`.eq("distrato", false)`) |
| 2 | appointment WhatsApp reminders | `cron/appointment-whatsapp-reminders/route.ts` L32 + L51 | coluna `leads.distrato` (join + gate `skipped++`) |
| 3 | appointment email reminders | `cron/appointment-email-reminders/route.ts` L39 + L54 | coluna `leads.distrato` (join + gate + `skipped` na resposta) |
| 4 | email-automations cron.daily | `cron/email-automations/route.ts` L69 | coluna `leads.distrato` (`.eq("distrato", false)`) |
| 5 | email-automations birthday | `cron/email-automations/route.ts` L116-138 + L128 | active-contract-wins 3-passos sobre `clientes_obras_vinculos` (set `distratadoClienteIds`) |
| 6 | campaign send-whatsapp | `campaigns/[id]/send-whatsapp/route.ts` L98 | helper `isContatoDistratado({ phone, orgId: campaign.org_id })` |
| 7 | campaign send-emails | `campaigns/[id]/send-emails/route.ts` L66 | helper `isContatoDistratado({ email, orgId: campaign.org_id })` |
| 8 | webhook Nicole [CRÍTICO] | `webhook/whatsapp/route.ts` L900 (tipo) + L940/L977/L998 (3 selects) + L598 (gate) | coluna `leads.distrato` via `findOrUpsertLead` |
| 9 | roleta | `lib/roleta/distributor.ts` L71 + L83 | coluna `leads.distrato` (select + gate → `sem_corretor_disponivel`) |

Pontos-chave:
- **SEC-001 (orgId):** os ÚNICOS call-sites do helper `isContatoDistratado` são os Canais 6 e 7. Ambos passam `orgId: campaign.org_id`. Os demais canais usam a coluna `leads.distrato` (já escopada por org na propagação do cron 20-11) — não invocam o helper.
- **Webhook Nicole (Canal 8):** o gate SILENCIA a Nicole (log de warning `[WEBHOOK] lead distratado — Nicole não ativada` + `return`), NÃO encaminha ativamente ao corretor — sinalização ativa a humano está explicitamente em **Scope OUT** desta story (linha 27). O log é o sinal para o atendimento humano via monitoramento Vercel. A mensagem do lead continua sendo salva no DB (fluxo sync antes do `after()`) e o HTTP 200 é retornado imediatamente — apenas a resposta automática é suprimida.
- **3 selects (não 4):** confirmado contra o código real — `findOrUpsertLead` tem 3 `.select("id, created_at")` que retornam `LeadResult`; o `.select("id")` de L954 é de `kanban_stages` e ficou intocado (conforme observação do @po v1.3).
- **Fail-open preservado:** `LeadResult.distrato` é optional (`boolean | null`) → campo ausente/undefined → falsy → Nicole responde. O helper mantém try/catch → `false` em erro. Nenhum canal virou fail-closed.
- **AC 10 (lead novo):** `leads.distrato` é `NOT NULL DEFAULT FALSE` (migration 161) → lead recém-criado tem `distrato = false` → recebe normalmente. `.eq("distrato", false)` não descarta nulls (coluna NOT NULL).
- **Menor mudança possível:** cada canal recebeu só o filtro/gate; nenhuma lógica existente foi refatorada.

### File List
- `packages/web/src/app/api/cron/followup/route.ts` (modificar — Canal 1)
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (modificar — Canal 2)
- `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` (modificar — Canal 3)
- `packages/web/src/app/api/cron/email-automations/route.ts` (modificar — Canais 4 e 5)
- `packages/web/src/app/api/campaigns/[id]/send-whatsapp/route.ts` (modificar — Canal 6)
- `packages/web/src/app/api/campaigns/[id]/send-emails/route.ts` (modificar — Canal 7)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (modificar — Canal 8)
- `packages/web/src/lib/roleta/distributor.ts` (modificar — Canal 9)

---

## QA Results

_A preencher pelo @qa após implementação_

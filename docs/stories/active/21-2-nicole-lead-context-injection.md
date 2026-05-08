---
epic: 21
story: 21.2
title: Nicole — Lead Context Injection no System Prompt
status: Done
priority: P2
created_at: 2026-05-06
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [lead_context_injection, personalization_rules, regression_guard, no_field_leak, type_check]
complexity: S
estimated_hours: 2
depends_on: ["21.1"]
blocks: []
---

# Story 21.2 — Nicole: Lead Context Injection no System Prompt

## Contexto

**Epic 21 — WhatsApp Channel Reliability**

A Story 21.1 resolveu a deduplicação de leads e a normalização de phone. Com leads agora únicos e consolidados, a Story 21.2 resolve um problema de UX descoberto via smoke E2E pós-deploy da 21.1:

**Nicole ignora os campos estruturados do lead ao construir o system prompt.**

O pipeline em `packages/ai/src/chat/pipeline.ts` (passo 6.5, linha 261) só busca `ai_summary` e `stage_id` da tabela `leads`. Os campos `name`, `source`, `qualification_status`, `utm_source`, `utm_campaign` estão gravados no banco (especialmente para leads vindos de campanhas Meta Ads e Google Forms) mas **nunca chegam ao contexto da Nicole**.

**Consequência:** Leads de campanhas chegam ao WhatsApp com nome já preenchido e são recebidos com "Qual é o seu nome?" — péssima UX para leads qualificados que já passaram por um formulário de captura.

**Infraestrutura já preparada para este fix:**

O código já contém dois comentários placeholder indicando exatamente onde injetar:

1. `packages/ai/src/prompts/index.ts` linha 99–100:
   ```
   // NOTA — Story 21.2 (lead context injection): qualquer bloco <lead_context>
   // a ser adicionado deve ser DINÂMICO e ir como parte do segundo bloco (sem
   // cache_control). Nunca incluir no bloco estático cacheável.
   ```

2. `packages/ai/src/chat/pipeline.ts` linha 311:
   ```
   // Story 21.2 (lead context) deve ser incluída aqui.
   ```

## Story Statement

**Como** operador do CRM Trifold,
**Quero** que Nicole reconheça o nome e a origem de leads vindos de campanhas logo na primeira mensagem,
**Para que** ela nunca pergunte informações que o lead já forneceu no formulário de captura.

## Acceptance Criteria

- [ ] **AC1:** Step 6.5 do pipeline expande a query de `leads` para incluir `name, source, qualification_status, utm_source, utm_campaign`
  - Query expandida em `processMessageWithMetadata()` (linha ~261 de `pipeline.ts`)
  - Variáveis extraídas: `leadName`, `leadSource`, `leadQualStatus`, `leadUtmCampaign`, `leadUtmSource`
  - Sem breaking change: campos não existentes retornam `null`

- [ ] **AC2:** Função `buildLeadContext()` adicionada ao final de `pipeline.ts`
  - Aceita `{ name, source, qualificationStatus, utmCampaign, utmSource }` (todos opcionais/null)
  - Retorna string vazia `""` se todos os campos são nulos/vazios — sem bloco injetado
  - Gera bloco XML `<lead_context>` apenas com campos não-nulos
  - Formato do bloco:
    ```
    <lead_context>
    Nome: João Silva
    Fonte: meta_ads
    Campanha: Lançamento Yarden
    </lead_context>

    === PERSONALIZATION RULES ===
    1. Se o NOME do lead está preenchido acima, use-o e NÃO pergunte o nome novamente.
    2. Se a FONTE indica campanha (meta_ads, google_ads), o lead já demonstrou interesse — pule apresentações genéricas.
    3. NÃO repita informações que já constam no lead_context.
    === END PERSONALIZATION RULES ===
    ```
  - `qualification_status = "not_started"` é omitido (valor default, não informativo)

- [ ] **AC3:** `leadContext` injetado no `dynamicSuffix` **antes** do `memoryContext` (linha ~313 de `pipeline.ts`)
  - Ordem correta: `dateTimeContext + propertyDataContext + leadContext + memoryContext + noShowContext + buildFlowContext(...) + yardenGateContext`
  - `leadContext` é DINÂMICO — nunca entra no bloco estático cacheável de `buildSystemPrompt()`

- [ ] **AC4:** Quando `conversation.lead_id` é `null` (conversa sem lead associado), `leadContext` é `""` — sem erro, sem bloco injetado

- [ ] **AC5:** `pnpm run type-check` passa sem erros em `pipeline.ts`

- [ ] **AC6:** `pnpm run lint` passa sem erros em `pipeline.ts`

## Escopo

**IN SCOPE:**
- Expandir query de leads no passo 6.5 do pipeline
- Adicionar `buildLeadContext()` em `pipeline.ts`
- Injetar `leadContext` no `dynamicSuffix`

**OUT OF SCOPE:**
- Alterar `buildSystemPrompt()` em `prompts/index.ts` — a função já tem a estrutura correta e não deve ser modificada
- Alterar o bloco estático cacheável (Story 21.3 já finalizou essa estrutura)
- Testes end-to-end de conversa com Nicole
- Novos campos no schema de leads
- Personalização por `utm_medium`, `utm_content`, `utm_term` — fora do escopo inicial

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `leadContext` vazar informações sensíveis ao log | Baixa | `buildLeadContext()` inclui apenas campos explicitamente listados — sem `email`, `phone` |
| Regressão no prompt caching (Story 21.3) | N/A | `leadContext` vai no `dynamicSuffix` (nunca no bloco estático) — cache não afetado |
| Nicole repetir os dados do lead_context | Baixa | `PERSONALIZATION RULES` guarda que não deve repetir |
| Leads sem nome (majoritários via WhatsApp direto) | N/A | `buildLeadContext()` retorna `""` — sem bloco injetado, comportamento igual ao atual |

## Dev Notes

### Localização exata no pipeline.ts

**Passo 6.5 — expandir query (linha ~261):**

```typescript
// ANTES:
const { data: leadData } = await supabase
  .from("leads")
  .select("ai_summary, stage_id")
  .eq("id", conversation.lead_id)
  .single()
currentSummary = leadData?.ai_summary ?? null
leadStageId = leadData?.stage_id ?? null

// DEPOIS:
const { data: leadData } = await supabase
  .from("leads")
  .select("ai_summary, stage_id, name, source, qualification_status, utm_source, utm_campaign")
  .eq("id", conversation.lead_id)
  .single()
currentSummary = leadData?.ai_summary ?? null
leadStageId = leadData?.stage_id ?? null
const leadName = leadData?.name ?? null
const leadSource = leadData?.source ?? null
const leadQualStatus = leadData?.qualification_status ?? null
const leadUtmCampaign = leadData?.utm_campaign ?? null
const leadUtmSource = leadData?.utm_source ?? null
```

**Declarar `leadContext` antes do dynamicSuffix (linha ~283, após o bloco memoryContext):**

```typescript
const leadContext = conversation?.lead_id
  ? buildLeadContext({
      name: leadName,
      source: leadSource,
      qualificationStatus: leadQualStatus,
      utmCampaign: leadUtmCampaign,
      utmSource: leadUtmSource,
    })
  : ""
```

**dynamicSuffix — adicionar `leadContext` antes de `memoryContext` (linha ~313):**

```typescript
const dynamicSuffix =
  dateTimeContext +
  propertyDataContext +
  leadContext +          // ← NOVO — antes de memoryContext
  memoryContext +
  noShowContext +
  buildFlowContext(qualificationStep, qualificationScore, identifiedPropertyId) +
  yardenGateContext
```

**Função `buildLeadContext()` — adicionar no final de `pipeline.ts` (junto com `buildFlowContext`):**

```typescript
function buildLeadContext(params: {
  name: string | null
  source: string | null
  qualificationStatus: string | null
  utmCampaign: string | null
  utmSource: string | null
}): string {
  const lines: string[] = []
  if (params.name) lines.push(`Nome: ${params.name}`)
  if (params.source) lines.push(`Fonte: ${params.source}`)
  if (params.utmCampaign) lines.push(`Campanha: ${params.utmCampaign}`)
  if (params.utmSource) lines.push(`Origem UTM: ${params.utmSource}`)
  if (params.qualificationStatus && params.qualificationStatus !== "not_started") {
    lines.push(`Status de qualificação: ${params.qualificationStatus}`)
  }

  if (lines.length === 0) return ""

  return (
    "\n<lead_context>\n" +
    lines.join("\n") +
    "\n</lead_context>\n\n" +
    "=== PERSONALIZATION RULES ===\n" +
    "1. Se o NOME do lead está preenchido acima, use-o e NÃO pergunte o nome novamente.\n" +
    "2. Se a FONTE indica campanha (meta_ads, google_ads), o lead já demonstrou interesse — pule apresentações genéricas.\n" +
    "3. NÃO repita informações que já constam no lead_context.\n" +
    "=== END PERSONALIZATION RULES ===\n"
  )
}
```

### Variáveis de escopo

`leadName`, `leadSource`, `leadQualStatus`, `leadUtmCampaign`, `leadUtmSource` são declaradas dentro do bloco `if (conversation?.lead_id)` — escopar corretamente com `let` fora do bloco para uso posterior no `dynamicSuffix`:

```typescript
// Declarar antes do bloco if:
let leadName: string | null = null
let leadSource: string | null = null
let leadQualStatus: string | null = null
let leadUtmCampaign: string | null = null
let leadUtmSource: string | null = null

// Dentro do bloco if (conversation?.lead_id):
leadName = leadData?.name ?? null
// etc.
```

### Não tocar em prompts/index.ts

`buildSystemPrompt()` em `packages/ai/src/prompts/index.ts` **não deve ser modificada**. O comentário da linha 99 é informativo — o fix acontece inteiramente em `pipeline.ts`.

## Tasks / Subtasks

- [x] **Task 1 — Expandir query de leads no passo 6.5** (AC1)
  - [x] Adicionar `name, source, qualification_status, utm_source, utm_campaign` ao `.select()`
  - [x] Declarar variáveis `leadName`, `leadSource`, `leadQualStatus`, `leadUtmCampaign`, `leadUtmSource` com `let` antes do bloco `if`
  - [x] Atribuir dentro do bloco `if (conversation?.lead_id)`

- [x] **Task 2 — Adicionar `buildLeadContext()` e injetar no dynamicSuffix** (AC2, AC3, AC4)
  - [x] Implementar `buildLeadContext()` no final de `pipeline.ts`
  - [x] Calcular `leadContext` antes do `dynamicSuffix`
  - [x] Inserir `leadContext` no `dynamicSuffix` antes de `memoryContext`
  - [x] Garantir `leadContext = ""` quando `conversation?.lead_id` é null

- [x] **Task 3 — Validações finais** (AC5, AC6)
  - [x] `pnpm run type-check` sem erros em `pipeline.ts`
  - [x] `pnpm run lint` sem erros em `pipeline.ts`

## 🤖 CodeRabbit Integration

### Story Type Analysis
- **Primary Type:** AI pipeline enhancement — injeção de contexto dinâmico
- **Complexity:** Pequena — 1 arquivo modificado, ~40 linhas adicionadas

### Specialized Agent Assignment
- **Primary Agent:** @dev
- **Supporting Agent:** @qa (quality gate)

### CodeRabbit Focus Areas
- `buildLeadContext()` retorna `""` para todos os campos nulos — sem bloco injetado
- `leadContext` vai em `dynamicSuffix` (dinâmico), nunca no bloco estático cacheável
- Variáveis `let` declaradas fora do `if` para escopo correto no `dynamicSuffix`
- `qualification_status = "not_started"` omitido (valor default não informativo)
- Campos sensíveis (`email`, `phone`) **não** incluídos em `buildLeadContext()`

### Self-Healing Configuration
- **Max Iterations:** 2
- **Severity Filter:** CRITICAL only
- **Behavior:** CRITICAL → auto_fix; HIGH → document_only

## Dev Agent Record

### Status
Done

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Task 1: Query expandida em `pipeline.ts` linha 268 — 5 campos adicionados ao `.select()`. Variáveis declaradas com `let` antes do bloco `if (conversation?.lead_id)` para escopo correto no `dynamicSuffix`.
- Task 2: `buildLeadContext()` adicionada após `buildSystemPrompt()` (linha ~956). `leadContext` calculado antes de `noShowContext`. Injetado no `dynamicSuffix` entre `propertyDataContext` e `memoryContext`. Null guard via ternário (`conversation?.lead_id ? ... : ""`).
- Task 3: `pnpm type-check` — 8 successful, zero erros em `@trifold/ai`. `pnpm lint` em `packages/ai` — limpo. Erros pré-existentes em `packages/web` não relacionados a esta story.

### Debug Log References
_nenhum_

### File List
- `packages/ai/src/chat/pipeline.ts` — modificado

## QA Results

### Review Date: 2026-05-06

### Reviewed By: Quinn (@qa)

**Checks executados:**

| Check | Status |
|-------|--------|
| Code review | ✅ PASS |
| Unit tests | ⚠️ MEDIUM — fora do escopo da story |
| Acceptance criteria (AC1-AC6) | ✅ PASS |
| Regressões | ✅ PASS |
| Performance | ✅ PASS |
| Security (sem campos sensíveis) | ✅ PASS |
| Documentação | ⚠️ LOW — 1 comentário placeholder obsoleto |

**TEST-001 (medium):** `buildLeadContext()` sem testes unitários — função pura, trivialmente testável. Recomendado em próximo sprint.

**MNT-001 (low):** `pipeline.ts:332` — comentário "deve ser incluída aqui" obsoleto após implementação.

### Gate Status

Gate: PASS → docs/qa/gates/21.2-nicole-lead-context-injection.yml

## Change Log

| Data | Agente | Descrição |
|------|--------|-----------|
| 2026-05-06 | River (@sm) | Story 21.2 criada — lead context injection no pipeline da Nicole, descoberta via smoke E2E pós-Story 21.1 |
| 2026-05-06 | Pax (@po) | Validação GO (10/10) — dependência 21.1 Done, 21.3 Done, Dev Notes auto-contidas com código exato. Status: Draft → Ready |
| 2026-05-06 | Dex (@dev) | Implementação completa — query expandida, `buildLeadContext()` adicionada, `leadContext` injetado no `dynamicSuffix`. type-check + lint PASS. Status: Ready → Ready for Review |
| 2026-05-08 | @po | Story fechada — QA Gate PASS (2026-05-06), implementação verificada em pipeline.ts | — |

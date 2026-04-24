---
epic: 16
story: 16.0
title: Fix Meta Ads Webhook — Graph API Fetch
status: Ready for Review
priority: P0-CRITICO
created_at: 2026-04-24
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [api_integration_review, async_processing_validation, error_handling, security_review]
complexity: M
estimated_hours: 4
---

# Story 16.0 — Fix Meta Ads Webhook: Graph API Fetch

> ⚡ **P0 CRÍTICO** — Implementar ANTES de qualquer outra story do Epic 16.
> Em produção, leads chegam sem nome/telefone/email por um bug silencioso no webhook atual.

## Contexto

O webhook em `packages/web/src/app/api/webhooks/meta-ads/route.ts` assume (linha 71-85) que o array `field_data[]` chega preenchido no payload do evento `leadgen`. Isso é um equívoco: **em produção, a Meta envia apenas o `leadgen_id`** — os dados do lead precisam ser buscados via Graph API com uma segunda chamada.

O resultado hoje: todos os leads vindos de Meta Ads entram no CRM com `name=null`, `phone=null`, `email=null`. A verificação `!phone && !email` na linha 87 aborta o processo antes de criar o lead, descartando o evento silenciosamente.

Além disso:
- `utm_campaign` é preenchido com `value.campaign_name` (linha 123) — campo que não existe no payload de webhook
- Nenhum evento é logado para debugging
- O processamento é síncrono, arriscando timeout (Meta exige 200 em < 20s)

## Story Statement

**Como** administrador do CRM Trifold,
**Quero** que os leads de Meta Ads Lead Forms sejam criados com os dados completos (nome, telefone, email, nome da campanha),
**Para que** a equipe de vendas possa atender esses leads imediatamente sem dados faltantes.

## Acceptance Criteria

- [ ] **AC1:** Ao receber evento `leadgen`, o webhook faz `GET /v21.0/{leadgen_id}?access_token={META_PAGE_ACCESS_TOKEN}&fields=field_data,ad_id,campaign_id,form_id,created_time` via Graph API
- [ ] **AC2:** Se `field_data[]` chega preenchido no payload (testes/sandbox), usa os dados diretamente sem chamar a API (backward compatible)
- [ ] **AC3:** O processamento (Graph API fetch + criação do lead) é executado de forma assíncrona via `waitUntil()` — o handler retorna `200 OK` imediatamente após validação da assinatura
- [ ] **AC4:** Nome da campanha é resolvido via `GET /v21.0/{campaign_id}?fields=name&access_token=...` e salvo em `utm_campaign` (fallback: `null` se `campaign_id` não disponível)
- [ ] **AC5:** Retry com backoff exponencial se Graph API falhar: `1s → 2s → 4s` (max 3 tentativas) antes de abandonar
- [ ] **AC6:** Todos os eventos webhook recebidos são logados via `console.log` estruturado (JSON) com: `leadgen_id`, `form_id`, `ad_id`, `campaign_id`, `timestamp`, `signature_valid: <resultado real da validação HMAC>`, `processing: async`
- [ ] **AC7:** Se Graph API retornar erro após retries, lead é criado com dados parciais (apenas `leadgen_id` em metadata) e flag `metadata.incomplete = true` em vez de ser descartado
- [ ] **AC8:** Lead já existente (dedup por phone) recebe update de `utm_*` e `metadata` com dados da campanha
- [ ] **AC9:** `DEFAULT_STAGE_ID` hardcoded é substituído por query dinâmica à tabela `pipeline_stages` buscando estágio com `is_default = true` ou `position = 1`
- [ ] **AC10:** Env var `META_PAGE_ACCESS_TOKEN` documentada em `.env.example` e `vercel.json` (ou `docs/` de deploy)

## Scope

### IN (o que esta story implementa)
- Fix do handler `POST /api/webhooks/meta-ads` com Graph API fetch assíncrono
- Retry com backoff para chamadas Graph API
- Log estruturado de todos os eventos recebidos
- Resolução dinâmica do `DEFAULT_STAGE_ID`
- Documentação da nova env var

### OUT (fora desta story)
- Tabela `webhook_logs` no banco (→ Story 16.6)
- Tabela `meta_campaigns` (→ Story 16.1)
- Client tipado `packages/shared/src/meta/client.ts` (→ Story 16.2)
- UI de configuração da integração (→ Story 16.3)
- Qualquer modificação no handler GET de verificação

## Dev Notes

### Arquivo principal a modificar

```
packages/web/src/app/api/webhooks/meta-ads/route.ts
```

[Source: docs/framework/source-tree.md#api-routes]

### Bug atual — análise linha a linha

```typescript
// LINHA 71-85 — BUG: field_data vem vazio em produção
const fieldData: Array<{ name: string; values: string[] }> =
  value.field_data ?? []   // ← vazio em produção

// LINHA 87 — BUG: aborta silenciosamente sem logar
if (!phone && !email) {
  console.error("Meta Ads webhook: no phone or email in lead data")
  return NextResponse.json({ status: "ok" }) // ← lead descartado
}

// LINHA 123 — BUG: campo inexistente no payload
const utmCampaign = value.campaign_name ?? value.ad_group_name ?? null
//                        ^^^^^^^^^^^^^^ não existe no webhook payload
```

### Graph API — endpoint e response

```typescript
// Buscar dados do lead
GET https://graph.facebook.com/v21.0/{leadgen_id}
  ?access_token={META_PAGE_ACCESS_TOKEN}
  &fields=field_data,ad_id,campaign_id,form_id,created_time,page_id

// Response:
{
  "id": "123456789",
  "field_data": [
    { "name": "full_name", "values": ["João Silva"] },
    { "name": "phone_number", "values": ["+5541999999999"] },
    { "name": "email", "values": ["joao@email.com"] }
  ],
  "ad_id": "...",
  "campaign_id": "...",
  "form_id": "...",
  "created_time": "2026-04-24T10:00:00+0000"
}

// Resolver nome da campanha
GET https://graph.facebook.com/v21.0/{campaign_id}
  ?access_token={META_PAGE_ACCESS_TOKEN}
  &fields=name

// Response:
{ "id": "...", "name": "Trifold - Vind - Leads Qualificados" }
```

### Padrão async — `waitUntil()` no Next.js App Router

O Vercel Edge Runtime expõe `waitUntil` via `after()` do Next.js 15+ ou pelo objeto de contexto. No Next.js 16 (App Router), usar:

```typescript
import { after } from 'next/server'  // Next.js 15+

export async function POST(request: NextRequest) {
  // 1. Validar assinatura — síncrono
  // 2. Parsear body — síncrono
  // 3. Retornar 200 IMEDIATAMENTE
  after(async () => {
    // 4. Processar lead de forma async
    await processLeadAsync(leadgenId, webhookValue, entry)
  })
  return NextResponse.json({ status: "ok" })
}
```

> **Nota:** Se `after()` não estiver disponível nesta versão do Next.js, usar padrão de fire-and-forget com `Promise` sem await:
> ```typescript
> processLeadAsync(leadgenId, webhookValue, entry).catch(console.error)
> return NextResponse.json({ status: "ok" })
> ```
> Verificar `next/server` exports antes de usar `after`.

[Source: docs/framework/tech-stack.md#runtime]

### Retry com backoff exponencial

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error(`[META-WEBHOOK] Graph API failed after ${maxRetries} retries:`, error)
        return null
      }
      const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return null
}
```

### Log estruturado (sem tabela por ora)

```typescript
// Log todos os eventos ao receber — antes de qualquer processamento
console.log(JSON.stringify({
  type: 'meta_webhook_received',
  leadgen_id: value?.leadgen_id,
  form_id: value?.form_id,
  ad_id: value?.ad_id,
  campaign_id: value?.campaign_id,
  page_id: entry?.id,
  timestamp: new Date().toISOString(),
  signature_valid: true,
  processing: 'async',
}))
```

### Stage ID dinâmico

```typescript
// Substituir DEFAULT_STAGE_ID hardcoded por:
async function getDefaultStageId(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_default', true)
    .single()

  return data?.id ?? '00000000-0000-0000-0001-000000000001' // fallback se não configurado
}
```

> Verificar se `pipeline_stages` tem coluna `is_default` ou `position`. Adaptar conforme schema atual.
> [Source: supabase/migrations/001_base_schema.sql]

### Env vars

| Variável | Status | Uso |
|---|---|---|
| `META_APP_SECRET` | Existe | Validação HMAC — não alterar |
| `META_WHATSAPP_VERIFY_TOKEN` | Existe | Verificação webhook GET — não alterar |
| `META_PAGE_ACCESS_TOKEN` | **Nova** | Graph API fetch de `leadgen_id` |

### Padrões do projeto a seguir

- Imports: `@web/lib/...` para utils internos [Source: docs/framework/coding-standards.md#import-order]
- Nomes de arquivos: kebab-case [Source: docs/framework/coding-standards.md#naming-conventions]
- Supabase admin: usar `createClient` com `SUPABASE_SERVICE_ROLE_KEY` (padrão existente no arquivo)
- Não adicionar comentários explicativos — código auto-documentado via nomes

## Tasks / Subtasks

- [x] **Task 1** — Adicionar `after()` / fire-and-forget para tornar handler assíncrono (AC3)
  - `after` confirmado disponível em `next/server` (Next.js 16.2.2)
  - Lógica extraída para `processLeadAsync()`
  - Handler POST retorna 200 antes de processar

- [x] **Task 2** — Implementar `fetchLeadData(leadgenId)` via Graph API (AC1, AC2)
  - `GET /v21.0/{leadgen_id}?fields=field_data,ad_id,campaign_id,form_id,created_time&access_token=...`
  - Se `value.field_data` já vem preenchido (sandbox), retorna diretamente sem chamar API
  - Envolvido em `fetchWithRetry()` com max 3 tentativas

- [x] **Task 3** — Implementar `resolveCampaignName(campaignId)` (AC4)
  - `GET /v21.0/{campaign_id}?fields=name&access_token=...`
  - Retorna `null` se `campaign_id` ausente ou request falhar
  - Envolvido em `fetchWithRetry()`

- [x] **Task 4** — Implementar `fetchWithRetry()` com backoff (AC5)
  - Delays: 1s, 2s, 4s (exponential: `Math.pow(2, attempt) * 1000`)
  - Loga cada tentativa com número e mensagem de erro

- [x] **Task 5** — Adicionar log estruturado no início do POST (AC6)
  - JSON com todos os campos do evento incluindo `signature_valid: signatureValid` (resultado real)
  - Log ANTES do `after()` — ainda síncrono

- [x] **Task 6** — Tratar criação de lead com dados parciais (AC7)
  - Se Graph API falha após retries: cria lead com `metadata.incomplete = true`
  - Phone fallback para `"meta_ads_lead"` — nenhum evento descartado

- [x] **Task 7** — Substituir `DEFAULT_STAGE_ID` hardcoded por query dinâmica (AC9)
  - Tabela confirmada como `kanban_stages` (não `pipeline_stages`) com `is_default boolean`
  - `getDefaultStageId()` busca por `is_default=true`, fallback por `ORDER BY position ASC`
  - UUID hardcoded mantido como último fallback

- [x] **Task 8** — Documentar `META_PAGE_ACCESS_TOKEN` (AC10)
  - Adicionado ao `.env.example` com comentário explicativo
  - `vercel.json` verificado — env vars adicionadas via Vercel dashboard

- [x] **Task 9** — Verificar e ajustar dedup de leads (AC8)
  - Lead existente recebe update de `utm_*` e `metadata` com `.is("utm_campaign", null)` para não sobrescrever dados existentes

- [x] **Task 10** — Lint + typecheck
  - `tsc --noEmit`: sem erros ✅
  - `eslint src/app/api/webhooks/meta-ads/route.ts`: sem erros ✅
  - Sem `any` implícito — todos os tipos explícitos

## File List

### Arquivos modificados
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — refactor completo do handler POST
- `.env.example` — documentação de `META_PAGE_ACCESS_TOKEN`

### Arquivos criados
- Nenhum

### Descobertas durante implementação
- Tabela é `kanban_stages` (não `pipeline_stages`) — `is_default boolean` confirmado
- `after()` disponível em `next/server` no Next.js 16.2.2 ✅

## Testes

- [ ] Testar com payload de sandbox da Meta (com `field_data` preenchido) — deve usar dados sem chamar API
- [ ] Testar com payload de produção simulado (sem `field_data`) — deve chamar Graph API
- [ ] Simular falha da Graph API — lead deve ser criado com `incomplete=true`
- [ ] Verificar que 200 é retornado antes de 5s mesmo com Graph API lenta
- [ ] Verificar log estruturado em todos os cenários

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Integration (webhook + external API)
- Secondary Type: API (modificação de route handler)
- Complexity: Medium (1 arquivo modificado, nova dependência externa, lógica async)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação e pré-commit)
- Supporting: `@architect` (validação do pattern async + error handling)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `pnpm run lint && pnpm run typecheck`
- [ ] Pre-PR (`@architect`): Revisar pattern async, retry logic, e tratamento de falhas

**CodeRabbit Focus Areas:**
- Async processing: garantir que `waitUntil`/fire-and-forget não engole erros silenciosamente
- Error handling: Graph API failures devem ser logados, não descartados
- Security: `META_PAGE_ACCESS_TOKEN` nunca logado em plaintext
- Retry idempotency: múltiplos retries não criam leads duplicados

**Self-Healing Configuration:**
- Primary Agent: `@dev` (light mode)
- Max Iterations: 2
- Timeout: 15 min
- Severity Filter: CRITICAL
- Behavior: CRITICAL → auto_fix, HIGH → document_only

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-24 | @sm (River) | Story criada — Draft |
| 2026-04-24 | @po (Pax) | Validação GO — 9/10 — status atualizado para Ready |
| 2026-04-24 | @dev (Dex) | Implementação completa — 10/10 tasks concluídas — Ready for Review |
| 2026-04-24 | @qa (Quinn) | QA Gate — veredicto CONCERNS — 4 issues (2 MEDIUM, 2 LOW) — gate file criado |
| 2026-04-24 | @dev (Dex) | QA fixes aplicados — REQ-001 (AC8 metadata update), SEC-001 (AbortSignal.timeout), REL-001 (phone null) — TEST-001 registrado como tech-debt Story 16.6 |

## QA Results

**Revisor:** @qa (Quinn)
**Data:** 2026-04-24
**Veredicto:** CONCERNS
**Gate file:** `docs/qa/gates/16.0-fix-meta-ads-webhook-graph-api.yml`

### Resumo

Fix crítico implementado corretamente — webhook agora busca dados via Graph API assincronamente. ACs 1-7, 9-10 aprovados. Concerns documentados:

| ID | Severidade | Descrição |
|---|---|---|
| REQ-001 | MEDIUM | AC8 incompleto — `.is("utm_campaign", null)` impede update de `metadata` em leads com utm já preenchido |
| SEC-001 | MEDIUM | Sem `AbortSignal.timeout()` nos fetch calls dentro de `after()` |
| REL-001 | LOW | `phone: "meta_ads_lead"` como fallback pode causar colisões no dedup futuro |
| TEST-001 | LOW | Sem testes automatizados — registrar como tech-debt para Story 16.6 |

### Recomendação

Fixes REQ-001 e SEC-001 recomendados antes do merge para produção. REL-001 e TEST-001 podem ser resolvidos em Story 16.6.

---

## Definition of Done

- [x] Handler POST retorna 200 imediatamente (processamento async)
- [ ] Leads de Meta Ads chegam com nome/telefone/email preenchidos
- [ ] Nome da campanha resolvido em `utm_campaign`
- [x] Log estruturado em todos os eventos
- [x] Lint e typecheck passando
- [ ] @qa PASS
- [ ] @devops push realizado

---
epic: 16
story: 16.7
title: Backfill — Leads Históricos via Lead Forms API
status: Ready for Review
priority: P2-MÉDIO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [idempotency, dedup_logic, rate_limit_compliance]
complexity: M
estimated_hours: 3
depends_on: [16.0, 16.2]
---

# Story 16.7 — Backfill: Leads Históricos via Lead Forms API

## Contexto

Stories 16.0–16.6 estão em produção. O webhook Meta Ads agora cria leads corretamente, mas
todos os leads recebidos **antes** do fix da Story 16.0 (2026-04-24) foram criados sem
`name/email/phone` — ou nem foram criados (se chegaram enquanto o webhook estava quebrado).

Esta story cria um script one-shot para recuperar leads históricos diretamente da Meta Lead
Forms API, com deduplicação por `leadgen_id` para garantir idempotência.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** executar um script de backfill que recupere leads históricos de um formulário Meta,
**Para que** eu possa completar o CRM com leads que chegaram antes do fix do webhook ou que
foram perdidos durante interrupções.

## Acceptance Criteria

- [x] **AC1:** Script `scripts/meta-backfill-leads.ts` aceita os seguintes argumentos CLI:
  - `--form-id=xxx` (obrigatório — ID do Lead Form Meta)
  - `--from=YYYY-MM-DD` (obrigatório — data de início do backfill)
  - `--to=YYYY-MM-DD` (opcional — data fim, default hoje)
  - `--dry-run` (opcional — simula sem gravar)
  - `--org-id=xxx` (opcional — auto-detectado via `meta_ad_accounts` se ausente)
  - Exibe erro e encerra com `process.exit(1)` se `--form-id` ou `--from` ausentes

- [x] **AC2:** Script busca leads da Meta Lead Forms API com paginação cursor + chunks:
  - Divide período `from → to` em chunks de 7 dias
  - Para cada chunk: `GET /{form_id}/leads?fields=id,field_data,created_time,ad_id,campaign_id,adgroup_id&since={UNIX}&until={UNIX}&limit=100`
  - Pagina via `paging.cursors.after` até `paging.next` não existir
  - Pausa de 5 segundos entre chunks (proteção rate limit)
  - Usa `metaFetch<MetaPagedResponse<MetaLeadRecord>>` de `@trifold/shared`

- [x] **AC3:** Deduplicação por `leadgen_id` — idempotente:
  - Antes de criar, verifica: `SELECT id FROM leads WHERE org_id=? AND metadata->>'leadgen_id'=?`
  - Se já existe: skip (conta como `skipped`)
  - Nunca cria duplicatas mesmo se executado múltiplas vezes

- [x] **AC4:** Criação de leads usa mesma lógica do webhook handler:
  - `getField()` para extrair `full_name`/`name`, `email`, `phone_number`/`phone`
  - `source='meta_ads'`, `channel='meta_ads'`
  - `stage_id` via `kanban_stages WHERE org_id=? AND is_default=true` (fallback: primeira stage)
  - `metadata`: `{ leadgen_id, form_id, ad_id, field_data, backfill: true }`
  - Cria activity `lead_created` com `description='Lead importado via backfill Meta Ads'`
  - `--dry-run`: exibe o que seria criado, sem INSERT

- [x] **AC5:** Org ID resolvido automaticamente se `--org-id` não fornecido:
  - Query: `SELECT org_id FROM meta_ad_accounts WHERE status='active' LIMIT 1`
  - Fallback: `SELECT org_id FROM whatsapp_config WHERE status='active' LIMIT 1` (padrão existente)
  - Se nenhum encontrado: erro claro e `process.exit(1)`

- [x] **AC6:** Output de progresso e sumário final no console:
  - Por chunk: `[CHUNK 2026-01-01→2026-01-07] fetched=23, created=5, skipped=18`
  - Por erro: `[ERROR] leadgen_id=xxx — mensagem do erro`
  - Sumário final:
    ```
    ✅ Backfill concluído
    Chunks processados: 4
    Total fetched:  92
    Criados:        21
    Skipped:        70
    Erros:           1
    ```

- [x] **AC7:** TypeScript: `npm run type-check` passa sem erros. Sem `any` explícito.

## Scope

### IN (o que esta story implementa)
- Script `scripts/meta-backfill-leads.ts` — execução manual via `npx tsx`
- Busca via Lead Forms API (`/{form_id}/leads`)
- Dedup por `leadgen_id` em `leads.metadata`
- Criação de leads + activities

### OUT (fora desta story)
- Atualização de leads **existentes** com dados incompletos (re-enrich → story separada)
- UI de backfill no dashboard
- Backfill de insights/métricas (já coberto por 16.5)
- Suporte a múltiplos formulários em uma execução (um `--form-id` por vez)

## Dev Notes

### Padrão de script existente

Ver `scripts/re-enrich-lead.ts` para o padrão:
- Carrega env de `packages/web/.env.local`
- `createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY)` — service role bypassa RLS
- `npx tsx scripts/meta-backfill-leads.ts --form-id=xxx --from=2026-01-01`

```typescript
// scripts/meta-backfill-leads.ts — estrutura base
import { createClient } from "@supabase/supabase-js"
import { metaFetch } from "@trifold/shared/meta"
import type { MetaPagedResponse } from "@trifold/shared/meta"
import { readFileSync } from "fs"
import { resolve } from "path"

// Carregar env
const envPath = resolve(__dirname, "../packages/web/.env.local")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim()
  }
}
```

### Interface de lead da Lead Forms API

```typescript
interface MetaLeadRecord {
  id: string                                         // leadgen_id
  field_data: Array<{ name: string; values: string[] }>
  created_time: string                               // ISO 8601
  ad_id?: string
  adgroup_id?: string                                // adset_id
  campaign_id?: string
}
```

Adicionar `MetaLeadRecord` a `packages/shared/src/meta/types.ts`.

### Fetch de uma página

```typescript
// Uma página de leads de um chunk (since/until em UNIX timestamp)
const page = await metaFetch<MetaPagedResponse<MetaLeadRecord>>(
  `${formId}/leads`,
  token,
  {
    params: {
      fields: "id,field_data,created_time,ad_id,adgroup_id,campaign_id",
      since: String(sinceUnix),
      until: String(untilUnix),
      limit: "100",
      ...(cursor ? { after: cursor } : {}),
    },
  }
)
```

`paging.next` existindo indica mais páginas. Próximo cursor: `paging.cursors.after`.

### Chunks de 7 dias

```typescript
function buildChunks(from: Date, to: Date): Array<[Date, Date]> {
  const chunks: Array<[Date, Date]> = []
  let cursor = new Date(from)
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + 7 * 86400000, to.getTime()))
    chunks.push([new Date(cursor), end])
    cursor = end
  }
  return chunks
}
```

### Dedup check

```typescript
const { data: existing } = await supabase
  .from("leads")
  .select("id")
  .eq("org_id", orgId)
  .eq("metadata->>leadgen_id", lead.id)
  .single()

if (existing) { stats.skipped++; continue }
```

### Env vars necessárias

- `META_PAGE_ACCESS_TOKEN` — já existe (usado no webhook)
- `SUPABASE_SERVICE_ROLE_KEY` — já existe
- `NEXT_PUBLIC_SUPABASE_URL` — já existe

### Uso

```bash
# Dry-run (sem escrita)
npx tsx scripts/meta-backfill-leads.ts --form-id=1234567890 --from=2026-01-01 --dry-run

# Backfill real
npx tsx scripts/meta-backfill-leads.ts --form-id=1234567890 --from=2026-01-01 --to=2026-04-24
```

## Tasks / Subtasks

- [x] **Task 1** — Adicionar `MetaLeadRecord` a `packages/shared/src/meta/types.ts`
  - Interface com `id, field_data, created_time, ad_id?, adgroup_id?, campaign_id?`
  - Exportar de `packages/shared/src/meta/index.ts`

- [x] **Task 2** — Criar script `scripts/meta-backfill-leads.ts`
  - Parse de args CLI (AC1)
  - Load env de `.env.local` (padrão `re-enrich-lead.ts`)
  - `resolveOrgId()`: meta_ad_accounts → whatsapp_config fallback (AC5)
  - `buildChunks()`: dividir período em chunks de 7 dias (AC2)
  - Loop de chunks com fetch + paginação cursor (AC2)
  - Dedup check por `metadata->>'leadgen_id'` (AC3)
  - `createLead()`: extração de campos + insert + activity (AC4)
  - Output de progresso + sumário final (AC6)
  - Suporte a `--dry-run` (AC4)

- [x] **Task 3** — Validar
  - `npm run type-check` sem erros (AC7) ✅
  - `npm run lint` sem erros ✅

## File List

### Arquivos criados
- `scripts/meta-backfill-leads.ts`

### Arquivos modificados
- `packages/shared/src/meta/types.ts` — `MetaLeadRecord` adicionado (index.ts já exporta via `export * from './types'`)

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] `--dry-run` exibe leads esperados sem gravar no banco
- [ ] Segunda execução com mesmo `--form-id` e período → 0 criados, N skipped (idempotência)
- [ ] `--form-id` ausente → mensagem de erro + exit 1
- [ ] `--from` ausente → mensagem de erro + exit 1
- [ ] Paginação funciona: com 150+ leads fetched para um chunk, paginação cursor busca todos

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Script / Data Migration
- Complexity: Média (rate limiting, dedup, paginação, env handling)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@qa` (idempotência, dedup, rate limit compliance)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@qa`): Validar idempotência, dedup correto, sem SQL injection via metadados

**CodeRabbit Focus Areas:**
- Dedup check usando `metadata->>'leadgen_id'` (PostgREST JSON operator correto)
- Pausa de 5s entre chunks (não entre páginas — apenas entre chunks de 7 dias)
- `MetaOAuthException` → abort imediato (não retry)
- `--dry-run` nunca executa INSERT ou UPDATE

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-27 | @sm (River) | Story criada — Draft |
| 2026-04-27 | @po (Pax) | Validação 10-point: 9/10 — GO. Correção: AC1 adicionado `--org-id` ausente (inconsistência com AC5). Status: Draft → Ready |
| 2026-04-27 | @dev (Dex) | Implementação completa — MetaLeadRecord adicionado ao shared, script meta-backfill-leads.ts criado. type-check ✅ lint ✅ (0 errors). Status: Ready → Ready for Review |
| 2026-04-27 | @qa (Quinn) | Review completo — PASS. 7/7 ACs satisfeitos, 3 issues LOW (nenhum bloqueia). Gate: docs/qa/gates/16.7-backfill-leads-historicos.yml |

## QA Results

**Decisão: PASS**
**Revisor:** @qa (Quinn) — 2026-04-27
**Gate file:** `docs/qa/gates/16.7-backfill-leads-historicos.yml`

### Cobertura de ACs

| AC | Status | Observação |
|---|---|---|
| AC1 CLI args | ✅ PASS | form-id/from obrigatórios + exit(1), to/org-id/dry-run opcionais |
| AC2 Paginação + chunks | ✅ PASS | buildChunks 7 dias, cursor pagination, pausa 5s entre chunks |
| AC3 Dedup leadgen_id | ✅ PASS | `metadata->>leadgen_id` + `.maybeSingle()` — idempotente |
| AC4 Criação de leads | ✅ PASS | getField, source/channel, stage dinâmica, activity, dry-run correto |
| AC5 Org ID auto | ✅ PASS | meta_ad_accounts → whatsapp_config → exit(1) |
| AC6 Output progresso | ✅ PASS | [CHUNK] + [ERROR] + sumário final |
| AC7 TypeScript | ✅ PASS | type-check ✅ lint ✅ 0 errors |

### Issues (todos LOW — não bloqueantes)

1. **L1 — ux:** Sem validação `fromDate < toDate` — execução silenciosa se datas invertidas.
2. **L2 — ux:** `--to` não validado contra `isNaN`.
3. **L3 — code:** `ad_group_id` no metadata vs `adgroup_id` na API/webhook — inconsistência semântica.

## Definition of Done

- [ ] `scripts/meta-backfill-leads.ts` executa sem erros
- [ ] Dedup por `leadgen_id` funciona (idempotente)
- [ ] `--dry-run` não escreve nada no banco
- [ ] `MetaLeadRecord` exportado do shared
- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] @qa PASS
- [ ] @devops push realizado

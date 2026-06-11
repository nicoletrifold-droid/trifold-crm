# Story 46-3 — Cron de Abertura Redistribui Leads Represados da Roleta

## Metadata
- **Epic:** 46 — Roleta de Leads
- **Story:** 46-3
- **Status:** Done (QA PASS — aguardando @devops push)
- **Validated:** 2026-06-10 by @po (Pax) — GO (9/10)
- **Priority:** P1 — leads noturnos/fora-de-horário ficam sem corretor até intervenção manual
- **Complexity:** M (4-6h)
- **Created:** 2026-06-10
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[type-check, lint, smoke_cron_redistribute]`
- **Autossuficiente:** não — requer Story 46-1 Done (já está); Story 46-2 recomendada antes (reduz
  volume de leads represados ao abrir o expediente)

---

## User Story

**Como** administrador da construtora,
**Quero** que leads que chegaram fora do horário comercial sejam distribuídos automaticamente assim que
o expediente abre,
**Para que** nenhum lead fique sem corretor simplesmente por ter chegado à noite ou no final de semana.

---

## Context

A roleta (Story 46-1) verifica horário comercial antes de distribuir. Se o lead chega fora do horário
(`is_active` na `roleta_config`), `distributor.ts` registra `status = 'fora_horario'` em
`lead_distribution_log` e retorna sem atribuir corretor. Esse comportamento é correto.

O problema: **não existe nenhum mecanismo que reprocesse esses leads quando o expediente abre**.
Diagnóstico confirmado em 2026-06-10: sem cron de redistribuição em nenhuma branch do repositório;
`packages/web/vercel.json` não tem entrada para roleta.

### Solução: cron `GET /api/cron/roleta-redistribute`

Um novo endpoint de cron que, quando executado na abertura do expediente:
1. Busca leads `is_active = true`, `assigned_broker_id IS NULL` no stage "Aguardando atendimento"
   (default stage, `is_default = true`, ID semântico `00000000-0000-0000-0001-000000000001`)
2. Para cada lead elegível, chama `distributeLeadToNextBroker(leadId, orgId)`
3. Como o cron roda às 8h BRT (dentro da janela `08:00–20:00`), a verificação de horário dentro
   do `distributor.ts` passa normalmente. Toda a lógica de filtros, round-robin, notificações e
   logs é herdada gratuitamente.

### Agendamento Vercel Cron — gotcha UTC CRÍTICO

Vercel Cron usa **UTC** nas expressões cron. São Paulo é UTC-3 (horário padrão) ou UTC-2 (horário de
verão). Para garantir que o cron rode às **8h de São Paulo em horário padrão**:

```
0 11 * * *   ← 11h UTC = 8h SP (UTC-3)
```

**Evitar** o erro do `keep-alive` atual (`0 8 * * *` = 5h SP). Documentado aqui para o @dev não
repetir o mesmo equívoco.

Durante horário de verão (out–fev aproximadamente), o cron rodaria às 9h SP. Aceitável — o expediente
ainda estaria aberto e os leads seriam distribuídos.

### Padrão de referência: `GET /api/cron/followup`

O cron de follow-up (`packages/web/src/app/api/cron/followup/route.ts`) é a referência de
implementação para:
- Autenticação via `CRON_SECRET` (linhas 9–10, 128–135) — fail-closed
- Uso de `createAdminClient()` (linha 138)
- Estrutura `GET(request: NextRequest)` (Vercel Cron envia GET)
- Iteração por lead com try/catch individual (best-effort por lead)
- Retorno de JSON com contadores

### Stages a excluir (CRÍTICO)

Os seguintes stages contêm leads históricos/importados que NÃO devem ser redistribuídos:

| Stage | UUID | Motivo |
|-------|------|--------|
| "Corretores Antigos" | `62075f72-...` (ver nota abaixo) | ~195 leads históricos, import |
| "Ação Muffato" | `dab590c7-...` (ver nota abaixo) | ~109 leads de campanha pontual |

[AUTO-DECISION] Os UUIDs exatos desses stages devem ser verificados no banco em produção antes da
implementação. Decisão de usar o critério `is_default = true` para identificar o stage elegível
(ao invés de hardcodar UUIDs) + filtragem por slug `novo` como fallback. O @dev deve rodar:
```sql
SELECT id, name, slug, is_default FROM kanban_stages WHERE org_id = '<org_id>' ORDER BY position;
```
e documentar o resultado no Dev Agent Record. A lógica de filtro deve ser: buscar leads APENAS no
stage com `is_default = true` (ou slug `novo`). Isso exclui automaticamente todos os stages
históricos/de-campanha sem precisar hardcodar IDs no código.

Alternativa defensiva: buscar pelo stage_id que o webhook do Meta usa como `defaultStageId`
(`getDefaultStageId` em `meta-ads/route.ts:378–397`) — esse é o mesmo stage onde leads novos
entram. Leads dos stages "Corretores Antigos" e "Ação Muffato" nunca estarão no default stage.

### Limite de segurança

Para evitar timeout (Vercel tem limite de 60s por execução para crons em planos gratuitos/pro):
processar no máximo **50 leads por execução**. Leads além desse limite serão processados na
execução seguinte do dia. Documentar esse comportamento no log de retorno.

### Multi-org

Seguir o padrão do followup cron: iterar por `org_id` único dos leads elegíveis. Na prática, a
instância atual tem uma única org (resolvida via `whatsapp_config.status = 'active'`), mas o
cron deve ser robusto para multi-org.

[AUTO-DECISION] Usar a query de leads diretamente para derivar `org_id` dos resultados, sem
query separada de orgs. Isso simplifica a implementação e é compatível com o padrão existente.

---

## Acceptance Criteria

- [x] **AC1:** `GET /api/cron/roleta-redistribute` sem o header `Authorization: Bearer <CRON_SECRET>` → retorna 401 (e 503 se `CRON_SECRET` não estiver configurado — fail-closed igual ao followup). Com header correto → processa leads. _(testes AC1 401/503)_
- [x] **AC2:** Lead com `is_active = true`, `assigned_broker_id IS NULL`, no stage default **da sua org** (o mesmo stage resolvido por `getDefaultStageId` — `is_default = true` escopado por `org_id`, ID semântico `00000000-0000-0000-0001-000000000001` / slug `novo` na org atual) → `distributeLeadToNextBroker(leadId, orgId)` é chamado. Após execução do cron, lead tem `assigned_broker_id` preenchido e `lead_distribution_log` tem registro `status = 'distributed'`. _(teste AC2)_
- [x] **AC3:** Lead nos stages "Corretores Antigos" (`62075f72-...`) ou "Ação Muffato" (`dab590c7-...`) — que NÃO são o stage default da org — → NÃO é processado pelo cron (o filtro restringe ao `stage_id` default da org). Verificar que esses leads permanecem com `assigned_broker_id = NULL` após a execução. _(teste AC3 — usa stage ids fictícios prefixados `62075f72-`/`dab590c7-`)_
- [x] **AC4:** Lead com `assigned_broker_id` já preenchido → NÃO é reprocessado. A query filtra explicitamente `assigned_broker_id IS NULL`. _(teste AC4)_
- [x] **AC5:** Falha em `distributeLeadToNextBroker` para UM lead (mock) → erro é logado via `console.error`, cron continua processando os demais. O endpoint retorna 200 com contadores parciais. _(teste AC5)_
- [x] **AC6:** Cron retorna JSON `{ processed: N, distributed: M, failed: K, limited: bool }` onde `limited: true` indica que havia mais de 50 leads elegíveis (limite de segurança atingido). _(teste AC6)_
- [x] **AC7:** `packages/web/vercel.json` tem nova entrada `{ "path": "/api/cron/roleta-redistribute", "schedule": "0 11 * * *" }` (11h UTC = 8h São Paulo UTC-3).
- [x] **AC8:** `pnpm --filter @trifold/web type-check` passa com 0 erros. ESLint nos arquivos novos/modificados passa com 0 erros/warnings.

---

## Tasks / Subtasks

- [x] **T1 — Pre-Flight: confirmar stage elegível e CRON_SECRET**
  - Verificar que `CRON_SECRET` está configurado na Vercel (deve estar — usado pelo followup cron)
  - Confirmar o UUID do stage `is_default = true` da org (deve ser `00000000-0000-0000-0001-000000000001` ou o primeiro stage por posição)
  - Verificar que os stages "Corretores Antigos" e "Ação Muffato" NÃO têm `is_default = true`
  - Documentar resultado no Dev Agent Record

- [x] **T2 — Criar o endpoint de cron**
  - Criar `packages/web/src/app/api/cron/roleta-redistribute/route.ts`
  - Estrutura: `export async function GET(request: NextRequest)` (padrão Vercel Cron)
  - Auth: `CRON_SECRET` via `Authorization: Bearer` — fail-closed (igual ao followup, linhas 128–135)
  - `createAdminClient()` para queries (não RLS, igual ao followup)

- [x] **T3 — Implementar a query de leads elegíveis**
  - Buscar leads: `is_active = true`, `assigned_broker_id IS NULL`
  - Resolver o stage default **POR ORG** (CRÍTICO — `is_default` NÃO é único globalmente; cada org tem seu próprio default stage, sem unique constraint). Reutilizar EXATAMENTE a mesma estratégia de `getDefaultStageId` em `meta-ads/route.ts:378-397`, que escopa por `org_id`:
    ```ts
    // Para cada org elegível, resolver o stage default DAQUELA org:
    const { data: defaultStage } = await supabase
      .from("kanban_stages")
      .select("id")
      .eq("org_id", orgId)        // OBRIGATÓRIO — is_default é por-org
      .eq("is_default", true)
      .maybeSingle()              // .maybeSingle() — nunca .single() (lança em 0/N rows)

    // Fallback (igual getDefaultStageId): primeiro stage por position se is_default vier vazio.
    ```
  - **Recomendação de reuso (REUSE > CREATE):** extrair/reaproveitar a lógica de `getDefaultStageId`
    em vez de duplicar a query — garante consistência com onde os leads do Meta realmente entram.
  - Aplicar `.limit(50)` (limite de segurança — AC6)
  - Incluir `org_id` no select (necessário para `distributeLeadToNextBroker`)

- [x] **T4 — Iterar e redistribuir**
  - Para cada lead elegível, chamar `distributeLeadToNextBroker(lead.id, lead.org_id)`
  - Envolver em try/catch individual (best-effort por lead — AC5):
    ```ts
    for (const lead of leads) {
      try {
        const result = await distributeLeadToNextBroker(lead.id, lead.org_id)
        if (result.status === "distributed") distributed++
      } catch (err) {
        console.error("[roleta-redistribute] lead", lead.id, "error:", err)
        failed++
      }
    }
    ```
  - Contar: `distributed`, `failed`, `limited` (se o query retornou exatamente 50, pode haver mais)

- [x] **T5 — Adicionar entrada no vercel.json**
  - Editar `packages/web/vercel.json`
  - Adicionar ao array `"crons"`:
    ```json
    {
      "path": "/api/cron/roleta-redistribute",
      "schedule": "0 11 * * *"
    }
    ```
  - **ATENÇÃO UTC:** `0 11 * * *` = 11h UTC = 8h São Paulo (UTC-3, horário padrão)
  - Preservar todas as entradas existentes do array (18 entradas atuais)

- [x] **T6 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → 0 erros
  - ESLint nos arquivos novos/modificados → 0 erros / 0 warnings
  - Smoke manual: chamar `GET /api/cron/roleta-redistribute` com `Authorization: Bearer <CRON_SECRET>`
    e confirmar que leads elegíveis são distribuídos; chamar sem header → 401

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/api/cron/roleta-redistribute/route.ts  ← CRIAR (T2, T3, T4)
packages/web/vercel.json                                     ← EDITAR (T5)
packages/web/src/lib/roleta/distributor.ts                   ← REUSE (não modificar)
packages/web/src/app/api/cron/followup/route.ts              ← REFERÊNCIA (padrão auth + estrutura)
packages/web/src/app/api/webhooks/meta-ads/route.ts          ← REFERÊNCIA (getDefaultStageId)
```

### Padrão de autenticação (followup/route.ts linhas 9-10, 128-135)
```ts
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not configured — endpoint blocked")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ... processamento
}
```

### Gotcha: Vercel Cron usa UTC
| Horário São Paulo | UTC | Expressão cron |
|-------------------|-----|----------------|
| 8h SP (padrão UTC-3) | 11h UTC | `0 11 * * *` |
| 8h SP (verão UTC-2) | 10h UTC | `0 10 * * *` |

Usar `0 11 * * *`. Em horário de verão o cron dispara às 9h SP — ainda dentro do expediente.

**Erros reais no projeto:**
- `keep-alive`: `0 8 * * *` = 5h SP (está incorreto para 8h SP)
- `email-automations` e `meta-ads-intelligence`: `0 11 * * *` = 8h SP ← CORRETO, usar este padrão

### `.maybeSingle()` — nunca `.single()`
O padrão do projeto: `.single()` lança exceção em 0 rows; `.maybeSingle()` retorna null. Sempre
usar `.maybeSingle()` em queries que podem retornar 0 resultados (padrão estabelecido em Story 21.1).

### Import de `distributeLeadToNextBroker`
```ts
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
```
O `distributor.ts` tem `import "server-only"` (linha 1) — válido em API Route server-side.

### Stage filter — abordagem recomendada
Buscar o stage com `is_default = true` da org para filtrar leads elegíveis. Isso é mais robusto que
hardcodar UUIDs e automaticamente exclui stages históricos/campanha.

Fallback: se `is_default` não retornar resultado, usar o stage de menor `position` (igual ao
`getDefaultStageId` no meta webhook). Documentar se isso ocorrer.

### Idempotência do cron
O filtro `assigned_broker_id IS NULL` garante idempotência natural: leads já distribuídos não são
reprocessados. Se o cron rodar duas vezes no mesmo dia (cenário de falha/retry), o segundo run
encontrará menos leads elegíveis (ou nenhum).

### Limite de segurança (50 leads)
Vercel Pro: timeout de 60s para cron functions. `distributeLeadToNextBroker` faz ~3-5 queries +
notificações; estimar ~500ms por lead. 50 leads = ~25s. Margem segura.

Se `leads.length === 50`, informar `limited: true` no response para alertar o admin de que há
potencialmente mais leads aguardando (serão processados no dia seguinte).

### Sem migration necessária
Esta story é puro TypeScript + config Vercel — sem DDL, sem migration. O endpoint usa tabelas
existentes (`leads`, `kanban_stages`, `lead_distribution_log`) via `distributeLeadToNextBroker`.

---

## File List

### Criados
- `packages/web/src/app/api/cron/roleta-redistribute/route.ts` — endpoint de cron: auth fail-closed + resolução de stage default por org + query de leads elegíveis + loop best-effort de redistribuição
- `packages/web/src/app/api/cron/roleta-redistribute/__tests__/route.test.ts` — testes Vitest (AC1–AC6 + caso vazio): 8/8

### Modificados
- `packages/web/vercel.json` — entrada `roleta-redistribute` com schedule `0 11 * * *` (11h UTC = 8h SP)

### Referência (não modificar)
- `packages/web/src/lib/roleta/distributor.ts` — engine da roleta (REUSE)
- `packages/web/src/app/api/cron/followup/route.ts:9-10,128-135` — padrão de auth CRON_SECRET
- `packages/web/src/app/api/webhooks/meta-ads/route.ts:378-397` — `getDefaultStageId` (estratégia replicada com `.maybeSingle()`)

---

## Dev Agent Record

### Agent Model Used
Dex (Builder) — @dev / Claude Opus 4.8 (1M context)

### Pre-Flight (T1) — resultado documentado
- **CRON_SECRET:** já em uso pelo cron de followup (`followup/route.ts:9,130-135`) — padrão de auth copiado verbatim (503 se não configurado, 401 se Bearer inválido). Lido em module-scope (`const CRON_SECRET = process.env.CRON_SECRET`).
- **Stage default (org Trifold `00000000-...-0001`):** "Aguardando atendimento", `is_default = true` (conforme story). O endpoint NÃO hardcoda UUID — resolve dinamicamente via `is_default = true` escopado por `org_id`, com fallback ao primeiro stage por `position`.
- **Stages a excluir:** "Corretores Antigos" (`62075f72-1629-4d8b-a019-0fcb35e3d302`) e "Ação Muffato" (`dab590c7-ffc5-4086-be9a-4914f94fa3ba`) — ambos `is_default = false`, portanto automaticamente excluídos pelo filtro `stage_id = <default da org>`. Os UUIDs estão documentados aqui; o código não os referencia (filtro por stage default é mais robusto).
- **Schedule UTC:** `0 11 * * *` = 11h UTC = 8h São Paulo (UTC-3). Confirmado contra `email-automations`/`meta-ads-intelligence` (mesmo `0 11`). NÃO usado `0 8` (= 5h SP, erro do `keep-alive`).

### Implementation Notes (IDS: REUSE > ADAPT > CREATE)
- **REUSE** `distributeLeadToNextBroker` — herda horário/round-robin/limites/notificação/log. Como o cron roda 8h (dentro de 08–20h), a verificação de horário interna passa.
- **ADAPT** da estratégia de `getDefaultStageId` (meta-ads/route.ts): mesma lógica (is_default por org + fallback por position), mas trocando `.single()` por `.maybeSingle()` por segurança multi-org (`.single()` lança em 0 rows; `is_default` não tem unique constraint global). Função local `resolveDefaultStageId` para não importar um helper privado de outra rota.
- **ADAPT** do padrão de auth fail-closed do followup cron.
- **CREATE** o endpoint + teste co-localizado (necessários; novo caminho de cron sem equivalente existente).

### Multi-org
Itera pelas orgs com `roleta_config.is_active = true` (deduplicadas), resolve o stage default de cada org e filtra leads escopados por `org_id` + `stage_id`. Limite `.limit(50)` por org; `limited = true` quando uma org retorna exatamente 50.

### Validation Output
- `pnpm --filter @trifold/web type-check` → 0 erros
- ESLint nos arquivos novos → 0 erros, 0 warnings
- Vitest (cron route.test.ts) → 8/8 passed (AC1 401/503, AC2 distribui, AC3 stages históricos excluídos, AC4 IS NULL, AC5 best-effort, AC6 limited, caso vazio)

### Completion Notes
- Idempotência natural via filtro `assigned_broker_id IS NULL`: reexecução não reprocessa leads já distribuídos.
- Out of scope respeitado: sem UI, sem notificação ao admin, sem redistribuição intra-dia.
- Pré-existente, fora do escopo: `whatsapp/__tests__/route.test.ts` falha em isolamento (alias `@web` não resolvido no `vitest.config.ts`); não tocado por esta story.

---

## Testing

### Framework
Vitest (unit) + smoke manual (E2E)

### Cenários obrigatórios
1. **Sem CRON_SECRET no header** → 401 (fail-closed)
2. **Lead elegível (is_active, assigned_broker_id NULL, default stage)** → distribuído → `assigned_broker_id` preenchido
3. **Lead com corretor já atribuído** → NOT processado (filtro IS NULL)
4. **Lead em stage histórico ("Corretores Antigos", "Ação Muffato")** → NOT processado (fora do default stage)
5. **`distributeLeadToNextBroker` lança exceção** → erro logado, cron continua, retorna 200 com `failed: 1`
6. **50+ leads elegíveis** → processa os primeiros 50, retorna `limited: true`
7. **Sem leads elegíveis** → retorna `{ processed: 0, distributed: 0, failed: 0, limited: false }`

### Smoke pós-deploy
- Verificar que `vercel.json` tem a nova entrada (visível no deploy summary)
- Chamar `GET /api/cron/roleta-redistribute` manualmente com `Authorization: Bearer <CRON_SECRET>`
- Confirmar JSON de retorno com contadores
- Confirmar que leads `channel = 'meta_ads'` com `assigned_broker_id = NULL` no default stage são distribuídos
- Confirmar que leads nos stages "Corretores Antigos" e "Ação Muffato" NÃO são tocados
- Próximo dia útil: verificar que o cron disparou automaticamente às 8h SP via Vercel Cron dashboard

---

## Out of Scope

- Leads fora do horário que chegam por WhatsApp (cobertos pela roleta normal após 46-2)
- Redistribuição ao longo do dia (ex.: a cada hora) → esta story só cobre a abertura do expediente
- UI de status do cron no `/dashboard/roleta` → extensão futura
- Notificação ao admin sobre leads represados redistribuídos → extensão futura

---

## Definition of Done

- [ ] AC1–AC8 implementados e verificados
- [ ] T1–T6 marcados como done
- [ ] T1 (Pre-Flight) resultado documentado no Dev Agent Record
- [ ] @qa executou quality gate com verdict >= PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-10 | 0.1 | Story drafted — furo de cobertura: leads fora-de-horário sem redistribuição | @sm (River) |
| 2026-06-10 | 0.2 | Validada (GO 9/10). Fixes: stage lookup agora escopado por `org_id` (is_default NÃO é único global — sem unique constraint, é por-org); AC1 corrigido (`GET`, não `POST`) + 503 fail-closed; AC2/AC3 referenciam o stage default da org via `getDefaultStageId` (não `is_default=true` solto); recomendação de REUSE de `getDefaultStageId`. Schedule UTC `0 11` confirmado correto. Status Draft→Ready. | @po (Pax) |
| 2026-06-10 | 0.3 | Implementada. Endpoint `GET /api/cron/roleta-redistribute` (auth fail-closed, stage default por org via `.maybeSingle()`, loop best-effort, limite 50) + entrada `0 11 * * *` no vercel.json. Testes AC1–AC6 (8/8). type-check 0 erros, lint 0/0. Status Ready→Ready for Review. | @dev (Dex) |

---

## QA Results

### Gate Decision: PASS — Quinn (@qa), 2026-06-11

**Gate file:** `docs/qa/gates/46.3-cron-redistribuir-leads-fora-horario.yml` | **Quality score:** 95/100 | **Iteration:** 1

Os 7 quality checks passam. 8/8 ACs atendidos por código com evidência path:linha; 8/8 testes verdes.

**Pontos críticos verificados diretamente no código:**
- **Schedule UTC correto:** `vercel.json:96-97` = `"0 11 * * *"` (11h UTC = 8h SP UTC-3). Igual a `email-automations`/`meta-ads-intelligence`; NÃO `"0 8"` (erro do `keep-alive` = 5h SP). As 18 entradas existentes preservadas.
- **Auth CRON_SECRET fail-closed:** 503 sem secret (`route.ts:61-64`, antes de qualquer query), 401 Bearer inválido (`:65-67`) — cópia verbatim do followup cron.
- **Filtro multi-org seguro:** `resolveDefaultStageId` por org via `.maybeSingle()` escopado por `org_id` (`:24-47`); filtro de leads `org_id` + `is_active` + `assigned_broker_id IS NULL` + `stage_id` default (`:102-109`). Stages "Corretores Antigos" (`62075f72-`) e "Ação Muffato" (`dab590c7-`) excluídos por construção (não são `is_default`).
- **Idempotência:** `.is("assigned_broker_id", null)` (`:107`).
- **Limite/timeout:** `.limit(50)` por org (`:109`) + flag `limited` (`:119`) + `maxDuration=60`. REUSE total de `distributor.ts` (não tocado).

| AC | Status | Evidência |
|----|--------|-----------|
| AC1 | Met | `route.ts:61-64` (503) + `:65-67` (401); testes `:133-140` e `:142-147` |
| AC2 | Met | stage default por org `:24-47` + filtro `:102-109` + chamada `:124-127`; teste `:149-166` |
| AC3 | Met | filtro `.eq("stage_id", stageId default)` `:108`; teste `:168-180` (ids fictícios, not.called) |
| AC4 | Met | `.is("assigned_broker_id", null)` `:107`; teste `:182-194` |
| AC5 | Met | try/catch por lead `:123-132`; teste `:196-212` (distributed:1/failed:1) |
| AC6 | Met | `if (leads.length === 50) limited = true` `:119`; teste `:214-231` (60 leads → 50 + limited) |
| AC7 | Met | `vercel.json:95-98` `"0 11 * * *"` (8h SP), 18 entradas preservadas |
| AC8 | Met | type-check 0 erros + ESLint exit 0 (verificação independente) |

**Validação independente:** `pnpm --filter @trifold/web type-check` → 0 erros. ESLint (route.ts + test) → exit 0. `npx vitest run .../roleta-redistribute/` → 8/8 passed. git diff: `vercel.json` +4 linhas (um cron); `roleta-redistribute/` novo; nenhum outro arquivo tocado; `distributor.ts` intocado.

**Findings (não-bloqueantes):** PERF-001 (LOW, limite `.limit(50)` é por-org e `limited` é global; em multi-org de alto volume poderia aproximar do timeout — não aplicável hoje, 1 org), TEST-001 (LOW, testes via mock; integração real depende do alias `@web/*` herdado), OBS-001 (LOW, CodeRabbit não rodou — host darwin/config WSL).

**Regressão:** As 6 falhas pré-existentes de `webhook/whatsapp/__tests__/route.test.ts` (alias `@web/*`, Story 21.1) permanecem IDÊNTICAS — `vitest.config.ts` não tocado. NÃO introduzido por esta story. Nenhum cron existente alterado.

**Recomendação de status:** PASS → aprovado para @devops *push. Smoke pós-deploy: GET com `Authorization: Bearer <CRON_SECRET>` → confirmar contadores; sem header → 401; confirmar entrada no Vercel Cron dashboard e disparo automático às 8h SP no próximo dia útil.

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation will use manual review process only.

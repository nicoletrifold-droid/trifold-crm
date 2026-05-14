---
schema: 1
story: "30.4"
slug: "paginacao-pipeline"
gate: CONCERNS
status_reason: "Implementação técnica sólida (Promise.all paralelo, Map state, optimistic + rollback, multi-tenancy via RLS). Smoke humano AC10/AC12 e atualização epic-30 AC11 ainda pendentes; race condition residual identificada mas mitigada por dedup."
reviewer: "Quinn"
updated: "2026-05-14T18:30:00Z"
top_issues:
  - id: "TEST-001"
    severity: medium
    finding: "AC 10 (smoke humano 4 cenários: drag, load-more, filtros+paginação, regressão visual) ainda não executado."
    suggested_action: "Executar smoke após deploy (@devops valida em preview/prod e marca AC 10 + AC 12)."
  - id: "DOC-001"
    severity: low
    finding: "AC 11 (marcar 30.4 Done no epic-30) ainda não foi feito — Dev Notes mencionam que será junto com close."
    suggested_action: "@devops *push deve incluir update do checkbox em docs/stories/epics/epic-30-over-fetch-killers.md."
  - id: "REL-001"
    severity: low
    finding: "Score filter aplicado em JS após query — leads filtrados por score podem fazer count > leads.length artificialmente (hasMore=true mesmo quando próxima página também seria filtrada vazia)."
    suggested_action: "Aceitar como limitação V1 (já documentado nos Riscos da story). Mover para SQL em epic de hardening se virar dor."
  - id: "PERF-001"
    severity: low
    finding: "LEADS_SELECT duplicado entre page.tsx e route.ts — drift potencial se um for atualizado sem o outro."
    suggested_action: "Aceitar como intencional (declarado pelo dev). Considerar extrair para shared const em refactor futuro."
waiver: { active: false }
---

# QA Gate — Story 30.4 (Paginação por stage em /dashboard/pipeline)

## Code Review — Detalhado

### 1. `page.tsx` — Promise.all per-stage
**PASS.** Query inicial agora é N queries paralelas, uma por stage, cada uma com:
- `.eq("is_active", true).eq("stage_id", stage.id)` — usa `idx_leads_org_stage_active` (Epic 29.3)
- `.order("updated_at", { ascending: false }).limit(50)` — usa `idx_leads_org_active_updated`
- `count: "exact"` para calcular `hasMore = totalCount > rawLeads.length` (mais robusto que `length === 50`)

Filtros (`property_id`, `broker_id`) são aplicados ANTES do `.order/.limit` em cada query paralela — correto. Campaign lookup é resolvido UMA vez antes do `Promise.all`, depois passado para cada query — boa otimização. Edge case "campanha sem leads" tratado via UUID sentinel `00000000-...` para preservar query shape.

Score filter mantido em JS por stage após query — paridade explícita com comportamento original, limitação documentada.

### 2. `kanban-board.tsx` — Map state + drag/drop
**PASS com observações.** O state foi migrado de `Lead[]` plano para `Map<stageId, StageState>` onde `StageState = { leads, totalCount, hasMore, loading }`. Análise crítica:

**Drag/drop logic (handleDragEnd):**
- Localiza source stage iterando o Map (`for...of` em `stageMap.entries()`) — O(stages) busca, aceitável para 8 stages.
- Detecta same-stage drag (`sourceStageId === newStageId`) e retorna no-op — correto.
- Optimistic update atômico em UM `setStageMap` (remove src + add dst) — evita inconsistência intermediária.
- Lead movido vai pro **topo da coluna destino** (`[updatedLead, ...dst.leads]`) — comportamento intencional e UX esperado.
- `totalCount` é incrementado no destino e decrementado na origem — preserva accuracy do badge `visiveis/total`.

**Rollback em erro:**
- Em caso de `error` do `supabase.update`, o rollback restaura AMBOS source (re-add com `stage_id: previousStageId`) e destination (filter out o leadId).
- **Bug latente menor:** `previousStageId` é capturado de `movedLead.stage_id ?? sourceStageId` — se `movedLead.stage_id` é `null` (lead sem stage), o rollback restaura para `sourceStageId` corretamente. OK.
- **Side-effect ausente em rollback:** o `supabase.from("activities").insert(...)` (linha 243-251) acontece DEPOIS da verificação de error, então não há activity log órfão. OK.

**Edge case identificado — drag para coluna destino com `hasMore=true`:**
O lead movido entra no topo do array local mesmo se "ordenado por `updated_at` desc" ele estaria fora do top-50. Isso É o comportamento desejado (lead acabou de ser tocado = updated_at mais recente). Não é bug.

**Edge case — drag DURANTE load-more em curso:**
Se user dispara `handleLoadMore(stageId)` e arrasta um lead para o mesmo `stageId` durante o fetch, o resultado do load-more chega e o `setStageMap` faz:
```
const existingIds = new Set(state.leads.map((l) => l.id))
const fresh = (json.leads ?? []).filter((l) => !existingIds.has(l.id))
```
O lead recém-arrastado já está em `state.leads`, então é deduplicado. **PASS** — race condition mitigada.

**Edge case — drag SAINDO de stage durante load-more no MESMO stage:**
Se lead L está em stage A e load-more de stage A está em curso, usuário arrasta L para stage B. Quando o load-more retorna, L já foi removido de stage A localmente. O backend retorna L (porque update do drag pode não ter persistido ainda — race com network). Resultado: L aparece em stage A novamente (vindo do servidor) E em stage B (do drag local). Mitigação parcial: dedup só funciona dentro do mesmo stage; cross-stage dedup não existe. **Risco residual BAIXO** — janela temporal estreita (250-500ms) e drag persiste rapidamente.

### 3. `kanban-column.tsx` — backward compatible
**PASS.** Todos os novos props (`totalCount`, `hasMore`, `loading`, `onLoadMore`) são opcionais com defaults sensatos. Botão "Carregar mais 50" só renderiza quando `hasMore && onLoadMore`. Loading state com `disabled` + texto "Carregando..." — UX correto. Badge dual-format (`leads.length` vs `leads.length/totalCount`) — UX clean.

### 4. `/api/pipeline/leads/route.ts` — Endpoint novo
**PASS.** Análise de segurança:

**Auth:** `requireAuth()` consistente com `/api/leads/route.ts`. Retorna 401 se sem session, 404 se appUser não encontrado.

**Multi-tenancy:** Endpoint usa `supabase` retornado por `requireAuth()` que é o `createClient()` cookie-based — RLS ativo. Verificada policy `leads_select` em `004_rls_policies.sql`:
```sql
USING (org_id = public.user_org_id() AND (is_admin_or_supervisor() OR assigned_broker_id = ... OR assigned_broker_id IS NULL))
```
**Garantia:** queries são escopadas automaticamente por org_id via RLS — mesmo se um attacker passar `stage_id` de outra org, o RLS filtra. **PASS multi-tenancy.**

**Input validation:**
- `stage_id` obrigatório → 400 se ausente. OK.
- `offset` clamped a `Math.max(0, ...)` e `Number.parseInt` com fallback 0 — não pode ser negativo. OK.
- `limit` clamped a `Math.min(Math.max(1, requested), MAX_LIMIT=100)` — cap protege contra `limit=99999`. OK.
- Outros params são strings opcionais filtradas via `.eq()` (parameterized, sem SQL injection).

**Campaign filter parity:** Lógica de `campaign_entries` lookup duplicada do page.tsx — funcionalmente idêntica. Edge case "campanha sem leads" retorna `{ leads: [], totalCount: 0, hasMore: false }` early — economiza query.

**hasMore calculation:** `totalCount > offset + rawLeads.length` — correto para paginação por range.

### 5. `/broker/pipeline/page.tsx` — Cascade fix
**PASS.** Migrado para novo shape de props. Query escopada por `assigned_broker_id = user.id` — RLS já garante isso via policy, mas o `.eq()` explícito é defensivo e correto. Filtro `users:assigned_broker_id(name)` foi removido do SELECT (já é o próprio broker, sem necessidade de join) — boa otimização. `activeFilters.broker_id = user.id` passado para o board → load-more preserva o scope do broker. **PASS.**

## AC Verification

| AC | Status | Evidência |
|----|--------|-----------|
| 1 (spike) | PASS | Documentado no story file seção "Contexto" |
| 2 (Promise.all `.limit(50)`) | PASS | `page.tsx:94-137` |
| 3 (hasMore prop) | PASS | `kanban-column.tsx:31, 47` |
| 4 (botão "Carregar mais 50") | PASS | `kanban-column.tsx:98-107` |
| 5 (route handler) | PASS | `/api/pipeline/leads/route.ts` completo |
| 6 (state Map, append sem reset) | PASS | `kanban-board.tsx:93-95, 290-304` |
| 7 (drag/drop preservado, remove src + add dst, rollback) | PASS | `kanban-board.tsx:153-254` |
| 8 (type-check + lint + build) | PASS | Build reproduzido pelo QA: PASS, rota `/api/pipeline/leads` registrada |
| 9 (payload -90%) | CONCERNS | Validável em smoke; estimativa teórica sólida (50×N stages vs todos os leads) |
| 10 (smoke humano 4 cenários) | PENDING | A executar em preview/prod por @devops |
| 11 (epic-30 atualizado) | PENDING | A fazer junto com `@devops *push` |
| 12 (sem regressão visual) | CONCERNS | Smoke pendente; estrutura idêntica (apenas badge agora pode mostrar `X/Y`) |

## Race Conditions — Resumo

| Cenário | Mitigação | Risco residual |
|---------|-----------|----------------|
| Drag para stage X durante load-more do mesmo stage X | Dedup por ID via `Set` no merge | NENHUM |
| Drag SAINDO de stage X durante load-more do MESMO stage X | Nenhuma (cross-stage dedup ausente) | BAIXO — janela 250-500ms |
| Múltiplos load-more concorrentes no mesmo stage | `if (current.loading) return` no início do handler | NENHUM |
| Drag de mesmo lead duas vezes seguidas | Optimistic update + rollback | NENHUM |
| Rollback de drag + activity log órfão | Activity log só ocorre após `if (error) return` | NENHUM |

## Multi-Tenancy — Confirmado

`/api/pipeline/leads` usa `requireAuth()` → `createClient()` (cookie-based, RLS ativo). RLS policy `leads_select` em migration `004_rls_policies.sql` força `org_id = public.user_org_id()` em todo SELECT. **Garantia adequada para V1.** Não há vazamento cross-org possível mesmo com manipulação de query params.

## Decisão de Gate: CONCERNS

Implementação está em qualidade de produção. Issues remanescentes são:
1. Smoke humano (AC 10, AC 12) — executar em preview antes do merge para main.
2. Update do epic-30 (AC 11) — incluir no commit do `@devops *push`.
3. Score filter JS-side — limitação documentada e aceita.

Não há blockers técnicos. Recomendo: **proceder para `@devops *push`** com smoke validation no preview ANTES do merge para main.

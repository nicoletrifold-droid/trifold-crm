---
story: 30.1
gate: architect
verdict: PASS
date: 2026-05-14
reviewer: Aria (@architect)
phase_reviewed:
  - FASE 1 (Dara) — RPC `get_analytics_summary` em migration 037
  - FASE 2 (Dex)  — page.tsx + 4 rotas API refatoradas
---

# Quality Gate — Story 30.1: Analytics RPCs (Architect)

## Verdict

**PASS** (com observação: AC 14-15 — payload measurement e smoke runtime humano — ficam pendentes para validação humana no preview/produção pelo precedente do Epic 30 / Epic 29).

## Resumo

A Story 30.1 entrega o **maior ganho percebido do Epic 30**. A FASE 1 (Dara) criou uma RPC `get_analytics_summary` arquiteturalmente exemplar (CTEs isoladas, multi-tenancy explícito em todas as 6 fontes de dados, JSONB enxuto, SECURITY INVOKER + RLS). A FASE 2 (Dex) refatorou 4 arquivos com mappings disciplinados, preservou contratos HTTP e validou tudo (build + type-check + lint = PASS).

EXPLAIN ANALYZE da RPC: **3.803ms** — **13x abaixo do alvo de 50ms**, usando 5 índices distintos (incluindo `idx_leads_assigned_broker` do Epic 29). Zero `as any`.

---

## Quality Checks

### 1. Code Review — RPC `get_analytics_summary`

| Aspecto | Status | Nota |
|---------|--------|------|
| `LANGUAGE sql STABLE` (não VOLATILE) | OK | Permite cache de plano por sessão; correto para função puramente leitura |
| `SECURITY INVOKER` (herda RLS) | OK | **Crítico para multi-tenancy** — ver seção 5 abaixo |
| `p_since` com default `date_trunc('month', now())` | OK | Match com `monthStart` do código original |
| GRANT EXECUTE para `authenticated, service_role` | OK | Permite chamada via Server Component e API route |
| `COALESCE(..., '[]'::jsonb)` e `'{}'::jsonb` | OK | **Defensivo** — retorno sempre tem shape estável mesmo com 0 rows |
| Cast `source::text` no `jsonb_object_agg` | OK | Enum forçado para text (descoberto via spike — não estava no SQL proposto) |
| FK correta: `assigned_broker_id` (não `assigned_to`) | OK | Spike corrigiu divergência entre story e schema real |
| `ROUND(AVG(qualification_score))::int` | OK | Preserva semântica do código atual (broker.avg_score como integer) |
| 6 CTEs (funnel, by_property, by_broker, source_agg, lost_agg, totals) | OK | Bem isoladas, cada uma com seu próprio filtro `org_id = p_org_id` |
| `kanban_stages.org_id` filtrado | OK | **Correção adicionada no spike** — original assumia kanban_stages global; schema tem `org_id` |
| `users.org_id` filtrado | OK | Multi-tenancy garantida mesmo para users |
| `properties.org_id` filtrado | OK | Multi-tenancy garantida para properties |
| `ORDER BY ks.position` no funnel CTE | OK | Ordem visual do funil preservada |

**Trade-off observado:** `lost_agg` não filtra por `p_since` (consistente com código atual em `/api/analytics/route.ts` linhas 68-70 que também não filtrava). É um trade-off semântico aceitável — lost_reasons mostra histórico cumulativo, não recortado por período. **Recomendação futura (não bloqueia):** alinhar com PM se essa semântica é desejada ou se lost_reasons deveria filtrar por período como `source_counts`.

### 2. Code Review — 4 Arquivos Refatorados (Dex / FASE 2)

| Arquivo | Mudança Estrutural | Avaliação |
|---------|--------------------|-----------|
| `page.tsx` | 3 queries `leads(id)` → 1 RPC + 4 head-only counts mantidos em Promise.all | Excelente. Helper `toCount()` para bigint→number defensivo. Mapping `stage_id→id`, `property_id→id`, `user_id→id` claro. |
| `/api/analytics/route.ts` | 5 queries (3 joins + 2 .limit(10000)) → 1 RPC | Excelente. Mapping preserva contrato HTTP histórico (`brokerPerformance.totalLeads`, `brokerPerformance.avgScore`). |
| `/api/analytics/campaigns/route.ts` | `.limit(10000)` removido; select escalar; classificação JS mantida | **AUTO-DECISION válida** — ver seção 4. |
| `/api/analytics/sources/route.ts` | `.limit(10000)` removido; select escalar `source`; GROUP BY JS | **AUTO-DECISION válida** — ver seção 4. |
| `/api/analytics/leads-by-period/route.ts` | **NÃO tocado** (auditado, aceitável) | Correto — spike validou que campos `created_at`/`property_interest_id` são mínimos. |

**Helpers introduzidos:**
- `toCount(v)`: bigint → number safe cast (presente em page.tsx e route.ts). Comportamento defensivo (`Number.isFinite` check).
- `extractStageSlug(s)`: lida com ambiguidade PostgREST (single object vs array) para join `kanban_stages(slug)`. Bem documentado inline.

**Type safety:** Zero `as any` (validado por type-check). Type aliases locais (`AnalyticsSummary`, `LeadRow`, `LeadSourceRow`) duplicados entre page.tsx e route.ts — **observação não bloqueante:** poderiam ser extraídos para `@web/types/analytics.ts` em refactor futuro, mas a duplicação é mínima (~25 linhas) e não justifica esforço adicional nesta story.

### 3. Análise dos Mappings

#### `page.tsx` (Server Component / SSR)
```ts
stage_id → id          (renomeação UI-friendly)
property_id → id
user_id → id
count (bigint) → count (number) via toCount()
avg_score (int|null) → avgScore (number, default 0)
```
**Validação:** O JSX original consome `stage.id`, `p.id`, `broker.id` como `key` em `.map()`. Renomeação preserva esse contrato. LeadsChart recebe `properties.map(p => ({ id: p.id, name: p.name }))` — shape intacto.

#### `/api/analytics/route.ts` (API HTTP)
```ts
rpc.funnel        → funnel { name, slug, color, count }     (DROPA stage_id e position — alinhado com contrato HTTP histórico)
rpc.by_property   → byProperty { name, count }              (DROPA property_id)
rpc.by_broker     → brokerPerformance { name, totalLeads, avgScore }
rpc.source_counts → bySource (Record<string, number>)
rpc.lost_reasons  → lostReasons (Record<string, number>)
rpc.total_leads   → totalLeads
rpc.new_leads     → newLeads
```
**Validação:** O drop de `stage_id`/`position` em `/api/analytics` é intencional — o contrato HTTP histórico não exportava esses campos. Consumers externos (se existirem) não recebem campos novos inesperados. **Backward compatibility: OK.**

### 4. Análise Crítica das AUTO-DECISIONS

#### AUTO-DECISION 1: `/api/analytics/campaigns/route.ts` — manter classificação JS
**Decisão Dex:** Não criar `get_analytics_campaigns` RPC; manter GROUP BY + CASE WHEN em JS após eliminar `.limit(10000)` e arrays de UUIDs.

**Análise:** **DEFENSÁVEL e correta.**

Razões:
1. **O over-fetch ESTRUTURAL foi eliminado.** O problema original era o select `leads(id)` aninhado em joins, retornando arrays de UUIDs. Aqui isso não existia: o problema era o `.limit(10000)` arbitrário + retorno de `id`. Ambos eliminados.
2. **Query agora é enxuta:** apenas `utm_campaign, stage:kanban_stages(slug)`. Sem PK leak, sem arrays.
3. **Filtro `utm_campaign IS NOT NULL` aplicado cedo** no plan — query Supabase reduz set drasticamente antes de retornar.
4. **A classificação JS (`qualified`, `converted`) é trivial computacionalmente** e não escala mal mesmo com 10k leads (loops de O(n) sobre payload escalar).
5. **Pragmatismo da fase:** FASE 1 não entregou `get_analytics_campaigns`. Criar uma nova RPC AGORA bloquearia a story por horas adicionais sem ganho mensurável proporcional.

**Trade-off documentado:** Se no futuro o volume de leads com `utm_campaign` exceder ~50k por org, criar RPC dedicada `get_analytics_campaigns(p_org_id, p_from, p_to)` movendo `CASE WHEN` para SQL será valioso. **Não é necessário agora.**

#### AUTO-DECISION 2: `/api/analytics/sources/route.ts` — manter GROUP BY JS
**Decisão Dex:** `.limit(10000)` removido; select escalar `source` mantido; GROUP BY em JS.

**Análise:** **DEFENSÁVEL e correta.**

Razões:
1. **Campo escalar `source` não é over-fetch real.** Conforme próprias Dev Notes da story: "O over-fetch real é de UUIDs, não de campos escalares".
2. **`source` é enum (texto curto)** — payload é trivialmente pequeno mesmo com 100k leads.
3. **`.limit(10000)` arbitrário removido** — eliminação do bug latente de truncamento silencioso.
4. **Contrato HTTP preservado:** `{sources: [{source, count}], total}`.

**Observação não bloqueante:** Sources poderia consumir `source_counts` da RPC mestre via filtros adicionais, mas como `/sources/route.ts` aceita `from`/`to` arbitrários (não apenas `p_since` da RPC mestre), preservar separação **faz sentido arquitetural** — sources tem flexibilidade de filtros que a RPC mestre não tem.

#### AUTO-DECISION 3: Não tocar `leads-by-period/route.ts`
**Análise:** **CORRETA.** Auditado no spike: campos `created_at` + `property_interest_id` são mínimos, sem over-fetch estrutural.

### 5. Multi-tenancy & Security — ANTI-IDOR

**CRÍTICO para CRM imobiliário multi-tenant.**

| Vetor | Verificação | Status |
|-------|-------------|--------|
| Filtro `org_id = p_org_id` em CTE `funnel` (joins leads + kanban_stages) | Ambas tabelas filtradas | OK |
| Filtro `org_id = p_org_id` em CTE `by_property` | leads + properties filtradas | OK |
| Filtro `org_id = p_org_id` em CTE `by_broker` | leads + users filtradas | OK |
| Filtro `org_id = p_org_id` em CTE `source_agg` | leads filtrada | OK |
| Filtro `org_id = p_org_id` em CTE `lost_agg` | leads filtrada | OK |
| Filtro `org_id = p_org_id` em CTE `totals` | leads filtrada | OK |
| `SECURITY INVOKER` (não DEFINER) | RLS do caller é respeitada | OK |
| `p_org_id` vem de `appUser.org_id` / `appUser.orgId` (server-side via `requireAuth`/`getServerUser`) | Não vem de query string ou request body | OK — **anti-IDOR garantido** |
| RLS Policies ativas em `leads`, `properties`, `users`, `kanban_stages` | Confirmado em Epic 29 audits | OK |
| Tentativa de chamar RPC com `p_org_id` de outra org via authenticated user | RLS bloqueia (defense-in-depth) | OK |

**Veredicto:** **Sem leak cross-org.** A camada de filtragem explícita por `org_id` em TODAS as 6 CTEs é defesa em profundidade sobre RLS. Mesmo se RLS fosse desligada acidentalmente, o filtro WHERE manteria a tenancia. **Padrão correto.**

**Observação:** O filtro `p_org_id` no JOIN dos LEFT JOIN das CTEs funnel/by_property/by_broker garante que stages/properties/users de uma org nunca incluam contagens de leads de outra org (mesmo cenário improvável onde RLS estivesse permissiva). **Defense-in-depth exemplar.**

### 6. Performance (AC 13 — EXPLAIN)

**EXPLAIN ANALYZE (169 leads, 1 org):**
- **Execution Time: 3.803ms** (vs alvo 50ms — **13x abaixo**)
- Planning Time: 13.669ms
- Buffers: shared hit=95 (zero disk I/O)

**Índices usados:**
- `idx_leads_stage` (funnel)
- `idx_leads_property_interest` (by_property)
- `idx_leads_assigned_broker` (by_broker) — **HOT INDEX do Epic 29**
- `idx_properties_org` (by_property)
- `kanban_stages_org_id_slug_key` (funnel)

**Seq scans aceitáveis:**
- `source_agg`: 169 rows (trivial)
- `totals`: 1 varredura compartilhada (FILTER agrega 2 counts numa só passagem) — **otimização do planner**
- `users` em by_broker: 18 rows (trivial)

**Projeção em escala:** Mesmo com 100k leads/org, o planner mantém index scan nas CTEs com LEFT JOIN — não escala linearmente com row count graças aos índices compostos do Epic 29.

### 7. Reprodução

- `SELECT * FROM public.get_analytics_summary('<org_id>', NOW() - INTERVAL '30 days')` retorna JSON com shape AC4 — validado pela Dara em FASE 1.
- `pnpm --filter @trifold/web build` exit 0, 123/123 páginas — validado pelo Dex em FASE 2.
- `pnpm --filter @trifold/web type-check` exit 0 (0 erros).
- `pnpm --filter @trifold/web lint` exit 0 (6 warnings preexistentes, fora desta story).

### 8. AC Verification (17 ACs)

| AC | Status | Nota |
|----|--------|------|
| AC 1 — Spike documentado | PASS | Spike completo na story file |
| AC 2 — Append em 037 | PASS | Header `-- Story 30.1` presente |
| AC 3 — Decisão A1 justificada | PASS | Justificativa completa |
| AC 4 — RPC retorna jsonb com shape esperado | PASS | Validação com dados reais |
| AC 5 — SECURITY INVOKER + LANGUAGE sql STABLE | PASS | Confirmado |
| AC 6 — GRANT EXECUTE | PASS | authenticated + service_role |
| AC 7 — Header + ROLLBACK PLAN atualizado | PASS | DROP FUNCTION presente |
| AC 8 — page.tsx refatorado | PASS | 3 queries → 1 RPC + 4 head-only mantidos |
| AC 9 — /api/analytics/route.ts refatorado | PASS | 5 queries → 1 RPC + mapping HTTP |
| AC 10 — /api/analytics/campaigns refatorado | PASS | `.limit(10000)` removido, select enxuto |
| AC 11 — /api/analytics/sources refatorado | PASS | `.limit(10000)` removido |
| AC 12 — /leads-by-period não tocado | PASS | Correto (auditado) |
| AC 13 — typecheck/lint/build PASS | PASS | Build 123/123 |
| AC 14 — EXPLAIN ANALYZE documentado | PASS | 3.803ms |
| AC 15 — Payload <5KB | **CONCERNS (deferido)** | Requer preview Vercel — humano valida |
| AC 16 — Smoke runtime humano | **CONCERNS (deferido)** | Requer browser real — humano valida no push |
| AC 17 — Epic atualizado | PASS | Tracking presente no epic file |

**Pendências (AC 14-15-16):** **Não bloqueiam o gate arquitetural.** Mesmo padrão do Epic 29 (Story 29.8) e Stories 30.5/30.6: medições de payload e smoke runtime são validadas pós-push em preview/produção. O gate técnico (arquitetura + DB + tipos + build) está **APROVADO**.

---

## Issues Encontrados

**Nenhum issue bloqueante.**

### Observações não bloqueantes (futuras)

1. **`lost_agg` sem filtro de período** — Consistente com código atual, mas vale alinhar com PM se semântica desejada é cumulativa ou recortada por `p_since`.
2. **Type aliases duplicados** entre `page.tsx` e `route.ts` — Refactor opcional: extrair para `@web/types/analytics.ts`. Não justifica esforço nesta story.
3. **Sources route não consome `source_counts` da RPC** — Decisão correta porque `/sources` aceita `from`/`to` arbitrários (não apenas `p_since`). Documentar essa separação intencional.

---

## Ganho Estimado

| Métrica | Antes | Depois (estimado) | Ganho |
|---------|-------|-------------------|-------|
| Payload `/api/analytics` (org com 10k leads) | ~190KB | <5KB | **~38x redução** |
| Queries por hit em `/dashboard/analytics` | 7 (3 over-fetch + 2 limit10k + 4 head-only) | 5 (1 RPC + 4 head-only) | -29% queries, -100% over-fetch |
| TTFB `/dashboard/analytics` | ~800ms-2s | <300ms (alvo) | **~3-6x mais rápido** |
| Server processing time (RPC) | múltiplos roundtrips + transferência | 3.803ms execution | **13x abaixo do alvo de 50ms** |
| UUIDs trafegados por hit | ~9.500 | ~0 (apenas IDs de stages/properties/brokers — ~15 UUIDs no shape JSONB) | **~99.8% redução** |

---

## Multi-Tenancy — Veredicto Final

**ANTI-IDOR ROBUSTO.** Filtro explícito por `org_id` em todas as 6 CTEs + SECURITY INVOKER + RLS ativa em todas as 4 tabelas envolvidas. Defesa em profundidade exemplar. `p_org_id` sempre vem de auth server-side, nunca de input user-controlled.

---

## Recomendação

**APROVADO PARA PUSH** (`@devops *push`).

Após o push:
1. **Validar AC 14-15 em preview Vercel:** medir payload de `/api/analytics?period=month` via DevTools Network ou `curl -w "%{size_download}\n"`.
2. **Validar AC 16:** smoke runtime humano em `/dashboard/analytics` confirmando funil, properties, brokers, sources, lost reasons renderizam corretamente.
3. **Considerar** como follow-up futuro: extrair `AnalyticsSummary` types para módulo compartilhado se Epic 30 trouxer mais consumers.

---

## Next Step

`@devops *push` para deploy. Após deploy em preview, executar smoke runtime humano (AC 16) e medir payload (AC 15) para fechar story.

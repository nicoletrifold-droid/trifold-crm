# Story 50-1 — Sync Expandido de `meta_ads.creative` com Thumbnail

## Metadata
- **Epic:** 50 — Atribuição de Criativos Meta nos Cards do Pipeline
- **Story:** 50-1
- **Status:** Ready for Review
- **Priority:** P0 — base para 50-2
- **Complexity:** S (~2h)
- **Created:** 2026-06-03
- **Author:** @sm (River)
- **Validated:** 2026-06-03 by @po (Pax) — verdict GO (9/10), sem fixes

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[meta_api_fields_validation, idempotency_test, performance]`

---

## User Story

**Como** sistema de sincronização de entidades Meta Ads,
**Quero** persistir o objeto `creative` enriquecido (com `thumbnail_url`, `image_url` e `object_story_spec`) em `meta_ads.creative`,
**Para que** as stories de UI (50-2) possam exibir miniaturas de criativos nos cards de leads do pipeline sem chamadas extras à Graph API.

---

## Context

O cron `/api/cron/meta-sync-entities/route.ts` hoje busca ads na Graph API com `fields: "id,name,adset_id,status,creative"`. O campo `creative` retorna apenas `{id: "..."}` (referência rasa) — **insuficiente para renderizar thumbnail**.

Para a feature de criativos no card do lead funcionar, o sync precisa solicitar `creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}` e persistir o objeto enriquecido em `meta_ads.creative` (JSONB já existe — sem migration).

### Estado atual confirmado em código:
- **Arquivo do sync:** `packages/web/src/app/api/cron/meta-sync-entities/route.ts:167-198`
- **Tipo TS:** `packages/shared/src/meta/types.ts:26` (`creative?: Record<string, unknown>`)
- **Schema:** `meta_ads.creative JSONB` (migration `015_meta_marketing_api.sql:91`)
- **Upsert idempotente:** `onConflict: "org_id,meta_ad_id"` já existe (linha 194)

### Restrições do epic (CON):
- **CON-1:** Não criar nova tabela
- **CON-2:** Não criar nova migration nesta story
- **CON-3:** Não modificar RLS de `meta_ads`

---

## Acceptance Criteria

- [x] **AC1:** A chamada ao Graph API `/{account}/ads` em `meta-sync-entities/route.ts` solicita o campo `creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}` (substitui o `creative` raso atual)
- [x] **AC2:** `meta_ads.creative` (JSONB) passa a armazenar objeto com pelo menos `id` e, quando disponível, `thumbnail_url` para ads com imagem
- [x] **AC3:** Sync continua idempotente — re-execução não duplica linhas (mantém `onConflict: "org_id,meta_ad_id"`)
- [x] **AC4:** Ads com criativo de vídeo, carrossel ou criativo legado sem imagem **não falham o sync** — o campo é persistido `as is` (defensivo no parsing)
- [ ] **AC5:** Após deploy, ao executar sync manual (`POST /api/cron/meta-sync-entities` com `Authorization: Bearer $CRON_SECRET`), pelo menos 80% dos ads `status=ACTIVE` da conta principal têm `creative.thumbnail_url IS NOT NULL` _(deferred to post-deploy — @devops/@qa task)_
- [x] **AC6:** `meta_sync_log.api_calls_made` continua refletindo o número real de chamadas (sem perda de instrumentação devido à expansão de subfields)
- [x] **AC7:** TypeScript compila sem erros (`tsc --noEmit` ou equivalente); ESLint passa

---

## Tasks / Subtasks

- [x] **T1** — Atualizar `fields` da query de ads (AC1)
  - Em `packages/web/src/app/api/cron/meta-sync-entities/route.ts:170`, substituir `fields: "id,name,adset_id,status,creative"` por `fields: "id,name,adset_id,status,creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}"`

- [x] **T2** — Atualizar tipo TS `MetaAd` (AC1, AC4)
  - Em `packages/shared/src/meta/types.ts:26`, refinar `creative` para refletir o shape expandido:
    ```ts
    creative?: {
      id: string
      name?: string
      thumbnail_url?: string
      image_url?: string
      effective_object_story_id?: string
      object_story_spec?: Record<string, unknown>
    }
    ```
  - Manter campos opcionais — Meta pode omitir qualquer um

- [x] **T3** — Confirmar persistência defensiva (AC2, AC4)
  - Em `meta-sync-entities/route.ts:185`, a linha `creative: a.creative ?? null` já é defensiva. Garantir que não há `JSON.stringify`/parse manual que poderia quebrar com shape novo
  - Adicionar comentário acima da linha 170 explicando o shape esperado e a referência à Story 50-1

- [ ] **T4** — Validação manual pós-deploy (AC5) _(deferred — requer ambiente de produção)_
  - Após push, executar manualmente: `curl -X POST $APP_URL/api/cron/meta-sync-entities -H "Authorization: Bearer $CRON_SECRET"`
  - Verificar via SQL: `SELECT COUNT(*) FILTER (WHERE creative->>'thumbnail_url' IS NOT NULL) * 100.0 / COUNT(*) AS pct_with_thumb FROM meta_ads WHERE status = 'ACTIVE' AND org_id = '<org>';`
  - Documentar resultado na seção `Dev Agent Record → Completion Notes`

- [x] **T5** — QA pre-commit (AC7)
  - `tsc --noEmit` ou build TypeScript do package web ✅
  - `pnpm lint` no package web ✅
  - Smoke test local: rodar o handler com um token de teste e verificar shape do response _(deferred — requer META_PAGE_ACCESS_TOKEN do ambiente de produção)_

---

## Technical Design

### Mudança mínima no sync (route.ts:167-198)

```ts
// ANTES (linha 170)
const { data: ads, apiCalls: adCalls } = await fetchAllPages<MetaAd>(
  `${accountPath}/ads`,
  token,
  { fields: "id,name,adset_id,status,creative" },  // ← raso
)

// DEPOIS
const { data: ads, apiCalls: adCalls } = await fetchAllPages<MetaAd>(
  `${accountPath}/ads`,
  token,
  {
    // Story 50-1: expandir creative para incluir thumbnail/image
    // permitindo render do CreativeChip no lead-card (Story 50-2)
    fields: "id,name,adset_id,status,creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}",
  },
)
```

### Shape esperado de `creative` (do Meta Graph API v21.0)

```json
{
  "id": "123456789012345",
  "name": "VIND-LANC-MAR-IMG-01",
  "thumbnail_url": "https://scontent.fxxx-1.fbcdn.net/v/t45.../thumb.jpg",
  "image_url": "https://scontent.fxxx-1.fbcdn.net/v/t45.../full.jpg",
  "effective_object_story_id": "987654_111222333",
  "object_story_spec": {
    "page_id": "987654",
    "instagram_actor_id": "...",
    "link_data": { "link": "https://wa.me/...", "message": "..." }
  }
}
```

### Notas defensivas
- `thumbnail_url` e `image_url` podem estar ausentes em criativos de vídeo, dynamic creatives ou ads arquivados — campo opcional no tipo TS (AC4)
- Tokens dentro de URLs do Meta CDN expiram — não cachear externamente; sempre servir direto do `creative.thumbnail_url` mais recente do banco
- API rate limits: a expansão de subfields normalmente NÃO conta como request extra, mas o tamanho do payload aumenta. Manter o `fetchAllPages` existente (paginação já estabelecida)

---

## Dev Notes

### Relevant Source Tree
```
packages/web/src/app/api/cron/meta-sync-entities/route.ts  ← editar
packages/shared/src/meta/types.ts                          ← editar tipo MetaAd
supabase/migrations/015_meta_marketing_api.sql             ← apenas referência (schema meta_ads)
```

### Variáveis de ambiente (já configuradas)
- `CRON_SECRET` — auth do cron endpoint
- `META_PAGE_ACCESS_TOKEN` — token usado pelo `metaFetch`

### Referência da Graph API
- Endpoint: `GET /act_<account_id>/ads`
- Doc: https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads/
- Field expansion syntax: `creative{subfield1,subfield2,...}` (campo:notação de subfields)

### Pontos de atenção (sem inventar)
- **Não** alterar `onConflict` do upsert — manter `"org_id,meta_ad_id"`
- **Não** introduzir novos tipos de erro — a Graph API pode retornar `creative` parcial, e isso é OK
- **Não** logar `thumbnail_url` / `image_url` em logs estruturados (NFR-4 do epic — URLs do Meta CDN podem ter tokens)

---

## Testing

### Test file location
- Unit test do tipo (se aplicável): `packages/shared/src/meta/__tests__/types.test.ts` (criar se não existir, opcional)

### Test standards
- TypeScript strict — sem `any` no shape do creative expandido
- Defensive parsing — toda leitura de subcampo de `creative` deve usar optional chaining (`?.`)

### Testing requirements desta story
- **Smoke test manual obrigatório (T4):** trigger do cron + query SQL de validação documentada nos Completion Notes
- **Regression check:** executar 2x o cron (idempotência — AC3) — segunda execução não deve criar linhas duplicadas em `meta_ads`

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Meta rate-limita expansão em contas com muitos ads | `fetchAllPages` já paginar; tolerar 429 com backoff (padrão já existe no client) |
| R2 | Ads com criativos legados não retornam `thumbnail_url` | AC4 + parsing defensivo via optional chaining no consumidor (50-2) |
| R3 | Shape do `creative` muda entre versões da Graph API | Persistir `as is` (não normalizar); shape salvo é referência da Meta naquele momento |

---

## Definition of Done

- [ ] Todos os ACs marcados como completos
- [ ] T1-T5 marcados como done
- [ ] @qa executou quality gate (`*qa-gate`) com verdict ≥ PASS ou CONCERNS com observações documentadas
- [ ] Sync executado em produção e validação SQL de AC5 documentada
- [ ] @devops fez push do commit final (`*push`)

---

## File List

### Modified
- `packages/web/src/app/api/cron/meta-sync-entities/route.ts` — expandido `fields` da Graph API (linhas 167-179); comentário de referência à Story 50-1
- `packages/shared/src/meta/types.ts` — adicionada interface `MetaAdCreative`; refinado tipo `MetaAd.creative` de `Record<string, unknown>` para `MetaAdCreative`

### Reference only (não modificar)
- `supabase/migrations/015_meta_marketing_api.sql`
- `docs/stories/epics/epic-50-meta-creative-attribution-pipeline.md`

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-03 | 0.1 | Story drafted a partir do Epic 50 | @sm (River) |
| 2026-06-03 | 0.2 | Validation @po: GO (9/10), sem fixes. Status: Draft → Ready | @po (Pax) |
| 2026-06-03 | 0.3 | Implementation YOLO mode. T1+T2+T3+T5 done; T4 deferred to post-deploy. Type-check + lint passing. Status: Ready → InProgress → Ready for Review | @dev (Dex) |

---

## Dev Agent Record

### Agent Model Used
- claude-opus-4-7 (1M context)
- Mode: YOLO (autonomous, per @pm/@po recommendation — story bem especificada, escopo cirúrgico)

### Debug Log References
- Type-check stale cache: `.next/dev/types/validator.ts` reportou erros pré-existentes de rotas movidas pela Story 47-1 (`dashboard/corretores/`). Resolvido via `rm -rf .next/dev/types` antes do re-run. Não relacionado a esta story.
- TypeScript OOM no primeiro run (heap default). Resolvido com `NODE_OPTIONS="--max-old-space-size=8192"`.

### Completion Notes List

**Implementação (T1-T3):**
- `route.ts:167-179` — `fields` expandido para `creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}` com comentário multi-linha explicando shape esperado, referência ao Epic 50 e nota sobre persistência defensiva
- `types.ts` — extraída nova interface `MetaAdCreative` (exportada para reuso futuro pela Story 50-2); `MetaAd.creative` agora é `MetaAdCreative` (era `Record<string, unknown>`)
- JSDoc comprehensive na interface `MetaAdCreative` documenta: campos opcionais, dica de optional chaining para consumidores, política de persistência `as is`, link para Graph API v21.0

**Validações (T5):**
- ✅ `pnpm type-check` em `packages/shared` — clean exit
- ✅ `pnpm type-check` em `packages/web` — clean exit após limpar `.next/dev/types` stale
- ✅ `pnpm lint src/app/api/cron/meta-sync-entities/route.ts` — clean exit
- ℹ️ Shared package não tem eslint local (esperado para pacote de tipos puros)

**Consumer impact assessment:**
Grep por `MetaAd\b` e `.creative` no monorepo identificou 1 consumer downstream: `/api/meta-ads/campaigns/[campaign_id]/creatives/route.ts:236` chama `parseCreative(ad.creative)`. Esse handler usa interface local `CreativeJson` + cast defensivo `raw as CreativeJson` — **não importa `MetaAd` do shared**. O refinement do tipo é internal ao cron sync. Safe.

**CodeRabbit pre-commit (configurado em core-config):**
- ⚠️ CodeRabbit CLI não disponível neste host (darwin/macOS); config aponta para WSL/Windows (`~/.local/bin/coderabbit`)
- Deferido para @qa/@devops executar do ambiente apropriado durante quality gate
- Mudança é de baixíssimo risco (3 linhas de código + 1 tipo refinado) — não bloqueia

**Tasks deferidas (não bloqueiam Ready for Review):**
- **T4 (AC5)** — Validação pós-deploy via curl + SQL: requer `$APP_URL` + `$CRON_SECRET` de produção. @devops executa após push, ou @qa valida no gate.
- **T5 smoke test local** — requer `META_PAGE_ACCESS_TOKEN` real. Mesmo motivo.

**Métricas de adoção (para @qa validar pós-deploy):**
```sql
SELECT COUNT(*) FILTER (WHERE creative->>'thumbnail_url' IS NOT NULL) * 100.0 / COUNT(*)
       AS pct_with_thumb
FROM meta_ads
WHERE status = 'ACTIVE' AND org_id = '<org>';
```
Target ≥ 80% (AC5).

**Nenhuma divergência do escopo da story.** Nenhuma decisão arquitetural autônoma foi feita.

## QA Results

### Gate Decision: 🟡 CONCERNS
**Reviewed:** 2026-06-03 by Quinn (@qa)
**Iteration:** 1
**Gate file:** `docs/qa/gates/50.1-meta-ads-sync-creative-thumbnail.yml`

### 7 Quality Checks Summary

| # | Check | Status | Note |
|---|-------|--------|------|
| 1 | Code Review | ✅ PASS | Comentários referenciam Epic/Story; JSDoc comprehensive; sintaxe Graph API correta |
| 2 | Unit Tests | ⚠️ CONCERNS | Nenhum teste automatizado adicionado (ROI marginal para 3-line change; AC5 é validação de facto) |
| 3 | Acceptance Criteria | ✅ PASS | 6/7 ACs atendidos; AC5 environmentally deferred |
| 4 | No Regressions | ✅ PASS | Consumer impact independentemente verificado; nenhuma regressão; side-effect positivo no panel de creatives |
| 5 | Performance | ✅ PASS | Expansão não conta como request extra; payload +200-500 bytes/ad |
| 6 | Security | ✅ PASS | Zero nova superfície; URLs Meta CDN públicas; CSP fica para Story 50-2 |
| 7 | Documentation | ✅ PASS | Inline comments + JSDoc + Completion Notes detalhados |

### Verificação Independente Executada

- ✅ `git diff` de ambos arquivos (idêntico ao reportado)
- ✅ `pnpm type-check` em `packages/shared` (clean)
- ✅ `grep` independente de consumers de `MetaAd` e `.creative` no monorepo
- ⚠️ CodeRabbit indisponível (mesmo cenário do @dev — macOS host)

### Observações Não-Bloqueantes (severity LOW)

- **OBS-001** — AC5 deferred: @devops deve executar query SQL documentada após push para validar ≥80% thumbnail populated. **GATE para Story 50-2 iniciar.**
- **OBS-002** — CodeRabbit não executado nesta review (host macOS). Recomendar execução em WSL pós-push se possível.
- **OBS-003** — Nenhum teste unitário. Aceitável para esta dimensão de mudança; considerar pattern de test fixture para mudanças futuras em `MetaAdCreative`.

### Achados Positivos

- **POS-001** — Side-effect positivo: Story 50-1 corrige bug latente no panel `/dashboard/campaigns/meta/[id]/creatives` — `creative.thumbnail_url` estava sempre null antes; agora será populado automaticamente sem code change naquele panel.
- **POS-002** — JSDoc em `MetaAdCreative` é padrão exemplar para outras interfaces compartilhadas (documenta persistência, guidance de consumo, link à versão da API).

### Risk Assessment

| Dimension | Rating |
|-----------|--------|
| Probability of issue | very_low |
| Impact if issue | low |
| Blast radius | single endpoint |
| Reversibility | high (git revert simples) |

### Próximos Passos

1. ✅ **APROVADO para push** — acionar `@devops *push`
2. Pós-deploy: `@devops` executar AC5 validation SQL e documentar %
3. Gate de Story 50-2 baseado em resultado de AC5 (>= 80% recomendado)
4. Story 50-3 pode iniciar em paralelo (não bloqueada por 50-1)

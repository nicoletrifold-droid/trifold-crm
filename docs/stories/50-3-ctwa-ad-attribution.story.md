# Story 50-3 — Attribution `ad_id` para Leads Click-to-WhatsApp (CTWA)

## Metadata
- **Epic:** 50 — Atribuição de Criativos Meta nos Cards do Pipeline
- **Story:** 50-3
- **Status:** Ready
- **Priority:** P1 — habilita CreativeChip para leads CTWA (paralelizável com 50-1)
- **Complexity:** S/M se Pre-Flight=B (~2-3h); M se Pre-Flight=A (~4-5h, inclui migration + deploy sequenciado)
- **Created:** 2026-06-03
- **Author:** @sm (River)
- **Validated:** 2026-06-03 by @po (Pax) — verdict GO (8/10) com fixes aplicados

### Executor Assignment
**Conditional based on Pre-Flight Check result:**
- **Pre-Flight A (coluna `leads.metadata` ausente):**
  - **Executor T0 (migration):** @data-engineer (Dara)
  - **Executor T1-T6 (código):** @dev (Dex) — após migration deployed
- **Pre-Flight B (coluna existe via remote-only migration):**
  - **Executor:** @dev (Dex) — todas as tasks
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[whatsapp_webhook_test, attribution_correctness, regression_test]`
- **Supporting Agent:** @data-engineer (Dara) — sempre consultado no T0

---

## User Story

**Como** corretor que recebe leads vindos de anúncios Meta com call-to-action Click-to-WhatsApp,
**Quero** que o `ad_id` do criativo seja persistido no lead no momento da criação,
**Para que** a UI do pipeline (Story 50-2) consiga exibir a miniatura do criativo também para esses leads — não apenas para os vindos via Lead Form.

---

## Context

Hoje leads CTWA chegam pelo webhook WhatsApp (`/api/webhook/whatsapp/route.ts`). O handler **já lê** o `referral` da mensagem e popula UTMs (`utm_source`, `utm_medium`, `utm_campaign`), mas **NÃO persiste o `ad_id`** — devido a um hot-fix da Story 21.1 que assumiu `leads.metadata` inexistente.

Trecho atual do código (linhas 281-345 do route.ts):
```ts
const referral = value?.messages?.[0]?.referral
if (referral) {
  const referralData = {
    source_url, source_id, ctwa_clid, headline, body, media_type, ...
  }
  // ...
  // Hot-fix Story 21.1 deploy: leads.metadata column does NOT exist (see
  // migration 016 doc). Preserve UTMs (real columns) but skip metadata
  // enrichment until follow-up story adds the column. CTWA referral context
  // (referralData, ctwaWindowExpiresAt) is lost on this code path until
  // then — non-blocking for P0 dedup fix.
  void referralData       // ← descartado
  void ctwaWindowExpiresAt
  // Apenas UTMs são gravados
}
```

**Esta story é o "follow-up" mencionado no comentário.**

---

## ⚠️ Pre-Flight Check (OBRIGATÓRIO antes de iniciar)

**Inconsistência detectada entre código e migrations committed:**

- ✅ Webhook **Meta** (`/api/webhooks/meta-ads/route.ts:206,223`) **grava** em `leads.metadata`
- ❌ Webhook **WhatsApp** (`/api/webhook/whatsapp/route.ts:329-335`) **assume** que `leads.metadata` não existe
- ❌ Nenhuma migration committed adiciona a coluna `leads.metadata` (verificado: `001`, `015`, `024-073` — nenhuma cria essa coluna em `leads`)
- ✅ Comentário em `016_meta_campaign_roas_view.sql:34` confirma: "leads.metadata NÃO existe"

**@dev DEVE, antes do T1:**

1. Verificar no banco real (via `@data-engineer` ou Supabase MCP) se `leads.metadata JSONB` existe:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'metadata';
   ```

2. **Resultado A (coluna NÃO existe):** Adicionar migration `074_leads_metadata.sql`:
   ```sql
   ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
   CREATE INDEX IF NOT EXISTS idx_leads_metadata_ad_id
     ON leads ((metadata->>'ad_id'))
     WHERE metadata->>'ad_id' IS NOT NULL;
   ```
   **NOTA:** Isso significa que o webhook Meta (`/api/webhooks/meta-ads/route.ts`) está atualmente **silenciosamente falhando** ao gravar em `leads.metadata` — esta migration corrige um bug latente.

3. **Resultado B (coluna JÁ existe via migration remote-only não committed):** Adicionar a migration `074_leads_metadata.sql` com `IF NOT EXISTS` (idempotente) + criar o índice acima se ainda não existir. Documentar a descoberta nos `Completion Notes`.

---

## Acceptance Criteria

- [ ] **AC0 (Pre-Flight):** Estado de `leads.metadata` validado no banco real e documentado nos `Completion Notes`. Se ausente, migration `074_leads_metadata.sql` criada
- [ ] **AC1:** No handler do WhatsApp webhook (`packages/web/src/app/api/webhook/whatsapp/route.ts`), quando `value?.messages?.[0]?.referral` está presente, `referralData` deixa de ser descartado (`void`) e passa a ser persistido em `leads.metadata`
- [ ] **AC2:** Shape do `leads.metadata` populado para CTWA:
  ```json
  {
    "ad_id": "<referral.source_id>",
    "source_url": "<referral.source_url>",
    "ctwa_clid": "<referral.ctwa_clid>",
    "headline": "<referral.headline>",
    "body": "<referral.body>",
    "media_type": "<referral.media_type>",
    "ctwa_window_expires_at": "<ISO 8601, baseTime + 72h>"
  }
  ```
- [ ] **AC3:** Quando lead **já existe** (re-engajamento), `metadata.ad_id` só é atualizado se atualmente `NULL` ou ausente — preserva atribuição original (mesma regra do webhook Meta `route.ts:202-208`)
- [ ] **AC4:** Lead novo via CTWA continua com `source = 'whatsapp_click_to_ad'`, `utm_source = 'meta_ads'`, `utm_medium = 'whatsapp_ctwa'`, `utm_campaign = <campaign_name resolvido>` (comportamento atual preservado)
- [ ] **AC5:** Teste de fixture com payload real (anonimizado) de CTWA referral adicionado em `packages/web/__tests__/webhooks/whatsapp-ctwa.test.ts` — cobrindo:
  - Lead novo com referral → metadata populado
  - Lead existente sem `metadata.ad_id` → atualizado
  - Lead existente com `metadata.ad_id` → NÃO sobrescrito
- [ ] **AC6:** Hot-fix comment (linhas 329-335 do webhook) é **removido** após implementação — substituído por comentário documentando a story 50-3
- [ ] **AC7:** Tipo TS para `WhatsAppReferral` movido (ou criado) em `packages/shared/src/whatsapp/types.ts` para reuso
- [ ] **AC8:** TypeScript compila sem erros; ESLint passa; testes existentes do webhook continuam passando
- [ ] **AC9:** Após deploy, monitorar `webhook_logs` por 24h — sem aumento de `processing_error` relacionado a CTWA

---

## Tasks / Subtasks

- [ ] **T0** — Pre-Flight Check (AC0)
  - Validar existência de `leads.metadata` no banco real
  - Criar migration `074_leads_metadata.sql` se necessário (ver Pre-Flight Check)
  - Coordenar com @data-engineer antes de prosseguir

- [ ] **T1** — Definir/exportar tipo `WhatsAppReferral` (AC7)
  - Em `packages/shared/src/whatsapp/types.ts` (criar se não existir):
    ```ts
    export interface WhatsAppReferral {
      source_url?: string
      source_id?: string  // = meta_ad_id
      ctwa_clid?: string
      headline?: string
      body?: string
      media_type?: string
      source_type?: 'ad' | 'post' | string
    }
    ```

- [ ] **T2** — Atualizar handler do webhook WhatsApp (AC1, AC2, AC4, AC6)
  - Em `packages/web/src/app/api/webhook/whatsapp/route.ts:278-359`:
    - Remover `void referralData` e `void ctwaWindowExpiresAt` (linhas 334-335)
    - Substituir o comentário hot-fix por: `// Story 50-3: CTWA referral persisted in leads.metadata (Epic 50)`
    - Construir objeto `metadataPatch` com shape de AC2
    - Persistir via `supabase.from("leads").update({ ...utms, metadata: <merge> })` respeitando preservação de campos existentes (ver T3)

- [ ] **T3** — Preservar atribuição original em re-engajamento (AC3)
  - Antes do update, ler `leads.metadata` atual via select
  - Se `current.metadata?.ad_id` já está populado → manter o valor existente (só atualizar outros campos do CTWA)
  - Padrão de referência: `/api/webhooks/meta-ads/route.ts:165-178,201-209` (mesma lógica de preservação)

- [ ] **T4** — Test fixture e testes unitários (AC5)
  - Criar `packages/web/__tests__/webhooks/whatsapp-ctwa.test.ts`
  - Mockar payload real de CTWA (anonimizado — usar `source_id: "test_ad_123"`)
  - 3 cenários conforme AC5

- [ ] **T5** — QA pré-commit (AC8)
  - Rodar test suite do webhook
  - `tsc --noEmit` + `pnpm lint`

- [ ] **T6** — Validação pós-deploy (AC9)
  - Monitorar logs por 24h após deploy
  - Query SQL de verificação:
    ```sql
    SELECT COUNT(*) FILTER (WHERE metadata->>'ad_id' IS NOT NULL)
           * 100.0 / COUNT(*) AS pct_with_ad_id
    FROM leads
    WHERE source = 'whatsapp_click_to_ad'
      AND created_at > now() - interval '24 hours';
    ```
  - Documentar resultado nos `Completion Notes`

---

## Technical Design

### Patch principal — handler WhatsApp (route.ts ~linha 278-359)

```ts
const referral = value?.messages?.[0]?.referral as WhatsAppReferral | undefined
if (referral) {
  try {
    const referralData = {
      ad_id: referral.source_id ?? null,           // ← chave para o CreativeChip
      source_url: referral.source_url ?? null,
      ctwa_clid: referral.ctwa_clid ?? null,
      headline: referral.headline ?? null,
      body: referral.body ?? null,
      media_type: referral.media_type ?? null,
    }

    // Resolver campaign_name (lógica já existe — manter intacta)
    let campaignName: string | null = referral.headline ?? null
    if (referral.source_id) { /* ... lookup meta_ads → meta_adsets → meta_campaigns ... */ }

    const baseTime = lead.created_at ? new Date(lead.created_at).getTime() : Date.now()
    const ctwaWindowExpiresAt = new Date(baseTime + 72 * 60 * 60 * 1000).toISOString()

    // Story 50-3: ler metadata atual para preservar ad_id se já existe
    const { data: currentLead } = await supabase
      .from("leads")
      .select("metadata")
      .eq("id", lead.id)
      .single()

    const currentMeta = (currentLead?.metadata as Record<string, unknown>) ?? {}
    const preservedAdId = currentMeta.ad_id ?? referralData.ad_id

    const mergedMetadata = {
      ...currentMeta,
      ...referralData,
      ad_id: preservedAdId,
      ctwa_window_expires_at: ctwaWindowExpiresAt,
    }

    await supabase
      .from("leads")
      .update({
        source: "whatsapp_click_to_ad",
        utm_source: "meta_ads",
        utm_medium: "whatsapp_ctwa",
        utm_campaign: campaignName,
        metadata: mergedMetadata,
      })
      .eq("id", lead.id)
  } catch (refErr) {
    logEvent({ /* mantém log existente */ })
  }
}
```

### Migration `074_leads_metadata.sql` (condicional — Pre-Flight)

```sql
-- Story 50-3 — Adiciona coluna leads.metadata (JSONB) para attribution Meta
-- Confirma column expected mas ausente nas migrations committed
-- (referenciada por webhook Meta desde Story 16.x e CTWA desde Story 21.1 hot-fix)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- Índice parcial para lookup do CreativeChip (Story 50-2)
CREATE INDEX IF NOT EXISTS idx_leads_metadata_ad_id
  ON leads ((metadata->>'ad_id'))
  WHERE metadata->>'ad_id' IS NOT NULL;

COMMENT ON COLUMN leads.metadata IS
  'JSONB com attribution Meta: { ad_id, campaign_id, form_id, ad_group_id, '
  'leadgen_id, source_url, ctwa_clid, headline, body, media_type, '
  'ctwa_window_expires_at }. Story 50-3 — Epic 50.';
```

---

## Dev Notes

### Relevant Source Tree
```
packages/web/src/app/api/webhook/whatsapp/route.ts          ← editar (T2, T3)
packages/web/src/app/api/webhooks/meta-ads/route.ts         ← referência de padrão de merge
packages/shared/src/whatsapp/types.ts                       ← criar (T1)
supabase/migrations/074_leads_metadata.sql                  ← criar se Pre-Flight=A
packages/web/__tests__/webhooks/whatsapp-ctwa.test.ts       ← criar (T4)
```

### Padrão de merge de metadata
Usar o mesmo pattern de `/api/webhooks/meta-ads/route.ts:201-209`:
- Lead existente → preservar atribuição original (`ad_id`), atualizar contexto
- Lead novo → criar com metadata completo
- Sempre fazer **merge** (`{...current, ...new}`) em vez de replace

### Pontos de atenção
- **Performance:** o select extra de `leads.metadata` antes do update adiciona 1 round-trip. Aceitável pois CTWA é fluxo de baixa frequência. Se virar problema, refatorar para `UPDATE ... SET metadata = metadata || jsonb_build_object(...)` em SQL puro
- **Privacidade:** `source_url` pode conter parâmetros de tracking — não logar em sistema externo (NFR-4 do epic)
- **Idempotência:** mensagens WhatsApp podem ser entregues múltiplas vezes (retry); o merge garante que reprocessamento não destrói dados

---

## Testing

### Test file location
- `packages/web/__tests__/webhooks/whatsapp-ctwa.test.ts`

### Test standards
- Framework: jest/vitest conforme padrão do projeto (verificar `packages/web/package.json`)
- Mock do supabase client via `@supabase/supabase-js` mock
- Fixtures em `packages/web/__tests__/fixtures/whatsapp-ctwa-referral.json`

### Testing requirements desta story
- 3 cenários de AC5 obrigatórios
- Smoke test pós-deploy via query SQL de T6

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Pre-Flight revela que `leads.metadata` está parcialmente populado (webhook Meta funcionando, mas sem coluna formal) | Migration com `IF NOT EXISTS` é idempotente; o backfill do Meta continua funcionando |
| R2 | Payload CTWA varia entre Meta Business Account e Cloud API | T1/T7 — tipo TS marca campos como opcionais; parsing defensivo |
| R3 | Update do metadata destrói atribuição original em re-engajamento | AC3 + T3 — preservação explícita do `ad_id` original via merge |
| R4 | Mensagem WhatsApp duplicada (retry Meta) reprocessa e altera metadata | Merge não-destrutivo (AC3); webhook idempotente já existe (Story 21.1) |

---

## Out of Scope

- **Backfill de leads históricos CTWA** sem `metadata.ad_id` — opcional, mencionado no epic como TODO. Pode virar Story 50-4 se necessário
- Migration de UTMs antigas para `metadata` — não fazemos data migration, apenas forward-fill

---

## Definition of Done

- [ ] AC0-AC9 marcados como completos
- [ ] T0-T6 marcados como done
- [ ] Pre-Flight resultado documentado nos `Completion Notes`
- [ ] @data-engineer aprovou migration 074 (se criada)
- [ ] @qa executou quality gate (`*qa-gate`) com verdict ≥ PASS
- [ ] @devops fez push (`*push`)
- [ ] Monitoramento de 24h pós-deploy sem regressão

---

## File List

### To be modified
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (handler CTWA — T2, T3)

### To be created
- `packages/shared/src/whatsapp/types.ts` (se não existir — T1)
- `supabase/migrations/074_leads_metadata.sql` (condicional ao Pre-Flight — T0)
- `packages/web/__tests__/webhooks/whatsapp-ctwa.test.ts` (T4)
- `packages/web/__tests__/fixtures/whatsapp-ctwa-referral.json` (T4)

### Reference only (não modificar)
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` (padrão de merge de metadata)
- `supabase/migrations/016_meta_campaign_roas_view.sql` (comentário linha 34)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-03 | 0.1 | Story drafted a partir do Epic 50; Pre-Flight Check adicionado após descoberta da inconsistência `leads.metadata` no código | @sm (River) |
| 2026-06-03 | 0.2 | Validation @po: GO (8/10). Executor Assignment condicional ao Pre-Flight (Resultado A → @data-engineer T0; Resultado B → @dev tudo). Complexity range clarificado. Status: Draft → Ready | @po (Pax) |

---

## Dev Agent Record
_To be populated by @dev (Dex) during implementation._

## QA Results
_To be populated by @qa (Quinn) after review._

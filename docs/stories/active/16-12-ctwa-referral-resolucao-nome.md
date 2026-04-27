---
epic: 16
story: 16.12
title: CTWA Referral + Resolução de Nome de Campanha
status: Done
priority: P2-MÉDIO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [referral_data_extraction, local_lookup, badge_accuracy]
complexity: M
estimated_hours: 2
depends_on: [16.11]
---

# Story 16.12 — CTWA Referral + Resolução de Nome de Campanha

## Contexto

Click-to-WhatsApp Ads (CTWA) são anúncios Meta que abrem uma conversa WhatsApp diretamente. Quando um lead chega via CTWA, o payload do webhook WhatsApp inclui um campo `referral` com dados do anúncio: `source_url`, `source_id`, `ctwa_clid`, `headline`.

**Estado atual do webhook** (`/api/webhook/whatsapp/route.ts`, linhas 285-310):
- O webhook já detecta `referral` e define `source = 'whatsapp_click_to_ad'` ✅
- Já define `utm_source = 'meta_ads'` e `utm_medium = 'whatsapp_ctwa'` ✅
- **Problema 1:** Salva campos do referral FLAT no `metadata` (sem sub-objeto `referral`)
- **Problema 2:** Usa `referral.headline` como `utm_campaign` (sem lookup real no DB)
- **Problema 3:** Não salva `source_id` nem `ctwa_window_expires_at`
- **Problema 4:** Não resolve o nome real da campanha via `meta_campaigns`/`meta_ads`
- **Problema 5:** Lead card não exibe nome da campanha CTWA

**Tabelas disponíveis** (criadas em 16.1/16.4):
- `meta_campaigns(id, org_id, meta_campaign_id, name)` — campanhas sincronizadas
- `meta_ads(id, org_id, meta_ad_id, name, adset_id)` — anúncios individuais
- `meta_adsets(id, org_id, meta_adset_id, name, campaign_id)` — conjuntos de anúncios

**Join CTWA → campanha:** `referral.source_id` = `meta_ad_id` (ad ID da Meta)
→ `meta_ads.meta_ad_id = referral.source_id`
→ `meta_adsets.id = meta_ads.adset_id`
→ `meta_campaigns.id = meta_adsets.campaign_id`

Se `meta_campaigns` não tiver o anúncio ainda (sync ainda não rodou), usar `referral.headline` como fallback.

---

## Acceptance Criteria

### AC1 — Estrutura do metadata.referral
**Dado** que um lead chega via CTWA (webhook com campo `referral`)
**Quando** o webhook é processado
**Então** `leads.metadata` deve ter:
```json
{
  "referral": {
    "source_url": "https://...",
    "source_id": "120200...",
    "ctwa_clid": "ARA...",
    "headline": "Nome do Anúncio",
    "body": "Texto do anúncio",
    "media_type": "image"
  },
  "ctwa_window_expires_at": "2026-04-30T10:00:00Z"
}
```
- `ctwa_window_expires_at = lead.created_at + 72 horas`
- Os campos devem ser aninhados em `metadata.referral`, não flat

### AC2 — Lookup de campanha via meta_campaigns
**Dado** que `referral.source_id` está disponível (= meta_ad_id)
**Quando** o webhook processa o referral
**Então** deve tentar resolver o nome da campanha:
1. Buscar `meta_ads` WHERE `meta_ad_id = referral.source_id` AND `org_id = orgId`
2. Se encontrado → ir para `meta_adsets` via `adset_id`
3. De `meta_adsets` → ir para `meta_campaigns` via `campaign_id`
4. Definir `utm_campaign = meta_campaigns.name` (nome real sincronizado)
5. **Fallback** (anúncio não sincronizado): usar `referral.headline` como `utm_campaign`
- Lookup deve ser assíncrono e NÃO bloquear o retorno 200 do webhook (já usa `waitUntil` ou executa antes da resposta — o webhook atual processa antes de retornar, então pode incluir no fluxo normal)

### AC3 — Badge de campanha no LeadCard
**Dado** que um lead tem `source = 'whatsapp_click_to_ad'`
**E** tem `utm_campaign` definido
**Quando** o lead é exibido no kanban (LeadCard)
**Então** abaixo do SourceBadge "CTWA" deve aparecer um badge secundário compacto:
- Texto: nome da campanha truncado em 16 chars (ex: "Black Friday...")
- Estilo: `bg-green-50 text-green-600 text-[9px]` (mesmo tom do badge CTWA)
- Só exibe se `utm_campaign` estiver definido E `source === 'whatsapp_click_to_ad'`
- No `lead-detail-drawer`, exibir nome completo sem truncate

### AC4 — Lead detail drawer exibe dados completos do referral
**Dado** que um lead tem `metadata.referral` definido
**Quando** o drawer de detalhes é aberto
**Então** a seção de origem deve exibir:
- SourceBadge "CTWA" (já existe via 16.11)
- Nome da campanha completo (de `utm_campaign`)
- `ctwa_clid` abreviado (primeiros 8 chars + "...")
- Janela CTWA: expirada ou `"expira em X horas"` (calculado a partir de `metadata.ctwa_window_expires_at`)

### AC5 — Sem quebras em leads existentes
**Dado** que leads existentes NÃO têm `metadata.referral`
**Quando** o lead card ou drawer são renderizados
**Então** nenhum erro é lançado e o badge de campanha simplesmente não aparece

---

## Scope

### IN
- Modificar lógica de referral em `/api/webhook/whatsapp/route.ts`
- Adicionar lookup em `meta_ads` → `meta_adsets` → `meta_campaigns` via Supabase service client
- Alterar estrutura do `metadata` salvo: sub-objeto `referral` + `ctwa_window_expires_at`
- Adicionar `source_id` à extração (faltava no código atual)
- Badge de campanha compacto em `lead-card.tsx` (novo elemento opcional)
- Exibição de dados CTWA no `lead-detail-drawer.tsx`
- Passar `utm_campaign` para `LeadCard` via `KanbanBoard`

### OUT
- Criação de novas tabelas ou migrations de schema
- Modificação do `SourceBadge` component (usa existente do 16.11)
- Chamadas externas à Meta Graph API (tudo via DB local)
- Dashboard de campanhas (stories 16.8/16.9)
- Tracking de conversão CTWA (fora de escopo)

---

## Dev Notes

### Fluxo de lookup no webhook (AC2)

```typescript
// No bloco que trata referral, após salvar referralMetadata:
let campaignName: string | null = referral.headline ?? null

if (referral.source_id) {
  // Tentativa de lookup: meta_ads → meta_adsets → meta_campaigns
  const { data: ad } = await supabase
    .from("meta_ads")
    .select("adset_id")
    .eq("meta_ad_id", referral.source_id)
    .eq("org_id", orgId)
    .single()

  if (ad?.adset_id) {
    const { data: adset } = await supabase
      .from("meta_adsets")
      .select("campaign_id")
      .eq("id", ad.adset_id)
      .single()

    if (adset?.campaign_id) {
      const { data: campaign } = await supabase
        .from("meta_campaigns")
        .select("name")
        .eq("id", adset.campaign_id)
        .single()

      if (campaign?.name) campaignName = campaign.name
    }
  }
}
```

### Estrutura do metadata (AC1)

```typescript
// ANTES (flat, incorreto):
metadata: {
  source_url: ..., headline: ..., ctwa_clid: ..., ...
}

// DEPOIS (sub-objeto referral + window):
const referralData = {
  source_url: referral.source_url ?? null,
  source_id: referral.source_id ?? null,      // ← NOVO
  ctwa_clid: referral.ctwa_clid ?? null,
  headline: referral.headline ?? null,
  body: referral.body ?? null,
  media_type: referral.media_type ?? null,
}

const ctwaWindowExpiresAt = new Date(
  new Date(lead.created_at || Date.now()).getTime() + 72 * 60 * 60 * 1000
).toISOString()

// Merge com metadata existente (preservar outros campos)
const existingMeta = (existingLead.metadata as Record<string, unknown>) ?? {}
await supabase
  .from("leads")
  .update({
    source: "whatsapp_click_to_ad",
    utm_source: "meta_ads",
    utm_medium: "whatsapp_ctwa",
    utm_campaign: campaignName,
    metadata: {
      ...existingMeta,
      referral: referralData,
      ctwa_window_expires_at: ctwaWindowExpiresAt,
    },
  })
  .eq("id", lead.id)
```

### Badge no LeadCard (AC3)

- `LeadCard` precisa receber `utm_campaign?: string | null` no tipo `lead`
- `KanbanBoard` já faz `.select(...)` no servidor via `broker/pipeline/page.tsx` — adicionar `utm_campaign` ao select
- Badge só aparece se `lead.source === 'whatsapp_click_to_ad' && lead.utm_campaign`
- Truncar: `campaign.length > 16 ? campaign.slice(0, 16) + '…' : campaign`

### Drawer (AC4)

- Drawer busca lead via `lead-detail-drawer.tsx` → provavelmente faz query com `select`
- Adicionar `utm_campaign, metadata` ao select do drawer (verificar query existente)
- Calcular `isCtwaExpired`: `new Date() > new Date(metadata.ctwa_window_expires_at)`
- Mostrar: `"Expirado"` ou `"Expira em Xh"` (Math.ceil sobre diff de horas)

### Atenção: merge de metadata

O webhook atual define `metadata: referralMetadata` (sobrescreve todo o metadata). Quando o lead EXISTE antes do CTWA (lead já tinha metadata de conversa anterior), isso apaga os dados existentes. Corrigir fazendo SELECT antes do UPDATE para preservar metadata existente.

No código atual, o lead pode ser criado ANTES do bloco de referral:
1. Lead criado em `whatsapp_organic` (sem referral)
2. Referral detectado → precisa buscar metadata atual e fazer merge

A sequência correta:
1. Criar/buscar lead (já feito)
2. Detectar referral
3. Buscar `lead.metadata` atual do DB
4. Fazer update com merge (não override)

---

## Tasks

- [x] **T1** — Modificar bloco de referral no webhook WhatsApp
  - [x] Adicionar `source_id` à extração do referral
  - [x] Implementar lookup `meta_ads → meta_adsets → meta_campaigns`
  - [x] Calcular `ctwa_window_expires_at = lead.created_at + 72h`
  - [x] Buscar metadata existente antes do update (para merge)
  - [x] Salvar `metadata.referral` como sub-objeto (não flat)
  - [x] Usar `campaignName` (lookup ou fallback headline) em `utm_campaign`

- [x] **T2** — Atualizar LeadCard para exibir badge de campanha
  - [x] Adicionar `utm_campaign?: string | null` à interface `lead` em `lead-card.tsx`
  - [x] Adicionar `utm_campaign` à interface `Lead` em `kanban-board.tsx`
  - [x] Adicionar `utm_campaign` ao `.select()` em `packages/web/src/app/broker/pipeline/page.tsx`
  - [x] Renderizar badge compacto de campanha quando `source === 'whatsapp_click_to_ad'`

- [x] **T3** — Atualizar LeadDetailDrawer para exibir dados CTWA completos
  - [x] Verificar e adicionar `utm_campaign, metadata` ao select do drawer
  - [x] Renderizar nome de campanha completo na seção de origem
  - [x] Renderizar `ctwa_clid` abreviado
  - [x] Renderizar status da janela CTWA (ativa/expirada)

- [x] **T4** — Validações e edge cases
  - [x] Leads sem referral: nenhum erro, nenhum badge (condicionais isCTWA guard todos os elementos)
  - [x] Referral sem `source_id`: fallback para headline direto (`campaignName = referral.headline`)
  - [x] `meta_ads` ainda não sincronizado (lookup retorna null): fallback para headline
  - [x] Metadata existente não é perdido (merge via `...existingMeta`)

---

## Testing

### Cenário 1 — CTWA com meta_ads sincronizado
- Simular POST no webhook com payload tendo `referral.source_id = meta_ad_id` existente no DB
- Verificar: `utm_campaign` = nome da campanha da tabela, `metadata.referral.source_id` presente, `metadata.ctwa_window_expires_at` ~72h no futuro

### Cenário 2 — CTWA sem sincronização prévia (fallback)
- Payload com `source_id` que não existe em `meta_ads`
- Verificar: `utm_campaign = referral.headline`, estrutura de metadata correta

### Cenário 3 — Badge no kanban
- Lead com `source = 'whatsapp_click_to_ad'` e `utm_campaign = 'Black Friday Vind'`
- Verificar: badge "Black Friday Vi…" aparece abaixo do SourceBadge no card

### Cenário 4 — Lead orgânico (sem referral)
- Payload sem campo `referral`
- Verificar: `source = 'whatsapp_organic'`, nenhum campo de referral criado, nenhum badge no card

### Cenário 5 — Lead existente com metadata anterior
- Lead já tem `metadata: { some_key: "value" }` antes do referral
- Verificar: após update, `metadata.some_key` ainda existe (merge, não override)

---

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.6

### Debug Log References
(a preencher pelo @dev)

### Completion Notes
- Lint: 0 errors (2 warnings pré-existentes em arquivos não tocados por esta story)
- Typecheck: PASS
- Decisão: `getCTWAWindowLabel` extraída como helper fora do componente para satisfazer `react-hooks/purity` (não pode chamar `Date.now()` inline em IIFE dentro do componente)
- `dashboard/pipeline/page.tsx` também atualizado com `utm_campaign` no select (além do `broker/pipeline/page.tsx`)
- Lookup de campanha: falha silenciosa em todos os passos → `campaignName` mantém fallback de `referral.headline`

### File List
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (modificado)
- `packages/web/src/components/pipeline/lead-card.tsx` (modificado)
- `packages/web/src/components/pipeline/kanban-board.tsx` (modificado)
- `packages/web/src/app/broker/pipeline/page.tsx` (modificado)
- `packages/web/src/app/dashboard/pipeline/page.tsx` (modificado)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` (modificado)

---

## QA Results

**Veredicto: PASS ✅** — Quinn (@qa) | 2026-04-27 | Iteração 1

Todos os 5 ACs cumpridos. Typecheck PASS, Lint PASS (0 errors).

**Concerns documentados (não-bloqueantes):**
- MEDIA-001 (LOW): `image_url`, `video_url`, `thumbnail_url` excluídos do `metadata.referral` vs. código anterior. AC1 não os exige — tech debt futuro.
- KANBAN-COL-001 (LOW): `KanbanColumn.leads` interface não declara `source`/`utm_campaign` — gap de type-safety pré-existente. Runtime correto.
- PERF-001 (INFO): 3 queries sequenciais no hot path do webhook para lookup de campanha. Aceitável para volume atual.

Gate file: `docs/qa/gates/16.12-ctwa-referral-resolucao-nome.yml`

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-04-27 | River (@sm) | Story criada |
| 2026-04-27 | Pax (@po) | Validação GO 10/10 — aprovada para desenvolvimento |
| 2026-04-27 | Dex (@dev) | Implementação completa — typecheck PASS, lint PASS (0 errors) |
| 2026-04-27 | Quinn (@qa) | QA Gate PASS — 5 ACs verificados, 2 concerns LOW não-bloqueantes |
| 2026-04-27 | Gage (@devops) | Push para origin/main — Story Done |

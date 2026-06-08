---
epic: 50
title: Atribuição de Criativos Meta nos Cards do Pipeline
status: Draft
created_at: 2026-06-03
updated_at: 2026-06-03
created_by: Morgan (@pm)
priority: High
objetivo_negocio:
  - Permitir ao corretor identificar visualmente, no card do lead, qual criativo Meta originou cada contato
  - Reduzir tempo de contexto pré-atendimento (corretor sabe sobre que anúncio o lead viu antes de ligar)
  - Habilitar análise qualitativa de performance criativa (quais criativos trazem leads que fecham)
depends_on:
  - Epic 16 (Meta Ads Marketing API) — stories 16.1 a 16.5 em produção (meta_ads, meta_campaigns, meta_adsets sincronizando)
  - Webhook Meta Lead Forms (`/api/webhooks/meta-ads`) em produção persistindo `leads.metadata.ad_id`
related:
  - Epic 19 (Meta Ads Intelligence) — completa visão qualitativa por criativo
  - Epic 25 (Meta Ads Campaign Actions) — base de attribution
sub_epics:
  - 50A: Expansão do sync `meta_ads` para incluir thumbnail/preview do criativo
  - 50B: Componente `CreativeChip` no card do lead (Pipeline + Broker)
  - 50C: Backfill e attribution para leads `whatsapp_click_to_ad` (ad_id via CTWA payload)
stories_planned: [50.1, 50.2, 50.3]
---

# Epic 50 — Atribuição de Criativos Meta nos Cards do Pipeline

## Objetivo do Epic

Tornar a **origem criativa do lead** visível diretamente no card do pipeline (Kanban) — permitindo
ao corretor enxergar, antes de tocar no card, qual anúncio Meta (imagem + nome) trouxe aquele lead.
Hoje o corretor só vê um `SourceBadge` genérico ("Meta Ads"), o que obriga a abrir o lead,
checar UTMs e cruzar com o painel de campanhas para entender o contexto — atrito alto durante
follow-up em escala.

## Contexto do Sistema Existente

### O que já temos (NÃO inventar — confirmado em código)

**Database:**
- `leads.source` (enum `lead_source`) — valores incluem `'meta_ads'` e `'whatsapp_click_to_ad'` (migration 001)
- `leads.metadata` (JSONB, adicionada em migration remote-only) — preenchida pelo webhook com:
  - `leadgen_id`, `form_id`, `ad_id`, `ad_group_id`, `campaign_id`, `page_id`, `field_data`, `incomplete`
- `leads.utm_campaign`, `utm_content` (= ad_name), `utm_source`, `utm_medium`
- `meta_ads` (migration 015): `id` (UUID interno), `meta_ad_id` (TEXT, ID externo Meta), `name`, `status`, `creative` (JSONB), `synced_at`
- `meta_adsets`, `meta_campaigns` — hierarquia completa

**Sync entities cron** (`/api/cron/meta-sync-entities/route.ts`):
- Busca ads com `fields: "id,name,adset_id,status,creative"`
- Persiste `meta_ads.creative` como JSONB raso vindo do Graph API — **hoje contém apenas `{id: "..."}`** porque o expand de subfields não está sendo solicitado

**Webhook Meta Lead Forms** (`/api/webhooks/meta-ads/route.ts`):
- Recebe `leadgen_id` → busca via Graph API `field_data,ad_id,campaign_id,form_id,created_time`
- Persiste em `leads.metadata.ad_id` (chave de attribution) e em `leads.utm_content` (= ad_name)

**UI:**
- `packages/web/src/components/pipeline/lead-card.tsx` — card compartilhado entre `/dashboard/pipeline` e `/broker/pipeline`
- Já recebe `lead.source` e `lead.utm_campaign` como props
- Já renderiza `<SourceBadge source={lead.source} />` quando `lead.source` existe
- Já mostra `utm_campaign` truncado **apenas** quando `source === 'whatsapp_click_to_ad'`
- **Não consulta `leads.metadata` nem `meta_ads`** — não há código de exibição de criativo

### O Problema Hoje

| Cenário | Card mostra hoje | Card deveria mostrar |
|--|--|--|
| Lead via Meta Lead Form | "Meta Ads" (badge genérico) | Thumbnail do anúncio + nome do criativo |
| Lead via Click-to-WhatsApp | "WhatsApp" + utm_campaign truncado | Thumbnail do anúncio + nome do criativo (quando disponível) |
| Lead orgânico/site | "WhatsApp" / "Site" | (sem mudança) |

**Impacto no fluxo do corretor:**
- Corretor recebe lead novo em "Novos" do Kanban
- Precisa abrir lead → ver UTMs → ir no painel `/dashboard/campaigns/meta` → procurar pelo `utm_campaign` → identificar criativo
- 30-60 segundos de contexto perdido **por lead**
- Multiplicado por dezenas de leads/dia × N corretores = horas semanais de fricção

## Gaps Funcionais Confirmados

### Gap 1 — `meta_ads.creative` não tem preview utilizável (sub-épico 50A)

O cron `meta-sync-entities` solicita apenas `creative` (sem expansão de subfields). Resultado: `meta_ads.creative` armazena
algo como `{"id": "123456789"}` — **inútil para exibição**.

Precisa expandir para: `creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}`.

### Gap 2 — Lead card não tem componente para criativo (sub-épico 50B)

O `lead-card.tsx` recebe `lead.source` e `lead.utm_campaign`, mas não tem acesso a `lead.metadata.ad_id` nem a `meta_ads.creative`.
Precisa:
1. Expandir query da listagem do pipeline para incluir `metadata->>ad_id` e JOIN (ou cache) com `meta_ads`
2. Criar componente `<CreativeChip>` que exibe thumbnail + nome do ad em formato compacto (40×40 ou 48×48)

### Gap 3 — Leads CTWA não têm `ad_id` confiável (sub-épico 50C)

Hoje, leads vindos por `whatsapp_click_to_ad` chegam pelo webhook do WhatsApp com `referral.source_id` (ad_id) e
`referral.source_url` no payload, mas o handler **não persiste isso em `leads.metadata`** — só extrai `utm_campaign`.

Precisa atualizar handler do WhatsApp webhook para capturar `referral.source_id` (= meta_ad_id) em `leads.metadata.ad_id`,
habilitando attribution para CTWA também.

## Frentes de Trabalho

### 50A — Expansão do sync `meta_ads.creative`

Atualizar `/api/cron/meta-sync-entities/route.ts` para solicitar `creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}`.
Salvar em `meta_ads.creative` (JSONB já existe, sem migration nova).
Backfill: re-rodar sync uma vez (idempotente — `onConflict: "org_id,meta_ad_id"`).

### 50B — Componente `CreativeChip` no `lead-card.tsx`

UI compacta: thumbnail 32×32 + nome do criativo truncado (max 20 chars). Render condicional:
- Se `lead.source IN ('meta_ads', 'whatsapp_click_to_ad')` E `lead.metadata.ad_id` existe E `meta_ads.creative.thumbnail_url` resolvível → mostrar chip
- Senão → manter comportamento atual (SourceBadge + utm_campaign)
- Tooltip on hover: nome completo do ad + campanha (`meta_campaigns.name`)
- Click no chip abre modal com preview maior + link para `/dashboard/campaigns/meta?ad_id=...`

Query do pipeline precisa fazer LEFT JOIN otimizado (ou fetch separado batched) entre `leads.metadata->>ad_id` e `meta_ads.meta_ad_id` (org-scoped).

### 50C — Attribution CTWA via referral payload

Atualizar handler do webhook WhatsApp para extrair `referral.source_id` (= meta_ad_id) e `referral.source_url` (URL do post),
persistir em `leads.metadata.ad_id` no momento de criação do lead. Permite o `CreativeChip` funcionar também para CTWA.

---

## Stories

### Story 50.1 — Sync expandido de `meta_ads.creative` com thumbnail

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[meta_api_fields_validation, idempotency_test, performance]`
**Complexidade:** S (2h)
**Prioridade:** P0 — base para 50.2

**Descrição:**
Atualizar `packages/web/src/app/api/cron/meta-sync-entities/route.ts` para solicitar subfields do criativo na chamada
à Graph API e persistir o objeto enriquecido em `meta_ads.creative`.

**Acceptance Criteria:**
- AC1: A chamada ao Graph API `/{account}/ads` solicita campo `creative{id,name,thumbnail_url,image_url,effective_object_story_id,object_story_spec}`
- AC2: `meta_ads.creative` (JSONB) passa a armazenar objeto com pelo menos `id` e `thumbnail_url` quando o ad tem imagem
- AC3: Sync continua idempotente — re-execução não duplica linhas (mantém `onConflict: "org_id,meta_ad_id"`)
- AC4: Ads com criativo de vídeo ou sem imagem (creative apenas com `id`) **não falham o sync** — campo é persistido como veio do Meta
- AC5: Após deploy, rodar sync manual uma vez (POST `/api/cron/meta-sync-entities` com `Authorization: Bearer $CRON_SECRET`) e verificar que ao menos 80% dos ads ativos têm `creative.thumbnail_url` populado
- AC6: API calls extras (devido à expansão) ficam dentro do rate limit configurado para `meta-sync-entities` — adicionar contagem no `meta_sync_log.api_calls_made`

**Scope IN:**
- Atualizar fields do `fetchAllPages<MetaAd>` em `meta-sync-entities/route.ts`
- Atualizar tipo `MetaAd` em `packages/shared/src/meta/types.ts` para refletir o creative expandido
- Documentar shape esperado em comentário no código

**Scope OUT:**
- Migration nova (não é necessária — `creative` já é JSONB)
- Mudança no schema de `meta_ads`
- Mudança no `meta-sync-insights`

**Riscos:**
- R1: Meta pode rate-limitar a expansão em contas com muitos ads → mitigação: paginar via `fetchAllPages` (já existe) e tolerar 429 com backoff
- R2: Ads com criativos legados podem não retornar `thumbnail_url` → AC4 cobre

---

### Story 50.2 — Componente `CreativeChip` no card do lead

**Executor:** `@dev` (com `@ux-design-expert` para review visual) | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[ui_correctness, accessibility, performance_query]`
**Complexidade:** M (4-6h)
**Prioridade:** P0 — entrega o valor visível para o corretor
**Depende de:** Story 50.1 em produção

**Descrição:**
Exibir, no `LeadCard` do pipeline (Kanban), um chip compacto com thumbnail e nome do criativo Meta para leads
cuja `source IN ('meta_ads', 'whatsapp_click_to_ad')` e que tenham `metadata.ad_id` resolvível em `meta_ads`.

**Acceptance Criteria:**
- AC1: Quando `lead.source === 'meta_ads'` E `lead.metadata.ad_id` existe E há `meta_ads.creative.thumbnail_url` correspondente → renderizar `<CreativeChip thumbnail={url} name={ad_name} />` no card
- AC2: O chip tem altura compacta (~32px de thumbnail) e não quebra o layout do card em viewports mobile (375px) nem desktop
- AC3: Quando criativo não puder ser resolvido (sync atrasado, ad arquivado, sem metadata.ad_id) → o card mantém o comportamento atual (`SourceBadge` + `utm_campaign` truncado)
- AC4: Hover no chip (desktop) mostra tooltip com: nome completo do ad + nome da campanha (`meta_campaigns.name`)
- AC5: Click no chip abre modal/popover com preview maior (thumbnail 200×200 ou image_url) + link "Ver no painel de campanhas" → `/dashboard/campaigns/meta?ad_id={meta_ad_id}`
- AC6: A listagem do pipeline carrega criativos com no máximo +1 round-trip ao Supabase (batched lookup por `metadata.ad_id` distintos da página atual) — não pode disparar 1 query por card
- AC7: Para `source === 'whatsapp_click_to_ad'`, comportamento é o mesmo desde que `metadata.ad_id` exista (depende de 50.3)
- AC8: Chip respeita dark mode (já existe padrão de tokens `dark:bg-stone-*` no `lead-card.tsx`)
- AC9: Acessibilidade — chip tem `alt` text no thumbnail = nome do ad, e é navegável por teclado se for clicável
- AC10: Cobertura de testes — adicionar teste unitário do `CreativeChip` (props variantes: com/sem thumbnail, com/sem nome) e teste de integração na query do pipeline

**Scope IN:**
- Criar `packages/web/src/components/pipeline/creative-chip.tsx`
- Atualizar `lead-card.tsx` para receber `creative` prop opcional e renderizar o chip
- Atualizar queries do pipeline (`/dashboard/pipeline/page.tsx` e `/broker/pipeline/page.tsx`) para fazer batched lookup em `meta_ads` por `meta_ad_id IN (...)` org-scoped
- Atualizar tipos compartilhados se necessário
- Documentar o componente

**Scope OUT:**
- Edição/aprovação de criativos
- Filtros do pipeline por criativo (futura iteração)
- Performance/analytics de criativo (já é responsabilidade do epic 19)

**Riscos:**
- R1: Performance da query — leads do pipeline podem ter dezenas/centenas de ad_ids únicos → mitigar com índice (verificar com @data-engineer se índice em `meta_ads(org_id, meta_ad_id)` é suficiente — já existe pelo UNIQUE constraint)
- R2: Thumbnails do Meta CDN podem expirar/falhar → fallback gracioso para SourceBadge (AC3)
- R3: Densidade visual do card já é alta → review do @ux-design-expert obrigatório antes de @qa

---

### Story 50.3 — Attribution `ad_id` para leads Click-to-WhatsApp

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[whatsapp_webhook_test, attribution_correctness]`
**Complexidade:** S (2-3h)
**Prioridade:** P1 — habilita 50.2 para CTWA também
**Pode rodar em paralelo com 50.1**

**Descrição:**
Atualizar o handler de webhook do WhatsApp (canal de entrada de leads CTWA) para extrair `referral.source_id` (que é o `ad_id` do Meta)
e `referral.source_url` do payload, e persistir em `leads.metadata.ad_id` / `leads.metadata.ctwa_source_url` no momento de criação ou
update do lead.

**Acceptance Criteria:**
- AC1: Localizar o handler de webhook WhatsApp atual (provável: `packages/web/src/app/api/webhook/whatsapp/route.ts` ou similar — confirmar na investigação técnica)
- AC2: Quando payload da mensagem contém `referral.source_type === 'ad'` (CTWA), extrair `referral.source_id` e persistir em `leads.metadata.ad_id`
- AC3: Quando lead já existe (re-engajamento) → atualizar `metadata.ad_id` apenas se não estiver preenchido (preservar atribuição original)
- AC4: Lead novo via CTWA com referral é criado com `source = 'whatsapp_click_to_ad'`, `metadata.ad_id` populado, `utm_*` populados (comportamento atual mantido)
- AC5: Test fixture com payload real (anonimizado) de CTWA referral é adicionado em `packages/web/__tests__/` ou `e2e/`
- AC6: Backfill opcional via script `scripts/ctwa-backfill-ad-ids.ts` — para leads históricos com `utm_source = 'whatsapp_click_to_ad'` mas sem `metadata.ad_id`, tentar resolver via histórico de mensagens (out-of-scope para v1, deixar como TODO)

**Scope IN:**
- Atualização do handler WhatsApp webhook
- Test fixture de payload CTWA com referral
- Tipo TS para referral payload em `packages/shared`

**Scope OUT:**
- Backfill histórico (AC6 fica como TODO)
- Mudança em `whatsapp_config` ou schema base

**Riscos:**
- R1: Payload CTWA pode variar entre Meta Business Account e Cloud API — validar com payload real antes de codar
- R2: Conflito com lógica de dedup por phone — precisa garantir que update de metadata não destrói atribuição original (AC3)

---

## Requisitos Não-Funcionais (NFR)

- **NFR-1 Performance:** A página do pipeline não pode aumentar p95 de TTFB em mais que 100ms vs. baseline atual após a feature em produção. Medir antes/depois via Vercel Analytics ou equivalente.
- **NFR-2 Resiliência:** Falha na resolução de criativo (ad arquivado, thumbnail 404, sync atrasado) **nunca quebra** o card — degradação graciosa para `SourceBadge` (já é o comportamento atual).
- **NFR-3 Segurança/RLS:** Leitura de `meta_ads` no pipeline deve respeitar `org_isolation` (RLS já existe — apenas garantir que query não usa service role no client side).
- **NFR-4 Privacidade:** Thumbnails são URLs de CDN públicas do Meta (mesmo padrão que aparece no Ads Manager) — sem dados sensíveis. Não logar URLs em sistema de observabilidade externo.
- **NFR-5 Compatibilidade Mobile:** Card no `/broker/pipeline` precisa funcionar em mobile viewport (375px). Componente deve ser testado em mobile real (Lighthouse mobile audit) — alinhado com a Epic 22 (PWA).
- **NFR-6 Acessibilidade:** Componente cumpre WCAG AA — contraste de texto sobre thumbnail (overlay quando necessário), alt text descritivo, foco visível.

---

## Constraints (CON)

- **CON-1:** Não criar nova tabela. Reaproveitar `leads.metadata.ad_id` + `meta_ads.creative` existentes.
- **CON-2:** Não criar nova migration na story 50.1/50.2. Story 50.3 pode adicionar migration **somente se** for confirmado que `leads.metadata` precisa de índice GIN específico (`metadata->>'ad_id'`) — validar com `@data-engineer` antes.
- **CON-3:** Não modificar o contrato de RLS de `meta_ads` — usar a policy `org_isolation` existente.
- **CON-4:** Não usar `service_role_key` no client (browser) — query do pipeline já usa client com session do usuário, manter assim.
- **CON-5:** Não bloquear o render do pipeline se `meta_ads` lookup falhar — comportamento gracioso obrigatório (NFR-2).
- **CON-6:** Story 50.2 depende de Story 50.1 estar em produção e o sync ter rodado pelo menos 1× (caso contrário todos os criativos serão fallback).
- **CON-7:** Manter compatibilidade com leads orgânicos / WhatsApp não-CTWA / Site — esses cards **não** devem mostrar `CreativeChip` (renderizar comportamento atual).
- **CON-8:** No-Invention (Article IV): toda referência a campo/tabela neste epic foi verificada em código antes de ser escrita (ver "Contexto do Sistema Existente").

---

## Critérios de Done do Epic

- [ ] Story 50.1 deployed → `meta_ads.creative.thumbnail_url` populado para ads ativos
- [ ] Story 50.2 deployed → `CreativeChip` visível em `/dashboard/pipeline` e `/broker/pipeline` para leads Meta
- [ ] Story 50.3 deployed → leads CTWA novos passam a ter `metadata.ad_id`
- [ ] Métrica de adoção: ≥ 80% dos leads `meta_ads` novos (criados após deploy) exibem `CreativeChip` no card
- [ ] Métrica de fricção: corretor leva ≤ 5s para identificar criativo do lead (vs. ~30-60s hoje) — validação qualitativa com 2 corretores
- [ ] Sem regressão de p95 TTFB no pipeline (NFR-1)
- [ ] Zero erros novos no log relacionados a `meta_ads.creative` ou `CreativeChip` em 7 dias pós-deploy

---

## Riscos Globais do Epic

| ID | Risco | Probabilidade | Impacto | Mitigação |
|----|-------|---------------|---------|-----------|
| GR-1 | Thumbnails Meta CDN expirando ou bloqueados por CSP | Média | Médio | Configurar CSP `img-src https://*.fbcdn.net https://*.cdninstagram.com` no `next.config.js`; fallback gracioso (NFR-2) |
| GR-2 | Densidade visual do card piora UX | Média | Alto | Review obrigatório @ux-design-expert na story 50.2 antes de implementar |
| GR-3 | Performance da query do pipeline degrada em orgs com muitos leads | Baixa | Médio | Batched lookup (AC6 da 50.2); índice já existe; medir com EXPLAIN antes do PR |
| GR-4 | Mudança no shape do `creative` da Meta API quebra parsing | Baixa | Médio | Defensivo no parsing (optional chaining); shape salvo "as is" do Meta |
| GR-5 | CTWA referral payload divergente entre WA Business Account e Cloud API | Média | Médio | Story 50.3 AC1 obriga validação de payload real antes de codar |

---

## Próximos Passos

1. **@po (Pax):** Validar este epic via `*validate-story-draft` (checklist 10 pontos aplicado ao epic, não à story individual)
2. **@sm (River):** Criar story files `50.1.story.md`, `50.2.story.md`, `50.3.story.md` a partir deste epic via `*draft`
3. **@data-engineer (Dara):** Confirmar que `meta_ads(org_id, meta_ad_id)` tem índice adequado para o batched lookup da 50.2 (provável: já temos via UNIQUE constraint)
4. **@architect (Aria):** Revisar decisão de não criar nova tabela / não nova migration (CON-1, CON-2) — sign-off rápido antes de @sm draftar
5. **Order de execução sugerida:** 50.1 (P0) → 50.3 em paralelo (P1) → 50.2 após 50.1 em produção (P0)

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-03 | @pm (Morgan) | Criação do epic baseado em request de feature do PO + investigação técnica de Meta integration, schema atual e lead-card.tsx |

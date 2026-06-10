# Story 55-1 — Editor Visual de E-mail com A/B de Imagens em Campanhas de Sorteio

## Metadata
- **Epic:** 55 — Campaign Email Visual Editor & A/B Creative Performance
- **Story:** 55-1
- **Status:** Ready
- **Priority:** P1 — feature estratégica; bloqueada apenas por migration de schema
- **Complexity:** L (schema + storage + editor + UI nova) — estimativa 8-12h @dev + 2h @data-engineer
- **Created:** 2026-06-10
- **Author:** @sm (River)

### Executor Assignment
- **Executor principal (T0 schema/migration):** @data-engineer (Dara)
- **Executor principal (T1-T8 código):** @dev (Dex) — após migration aplicada em dev
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[vitest_unit, tsc_noEmit, pnpm_lint, manual_email_send_smoke]`
- **Supporting Agent:** @data-engineer (Dara) — consultar para revisar migration antes do apply

---

## User Story

**Como** administrador do CRM que cria campanhas de sorteio,
**Quero** montar o e-mail de confirmação num editor visual com suporte a blocos de imagem linkada e upload direto para o Supabase Storage,
**Para que** eu possa testar variantes A/B de imagens no mesmo e-mail e medir qual criativo gera mais cliques — sem escrever HTML à mão.

---

## Context

Hoje o form de criação de campanha (`/dashboard/campaigns/nova/`) expõe um `<textarea>` para HTML cru no campo `email_body_html`. O cron de envio (`campaign-poll`) faz replace de `{{nome}}`/`{{name}}` e envia via Resend. O webhook Resend (`/api/webhook/resend/route.ts`) já captura `email.clicked` e persiste o objeto `body.data.click` (com `link` = URL clicada) em `campaign_events.metadata`.

O que falta:
1. **Editor visual** em vez de textarea raw — já existe `visual-editor.tsx` (usa `react-email-editor`/Unlayer) em `sistema/email-templates/`, mas não está conectado a campanhas.
2. **Upload de imagens** para Supabase Storage com bucket dedicado `campaign-assets`.
3. **Variant ID por imagem** — cada imagem inserida recebe UUID único; o link de destino é injetado com `?utm_content=<variant_id>` para que o webhook Resend consiga distinguir qual imagem foi clicada.
4. **Aba Performance** em `/dashboard/campaigns/[id]/` que agrega cliques por `variant_id` (extraído de `utm_content` na URL capturada pelo webhook).

---

## Acceptance Criteria

1. **AC1 — Editor visual no form de campanha:** A página `/dashboard/campaigns/nova/` (e a edição `/dashboard/campaigns/[id]/editar`) substituiu o `<textarea name="email_body_html">` pelo componente `VisualEditor` (reutilizado de `sistema/email-templates/`). Abaixo do editor existe um toggle "Modo avançado (HTML)" que, ao ativar, exibe o textarea original como fallback.

2. **AC2 — Persistência de design JSON:** O form persiste dois campos: `email_body_html` (HTML exportado pelo Unlayer, para uso no cron de envio) e `email_body_json` (design JSON do Unlayer, para re-edição). Campanhas antigas sem `email_body_json` continuam funcionando (campo nullable, editor inicia com `DEFAULT_DESIGN` nesses casos).

3. **AC3 — Upload de imagem via editor:** Ao inserir um bloco "Image" no Unlayer, o usuário pode selecionar um arquivo local (jpg/png/webp/gif, max 5 MB). O arquivo é enviado para o bucket `campaign-assets` no Supabase Storage. A URL pública retornada substitui o src no editor.

4. **AC4 — Variant ID + UTM injetado:** Para cada imagem inserida pelo usuário em uma campanha, uma linha é persistida em `campaign_email_images` com `variant_id` (UUID v4), `image_url`, `link_url`, `alt_text`, `campaign_id`. A URL final do link no HTML renderizado tem `?utm_content=<variant_id>` injetado automaticamente antes do envio (dentro do cron `campaign-poll`, no bloco de substituição de HTML, após o replace de `{{nome}}`/`{{name}}`).

5. **AC5 — Webhook Resend: extração de `utm_content`:** No webhook Resend (`/api/webhook/resend/route.ts`), ao processar `email.clicked`, o campo `body.data.click.link` já é salvo em `campaign_events.metadata.click`. O webhook NÃO precisa ser modificado para extrair `utm_content` — a extração é feita na camada de aggregation (Server Component da aba Performance). Esta AC apenas documenta e confirma que o shape atual (`metadata.click.link`) é suficiente.

6. **AC6 — Aba Performance em `/dashboard/campaigns/[id]/`:** A página de detalhe da campanha ganha uma segunda aba "Performance" (ao lado da aba existente de entradas). A aba lista todas as imagens da campanha (via JOIN `campaign_email_images`) com as seguintes colunas:
   - Thumbnail (img tag com `image_url`, 48×48)
   - Alt text
   - Enviados (contagem de `campaign_events` com `event_type = 'sent'` para a campanha)
   - Cliques (contagem de `campaign_events` onde `event_type = 'clicked'` AND `metadata->>'click'->>>'link'` contém `utm_content=<variant_id>`)
   - Click-rate % (cliques / enviados × 100, formatado como "12.5%")
   - Ordenado por click-rate DESC

7. **AC7 — Bucket Supabase Storage `campaign-assets`:** Migration SQL cria o bucket `campaign-assets` com `public = true`. Policies: SELECT público (qualquer um), INSERT/UPDATE/DELETE autenticado (usuários logados da org). MIME types aceitos: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Tamanho máximo por arquivo: 5 MB. Nomes de arquivo prefixados com `{org_id}/{campaign_id}/{variant_id}.{ext}` para evitar colisão.

8. **AC8 — Compatibilidade retroativa:** Campanhas existentes com `email_body_html` em texto cru (sem `email_body_json`) continuam sendo enviadas normalmente pelo cron `campaign-poll`. O campo `email_body_json` é `NULL` nessas campanhas. O editor carrega com `DEFAULT_DESIGN` quando `email_body_json` é `NULL` e o usuário abre o form de edição.

9. **AC9 — TypeScript compila sem erros; ESLint passa; testes unitários do cron de injeção de UTM passam.**

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente = disabled).
> Validação de qualidade via revisão manual pelo @qa.

---

## Tasks / Subtasks

- [x] **T0 — Schema + Storage migration** (AC2, AC4, AC7) — @data-engineer
  - [x] T0.1: Criar `supabase/migrations/092_campaign_email_visual_editor.sql`:
    - `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_body_json JSONB` (nullable — compat retroativa)
    - `CREATE TABLE campaign_email_images (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, variant_id uuid NOT NULL DEFAULT gen_random_uuid(), image_url TEXT NOT NULL, link_url TEXT, alt_text TEXT, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())` — índice em `campaign_id`
    - RLS em `campaign_email_images`: SELECT/INSERT/UPDATE/DELETE restrito à `org_id` da campanha (via JOIN ou policy baseada em function `auth.uid()`)
    - Storage bucket `campaign-assets`: `INSERT INTO storage.buckets ...` com `public = true`, tamanho max 5MB
    - Storage policies via `storage.objects`: SELECT público, INSERT/UPDATE/DELETE autenticado
  - [x] T0.2: Aplicar migration em **dev** (`xnxvygyfyyyzwhiuoehz`) primeiro, validar; depois prod
  - [x] T0.3: Verificar numeração — próxima migration é `092` (última confirmada: `091_fix_broker_novos_leads.sql`)

- [x] **T1 — API de upload de imagem** (AC3, AC7) — @dev
  - [x] T1.1: Criar `packages/web/src/app/api/campaigns/upload-image/route.ts` — POST multipart, aceita arquivo, valida MIME e tamanho (≤5MB), faz upload para `campaign-assets/{org_id}/{campaign_id}/{uuid}.{ext}` via Supabase Storage client, retorna `{ url: string }`
  - [x] T1.2: Auth via `requireAuth()` de `@web/lib/api-auth` (padrão do projeto — não service_role)
  - [x] T1.3: Storage usa mesmas vars Supabase configuradas — nenhuma variável nova necessária

- [x] **T2 — API de persistência de `campaign_email_images`** (AC4) — @dev
  - [x] T2.1: Criar `packages/web/src/app/api/campaigns/[id]/images/route.ts` — GET lista imagens, POST insere variante, DELETE remove pelo image_id query param
  - [x] T2.2: Auth via `requireAuth()`, RLS da migration garante isolamento por org

- [x] **T3 — Adapter do VisualEditor para campanhas** (AC1, AC2, AC3) — @dev
  - [x] T3.1: Criar `packages/web/src/app/dashboard/campaigns/_components/campaign-visual-editor.tsx` — wrapper do VisualEditor com `registerUploadCallback` para interceptar uploads, expõe `getHtmlAndDesign()` via ref
  - [x] T3.2: Toggle "Modo avançado (HTML)" implementado com estado local `showRawHtml`

- [x] **T4 — Integração no form de campanha** (AC1, AC2, AC8) — @dev
  - [x] T4.1: `nova/page.tsx` — substituiu `<textarea>` pelo `CampaignVisualEditor`. UUID pré-gerado (`pendingId`) permite uploads antes da campanha existir
  - [x] T4.2: `editar/page.tsx` — reescrito com editor visual e carregamento de `email_body_json` existente
  - [x] T4.3: `api/campaigns/route.ts` aceita `campaign_id` e `email_body_json`. `api/campaigns/[id]/route.ts` PATCH aceita `email_body_json`

- [x] **T5 — Injeção de UTM no cron de envio** (AC4, AC8) — @dev
  - [x] T5.1: `campaign-poll/route.ts` — injeta UTM após replace de placeholders via `injectUtmToHtml`
  - [x] T5.2: Retrocompat garantida — lista vazia = no-op
  - [x] T5.3: Helper puro `injectUtmToHtml` em `packages/web/src/lib/campaign-utm.ts`

- [x] **T6 — Aba Performance no detalhe da campanha** (AC5, AC6) — @dev
  - [x] T6.1: `campaigns/[id]/page.tsx` — tabs via searchParams (`?tab=performance`), Link navigation
  - [x] T6.2: Server Component `performance-tab.tsx` — busca imagens + cliques, extrai utm_content via URL parser, ordena por click-rate DESC
  - [x] T6.3: Aggregation feita no Server Component diretamente (sem route handler extra)

- [x] **T7 — Testes unitários** (AC9) — @dev
  - [x] T7.1: `packages/web/src/lib/campaign-utm.test.ts` — 6 testes cobrindo todos os cenários obrigatórios: link sem params, com params, lista vazia, sem duplicar utm_content, link_url nulo, múltiplas variantes
  - [x] T7.2: 280 testes existentes passando sem regressões

- [x] **T8 — QA e smoke test** (AC9) — @dev antes de passar para @qa
  - [x] T8.1: `tsc --noEmit --skipLibCheck` sem erros; ESLint sem erros novos nos arquivos criados
  - [ ] T8.2: Smoke test manual: criar campanha test com 2 imagens, verificar que `campaign_email_images` foi populado, verificar que HTML gerado contém `utm_content`
  - [x] T8.3: Retrocompat garantida — `injectUtmToHtml(html, [])` retorna HTML inalterado (testado em T7.1)

---

## Dev Notes

### Source Tree Relevante

```
packages/web/src/app/dashboard/campaigns/nova/page.tsx                 ← T4.1 — textarea linha 224
packages/web/src/app/dashboard/campaigns/[id]/page.tsx                 ← T6.1 — adicionar tabs
packages/web/src/app/dashboard/campaigns/[id]/editar/                  ← T4.2 — verificar se existe
packages/web/src/app/dashboard/campaigns/[id]/entries-table.tsx        ← referência de padrão UI
packages/web/src/app/api/campaigns/route.ts                            ← T4.3 — aceitar email_body_json
packages/web/src/app/api/cron/campaign-poll/route.ts                   ← T5.1 — inject UTM (linha 450-458)
packages/web/src/app/api/webhook/resend/route.ts                       ← AC5 — click.link já salvo (linha 211-213)
packages/web/src/app/dashboard/sistema/email-templates/_components/visual-editor.tsx  ← REUSAR (não modificar; arquivo untracked/sem commit — @dev decide se reaproveita ou refaz do zero antes de T3)
supabase/migrations/013_campaign_engine.sql                             ← schema base: campaigns + campaign_events
supabase/migrations/091_fix_broker_novos_leads.sql                     ← última migration confirmada
packages/web/src/lib/email.ts                                          ← sendEmail() — não modificar
```

### VisualEditor — Detalhes Importantes

O componente `visual-editor.tsx` usa `react-email-editor` (Unlayer). A API relevante:

```ts
// Exportar HTML + design JSON
const { html, design } = await editorRef.current.exportHtml()

// Carregar design existente
editorRef.current.loadDesign(designObject)

// Registrar callback de upload de imagem (customizar upload handler)
// Unlayer expõe `registerCallback('image', handler)` para interceptar file picker
// Ver docs Unlayer: https://docs.unlayer.com/docs/custom-image-library
```

O componente expõe via `useImperativeHandle` um `exportHtml()` que retorna `{ html, design }` (linhas 326-355 do arquivo). O `@dev` DEVE consultar `node_modules/next/dist/docs/` conforme `packages/web/AGENTS.md` antes de escrever código — esta versão do Next.js pode ter convenções não-padrão.

### Schema da Migration 092

```sql
-- Adicionar email_body_json à tabela campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS email_body_json JSONB;

-- Tabela de variantes de imagem por campanha
CREATE TABLE campaign_email_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  image_url    TEXT NOT NULL,
  link_url     TEXT,
  alt_text     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_email_images_campaign_id
  ON campaign_email_images (campaign_id);

-- RLS
ALTER TABLE campaign_email_images ENABLE ROW LEVEL SECURITY;
-- (policy a definir baseada em org_id via JOIN com campaigns — @data-engineer a validar)

-- Bucket campaign-assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-assets',
  'campaign-assets',
  true,
  5242880,  -- 5 MB em bytes
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (a ajustar conforme auth schema do projeto)
-- SELECT público, INSERT autenticado
```

**Nota @data-engineer:** Verificar padrão de RLS do projeto — `auth.uid()` pertence ao `org_id` ou existe helper como `get_user_org_id()`? Confirmar antes de finalizar a policy. Ver `migrations/013_campaign_engine.sql` e `014_fix_campaign_rls.sql` como referência de padrão RLS em campanhas.

### Fluxo de UTM Injection (cron campaign-poll)

Hoje (linhas 450-458 do cron):
```ts
let html = campaign.email_body_html
  .replace(/\{\{nome\}\}/gi, fields.name)
  .replace(/\{\{name\}\}/gi, fields.name)
```

Após T5, o fluxo adiciona:
```ts
// Após replace de {{nome}} e custom fields:
const images = await supabase
  .from('campaign_email_images')
  .select('variant_id, image_url, link_url')
  .eq('campaign_id', campaign.id)

html = injectUtmToHtml(html, images.data ?? [])
```

O helper `injectUtmToHtml` busca por `href` attributes que contenham o `image_url` e appends `utm_content=<variant_id>`.

**ATENÇÃO:** O Unlayer exporta HTML com `href` no elemento `<a>` que envolve a `<img>`. O helper deve procurar por `href="<link_url>"` e substituir por `href="<link_url>?utm_content=<variant_id>"` (ou `&utm_content=` se já há query string). Usar regex simples com escape de URL.

### Webhook Resend — Click Tracking (AC5)

`campaign_events.metadata` já recebe (linha 211-213 do webhook):
```ts
...(eventType === "email.clicked" && body.data?.click
  ? { click: body.data.click }
  : {}),
```

O objeto `body.data.click` do Resend contém `{ link: string, ... }`. Para extrair `utm_content`:
```ts
// No Server Component da aba Performance (T6.2):
const url = new URL(event.metadata?.click?.link ?? '')
const variantId = url.searchParams.get('utm_content')
```

Ou via query SQL:
```sql
-- Extrai utm_content do link clicado
SELECT
  regexp_match(metadata->'click'->>'link', '[?&]utm_content=([^&]+)') AS variant_id_arr
FROM campaign_events
WHERE campaign_id = $1 AND event_type = 'clicked'
```

### Auth Pattern

Usar `requireAuth()` de `@web/lib/api-auth` em todas as route handlers novas (padrão do projeto para admin routes). **NÃO** usar `service_role` diretamente — RLS é aplicado via auth.

### Pontos a Validar com @data-engineer / @architect

1. **RLS de `campaign_email_images`**: qual helper de org_id usar? Consultar `013_campaign_engine.sql:14_fix_campaign_rls.sql` para padrão existente.
2. **Storage policies**: confirmar se o projeto usa funções customizadas de auth ou Supabase built-in `auth.uid()`.
3. **Ordering do email body JSON**: confirmar que `email_body_json JSONB` nullable não quebra queries/types existentes de `campaigns`.
4. **Performance da query de cliques**: a query SQL de extração de `utm_content` via regex no JSONB pode ser lenta em alto volume — avaliar se índice GIN em `campaign_events.metadata` já existe ou deve ser adicionado como parte desta migration.

### Compatibilidade Retroativa — Campanhas Existentes

- `email_body_json` é nullable: campanhas antigas têm `NULL`.
- O cron `campaign-poll` não muda para campanhas sem `email_body_json` — `campaign_email_images` estará vazia, `injectUtmToHtml([])` retorna HTML inalterado.
- O editor de edição de campanha antiga inicia com `DEFAULT_DESIGN` (já definido no `visual-editor.tsx`), NÃO carrega o `email_body_html` raw como design.

---

## Testing

### Test file location
- `packages/web/src/lib/campaign-utm.test.ts` — helper de injeção UTM (colocado em `lib/` pois é pure function, seguindo padrão `ctwa-metadata.test.ts` da Story 50-3 de colocation com o código)

### Test standards
- Framework: **Vitest** (NÃO Jest). `vitest.config.ts` na raiz do monorepo inclui `packages/web/src/**/*.test.ts`.
- Não usar `__tests__/` em `packages/web/` — esses arquivos NÃO são descobertos pelo vitest config atual (lição aprendida na Story 50-3, Completion Notes).
- Mock do Supabase client para testes de route handlers (se necessário).

### Cenários obrigatórios para `injectUtmToHtml`
1. Link sem query params → `?utm_content=<variant_id>` adicionado
2. Link com query params existentes → `&utm_content=<variant_id>` adicionado
3. Lista de imagens vazia → HTML retornado inalterado
4. Link já contém `utm_content` → não duplicar o parâmetro

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `react-email-editor` (Unlayer) pode não suportar `registerCallback('image', ...)` na versão instalada | T3.1 — verificar versão no `packages/web/package.json` antes de implementar; fallback: usar `onImageUpload` prop se disponível |
| R2 | Parsing de `utm_content` via regex no JSONB pode ser lento em `campaign_events` com muitas linhas | T6.2 — adicionar LIMIT; considerar índice GIN ou view materializada se > 100k eventos |
| R3 | Campanha existente "Sorteio Raquete Z Balance Zand" tem `email_body_html` raw — migrar pra editor pode quebrar layout | AC8 + T4.2 — editor inicia com DEFAULT_DESIGN, NÃO tenta parsear o HTML legado; campanha antiga só é impactada se admin re-salvar pelo editor visual |
| R4 | Conflito de numeração de migration (histórico 074/075) | T0.3 — verificar via `ls supabase/migrations/ \| sort \| tail -5` antes de criar; última confirmada é 091 → próxima é 092 |
| R5 | Storage policy muito permissiva (public INSERT) | AC7 — INSERT deve exigir `auth.uid() IS NOT NULL`; @data-engineer valida |

---

## Out of Scope

- Dashboard global de criativos (cross-campanha) — fora desta story
- Backfill de imagens em campanhas antigas
- A/B de subject line ou texto do e-mail — apenas imagens nesta story
- Integração com meta_ads criativos (Epic 50) — CTWA e Meta são sistemas separados
- Notificações de "criativo vencedor" automáticas

---

## Definition of Done

- [ ] AC1-AC9 marcados como completos
- [ ] T0-T8 marcados como done
- [ ] Migration 092 aplicada em dev e prod (em ordem: dev primeiro)
- [ ] @data-engineer validou migration e RLS antes do apply em prod
- [ ] Smoke test manual: campanha nova com 2 imagens, e-mail enviado, utm_content presente no HTML
- [ ] @qa executou quality gate (`*qa-gate`) com verdict ≥ PASS ou CONCERNS não-bloqueante
- [ ] @devops fez push (`*push`)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-10 | 0.1 | Story drafted a partir de sessão de escopo com Lucas (owner). Epic 55 criado. Auto-decisions documentadas na story: schema `campaign_email_images` separado, `email_body_json` nullable, epic novo 55. | @sm (River) |
| 2026-06-10 | 0.2 | Validação `*validate-story-draft` executada: 10/10 no checklist AIOS. Verdict GO. Status Draft → Ready. Observações não-bloqueantes: (a) risco do `visual-editor.tsx` untracked está em Dev Notes mas não na tabela R1-R5 — @dev confirma viabilidade do arquivo antes de T1; (b) AC5 é declarativa (não-mod do webhook), aceitável; (c) migração 092 confirmada (última aplicada: 091_fix_broker_novos_leads.sql). | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.6 (default)

### Debug Log References
- TypeScript crash com `pnpm type-check` (SIGABRT) — contornado com `node --max-old-space-size=4096 node_modules/typescript/bin/tsc`. Pré-existente, não relacionado à story.
- Import alias: projeto usa `@web/` (não `@/`) — corrigido em `campaign-visual-editor.tsx`.
- Vitest está na raiz do monorepo, não no pacote `web` — rodar de `/Users/lucasprado/trifold-crm`.

### Completion Notes List
- `nova/page.tsx` usa `pendingId = useState(() => crypto.randomUUID())` como `campaign_id` pré-gerado para uploads antes da campanha ser salva. Images "órfãs" ficam no Storage se form for abandonado — aceitável para v1.
- A aba Performance usa `searchParams` (Server Component) para controle de tab, evitando `"use client"` e estado no servidor.
- `registerUploadCallback` interno ao `VisualEditor` acessa `editorRef.current._editorRef.current.editor` — caminho frágil dependente do internals do `react-email-editor`. Se Unlayer atualizar, revisar.
- 6 testes pré-existentes falhando no `whatsapp/__tests__/route.test.ts` (import `@web/lib/supabase/admin` não encontrado) — não causados por esta story.

### File List
**Novos:**
- `packages/web/src/lib/campaign-utm.ts`
- `packages/web/src/lib/campaign-utm.test.ts`
- `packages/web/src/app/api/campaigns/upload-image/route.ts`
- `packages/web/src/app/api/campaigns/[id]/images/route.ts`
- `packages/web/src/app/dashboard/campaigns/_components/campaign-visual-editor.tsx`
- `packages/web/src/app/dashboard/campaigns/[id]/_components/performance-tab.tsx`
- `supabase/migrations/092_campaign_email_visual_editor.sql`

**Modificados:**
- `packages/web/src/app/dashboard/campaigns/nova/page.tsx`
- `packages/web/src/app/dashboard/campaigns/[id]/editar/page.tsx`
- `packages/web/src/app/dashboard/campaigns/[id]/page.tsx`
- `packages/web/src/app/api/campaigns/route.ts`
- `packages/web/src/app/api/campaigns/[id]/route.ts`
- `packages/web/src/app/api/cron/campaign-poll/route.ts`

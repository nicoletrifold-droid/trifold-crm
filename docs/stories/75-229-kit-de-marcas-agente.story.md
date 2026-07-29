# Story 75-229 — Kit de Marcas na aba Agente (base p/ geração de arte)

**Status:** Done
**Tipo:** Feature
**Epic:** Agente de Marketing
**Complexidade:** M

## Contexto
Decisão do Marcos (29/07): antes do piloto do motor de imagem, construir o **Kit de
Marcas** dentro da aba Agente (Campanhas › Agente) — inspirado no Brand Hub do Canva —
para a equipe já subir os arquivos e o agente ter uma base palpável. Uma marca para a
**Trifold institucional** e uma por **empreendimento** (Vind, Yarden, Solun…).

Cada marca reúne: logotipos, paleta de cores, fontes (referência), voz da marca,
diretrizes (proibições jurídicas/comerciais) e fotos/elementos de referência. É o
insumo que o futuro "Gerar arte" (modelo de imagem com referências) vai consumir; as
fotos reais de empreendimento continuam também na Biblioteca da Nicole (sem fusão).

## Acceptance Criteria
1. **AC1 — Migração 197:** tabela `marketing_brands` (org, nome, tipo
   institucional|empreendimento, property_id nullable→properties, cores jsonb,
   fontes, voz_da_marca, diretrizes, is_active, created_by) + `marketing_brand_assets`
   (brand_id CASCADE, tipo logo|foto|elemento, label, file_path, file_url, file_name,
   file_size, created_by). RLS ENABLED **sem policies** (padrão marketing_posts —
   acesso só via admin client em rota gateada). Bucket `marketing-brands` público,
   `file_size_limit` 10MB, MIME png/jpeg/webp/svg.
2. **AC2 — APIs gateadas por `marketingGuard()`** (admin/supervisor):
   GET/POST `/api/marketing-brands`; PATCH/DELETE `/api/marketing-brands/[id]`
   (DELETE remove assets do storage); POST `[id]/assets/sign` (signed upload URL,
   convenção 75-208 — extensão sanitizada, path `org/{brandId}/{uuid}.{ext}`);
   POST `[id]/assets` (registro; rollback do storage se insert falhar);
   DELETE `[id]/assets/[assetId]` (storage + linha).
3. **AC3 — UI:** nova seção **"Marcas"** na aba Agente (mesmo container/estilo das
   seções existentes), acima de Sugestões: cards por marca (logo principal como
   thumbnail, nome, tipo/empreendimento, nº de arquivos) + botão "+ Nova marca".
4. **AC4 — Modal criar/editar marca:** nome*, tipo (institucional|empreendimento),
   empreendimento (select de properties, obrigatório se tipo=empreendimento), cores
   (hex separadas por vírgula, com preview em chips), fontes, voz da marca,
   diretrizes. No modo edição: gestão de arquivos — upload (signed URL, múltiplos,
   por tipo logo/foto/elemento), thumbnails, excluir. No modo criação, aviso "salve a
   marca para enviar arquivos".
5. **AC5 — Validação server-side** em helper puro `lib/marketing/brands.ts`
   (padrão `posts.ts`): nome obrigatório, tipo whitelist, property exigida p/
   empreendimento, cores = array de hex válidos; **com testes** (`brands.test.ts`).
6. **AC6 — Sem regressão** na aba Agente (Sugestões/Fila/Publicados intactos);
   seção invisível pra quem não passa no gate (a aba já é admin/supervisor).

## Fora do escopo
- Consumo do kit pelo "Gerar arte" (story seguinte, pós-piloto do motor).
- Fusão com a Biblioteca de Mídia da Nicole.
- Upload de fontes (arquivo .ttf) — campo é referência textual por ora.
- Peças aprovadas viram referência da marca (loop de aprendizado — futuro).

## Riscos
- Bucket público novo: MIME whitelist + file_size_limit desde a criação (gotcha das
  migs 186/190 — o teto real mora no bucket).
- SVG em bucket público: servido como arquivo; usado só em `<img>` no dashboard.

## Dev Agent Record
### File List
- `supabase/migrations/197_marketing_brands.sql` (novo)
- `packages/web/src/lib/marketing/brands.ts` (novo) + `brands.test.ts` (novo, 8 testes)
- `packages/web/src/app/api/marketing-brands/route.ts` (novo)
- `packages/web/src/app/api/marketing-brands/[id]/route.ts` (novo)
- `packages/web/src/app/api/marketing-brands/[id]/assets/sign/route.ts` (novo)
- `packages/web/src/app/api/marketing-brands/[id]/assets/route.ts` (novo)
- `packages/web/src/app/api/marketing-brands/[id]/assets/[assetId]/route.ts` (novo)
- `packages/web/src/app/dashboard/campaigns/agente/marcas-section.tsx` (novo)
- `packages/web/src/app/dashboard/campaigns/agente/agente-client.tsx`
- `docs/stories/75-229-kit-de-marcas-agente.story.md` (novo)

## QA Results
### Review Date: 2026-07-29 — Reviewed By: Quinn
Gate: **CONCERNS→PASS** — 7/7 checks; segurança das 5 rotas ok (guard, org_id,
path com prefixo org/brand, rollback, limpeza no delete); 6/6 ACs. CONCERNS:
(1) MEDIUM assets do modal não propagavam ao pai sem Salvar → corrigido
(`onAssetsChanged` a cada mutação); (2) LOW exclusão de asset sem confirmação →
corrigido (two-step inline). Débitos LOW aceitos e documentados: órfão de upload
interrompido não é varrido (delete da marca remove só paths registrados) e o
registro não verifica existência/duplicidade do objeto — superfície restrita a
admin/supervisor da própria org. Suíte 1268/1268; tsc/eslint/build limpos.

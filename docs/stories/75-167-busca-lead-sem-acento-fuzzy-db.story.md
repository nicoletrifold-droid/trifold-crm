# Story 75-167 — Busca de lead sem acento + fuzzy (lado banco: Leads, Pipeline, API)

## Metadata
- **Status:** Done · **Epic:** Busca de leads · **PR:** #216 · deploy 567f7cb · **Complexidade:** M (5 pontos) · **Branch:** feat/75-167-busca-lead-sem-acento-fuzzy-db
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Marcos: buscar "andreia" não acha "Andréia" (acento), e "maicon" não acha "maicom" (typo). Hoje a busca usa `ilike` (case-insensitive, **accent-SENSITIVE**), sem fuzzy. Extensões `unaccent`/`pg_trgm` disponíveis (não instaladas). Decisão do Marcos: **sem acento + fuzzy**, em **todos** os lugares. Esta story cobre os **3 pontos no banco** (via PostgREST): Leads (`dashboard/leads/page.tsx`), Pipeline (`dashboard/pipeline/page.tsx`), API (`api/leads/route.ts`). Os 3 pontos client-side vêm na 75-168.

## Escopo
**IN:**
1. **Migration 174:** `unaccent` + `pg_trgm` (schema `extensions`); wrapper IMMUTABLE `public.f_unaccent`; coluna gerada `leads.name_search = lower(f_unaccent(name))`; índice GIN trigram em `name_search`; RPC `public.fuzzy_lead_ids(p_org, p_term, p_limit)` → `table(id uuid)` (nomes parecidos por trigram, ranqueados, respeita org+RLS).
2. **Helper** `lib/leads/search.ts`: `normalizeSearchTerm(s)` = NFD + tira diacríticos + lower + trim (casa com `f_unaccent` do banco).
3. **3 sites DB:** trocar `name.ilike.%s%` por busca em `name_search` (accent-insensitive) **+** unir ids do `fuzzy_lead_ids` no `.or(...)` (typo). Preservar filtros/paginação/contagem existentes (só o trecho de nome muda). Telefone segue por dígitos.

**OUT:** os 3 sites client-side (broker leads/chat, conversas → 75-168); buscas não-lead (usuários, clientes, brindes); mudar UI.

## Acceptance Criteria
1. **Given** busca "andreia", **then** retorna "Andréia"/"ANDRÉIA" (accent-insensitive) na tela de Leads, Pipeline e API.
2. **Given** busca "maicom" (typo) e existe "Maicon", **then** ele aparece (fuzzy trigram).
3. **Given** os filtros atuais (etapa/empreendimento/corretor/origem/view/datas/paginação), **then** continuam funcionando junto com a busca (sem regressão).
4. **Given** busca por telefone (dígitos), **then** continua funcionando.
5. **Given** termo vazio, **then** sem filtro de nome (comportamento atual).
6. Migration aplicada é ADITIVA (coluna+índice+RPC; não altera dados/queries existentes). tsc/lint/vitest limpos, com teste de `normalizeSearchTerm`.

## Dev Notes
- Sites: `dashboard/leads/page.tsx:109-112`, `dashboard/pipeline/page.tsx:127-133`, `api/leads/route.ts:61`. `.or()` PostgREST aceita `id.in.(uuid,uuid)`.
- Coluna gerada exige unaccent IMMUTABLE → wrapper `f_unaccent` usa a forma de 2 args (`extensions.unaccent('extensions.unaccent'::regdictionary, $1)`).
- RPC via `supabase.rpc("fuzzy_lead_ids", { p_org, p_term })` (client autenticado → RLS aplica). Se retornar 0 ids, `.or` só com name_search/phone.
- CONVENÇÃO: `normalizeSearchTerm` no app deve espelhar `lower(f_unaccent())` do banco. Ver [[feedback-nao-quebrar-o-que-funciona]] (a query da lista é crítica — mudar só o trecho de nome).

## Dev Agent Record (@dev — 2026-07-16)
- **Migration 174** aplicada em prod (aditiva): `unaccent`+`pg_trgm`, `f_unaccent` IMMUTABLE, coluna gerada `leads.name_search`, índice GIN trigram, RPC `fuzzy_lead_ids(p_org,p_term,p_limit)`.
- **`lib/leads/search.ts`:** `normalizeSearchTerm` (NFD+diacríticos+lower), `orSafeSearchTerm` (remove `,()%*`), `buildLeadSearchOrFilter` (monta `.or`: name_search ilike + phone dígitos + fuzzy ids do RPC).
- **3 sites:** `dashboard/leads/page.tsx`, `dashboard/pipeline/page.tsx`, `api/leads/route.ts` — usam o helper; filtros/paginação/contagem preservados.
- **Testado em PROD (read-only):** "andreia"→acha Andréia/Andréia Florêncio/ANDREIA (acento ✓); RPC "andreai"→Andréia (sim 0.45), "robsom"→Robson (fuzzy ✓).
- **Checks:** tsc web 0 · eslint 0 (1 warning pré-existente) · vitest **1030/1030** (+4).
- **Branch:** `feat/75-167-busca-lead-sem-acento-fuzzy-db`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (acento nos 3 sites — validado em prod) ✓ · AC2 (fuzzy/typo via RPC — validado) ✓ · AC3 (filtros/paginação preservados: só o trecho de nome muda) ✓ · AC4 (telefone por dígitos) ✓ · AC5 (termo vazio → sem filtro) ✓ · AC6 (migration aditiva; tsc/eslint/1030) ✓. Nota: fuzzy traz nomes ranqueados por similaridade (esperado; trade-off avisado ao Marcos).

## Change Log
- 2026-07-16 — @devops — PR #216 + merge. Deploy prod **SUCCESS** (567f7cb). Migration 174 já aplicada. Status → **Done**.
- 2026-07-16 — @qa — **QA GATE: PASS**. 6 ACs, 1030/1030.
- 2026-07-16 — @dev — Migration 174 (prod) + helper + 3 sites DB. tsc/eslint/1030. Status Ready → InReview.
- 2026-07-16 — @po — **GO**. Draft → Ready.
- 2026-07-16 — @sm — Story criada.

# Story 75-116 — Filtro "dias sem contato" no Pipeline do corretor

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (sem migration) · **Epic:** Pipeline · **Branch:** feat/75-116-broker-pipeline-filtro-sem-contato · **Complexidade:** S (1 ponto)

## Story
Mesmo filtro da 75-115, agora no `/broker/pipeline` (que não tinha barra de filtros).

## Escopo
**IN:** `broker/pipeline/page.tsx` — passa a ler `searchParams`; select **"Sem contato"** (Qualquer/3+/7+/15+/30+); query por etapa aplica `.lt("last_contact_at", cutoff)` (via `staleCutoffMs`); `sem_contato` no `activeFilters` (paginação respeita, via `/api/pipeline/leads`); empty-state ciente do filtro.

**OUT:** sem migration (coluna já existe); API de paginação já suporta `sem_contato` + `broker_id` (75-115).

## Acceptance Criteria
1. Corretor filtra seus leads por "sem contato" (7+/15+/30+); "Filtrar"/"Limpar" ok.
2. Paginação respeita o filtro (broker_id + sem_contato na API).
3. Sem resultado com filtro → mensagem específica (não "você não tem leads").
4. typecheck/lint limpos.

## File List
- `packages/web/src/app/broker/pipeline/page.tsx`

## Change Log
- 2026-07-02 — @dev/@qa — Filtro "dias sem contato" no pipeline do corretor. tsc 0, lint 0. Sem migration. Handoff @devops.

# Story 75-115 — Filtro "dias sem contato" no Pipeline

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (sem migration) · **Epic:** Pipeline · **Branch:** feat/75-115-pipeline-filtro-sem-contato · **Complexidade:** S (1-2 pontos)
- **quality_gate_tools:** [typecheck, lint]

## Story
Filtrar o Pipeline por **dias sem contato**, usando o `last_contact_at` (mesmo relógio do badge, Story 75-110).

## Escopo
**IN:**
1. `dashboard/pipeline/page.tsx` — novo select **"Sem contato"** (Qualquer / 3+ / 7+ / 15+ / 30+ dias, `name="sem_contato"`); query por etapa aplica `.lt("last_contact_at", cutoff)` (via `staleCutoffMs`); entra no "Limpar" e no `activeFilters` passado ao KanbanBoard.
2. `components/pipeline/kanban-board.tsx` — `PipelineFilters.sem_contato` (opcional) + repassa no "carregar mais".
3. `api/pipeline/leads/route.ts` (paginação) — lê `sem_contato` e aplica o mesmo filtro; **+ inclui `last_contact_at` no select** (corrige badge "sem contato" nos cards carregados via paginação — fecha cobertura da 75-110).

**OUT:** broker pipeline (usa `LeadFilters`/param `days` próprio; `sem_contato` opcional não o afeta). Sem migration (coluna já existe).

## Acceptance Criteria
1. Selecionar "7+ dias" mostra só leads com `last_contact_at` > 7 dias; "Filtrar" e "Limpar" funcionam.
2. Paginação ("carregar mais") respeita o filtro.
3. Cards paginados mostram o badge de "sem contato" correto (last_contact_at no select da API).
4. typecheck/lint limpos.

## File List
- `packages/web/src/app/dashboard/pipeline/page.tsx`
- `packages/web/src/components/pipeline/kanban-board.tsx`
- `packages/web/src/app/api/pipeline/leads/route.ts`

## Change Log
- 2026-07-02 — @dev/@qa — Filtro "dias sem contato" no Pipeline (last_contact_at) + fix do badge na paginação. tsc 0, lint 0. Sem migration. Handoff @devops.

# Story 75-97 — IMOB: coluna de Engajamento da imobiliária (Alta/Média/Baixa)

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (push + PR + migration 134) · **Epic:** IMOB · **Branch:** feat/75-97-imob-engajamento · **Complexidade:** S-M (2 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [migration em txn rollback, typecheck, lint, teste da validação]
- **Prioridade:** 🟢 Média — pedido do diretor (medir engajamento do parceiro na venda).

## Decisões (UX @ux-design-expert + produto, 2026-07-01)
- **Como medir:** MANUAL — o gestor define no cadastro (não há dado de venda por imobiliária ainda; evolui p/ automático no futuro).
- **Visual:** **Nível colorido — Alta 🟢 / Média 🟡 / Baixa 🔴**, como **1ª coluna** (antes do nome), compacto e escaneável. (0–10 descartado = falsa precisão p/ valor subjetivo; temperatura ficou como alternativa.)

## Story
**As a** gestão, **I want** ver e definir o **engajamento** de cada imobiliária (Alta/Média/Baixa, colorido), **so that** eu saiba de relance quão engajada ela está na venda dos nossos produtos.

## Escopo
**IN:**
1. **Migration 134**: `imobiliarias` ADD COLUMN `engajamento text` (nullable) com `CHECK (engajamento IS NULL OR engajamento IN ('alta','media','baixa'))`. Null = ainda não avaliado.
2. **`lib/imob/imobiliarias.ts`**: `ENGAJAMENTO` (keys + labels + cor/dot) + campo no tipo `Imobiliaria`; `validateImobiliaria` aceita `engajamento` null ou uma das 3 keys (senão erro).
3. **Form** (`imobiliarias-manager.tsx`): seletor de engajamento (Não avaliado / Alta / Média / Baixa) no modal.
4. **Lista**: **1ª coluna "Engaj."** (antes de Imobiliária) — bolinha colorida (🟢 alta / 🟡 média / 🔴 baixa) + rótulo; null → "—".

**OUT:** não é automático (manual por ora); não mexe no board; sem filtro por engajamento (pode vir depois); campo opcional (não quebra cadastros).

## Acceptance Criteria
1. **Given** a lista de imobiliárias, **then** a **1ª coluna** mostra o engajamento com cor (Alta verde / Média amarelo / Baixa vermelho); sem valor → "—".
2. **Given** o form (novo/editar), **then** dá pra definir o engajamento (incl. "Não avaliado" = null); salva e persiste.
3. **Given** valor inválido enviado à API, **then** é barrado (validação + CHECK).
4. migration aplicável (txn rollback), CHECK barra inválido; validação testada; typecheck/lint limpos.

## Dev Notes
- `ENGAJAMENTO` keys: `alta`/`media`/`baixa`; labels Alta/Média/Baixa; tom: alta=emerald, media=amber, baixa=red (dot + texto).
- `validateImobiliaria`: se `engajamento` presente → aceitar `null`/`""`(→null) ou key válida; senão erro "Engajamento inválido".
- Form: um `<select>` ou pills (Não avaliado / Alta / Média / Baixa). `save()` já serializa via `{...form}`.
- Lista: inserir a coluna ANTES da célula do nome; reusar padrão de badge.
- Migration próxima = 134.

## File List
- `supabase/migrations/134_imobiliarias_engajamento.sql` (novo).
- `packages/web/src/lib/imob/imobiliarias.ts` — ENGAJAMENTO + campo + validação.
- `packages/web/src/lib/imob/imobiliarias.test.ts` — casos de engajamento.
- `packages/web/src/app/dashboard/imob/imobiliarias/_components/imobiliarias-manager.tsx` — seletor no form + 1ª coluna na lista.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Extensão simples da 75-92/96, decisões (manual + nível colorido) registradas, CHECK garante integridade, campo opcional (não quebra), reuso do padrão. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] Migration `134_imobiliarias_engajamento.sql`: `engajamento text` nullable + CHECK IN ('alta','media','baixa').
- [x] `lib/imob/imobiliarias.ts`: `ENGAJAMENTO`/`ENGAJAMENTO_LABELS`/`ENGAJAMENTO_TONE` (dot+texto verde/amarelo/vermelho); campo no tipo; validação (null/""→null ou key válida).
- [x] `imobiliarias-manager.tsx`: `<select>` "Engajamento na venda" (Não avaliado/Alta/Média/Baixa) no form; **1ª coluna "Engaj."** na lista (dot colorido + rótulo; null → "—").
- [x] `imobiliarias.test.ts`: +1 caso (válida/vazio→null/inválida).
- **Checks:** `vitest` 10/10; `tsc` 0; `eslint` 0. Migration validada em txn rollback. NÃO aplicada em prod (=@devops).
- Branch `feat/75-97-imob-engajamento` (a partir da main, já com 75-95/75-96). Commit local (sem push).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅
- **Migration (txn rollback, prod):** `engajamento='alta'` gravado; **CHECK barrou valor inválido ('super')**. Revertido.
- **Rastreabilidade:** AC1 — 1ª coluna com dot colorido (Alta verde/Média amarelo/Baixa vermelho), null→"—". AC2 — select no form incl. "Não avaliado" (null). AC3 — validação (10/10) + CHECK. AC4 — migration rollback + tsc/lint 0.
- **Observação:** manual por ora (decisão registrada); campo opcional → não quebra cadastros existentes.

**Gate → PASS.** Pronto para @devops (push + PR + aplicar migration 134).

## Change Log
- 2026-07-01 — @qa (Quinn) — Gate PASS (migration txn rollback: CHECK barra inválido; validação 10/10; tsc/lint 0). Status → Done.
- 2026-07-01 — @dev (Dex) — migration 134 + ENGAJAMENTO no lib + select no form + 1ª coluna colorida na lista. Sem push.
- 2026-07-01 — @po (Pax) — GO. Decisões: manual + Alta/Média/Baixa colorido. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic IMOB). Coluna de engajamento (manual, nível colorido) no cadastro de imobiliárias. UX via @ux-design-expert.

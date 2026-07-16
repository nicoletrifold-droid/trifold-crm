# Story 75-168 — Busca de lead sem acento + fuzzy (client-side: Broker leads, Broker chat, Conversas)

## Metadata
- **Status:** InReview · **Epic:** Busca de leads · **PR:** — · **Complexidade:** S (2 pontos) · **Branch:** feat/75-168-busca-lead-sem-acento-fuzzy-client
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Complemento da 75-167 (que cobriu os 3 sites no banco). Os 3 sites restantes filtram os leads **no navegador** (JS): Broker leads (`broker/leads/page.tsx`), Broker chat (`broker/chat/page.tsx`), Conversas (`dashboard/conversas/page.tsx`). Faziam `String.includes` após `toLowerCase()` — case-insensitive mas **accent-sensitive** e sem fuzzy. Agora consistentes com o lado-banco.

## Escopo
**IN:**
1. **`lib/leads/search.ts`:** `trigramSimilarity(a,b)` (Jaccard de trigramas, aproxima pg_trgm) e `leadMatchesSearch(fields, term)` — sem acento (substring) + fuzzy (trigram, termos ≥4) nos campos texto + dígitos no telefone. +testes.
2. **3 sites client:** substituir os filtros JS por `leadMatchesSearch([...campos], search)`.

**OUT:** buscas não-lead; mudar UI.

## Acceptance Criteria
1. **Given** "andreia" no Broker leads/chat/Conversas, **then** casa "Andréia" (sem acento).
2. **Given** typo "robsom", **then** casa "Robson" (fuzzy, termo ≥4).
3. **Given** dígitos de telefone, **then** casa pelo telefone.
4. **Given** termo vazio, **then** mantém todos (sem filtro).
5. tsc/lint/vitest limpos, com testes de `leadMatchesSearch`/`trigramSimilarity`.

## Dev Notes
- Sites: `broker/leads/page.tsx` (~L148), `broker/chat/page.tsx` (~L92), `dashboard/conversas/page.tsx` (~L138). Passam campos crus; `leadMatchesSearch` normaliza. Fuzzy client-side é Jaccard de trigramas (aprox. do pg_trgm do banco). Ver [[feedback-nao-quebrar-o-que-funciona]].

## Dev Agent Record (@dev — 2026-07-16)
- `lib/leads/search.ts`: `trigramSimilarity` + `leadMatchesSearch`. 3 sites trocados. +6 testes (accent/fuzzy/phone/vazio/diferente/trigram).
- Checks: tsc web 0 · eslint 0 · vitest **1036/1036** (+6).
- Branch: `feat/75-168-busca-lead-sem-acento-fuzzy-client`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (acento) ✓ · AC2 (fuzzy/typo) ✓ · AC3 (telefone dígitos) ✓ · AC4 (vazio→todos) ✓ · AC5 (tsc/eslint/1036) ✓. Consistente com o lado-banco (75-167).

## Change Log
- 2026-07-16 — @qa — **QA GATE: PASS**. 5 ACs, 1036/1036.
- 2026-07-16 — @dev — matcher JS + 3 sites client. Status Ready → InReview.
- 2026-07-16 — @po/@sm — GO. Story criada.

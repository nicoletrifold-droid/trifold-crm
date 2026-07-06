# Story 75-136 — Assinatura: botão "Enviar p/ assinatura" só no Termo de Intenção

## Metadata
- **Status:** Done · **Epic:** Pastas · **PR:** #133 · **Complexidade:** XS (1 ponto) · **Branch:** feat/75-136-assinatura-somente-termo
- **executor:** @dev · **quality_gate:** @qa

## Contexto
No detalhe da pasta, o botão **"Enviar p/ assinatura"** aparece em todos os documentos (RG, CPF, comprovantes…), mas na prática só o **Termo de Intenção** (slug `termo_intencao`) vai para assinatura. O diretor pediu para remover o botão dos demais documentos, evitando envio indevido. Ver [[project-pastas-documentos]] e [[project-clicksign-integracao]].

## Escopo
**IN:** em `pasta-detail.tsx`, exibir "Enviar p/ assinatura" **apenas** quando `doc.slug === TERMO_SLUG` (além das condições atuais: `uploaded && !sig && clicksignEnabled`).

**OUT:** mudar o backend/rota de assinatura (continua genérica); esconder a coluna de status de assinatura de docs que já tenham envelope (não se aplica — só o Termo terá).

## Acceptance Criteria
1. **Given** um documento que **não** é o Termo (RG, CPF, comprovantes), **then** o botão "Enviar p/ assinatura" **não** aparece.
2. **Given** o Termo de Intenção anexado e Clicksign habilitado e ainda sem envelope, **then** o botão "Enviar p/ assinatura" aparece.
3. Demais botões (Visualizar, Baixar, Deferir, Recusar, Substituir) permanecem em todos os documentos. tsc/lint/vitest limpos.

## Tasks (@dev)
- [ ] `pasta-detail.tsx`: condicionar o botão a `doc.slug === TERMO_SLUG` (importar `TERMO_SLUG` de `lib/pastas/status`).
- [ ] tsc/eslint/vitest.

## Riscos
- **Mínimo.** Uma condição a mais no render; não afeta rota nem dados.

## Dev Agent Record (@dev — 2026-07-06)
- **`pasta-detail.tsx`:** botão "Enviar p/ assinatura" condicionado a `doc.slug === TERMO_SLUG` (import de `lib/pastas/status`). Demais botões inalterados.
- **Checks:** tsc 0 · eslint 0 · vitest 780/780.
- **Files:** `[id]/_components/pasta-detail.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (docs não-Termo sem o botão) ✓ · AC2 (Termo mantém o botão) ✓ · AC3 (Visualizar/Baixar/Deferir/Recusar/Substituir intactos; tsc/eslint/780) ✓. Sem impacto em rota/dados.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #133** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 3 ACs, 780/780.
- 2026-07-06 — @dev — Implementado (botão só no Termo). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).

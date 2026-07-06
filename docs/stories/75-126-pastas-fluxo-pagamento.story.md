# Story 75-126 — Pastas: preferência de "Fluxo de pagamento" no wizard (Tela 1)

## Metadata
- **Status:** Done · **Epic:** Pastas · **Branch:** feat/75-126-pastas-fluxo-pagamento · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
O Termo de Intenção tem a seção **"PREFERÊNCIA DE FLUXO DE PAGAMENTO"** com 4 opções pra assinalar. O wizard de "Nova Pasta" já captura o PIX (Grupo 1 × Grupo 2 do Termo), mas falta o fluxo de pagamento. O diretor pediu pra adicionar isso na **Tela 1 (junto do PIX)**. Ver [[project-pastas-documentos]].

## Decisão (diretor, 2026-07-06)
1. Campo **"Fluxo de pagamento"** na **Tela 1** (junto do PIX/SEM PIX), seleção única, **opcional** (pode avançar sem escolher).
2. Opções (do Termo): **Fluxo 30/70**, **Fluxo 100% obra**, **Plano Safra**, **Plano Investidor**.
3. É só uma preferência gravada na pasta — **não** afeta o checklist de documentos.

## Escopo
**IN:**
1. **Migration 160:** coluna `fluxo_pagamento text` em `pastas` com CHECK in ('fluxo_30_70','fluxo_100_obra','plano_safra','plano_investidor') — nullable (CHECK aceita null).
2. **`POST /api/pastas`:** aceita/valida `fluxo_pagamento` (∈ set ou null) e persiste.
3. **UI Tela 1:** seção "Fluxo de pagamento" com os 4 botões (single-select, clicar no selecionado desmarca → volta a null). Opcional.

**OUT:** impacto no checklist; exibir no detalhe `/dashboard/pastas/[id]` (pode ser follow-up); parcelas/valores do fluxo. Sem mudança no PIX (já existe).

## Acceptance Criteria
1. **Given** a Tela 1, **then** aparece "Fluxo de pagamento" com Fluxo 30/70, Fluxo 100% obra, Plano Safra e Plano Investidor; nenhum vem pré-selecionado.
2. **Given** que escolho um fluxo e crio a pasta, **then** `fluxo_pagamento` é persistido; **given** que não escolho, **then** fica null (avança normal — opcional).
3. **Given** um valor inválido enviado à API, **then** é ignorado (grava null), sem erro.
4. Pastas antigas seguem válidas (coluna nullable). tsc/lint/testes limpos; migration validada em transação.

## Tasks (@dev)
- [ ] Migration 160 (`fluxo_pagamento` + CHECK) — validar em BEGIN/ROLLBACK.
- [ ] `POST /api/pastas`: aceitar/validar/persistir `fluxo_pagamento`.
- [ ] UI Tela 1: seção "Fluxo de pagamento" (4 botões single-select, opcional).
- [ ] tsc/eslint/vitest.

## Riscos
- CHECK constraint deve aceitar null (nullable) → `check (fluxo_pagamento in (...))` já aceita null por padrão no Postgres.
- Baixo risco: campo isolado, sem efeito no seed de documentos.

## Dev Agent Record (@dev — 2026-07-06)
- **Migration 160** (`fluxo_pagamento text` + CHECK 4 valores, nullable). Validada em BEGIN/ROLLBACK (valor válido insere; rollback confirmado 0 remanescentes).
- **`POST /api/pastas`:** `FLUXOS.includes(body.fluxo_pagamento) ? ... : null` (valida/ignora inválido) e persiste.
- **UI Tela 1:** const `FLUXOS_PAGAMENTO` (label + hint) + grid 2x2 de botões single-select acima do "Pagamento" (PIX); clicar no selecionado desmarca (opcional, começa null).
- **Checks:** tsc 0 · eslint 0 · vitest 755/755.
- **Files:** `supabase/migrations/160_pastas_fluxo_pagamento.sql`; `app/api/pastas/route.ts`; `app/dashboard/pastas/_components/pastas-manager.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (4 opções, nenhuma pré-selecionada) ✓ · AC2 (persiste escolhido / null se vazio, opcional) ✓ · AC3 (valor inválido → null, sem erro) ✓ · AC4 (nullable, migration validada, 755/755) ✓. Sem regressão. Campo isolado, sem efeito no checklist.

## Change Log
- 2026-07-06 — @qa — **QA GATE: PASS**. 4 ACs, 755/755.
- 2026-07-06 — @dev — Implementado (fluxo de pagamento na Tela 1). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-06 — @sm — Story criada (Draft).

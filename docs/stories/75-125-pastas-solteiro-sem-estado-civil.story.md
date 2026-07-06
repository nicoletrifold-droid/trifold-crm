# Story 75-125 — Pastas: solteiro não exige "Comprovante de estado civil"

## Metadata
- **Status:** Done · **Epic:** Pastas · **Branch:** feat/75-125-pastas-solteiro-estado-civil · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
No checklist da pasta (PF), o "Comprovante de estado civil" aparece pra todo mundo, inclusive **solteiro**. O diretor apontou que não faz sentido exigir comprovante de estado civil de solteiro. Ver [[project-pastas-documentos]].

## Decisão (diretor, 2026-07-06)
O documento **"Comprovante de estado civil" do titular** só aparece quando **casado OU união estável**. **Solteiro** (nenhum dos dois marcado) → **não** pede esse documento. Só afeta o titular/interessado PF — cônjuge/companheiro(a), PJ (representante) e demais docs ficam inalterados.

## Escopo
**IN:**
1. **`checklist.ts`:** o slot `comprovante_estado_civil` do **interessado** só é incluído quando `casado || uniaoEstavel`. Cônjuge/companheiro seguem com os docs atuais; PJ inalterado. Atualizar `checklist.test.ts` (solteiro agora tem 3 docs: RG/CNH, CPF, endereço).

**OUT:** mexer no comprovante do cônjuge/companheiro ou do representante PJ; redundância pré-existente do estado civil em casado/união estável (não é escopo). Sem migration (é só lógica de seed).

## Acceptance Criteria
1. **Given** PF solteiro (nenhum checkbox), **then** o checklist do titular = RG/CNH, CPF, Comprovante de endereço (**sem** comprovante de estado civil) + PIX se marcado.
2. **Given** PF casado, **then** comportamento atual preservado (titular com comprovante de estado civil + docs do cônjuge).
3. **Given** PF união estável, **then** comportamento atual preservado (titular + companheiro(a) + "Comprovante de união estável").
4. **Given** PJ, **then** inalterado (representante mantém comprovante de estado civil).
5. tsc/lint/testes limpos.

## Tasks (@dev)
- [ ] `checklist.ts`: `pessoaDocs` aceita flag p/ incluir estado civil; interessado PF passa `casado || uniaoEstavel`.
- [ ] Atualizar `checklist.test.ts` (solteiro = 3 docs).
- [ ] tsc/eslint/vitest.

## Riscos
- Alterar `pessoaDocs` afeta cônjuge/representante se feito errado → a flag default `true` mantém o comportamento deles; só o interessado PF passa condicional.

## Dev Agent Record (@dev — 2026-07-06)
- `pessoaDocs(titular, includeEstadoCivil=true)` — flag opcional; interessado PF passa `casado || uniaoEstavel`. Cônjuge/companheiro/representante PJ mantêm o default (true). Sem migration.
- **Checks:** tsc 0 · eslint 0 · vitest 755/755 (checklist 9/9).
- **Files:** `packages/web/src/lib/pastas/checklist.ts` (+`checklist.test.ts`).

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (solteiro = 3 docs, sem estado civil — testado) ✓ · AC2 (casado com estado civil, testado) ✓ · AC3 (união estável preservado) ✓ · AC4 (PJ inalterado) ✓ · AC5 (checks limpos) ✓. Sem regressão (755/755). Flag default true garante que só o interessado PF muda.

## Change Log
- 2026-07-06 — @qa — **QA GATE: PASS**. 5 ACs, 755/755.
- 2026-07-06 — @dev — Implementado (estado civil condicional no interessado PF). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-06 — @sm — Story criada (Draft).

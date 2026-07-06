# Story 75-124 — Módulo "Pastas": estado civil "União estável" no wizard (+ comprovante próprio)

## Metadata
- **Status:** InReview · **Epic:** Pastas · **Branch:** feat/75-124-pastas-uniao-estavel · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 união estável exige comprovante próprio (com validade), distinto de casamento.

## Contexto
No wizard de "Nova Pasta" (Story 75-123) a Tela 2 (Comprador) só tem o checkbox **Casado(a)**. O diretor apontou que falta **União estável** — que tem **validade** e por isso exige um **comprovante próprio** (escritura/contrato de união estável), diferente da certidão de casamento. Ver [[project-pastas-documentos]].

## Decisões (diretor, 2026-07-06)
1. **Manter o checkbox "Casado(a)" e adicionar "União estável"**, **mutuamente exclusivos** (marcar um desmarca o outro — não pode os dois).
2. União estável puxa os **mesmos documentos do parceiro(a)** que "casado" (os 4 docs do cônjuge) **+** adiciona **1 documento**: **"Comprovante de união estável"** (titular = interessado). **Sem** campo de data de validade separado (o próprio comprovante mostra a validade).
3. Só PF (igual "casado" — PJ ignora).

## Escopo
**IN:**
1. **Migration 159:** coluna `uniao_estavel boolean not null default false` em `pastas`.
2. **`checklist.ts`:** `buildDocSlots(tipo, casado, temPix, uniaoEstavel)` — docs do cônjuge quando `casado || uniaoEstavel`; quando `uniaoEstavel`, adiciona o slot `comprovante_uniao_estavel` ("Comprovante de união estável", titular `interessado`, required) antes do PIX. Atualizar `checklist.test.ts`.
3. **`POST /api/pastas`:** aceita/persiste `uniao_estavel` e passa ao `buildDocSlots`; garante exclusividade no servidor (se `uniao_estavel`, `casado=false`).
4. **UI (Tela 2 do wizard):** dois checkboxes ("Casado(a) — inclui documentos do cônjuge" e "União estável — inclui documentos do(a) companheiro(a) + comprovante de união estável"), mutuamente exclusivos.

**OUT:** campo de data de validade (decisão 2 — o comprovante já mostra); renomear o titular "Cônjuge" para "Companheiro(a)" na exibição (minor, pode ser follow-up); qualquer alerta de expiração.

## Acceptance Criteria
1. **Given** a Tela 2 (PF), **then** aparecem os checkboxes "Casado(a)" e "União estável"; marcar um **desmarca** o outro.
2. **Given** "União estável" marcado, **when** a pasta é criada, **then** o checklist inclui os 4 documentos do parceiro(a) **e** o doc **"Comprovante de união estável"** (titular interessado).
3. **Given** "Casado(a)" marcado, **then** comportamento atual preservado (4 docs do cônjuge, **sem** o comprovante de união estável).
4. **Given** nenhum marcado (solteiro), **then** só os docs do titular (comportamento atual).
5. **Given** PJ, **then** os dois checkboxes não se aplicam (ignorados).
6. `uniao_estavel` persistido em `pastas`; pastas antigas seguem válidas (default false). tsc/lint/testes limpos; migration validada em transação.

## Tasks (@dev)
- [ ] Migration 159 (`uniao_estavel` em `pastas`) — validar em BEGIN/ROLLBACK.
- [ ] `checklist.ts`: 4º arg `uniaoEstavel` + slot `comprovante_uniao_estavel`; atualizar `checklist.test.ts`.
- [ ] `POST /api/pastas`: aceitar/persistir `uniao_estavel` + exclusividade + passar ao `buildDocSlots`.
- [ ] UI Tela 2: checkbox "União estável" mutuamente exclusivo com "Casado(a)".
- [ ] `tsc` / `eslint` / `vitest`.

## Riscos
- **Assinatura `buildDocSlots`:** 4º arg opcional (`uniaoEstavel = false`) → callers antigos e testes de 2-3 args seguem válidos. Único caller de produção = `api/pastas/route.ts`.
- Migration aditiva (default false) → não impacta pastas existentes.
- Exclusividade: reforçar no servidor além da UI (se ambos vierem true, união estável prevalece e casado=false).

## Dev Agent Record (@dev — 2026-07-06)
- **Migration 159** (`uniao_estavel bool not null default false`). Validada em `BEGIN…ROLLBACK` (prod). Aplicar no @devops.
- **`checklist.ts`:** `buildDocSlots(tipo, casado, temPix=false, uniaoEstavel=false)` — docs do parceiro quando `casado || uniaoEstavel`; slot `comprovante_uniao_estavel` ("Comprovante de união estável", titular interessado) quando união estável (antes do PIX). Reusa titular `conjuge` p/ os docs do parceiro (sem mudar o enum do check).
- **`POST /api/pastas`:** aceita/persiste `uniao_estavel`; exclusividade no servidor (união estável prevalece → `casado=false`); passa ao `buildDocSlots`.
- **UI Tela 2:** checkbox "União estável" ao lado de "Casado(a)", mutuamente exclusivos (marcar um desmarca o outro).
- **Checks:** tsc 0 · eslint 0 · vitest **754/754** (checklist 8/8). Migration validada em ROLLBACK.
- **Files:** `supabase/migrations/159_pastas_uniao_estavel.sql`; `lib/pastas/checklist.ts` (+test); `app/api/pastas/route.ts`; `app/dashboard/pastas/_components/pastas-manager.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (checkboxes exclusivos) ✓ · AC2 (união estável → docs do parceiro + comprovante próprio, testado) ✓ · AC3 (casado preservado, sem comprovante união estável) ✓ · AC4 (solteiro só titular) ✓ · AC5 (PJ ignora) ✓ · AC6 (persistido, migration validada, 754/754) ✓. Sem regressão. Exclusividade reforçada no servidor além da UI. Nota: exibição do titular segue "Cônjuge" mesmo em união estável (label — follow-up cosmético, OUT de escopo).

## Change Log
- 2026-07-06 — @qa — **QA GATE: PASS**. 6 ACs, 754/754, sem regressão.
- 2026-07-06 — @dev — Implementado (mig 159 + checklist união estável + POST + UI). tsc/eslint 0, vitest 754/754. Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-06 — @sm — Story criada (Draft).

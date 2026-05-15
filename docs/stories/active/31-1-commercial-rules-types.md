---
story: 31.1
title: "Tipos e Zod Schema compartilhados — CommercialRules"
subtitle: "Story de prep — fundação tipada do Epic 31 (Nicole Data Layer Refactor)"
status: Done
epic: 31
created_at: 2026-05-15
created_by: River (@sm)
priority: P1
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools:
  - typecheck_all_packages
  - lint_check
  - unit_tests_zod_schema
effort: XS
story_points: 2
estimated_hours: 2
depends_on: []
---

# Story 31.1 — Tipos e Zod Schema compartilhados — `CommercialRules`

> **Story de prep — nenhuma mudança de runtime, nenhum consumidor existente referencia ainda.**
> Executor: `@dev` | QG: `@architect`
> Referência: `/docs/architecture/nicole-data-layer-refactor.md` — Seções 3.2, 3.5, 8, 9

---

## Story

**As a** dev implementando o Epic 31 (Nicole Data Layer Refactor),
**I want** uma interface TypeScript canônica `CommercialRules`, um enum `FinancingOption` e um schema Zod `CommercialRulesSchema` exportados de `@trifold/shared`,
**so that** todas as stories subsequentes do epic (31.2–31.9) tenham um contrato de tipos único e validado — sem duplicação entre pipeline, API e UI.

---

## Acceptance Criteria

1. **Arquivo criado:** `packages/shared/src/types/commercial-rules.ts` existe com a interface `CommercialRules`, o tipo `FinancingOption` (union de string literals), e o schema Zod `CommercialRulesSchema` exatamente conforme a Seção 3.5 do doc de arquitetura.

2. **Campos completos:** A interface `CommercialRules` inclui todos os 11 campos definidos na Seção 3.2: `requires_down_payment`, `min_down_payment_pct`, `example_down_payment_brl`, `down_payment_flexible`, `financing_options`, `mcmv_eligible`, `key_selling_points`, `ideal_buyer_profile`, `identification_keywords`, `status_label`, `notes`. Nenhum campo inventado ou omitido.

3. **Enum FinancingOption completo:** O tipo `FinancingOption` cobre exatamente os 5 valores: `"banco"`, `"construtora_direto"`, `"consorcio_contemplado"`, `"fgts"`, `"mcmv"`. O schema Zod usa `z.enum([...])` (não `z.union`).

4. **Schema Zod com `.partial()`:** `CommercialRulesSchema` é a versão `.partial()` do objeto (todos os campos opcionais na escrita), conforme decisão da Seção 3.5 — empreendimentos sem todas as regras preenchidas não devem falhar na validação. Tipos derivados `CommercialRulesInput = z.input<typeof CommercialRulesSchema>` e `CommercialRulesParsed = z.output<typeof CommercialRulesSchema>` exportados.

5. **Exportado via barrel:** `packages/shared/src/index.ts` exporta `CommercialRules`, `CommercialRulesInput`, `CommercialRulesParsed`, `CommercialRulesSchema`, `FinancingOption`, `FinancingOptionSchema`. Se o `index.ts` não existir, criá-lo.

6. **Typecheck limpo:** `pnpm typecheck` (em todos os pacotes que consomem `@trifold/shared`) passa sem erros introduzidos por esta story.

7. **Lint limpo:** `pnpm lint` passa sem warnings introduzidos por esta story.

8. **Testes unitários Zod:** arquivo de teste `packages/shared/src/types/commercial-rules.test.ts` (ou `.spec.ts`) existe e cobre no mínimo 4 cenários:
   - (a) Input válido completo — `CommercialRulesSchema.parse()` sucede sem throw.
   - (b) `min_down_payment_pct` com valor > 100 — `safeParse()` retorna `success: false`.
   - (c) `financing_options` contendo string inválida (ex: `"cartao"`) — `safeParse()` retorna `success: false`.
   - (d) Objeto vazio `{}` — `safeParse()` retorna `success: true` (devido ao `.partial()`).
   - (e) `min_down_payment_pct` com valor < 0 (ex: `-5`) — `safeParse()` retorna `success: false` (boundary lower simétrico ao caso b).

9. **JSDoc presente:** cada campo da interface `CommercialRules` tem comentário JSDoc de uma linha explicando seu propósito (ex: `/** Percentual mínimo de entrada, entre 0 e 100. Ex: 10 para 10%. */`).

10. **Zero mudança de runtime:** nenhum arquivo fora de `packages/shared/src/` é modificado nesta story. Nenhum consumer existente referencia ainda o novo tipo — esta é uma story exclusivamente aditiva.

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled (não há chave `coderabbit_integration.enabled` ativa no `core-config.yaml`). Qualidade validada via `pnpm typecheck` + `pnpm lint` + testes unitários Vitest.

---

## Tasks / Subtasks

- [x] **T1 — Criar o arquivo de tipos** (AC: 1, 2, 3, 4, 9)
  - [x] T1.1 — Criar `packages/shared/src/types/commercial-rules.ts`
  - [x] T1.2 — Definir `FinancingOptionSchema = z.enum([...])` com os 5 valores (AC: 3)
  - [x] T1.3 — Definir `CommercialRulesSchema = z.object({...}).partial()` com todos os 11 campos (AC: 2, 4)
  - [x] T1.4 — Exportar `CommercialRules = z.infer<typeof CommercialRulesSchema>` e `FinancingOption = z.infer<typeof FinancingOptionSchema>` (AC: 1)
  - [x] T1.5 — Exportar tipos derivados `CommercialRulesInput` e `CommercialRulesParsed` (AC: 4)
  - [x] T1.6 — Adicionar JSDoc em cada campo da interface (AC: 9)

- [x] **T2 — Exportar via barrel** (AC: 5)
  - [x] T2.1 — Verificar se `packages/shared/src/index.ts` existe
  - [x] T2.2 — Adicionar (ou criar) export de `CommercialRules`, `CommercialRulesInput`, `CommercialRulesParsed`, `CommercialRulesSchema`, `FinancingOption`, `FinancingOptionSchema`

- [x] **T3 — Testes unitários Zod** (AC: 8)
  - [x] T3.1 — Criar `packages/shared/src/types/commercial-rules.test.ts`
  - [x] T3.2 — Cenário (a): input válido completo — parse sucede
  - [x] T3.3 — Cenário (b): `min_down_payment_pct: 101` — safeParse retorna `success: false`
  - [x] T3.4 — Cenário (c): `financing_options: ["cartao"]` — safeParse retorna `success: false`
  - [x] T3.5 — Cenário (d): objeto vazio `{}` — safeParse retorna `success: true`
  - [x] T3.6 — Cenário (e): `min_down_payment_pct: -5` — safeParse retorna `success: false` (boundary lower simétrico)
  - [x] T3.7 — Rodar `pnpm vitest run packages/shared/src/types/commercial-rules.test.ts` e confirmar todos os testes passam (5/5 ✓)

- [x] **T4 — Validação de qualidade** (AC: 6, 7, 10)
  - [x] T4.1 — Rodar `pnpm type-check` no root e confirmar zero erros novos (todos os 8 pacotes OK)
  - [x] T4.2 — Rodar `pnpm lint` no root e confirmar zero warnings novos em `@trifold/shared` (lint clean). @trifold/web falha por env issue pré-existente (eslint-plugin-import missing) — não introduzido por esta story.
  - [x] T4.3 — Confirmar que nenhum arquivo fora de `packages/shared/src/` foi modificado (exceto `packages/shared/package.json` e `pnpm-lock.yaml` — atualizados pelo `pnpm add zod`)

---

## Dev Notes

### Contexto do Epic 31

Esta é a **story de prep** do Epic 31 — Nicole Data Layer Refactor. O epic move regras de negócio hardcoded nos prompts da Nicole (AI agent do CRM imobiliário) para a tabela `properties.commercial_rules` (jsonb) no DB. O objetivo é permitir que o time comercial edite percentual de entrada, valor exemplo, status e amenidades sem abrir PR.

Esta story é **puramente aditiva**: cria tipos TypeScript e schema Zod em `packages/shared`. Nenhuma lógica de runtime é tocada. Nenhum consumidor existente usa ainda esses tipos.

### Schema canônico (Seção 3.2 + 3.5 do doc de arquitetura)

O schema completo conforme aprovado pelo @architect:

```typescript
// Referência completa — NÃO inventar campos adicionais

export const FinancingOptionSchema = z.enum([
  "banco",
  "construtora_direto",
  "consorcio_contemplado",
  "fgts",
  "mcmv",
])

export const CommercialRulesSchema = z.object({
  requires_down_payment: z.boolean(),
  min_down_payment_pct: z.number().min(0).max(100),
  example_down_payment_brl: z.number().nonnegative().nullable(),
  down_payment_flexible: z.boolean(),
  financing_options: z.array(FinancingOptionSchema),
  mcmv_eligible: z.boolean(),
  key_selling_points: z.array(z.string()),
  ideal_buyer_profile: z.string().nullable(),
  identification_keywords: z.array(z.string()),
  status_label: z.string().nullable(),
  notes: z.string().nullable(),
}).partial()  // tudo opcional — empreendimentos sem todas as regras preenchidas são válidos

export type CommercialRules = z.infer<typeof CommercialRulesSchema>
export type FinancingOption = z.infer<typeof FinancingOptionSchema>
export type CommercialRulesInput = z.input<typeof CommercialRulesSchema>
export type CommercialRulesParsed = z.output<typeof CommercialRulesSchema>
```

**Importante — decisão do Apêndice B (Q6):** `min_down_payment_pct` é por property (não global). Backfill: Vind=10, Yarden=10. Isso é responsabilidade da Story 31.3, não desta.

**Importante — decisão do Apêndice B (Q2):** `example_down_payment_brl` é por property. Backfill: Vind=40000, Yarden=60000. Também responsabilidade da Story 31.3.

### Onde vive o `zod` em `packages/shared`

**Importante:** `zod` NÃO está como dependência direta de `packages/shared/package.json` (PO validou — está só transitivamente via pnpm-lock). Você DEVE rodar `pnpm --filter @trifold/shared add zod` antes de escrever qualquer código. Não assuma que está disponível.

### Padrão de barrel exports em `packages/shared`

Verificar `packages/shared/src/index.ts`. Padrão existente (confirmado em Epic 28.5 spike): há 12 arquivos `.ts` em `packages/shared/src`. Adicionar export seguindo o padrão existente. Se o arquivo não existe ainda, criar com apenas as novas exportações.

### Framework de testes

**Vitest** — NÃO Jest. Padrão confirmado em toda a codebase. O `describe`/`it`/`expect` são da Vitest. Import: `import { describe, it, expect } from "vitest"` (ou sem import explícito se o vitest.config.ts já declara globals).

### Riscos relevantes para esta story

- **Risco 2 (testes determinísticos):** esta story NÃO toca nenhum arquivo de teste existente em `packages/ai` — sem risco.
- **Risco 3 (multi-tenancy):** tipos são TypeScript puro, sem implicação de RLS — sem risco.
- **Sem risco de regressão:** nenhum consumidor existente importa ainda os novos tipos.

### Referência ao documento de arquitetura

- **Seção 3.2** — definição completa dos 11 campos com tipos e exemplos (linha 162-197 do doc)
- **Seção 3.5** — código TypeScript/Zod canônico (linha 327-359 do doc)
- **Seção 8** — escopo exato desta story na tabela de breakdown (linha 855 do doc)
- **Apêndice B Q2 e Q6** — decisões de produto sobre os campos `example_down_payment_brl` e `min_down_payment_pct` (linha 987-1013 do doc)

Doc completo: `/docs/architecture/nicole-data-layer-refactor.md`

### Testing

- **Framework:** Vitest (NÃO Jest)
- **Localização do teste:** `packages/shared/src/types/commercial-rules.test.ts`
- **Comando de execução:** `pnpm test -- packages/shared/src/types/commercial-rules.test.ts` (`packages/shared/package.json` NÃO tem script `test` próprio — vitest roda do root)
- **Cobertura mínima:** 5 cenários Zod obrigatórios (AC 8 a–e, incluindo boundary lower pct<0)
- **Não há testes existentes a manter nesta story** — arquivo novo, zero risco de regressão

---

## Scope

**IN:**
- `packages/shared/src/types/commercial-rules.ts` (criar)
- `packages/shared/src/types/commercial-rules.test.ts` (criar)
- `packages/shared/src/index.ts` (adicionar/criar exports)

**OUT (explicitamente fora desta story):**
- Nenhuma migration SQL (isso é Story 31.2)
- Nenhuma mudança em `packages/ai/` (isso é Stories 31.4, 31.6, 31.7, 31.8)
- Nenhuma mudança em `packages/web/` (isso é Story 31.5)
- Nenhuma mudança nos prompts hardcoded da Nicole (isso é Story 31.6)
- Nenhum backfill de dados (isso é Story 31.3)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-15 | 1.0 | Story criada a partir do doc de arquitetura (Seções 3.2, 3.5, 8) | River (@sm) |
| 2026-05-15 | 1.1 | PO validation executed — verdict GO (9/10). Status: Draft → Ready. 2 should-fixes não-bloqueantes documentados em `docs/qa/po-validation-31-1.md` (SF-1: zod não é dep direta no workspace; SF-2: comando de teste sugerido em T3.6 falha porque `packages/shared/package.json` não tem script `test`). | Pax (@po) |
| 2026-05-15 | 1.2 | PO concerns aplicados antes de @dev: (1) Dev Notes atualizadas para deixar explícito que `pnpm --filter @trifold/shared add zod` é obrigatório; (2) T3.7 renumerada com comando correto `pnpm test -- packages/shared/...`; (3) AC 8(e) adicionado cobrindo boundary lower `pct<0`; T3.6 adicionado para testar esse cenário. | Claude (orquestração) |
| 2026-05-15 | 1.3 | **Dev implementation completa (YOLO).** Arquivos criados: `commercial-rules.ts` + `commercial-rules.test.ts`. Barrel export adicionado. `zod ^4.4.3` instalado como dep direta de `@trifold/shared`. 5/5 testes Vitest passam. `pnpm type-check` clean em todos os 8 pacotes. `pnpm lint` clean em `@trifold/shared` (web lint falha por env issue pré-existente — não introduzido). Status: Ready → InProgress → InReview. | Dex (@dev) |
| 2026-05-15 | 1.4 | **QA Gate executado — verdict PASS.** 10/10 ACs cumpridos (incluindo AC8(e) novo). 7/7 quality checks PASS. Schema validado linha-a-linha contra Seção 3.5 do doc de arquitetura — zero divergência. Lint web verificado independentemente como pré-existente (`git diff HEAD -- packages/web/` vazio; erro é env issue do `next@16.2.2` chain). Zod version mismatch verificado como inofensivo (toda a árvore já em 4.x). 1 MEDIUM follow-up sugerido (eslint-plugin-import infra), 2 LOW (boundary teste explícito para BRL, alinhamento de versão zod nas próximas stories). Gate file: `docs/qa/gates/31-1-qa-gate.md`. Status: InReview (PASS) — pronto para @devops *push. | Quinn (@qa) |
| 2026-05-15 | 1.5 | **DevOps push completo.** Branch efêmera `feat/epic-31-story-1-commercial-rules-types` rebaseada sobre `origin/main` (Lucas avançou 2 commits: 44c3770 clientes CRM + 9b1b265 perfis acesso — zero overlap com escopo desta story). Commit final SHA: `b01470b`. Merge ff em `main` + push direto (sem PR, seguindo convenção observada em Epics 29/30). Status: InReview → **Done**. ★ EPIC 31 INICIADO. Próximo: Story 31.2 (migration `commercial_rules` jsonb) — ATENÇÃO: migration 040 foi tomada pelo Lucas (brinde_tipo_id), 041 também (clientes_crm), 042 (cliente_id_destinatario). Story 31.2 deve usar `043_commercial_rules_jsonb.sql` ou superior. | Gage (@devops) |

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — agente Dex (@dev), modo YOLO.

### Debug Log References

- `pnpm --filter @trifold/shared add zod` → adicionou zod ^4.4.3 como dep direta (Done in 2s).
- `pnpm vitest run packages/shared/src/types/commercial-rules.test.ts` → **5/5 testes passam** em 120ms.
- `pnpm type-check` → 8/8 pacotes OK (cache miss em @trifold/ai, @trifold/web, @trifold/shared — todos compilaram clean).
- `pnpm lint` → @trifold/shared lint clean. @trifold/web falha com `Cannot find module 'eslint-plugin-import'` (env issue pré-existente, não tocado por esta story).
- Comando do AC 8 `pnpm test -- packages/shared/...` mostrou que o `--` é descartado pelo turbo wrapper → vitest roda toda a suíte. Comando correto observado: `pnpm vitest run <path>` (sem `--`). Anotado para @qa.

### Completion Notes

**Implementação executada conforme Story 31.1 + Seções 3.2/3.5 do doc de arquitetura.**

- Schema canônico em `packages/shared/src/types/commercial-rules.ts` com todos os 11 campos exigidos por AC 2, JSDoc por campo (AC 9), `FinancingOptionSchema` usando `z.enum([...])` (AC 3), `CommercialRulesSchema` com `.partial()` (AC 4).
- Tipos exportados: `CommercialRules`, `FinancingOption`, `CommercialRulesInput`, `CommercialRulesParsed`, `CommercialRulesSchema`, `FinancingOptionSchema` — todos via barrel `packages/shared/src/index.ts` (AC 5).
- Testes Vitest cobrem os 5 cenários a–e (AC 8). Boundary inferior (e) confirma rejeição de `pct: -5`.
- `zod` adicionado como dep direta de `@trifold/shared` via `pnpm --filter @trifold/shared add zod` (resolve SF-1 do PO).
- `packages/shared/package.json` não tinha script `test` próprio; testes rodam do root via vitest config (`vitest.config.ts` inclui `packages/shared/src/**/*.test.ts`).

**Decisões autônomas (YOLO):**
- Mantido o nome do schema enum como `FinancingOptionSchema` e o tipo derivado `FinancingOption` exportados separadamente — alinhado a Seção 3.5 e ao AC 5 que lista ambos.
- Lint do @trifold/web falhou por env issue pré-existente (`eslint-plugin-import` ausente no eslint-config-next chain). Decisão: prosseguir, pois (1) AC 10 limita escopo a `packages/shared/src/`; (2) nenhum `.ts/.tsx` em web foi modificado; (3) @trifold/shared lint clean. Reportado ao @qa para decisão de gate.

### File List

| File | Action | Notes |
|------|--------|-------|
| `packages/shared/src/types/commercial-rules.ts` | CREATE | Schema Zod canônico (11 campos `.partial()`) + 5 tipos exportados + JSDoc por campo |
| `packages/shared/src/types/commercial-rules.test.ts` | CREATE | 5 cenários Vitest (a–e) — todos passam |
| `packages/shared/src/index.ts` | MODIFY | Adicionada linha `export * from "./types/commercial-rules"` |
| `packages/shared/package.json` | MODIFY | Adicionada dep direta `zod: ^4.4.3` (resolve PO SF-1) |
| `pnpm-lock.yaml` | MODIFY | Lockfile atualizado pelo `pnpm add zod` (auto) |

---

## QA Results

**Gate:** `docs/qa/gates/31-1-qa-gate.md`
**Verdict:** **PASS** ✅
**Reviewer:** Quinn (@qa)
**Date:** 2026-05-15

### Resumo executivo

Story de prep puramente aditiva, implementação fiel à Seção 3.5 do doc de arquitetura — zero divergência linha-a-linha. 10/10 ACs cumpridos. 7/7 quality checks PASS. Tests 5/5 Vitest em 154ms. `pnpm type-check` 8/8 pacotes OK. Lint do `@trifold/shared` clean.

### Pontos verificados

1. **AC8(e) novo (boundary `pct < 0`):** ✅ teste em `commercial-rules.test.ts:56-61` passa.
2. **Lint web pré-existente:** ✅ confirmado independentemente — `git diff HEAD -- packages/web/` vazio; erro é `eslint-plugin-import` ausente no chain do `next@16.2.2 → eslint-config-next`. Story não introduziu.
3. **Zod versão:** ✅ sem mismatch — todo o monorepo já está em Zod 4.x (4.3.6 transitivo + 4.4.3 novo, ambos minor compatíveis).
4. **Schema canônico:** ✅ 11 campos batem 1:1 com Seção 3.5 do doc. Bonus: `CommercialRulesInput`/`CommercialRulesParsed` exportados conforme AC4.
5. **Multi-tenancy:** ✅ schema é TS puro sem campos de tenant — RLS de `properties` preservada.
6. **Cobertura testes:** ✅ adequada para tipos puros (5 cenários cobrem happy + 4 boundaries críticas).

### Issues

- **CRITICAL/HIGH:** Nenhum.
- **MEDIUM (1):** Lint web pré-existente (`eslint-plugin-import` no chain do Next 16). Recomendação: criar follow-up `infra/eslint-plugin-import-next16`. Fora do escopo.
- **LOW (2):** (L-1) teste explícito para `example_down_payment_brl: -100` (coberto implicitamente); (L-2) alinhar versão de zod ao adicionar dep direta em `packages/web` e `packages/ai` nas próximas stories.

### Status final

- **Story status:** `InReview` → mantém-se em `InReview` aguardando push pelo @devops (a transição para `Done` é responsabilidade de `@devops` após push bem-sucedido, conforme `story-lifecycle.md`).

### Próxima ação

**`@devops *push`** — commit dos 5 arquivos modificados + criação de PR. Sugestão de mensagem:
```
feat(shared): tipos canônicos + Zod schema CommercialRules [Story 31.1] ★ EPIC 31 INICIADO
```

— Quinn, defendendo a qualidade 🛡️

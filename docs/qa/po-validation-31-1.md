---
validator: Pax (@po)
story: 31.1
story_title: "Tipos e Zod Schema compartilhados — CommercialRules"
epic: 31
validation_date: 2026-05-15
checklist: po-master / story-draft (AIOS 10-point)
arch_ref: docs/architecture/nicole-data-layer-refactor.md
verdict: GO (conditional — 1 should-fix applied before @dev pickup)
score: 9 / 10
implementation_readiness: 9
confidence: High
---

# PO Validation Report — Story 31.1

## TL;DR

Story 31.1 é uma story de prep aditiva, escopo minúsculo (XS / 2h), tipos + Zod em `packages/shared`. Verifica-se que (a) os 11 campos da interface batem 1:1 com Seção 3.2 do doc de arquitetura, (b) as decisões do Apêndice B (Q2 + Q6) sobre `min_down_payment_pct` e `example_down_payment_brl` por property estão modeladas corretamente, (c) os 4 cenários Zod de teste cobrem os edge cases mínimos.

**Verdict: GO (score 9/10).** Há 1 inconsistência factual menor no Dev Notes (zod **NÃO** é dep direta de `@trifold/ai` ou `@trifold/web`, é transitiva no pnpm-lock) e 1 ambiguidade de comando de teste que merecem nota antes do dev começar — nenhuma bloqueia mas ambas evitam fricção. Detalhe abaixo.

---

## 10-Point Checklist (AIOS Master)

| # | Critério | Status | Justificativa |
|---|----------|--------|---------------|
| 1 | Título claro e objetivo | **PASS** | "Tipos e Zod Schema compartilhados — CommercialRules" — escopo evidente no título; subtitle marca como story de prep. |
| 2 | Descrição completa | **PASS** | User story formato canônico (As a / I want / so that). Dev Notes detalham contexto do epic, schema canônico copiado da arquitetura, e referências por seção (3.2, 3.5, 8, 9). Self-contained. |
| 3 | AC testáveis | **PASS** | 10 AC, todos verificáveis: existência de arquivos, presença de campos por nome, valores exatos do enum, comportamento Zod específico em 4 cenários (válido / pct>100 / financing inválido / objeto vazio), typecheck e lint clean. AC8 a–d em formato quase Given/When/Then. |
| 4 | Escopo bem definido (IN/OUT) | **PASS** | Seção "Scope" lista 3 arquivos IN e 5 áreas OUT explicitamente (migration, packages/ai, packages/web, prompts, backfill). AC10 reforça "Zero mudança de runtime". |
| 5 | Dependências mapeadas | **PASS** | `depends_on: []` no frontmatter (correto — é a primeira do epic). Dev Notes apontam Section 3.2/3.5/8/Apêndice B do doc de arquitetura como fonte. Tabela da Seção 8 confirma 31.2 depende de 31.1, então o "no dep" é coerente. |
| 6 | Estimativa de complexidade | **PASS** | `effort: XS`, `story_points: 2`, `estimated_hours: 2`. Bate com Seção 8 da arquitetura ("2h"). Realista para criar 1 arquivo de tipo + 1 de teste + 1 export. |
| 7 | Valor de negócio | **PASS** | Dev Notes explicam: "fundação tipada do Epic 31 — todas as stories 31.2-31.9 dependem deste contrato. Sem duplicação entre pipeline, API e UI." Conecta com goal do Epic ("time comercial edita regras sem deploy"). |
| 8 | Riscos documentados | **PASS** | Seção "Riscos relevantes para esta story" lista 3 riscos do doc e marca cada como "sem risco" para esta story específica (testes determinísticos não tocados, RLS não aplicável, sem regressão). Honesto — risco é de fato baixo para story aditiva. |
| 9 | Definition of Done clara | **PASS** | AC1-10 servem como DoD. AC6/7/10 são gates objetivos (`pnpm typecheck` clean, `pnpm lint` clean, zero arquivos fora de `packages/shared/src/`). |
| 10 | Alinhamento com PRD/Epic | **CONCERN** | Schema bate 100% com Seção 3.2 e 3.5. **Mas Dev Notes contém 1 afirmação factualmente incorreta:** "Zod já é dependência de `packages/ai` e `packages/web`". Inspeção do `pnpm-lock.yaml` e dos 3 `package.json` confirma que **zod é apenas transitivo** (vem via `@anthropic-ai/sdk` ou similar) — **NÃO é direct dep de nenhum dos 3 pacotes**. A story já hedge isso com "se não estiver, rodar `pnpm add zod`", então o dev resolve em 30s. Não bloqueia. |

**Score: 9/10** (1 CONCERN em ponto 10, demais PASS)

---

## Epic 31-specific Checks (complementares, não substituem o 10-pontos)

### EC-1: Coherence com Stories 31.4-31.8 (consumidores)

**Status: PASS.** Cross-checked com Seções 4.2, 4.3, 5.1, 5.2 e 5.3 do doc de arquitetura:

- Story 31.4 (`buildPropertyDataContext`) consome: `requires_down_payment`, `min_down_payment_pct`, `example_down_payment_brl`, `down_payment_flexible`, `financing_options`, `mcmv_eligible`, `key_selling_points`, `ideal_buyer_profile`, `status_label`. → Todos presentes. ✅
- Story 31.5 (form UI) consome todos os 11 campos para inputs (multi-select financing, listas editáveis para arrays, text inputs para `status_label`/`ideal_buyer_profile`/`notes`). → Todos presentes. ✅
- Story 31.6 (prompts refactor) usa `requires_down_payment`, `down_payment_flexible`, `financing_options` em instruções genéricas. → Todos presentes. ✅
- Story 31.7 (down-payment-flag) usa `requires_down_payment` + `financing_options.includes("consorcio_contemplado")`. → Coberto pelo enum. ✅
- Story 31.8 (genericização keywords) usa `identification_keywords`. → Presente. ✅

**Nenhum campo órfão. Nenhum campo faltante.** Story 31.1 entrega a fundação completa.

### EC-2: Validações Zod cobrem edge cases

**Status: PASS com nuance.** Os 4 cenários da AC8 são adequados como **mínimo**:
- (a) input válido → garante happy path
- (b) `min_down_payment_pct: 101` → cobre boundary upper
- (c) `financing_options: ["cartao"]` → cobre enum violation
- (d) `{}` → confirma `.partial()` aceita objeto vazio

**Edge cases que NÃO estão na AC mas não bloqueiam** (Zod já cobre via schema, e Story 31.5 fará validação adicional no client):
- `min_down_payment_pct: -1` (lower boundary) — Zod `.min(0)` cobre, mas teste adicional seria nice-to-have
- `example_down_payment_brl: -100` — Zod `.nonnegative()` cobre, idem
- `financing_options: []` quando `requires_down_payment: true` — esta validação **cross-field NÃO está no schema** porque é decisão do produto que aceita property sem regras preenchidas (decisão arquitetural Seção 3.1). Coerente com `.partial()`.

**Análise da pergunta original do usuário ("financing_options não-vazia quando requires_down_payment=true"):** essa regra cross-field **não foi modelada no doc de arquitetura** e seria invenção da story. Coerente em deixar fora — Story 31.5 trata via UI no painel, ou Story 31.4 trata via lógica do builder de contexto. **Não é gap da Story 31.1.**

### EC-3: Naming consistency com Story 31.5 (UI form)

**Status: PASS.** Confronto entre nomes de campos no schema (Seção 3.2) e labels no form (Seção 5.1):

| Schema field | UI label | OK? |
|--------------|----------|-----|
| `requires_down_payment` | "Exige entrada?" | ✅ |
| `min_down_payment_pct` | "% mínima de entrada" | ✅ |
| `example_down_payment_brl` | "Valor exemplo (R$)" | ✅ |
| `down_payment_flexible` | "Entrada é flexível" | ✅ |
| `financing_options` | "Opções de financiamento aceitas" | ✅ |
| `mcmv_eligible` | "Elegível para MCMV" | ✅ |
| `status_label` | "Status descritivo" | ✅ |
| `ideal_buyer_profile` | "Perfil ideal do comprador" | ✅ |
| `key_selling_points` | "Argumentos-chave de venda" | ✅ |
| `identification_keywords` | "Palavras-chave para identificar..." | ✅ |
| `notes` | (vai em "modo avançado") | ✅ |

Snake_case nos tipos / Portuguese labels na UI — divergência **intencional** e correta (TS canon vs UX). Story 31.5 fará mapeamento, sem fricção.

### EC-4: Schema `.partial()` é apropriado para PATCH

**Status: PASS.** Confirmado por:
1. AC4 explicita o `.partial()` no schema base.
2. Seção 5.3 do doc mostra route PATCH usando `CommercialRulesSchema.partial().safeParse(body.commercial_rules)` — o re-apply de `.partial()` em schema já partial é idempotente em Zod (`.partial().partial() === .partial()`), então não há regressão. **Nota informativa:** isso é redundância nas docs, não bug.
3. Cenário (d) da AC8 valida explicitamente que `{}` passa — exatamente o caso de PATCH parcial.

### EC-5: Multi-tenancy (RLS)

**Status: PASS.** Confirma-se que o tipo `CommercialRules` é **puro TypeScript sem `org_id`** — coerente com o doc (Seção 9, Risco 3). Nenhum campo do schema implica violação RLS:
- Não há `tenant_id`, `org_id`, `user_id` etc no shape.
- `commercial_rules` é uma coluna de `properties`, e a tabela `properties` já tem RLS por `org_id` (confirmado no doc, Risco 3 mitigação 1 e 2).
- O risco de "payload de PATCH incluir `org_id`" é tratado em Story 31.5, não nesta.

---

## Anti-Hallucination Verification

- **Schema (Seção 3.2 vs AC2 + AC3):** 11 campos listados na story batem 1:1 com a interface da arquitetura. Enum tem exatamente os 5 valores listados em ambos lugares. ✅
- **Tipo derivado `CommercialRulesInput` / `CommercialRulesParsed`:** AC4 adiciona estes além do que está literalmente na Seção 3.5 do doc. **Justificável** — `z.input` vs `z.output` é boas práticas de Zod quando há transforms (mesmo que aqui não haja); a SM extrapolou minimamente para robustez. Não é invenção problemática. ✅
- **Vitest é o framework:** confirmado no `package.json` do root (`vitest@^4.1.2` em devDependencies, `"test": "vitest run"`). Story está correta em dizer "NÃO Jest". ✅
- **Apêndice B Q2 e Q6** referenciados em Dev Notes batem com o conteúdo real do doc (linhas 987 e 1007). ✅
- **Inconsistência fatual única detectada:** Dev Notes diz "Zod já é dependência de `packages/ai` e `packages/web`". Inspeção: `grep "zod" packages/ai/package.json packages/web/package.json packages/shared/package.json` retorna **vazio**. Zod aparece apenas no `pnpm-lock.yaml` como dep transitiva. **Hallucination minor.** A story já se previne com "se não estiver, rodar `pnpm add zod`" no Dev Notes — então não bloqueia, mas merece correção pra evitar dev assumir que basta importar. **→ Should-fix #1.**

---

## CodeRabbit Integration (Conditional)

**Status: N/A.** `core-config.yaml` não tem `coderabbit_integration.enabled: true`. Story corretamente declara: "CodeRabbit Integration: Disabled (não há chave `coderabbit_integration.enabled` ativa no `core-config.yaml`). Qualidade validada via `pnpm typecheck` + `pnpm lint` + testes unitários Vitest." → Skip notice OK conforme `.aios-core/development/tasks/validate-next-story.md` step 8.

---

## Executor Assignment Validation (Story 11.1)

- `executor: @dev` ✅ (story é puro TypeScript/Zod — código de aplicação compartilhada, classifica como "Code/Features/Logic")
- `quality_gate: @architect` ✅ (story de fundação tipada que será consumida por todo o epic — gate por arquiteto é apropriado, e bate com a tabela Type-to-Executor)
- `quality_gate_tools: [typecheck_all_packages, lint_check, unit_tests_zod_schema]` ✅ (apropriados — typecheck cross-package valida que consumidores não quebram; unit tests cobrem AC8)
- `executor != quality_gate` ✅ (@dev != @architect)

---

## Critical Issues (Must Fix — Block Story)

**Nenhum.** Story está implementável as-is.

---

## Should-Fix Issues (Important Quality Improvements)

### SF-1 — Corrigir afirmação sobre `zod` em Dev Notes (recommended before @dev pickup)

**Localização:** `docs/stories/active/31-1-commercial-rules-types.md`, seção "Dev Notes" → "Onde vive o `zod` em `packages/shared`" (linha 148-150).

**Problema:** Diz "Zod já é dependência de `packages/ai` e `packages/web` — provável que já esteja no workspace". Inspeção do repo: zod aparece **apenas como dep transitiva** no `pnpm-lock.yaml`. Nenhum dos 3 pacotes (`ai`, `web`, `shared`) tem `"zod": "^X"` em suas `dependencies`.

**Fix sugerido:**
> "Zod ainda **não** é dependência direta de nenhum pacote no workspace (aparece apenas como transitiva no pnpm-lock). Esta story precisa rodar `pnpm --filter @trifold/shared add zod` como primeiro passo da T1. Versão recomendada: `^4.3.6` (a que já está pinada como transitiva no lock — evita drift)."

**Impacto se não corrigido:** dev gasta 2-5 min descobrindo que precisa adicionar zod. Baixo, mas evitável.

### SF-2 — Esclarecer comando de teste (recommended before @dev pickup)

**Localização:** Dev Notes → "Framework de testes" + Tasks/Subtasks T3.6 ("Rodar `pnpm --filter @trifold/shared test`").

**Problema:** `packages/shared/package.json` NÃO tem script `"test"`. Rodar `pnpm --filter @trifold/shared test` retorna erro "Missing script: test". Vitest está só no root.

**Fix sugerido (uma das duas opções):**
- **Opção A (menos invasiva, recomendada):** Trocar T3.6 e Dev Notes para usar `pnpm test -- packages/shared/src/types/commercial-rules.test.ts` (vitest do root, filter por path).
- **Opção B (mais limpa, mas amplia escopo):** Adicionar `"test": "vitest run"` ao `packages/shared/package.json` como sub-task antes de T3.1. Documentar como AC11 adicional. **Trade-off:** alarga escopo da story em ~5 min e adiciona arquivo modificado, mas estabelece pattern reutilizável para futuros testes em `@trifold/shared`. Sugiro **Opção B** se Gabriel quiser pattern, **Opção A** se prioridade for minimalismo.

**Impacto se não corrigido:** dev tenta T3.6, recebe erro, descobre workaround. ~5 min de fricção.

---

## Nice-to-Have Improvements (Optional)

- **NTH-1:** AC8 poderia adicionar 5º cenário: `min_down_payment_pct: -5` (lower boundary). Não é necessário (Zod `.min(0)` cobre), mas seria belt-and-suspenders.
- **NTH-2:** Story poderia listar a versão pinada de zod (`^4.3.6`) para evitar drift de major version se o dev rodar `pnpm add zod` sem version. Tratado na SF-1 acima.
- **NTH-3:** Dev Notes não mencionam onde colocar `import { z } from "zod"` no topo do arquivo — trivial para qualquer dev, mas formalmente é detail. Skip.

---

## Implementation Readiness

| Dimensão | Score | Comentário |
|----------|-------|------------|
| Clareza do escopo | 10/10 | IN/OUT explícitos, 3 arquivos identificados |
| Completude técnica | 9/10 | Code block canônico copiado da arquitetura; 1 imprecisão em deps |
| Testabilidade | 10/10 | 4 cenários Zod nomeados + comandos de qualidade explícitos |
| Self-containment | 9/10 | Schema todo replicado na story; precisa consultar arch só para context, não para impl |
| Risco | 10/10 | Aditiva, sem consumidor existente, sem impacto runtime |

**Score agregado: 9/10. High confidence em implementação bem-sucedida em 2h.**

---

## Final Verdict

**GO** — story está READY para `@dev` pickup com 2 should-fixes recomendados mas **não bloqueantes** (ambos triviais, custam <10 min de fricção se ignorados).

Status do frontmatter da story atualizado de `Draft` → `Ready`. Change Log atualizado com entrada de validação.

**Next step:** `@dev *develop 31.1` em modo YOLO (story XS, deterministica, sem ambiguidade).

---

## Change Log (this validation)

| Date | Action | By |
|------|--------|-----|
| 2026-05-15 | PO validation executed (10-point checklist + Epic-31 specific) | Pax (@po) |
| 2026-05-15 | Verdict GO (9/10), status updated Draft → Ready | Pax (@po) |
| 2026-05-15 | 2 should-fixes documented (SF-1 zod dep claim, SF-2 test command) | Pax (@po) |

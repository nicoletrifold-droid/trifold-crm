---
name: Epic 31 QA Patterns — Nicole Data Layer Refactor
description: QA gate patterns aprendidos na Story 31.1 (story de prep — tipos compartilhados). Útil para gates de 31.2-31.9.
type: project
---

# Epic 31 QA Patterns

## Story 31.1 (Tipos + Zod Schema) — PASS (2026-05-15)

### Verificações independentes obrigatórias

1. **Validação linha-a-linha contra doc de arquitetura:** Quando a story copia um schema canônico do doc (ex: Seção 3.5), o gate DEVE comparar 1:1 cada campo. Não é suficiente confirmar AC textualmente — verifique a tradução TypeScript do doc para o arquivo real.

2. **Claims de "pré-existente" do @dev:** Sempre validar com `git diff HEAD -- <path>`. Se diff vazio em código de aplicação tocado pelo claim, @dev tem razão. Se diff não-vazio, FAIL.

3. **Zod version cross-package:** Epic 31 trará Zod a `packages/web` e `packages/ai` nas próximas stories. Verificar pnpm-lock.yaml para confirmar que toda a árvore está em Zod 4.x (foi confirmado em 31.1 — não há Zod 3 no projeto, apenas múltiplas versões 4.x convivendo via pnpm).

### Lint web pré-existente conhecido (NÃO bloquear)

**Sintoma:** `pnpm --filter @trifold/web lint` falha com:
```
Error: Cannot find module 'eslint-plugin-import'
Require stack:
- .../eslint-config-next@16.2.2/dist/index.js
```

**Causa:** `eslint-plugin-import` ausente no chain do `next@16.2.2 → eslint-config-next`. Não relacionado a código de aplicação.

**Veredicto:** Não bloquear stories que não tocam `packages/web/`. Para stories que tocam web (31.5), exigir fix via follow-up story `infra/eslint-plugin-import-next16` antes do gate.

### Story 31.1 — características que justificaram PASS rápido

- Story de prep aditiva, zero impacto runtime
- Zero consumidores existentes — risco de regressão = 0 por construção
- Schema canônico copiado do doc de arquitetura — invenção mínima (apenas tipos Input/Output do Zod, justificados pelo AC4)
- 5 cenários Vitest cobrem happy + 4 boundaries — adequado para tipos puros

### Próximos gates do Epic 31

Quando os gates de 31.2-31.9 chegarem, considerar:

- **31.2 (Migration 040 — DDL + CHECK):** validar via `supabase migration list` + `supabase db push` em ambiente isolado, conferir CHECK constraint cobre todos os 11 campos
- **31.3 (Backfill Vind+Yarden):** validar idempotência (rerun não duplica), conferir valores BRL=40000/60000 e pct=10 conforme Apêndice B
- **31.4 (buildPropertyDataContext):** validar que pipeline ainda determinístico (tests `packages/ai/`)
- **31.5 (UI form):** lint web obrigatório agora — exigir fix do `eslint-plugin-import` primeiro
- **31.6 (prompts refactor):** smoke test em staging via Telegram antes de PASS
- **31.7 (down-payment-flag):** garantir RLS preservada na nova validação
- **31.8 (genericização keywords):** garantir backward-compat com leads em flight
- **31.9 (cleanup):** validar que todo PROPERTY_KEYWORDS hardcoded foi removido

## Validações cross-package em monorepo Trifold

`pnpm type-check` no root usa turbo cache — sempre confirme cache miss para o pacote tocado:
- Se cache hit (✓ replay): tsc não rodou, mas o cache é válido para a árvore atual
- Se cache miss: tsc rodou de fato, validação real

Em Story 31.1, foi cache miss para `@trifold/shared` (esperado — novo arquivo) e cache hit para `@trifold/ai` + `@trifold/web` (esperado — turbo detectou que dependents não precisam recompilar pois ainda não importam o novo tipo).

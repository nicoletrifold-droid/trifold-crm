# Story 28.4 — Adicionar `import "server-only"` em módulos server-only

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["build_validation", "import_chain_audit"]

## Story
**As a** desenvolvedor da plataforma Trifold CRM,
**I want** que os módulos que encapsulam dependências pesadas server-only (`googleapis`, `resend`, `web-push`) declarem `import "server-only"` como primeira linha,
**so that** qualquer client component que os importe acidentalmente quebre o build em tempo de compilação — impedindo que 194 MB de dependências server-side vaze para o bundle cliente silenciosamente.

## Contexto

**Epic 28 — Next.js Config Quick Wins** | Prioridade: P1 | Dependência: 28.1 (Done)

### Por que esta story existe

A Story 28.1 configurou `serverExternalPackages: ["googleapis", "google-auth-library", "web-push", "resend"]` no `next.config.ts`. Isso externaliza essas dependências do bundle server lambda — redução confirmada de 119 MB → 55 MB em `.next/server` (delta -53,8%). Mas essa externalização **não impede** que um client component importe um desses módulos por engano: o import simplesmente falharia em runtime de forma obscura, ou — pior — incluiria o módulo no bundle cliente sem aviso.

`import "server-only"` é a rede de segurança complementar: Next.js integra o pacote `server-only` como guard que **quebra o build em tempo de compilação** se qualquer código marcado como client component (incluindo qualquer transitive importer com `'use client'`) tentar importar o módulo protegido. A falha é clara, imediata e não chega a produção.

**Analogia útil para o @dev:** `serverExternalPackages` = "não inclua no bundle". `server-only` = "bloqueia a porta para client code tentar acessar". São defesas complementares na mesma frente.

### Spike realizado (2026-05-12)

**Paths confirmados (todos existem):**
- `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/google.ts` — importa `from "googleapis"` (linha 1)
- `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/email.ts` — importa `from "resend"` (linha 1)
- `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/server/push-service.ts` — importa `from 'web-push'` (linha 1)

**Package `server-only`:** NÃO está instalado. Não consta em `packages/web/package.json` (dependencies nem devDependencies), não consta no `pnpm-lock.yaml`, não existe em `node_modules/`. Precisa ser adicionado como dependência.

**Vazamentos de client component encontrados:** NENHUM. Todos os 13 arquivos que importam `lib/google.ts`, `lib/email.ts` ou `lib/server/push-service.ts` são API routes (`app/api/**/*.ts`) ou lib helpers server-side — nenhum contém `'use client'`. Verificação transitiva confirmada: `lib/notificacoes.ts` e `lib/auto-vincular-cliente-obra.ts` (que importam `lib/email` e `lib/server/push-service`) são consumidos exclusivamente por API routes.

**Conclusão do spike:** Zero vazamentos. Story é XS pura — adicionar import + instalar package + rodar validações.

### Urgência

Defensivo, não ganha performance direta. Previne regressão futura: à medida que o codebase cresce, qualquer dev que acidentalmente importe `lib/google` num componente frontend receberá erro de build explícito em vez de bundle inflado silenciosamente.

**Referência:** `docs/audits/performance-bundle-audit.md` — seção "Falta: declarar `import 'server-only'` nos módulos que encapsulam googleapis/resend/web-push para proteção em build-time."

## Acceptance Criteria

1. `import "server-only"` está presente como **primeira linha** (antes de qualquer outro import ou código) em `packages/web/src/lib/google.ts`.

2. `import "server-only"` está presente como **primeira linha** em `packages/web/src/lib/email.ts`.

3. `import "server-only"` está presente como **primeira linha** em `packages/web/src/lib/server/push-service.ts`.

4. O package `"server-only"` está adicionado em `dependencies` (não `devDependencies`) de `packages/web/package.json`. Versão estável: `"server-only": "^0.0.1"`. O pacote é runtime — deve estar em `dependencies`, não `devDependencies`.

5. `pnpm install` (ou `pnpm --filter @trifold/web install`) foi executado e o package está presente em `node_modules` após a adição.

6. Nenhum arquivo com `'use client'` — em nenhum nível de import transitivo — importa os 3 módulos protegidos. Verificado via grep e confirmado pelo build passando (o Next.js lançaria erro de build se houvesse vazamento).

7. `pnpm --filter @trifold/web type-check` PASS — zero erros novos introduzidos por esta story.

8. `pnpm --filter @trifold/web lint` PASS — zero erros novos no arquivo `packages/web/next.config.ts` e nos 3 arquivos modificados.

9. `pnpm --filter @trifold/web build` PASS (exit code 0) — este é o AC mais crítico e o teste definitivo. Build quebrado indica vazamento de import ou package não instalado corretamente.

10. O File List desta story registra os 4 arquivos modificados com paths absolutos: os 3 arquivos `.ts` e o `package.json`.

## Estimativa
**Complexidade:** XS (Extra Small) — 30 min
**Story Points:** 1
**Prioridade:** P1 — defensivo, complementar à 28.1 (Done)

[AUTO-DECISION] Esforço mantido como XS. Spike confirmou zero vazamentos de client component. A única ação adicional em relação ao prompt original é instalar o package `server-only` (não estava presente) — adiciona ~2 min ao esforço, não altera sizing.

## Fora do Escopo (OUT)

- Adicionar `import "server-only"` em outros arquivos server-side (`lib/anthropic.ts`, `lib/supabase/admin.ts`, `lib/supabase/server.ts` etc.) — escopo deliberadamente restrito aos 3 módulos que encapsulam as dependências mais pesadas (googleapis 194 MB, resend, web-push). Outros módulos são candidatos para story separada em Epic futuro.
- Mover arquivos para subdiretório `lib/server/` (exceto `push-service.ts`, que já está lá) — refator de path é outra story.
- Qualquer mudança em `next.config.ts` — coberto pela Story 28.1 (Done).
- Adicionar `server-only` em `packages/shared/` — escopo é apenas `packages/web`.

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Build quebra porque algum import transitivo vazou para client code (falso negativo no spike) | Baixa | Spike confirmou zero vazamentos. Build PASS (AC 9) é o gate definitivo — o erro do Next.js é explícito e inclui o stack de import. Fix: remover o import do client component identificado. |
| Package `server-only` não disponível no npm registry ou versão incompatível | Muito Baixa | Pacote é mantido pela equipe do Next.js, versão `^0.0.1` estável desde Next 13. Se houver problema, `pnpm install` falhará com mensagem clara antes de qualquer mudança de código. |
| `import "server-only"` inserido depois de outros imports (ordem errada) | Baixa | AC 1-3 especificam "primeira linha". @dev deve confirmar visualmente após editar cada arquivo. |

## Tasks / Subtasks

### Task 1 — Instalar package `server-only` (AC 4, 5)
- [x] 1.1 Executar: `pnpm --filter @trifold/web add server-only`
- [x] 1.2 Confirmar que `"server-only": "^0.0.1"` (ou versão atual do npm) aparece em `packages/web/package.json` → `dependencies` (não `devDependencies`)
- [x] 1.3 Confirmar que `node_modules/server-only` existe após o install

### Task 2 — Adicionar `import "server-only"` nos 3 módulos (AC 1, 2, 3)
- [x] 2.1 Editar `packages/web/src/lib/google.ts` — inserir `import "server-only"` como linha 1 (antes do `import { google } from "googleapis"`)
- [x] 2.2 Editar `packages/web/src/lib/email.ts` — inserir `import "server-only"` como linha 1 (antes do `import { Resend } from "resend"`)
- [x] 2.3 Editar `packages/web/src/lib/server/push-service.ts` — inserir `import "server-only"` como linha 1 (antes do `import webpush from 'web-push'`)

### Task 3 — Validar zero vazamentos e confirmar build (AC 6, 7, 8, 9)
- [x] 3.1 Verificar via grep que nenhum consumidor tem `'use client'`: `grep -rn "'use client'\|\"use client\"" packages/web/src/lib/google.ts packages/web/src/lib/email.ts packages/web/src/lib/server/push-service.ts` (espera: zero matches nos próprios arquivos)
- [x] 3.2 Executar `pnpm --filter @trifold/web type-check` → deve PASSAR
- [x] 3.3 Executar `pnpm --filter @trifold/web lint` → deve PASSAR
- [x] 3.4 Executar `pnpm --filter @trifold/web build` → deve PASSAR (exit code 0). Se quebrar com erro `server-only`, ler o stack trace do Next.js para identificar qual client component está importando por caminho transitivo.

### Task 4 — Documentar (AC 10)
- [x] 4.1 Preencher File List desta story com os 4 arquivos (3 `.ts` + `package.json`)
- [x] 4.2 Registrar no Change Log

## Dev Notes

### Padrão de implementação

A única mudança em cada arquivo é inserir uma linha no topo:

```typescript
import "server-only"

import { google } from "googleapis"   // linha original — continua igual
// ... resto do arquivo inalterado
```

Convenção Next.js: `import "server-only"` DEVE ser a primeira linha, antes de qualquer outro import. Não é um comentário — é um import real que vai ao runtime do Node.js e lança `new Error("...only be used on the server...")` se executado em contexto cliente.

### Como instalar o package

```bash
# Da raiz do monorepo:
pnpm --filter @trifold/web add server-only

# Verificar resultado:
grep "server-only" packages/web/package.json
# Esperado: "server-only": "^0.0.1" (ou versão atual)
```

O package `server-only` é publicado pela Vercel/Next.js team. Tem apenas um arquivo `index.js` que lança erro se executado no browser. Tamanho negligível — não impacta bundle.

### Verificação de importadores (confirmar spike)

Para confirmar quem importa cada módulo durante a implementação:

```bash
# Quem importa lib/google:
grep -rn "from.*@web/lib/google\|from.*lib/google" packages/web/src/

# Quem importa lib/email (diretamente — não email-automations, email-layout):
grep -rn "from.*@web/lib/email[\"']" packages/web/src/

# Quem importa push-service:
grep -rn "from.*push-service\|from.*server/push" packages/web/src/
```

**Resultado do spike (2026-05-12):** Todos os importadores diretos e transitivos são API routes (`app/api/**`) ou lib helpers server-side sem `'use client'`. Nenhum vazamento encontrado.

### Contexto do serverExternalPackages (Story 28.1)

A Story 28.1 (Done) configurou `next.config.ts` com:
```typescript
serverExternalPackages: [
  "googleapis",
  "google-auth-library",
  "web-push",
  "resend",
],
```
Essa config reduziu `.next/server` de 119 MB → 55 MB (-53,8%). A story 28.4 não altera esse config — apenas adiciona a camada defensiva de build-time nos arquivos que usam esses packages.

### O que acontece se o build quebrar

Se `pnpm build` falhar com erro tipo:
```
Error: This module cannot be imported from a Client Component module.
It should only be used from a Server Component.
```

O Next.js mostrará o import chain completo (qual arquivo → qual arquivo → qual client component). O fix será remover o import do client component ou mover a lógica para um Server Component / API route.

### Testing

Não há suite de testes automatizados para este tipo de proteção. O `pnpm build` (Task 3.4) é o teste definitivo:
- Build PASS = nenhum client component importa os módulos protegidos
- Build FAIL com `server-only` error = vazamento real encontrado e explicitado pelo Next.js

Não há risco de falso positivo: o Next.js só lança o erro quando há import real de client code.

## File List

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `packages/web/src/lib/google.ts` | Modificado | Adicionada `import "server-only"` como linha 1 (+1 linha + linha em branco) |
| `packages/web/src/lib/email.ts` | Modificado | Adicionada `import "server-only"` como linha 1 (+1 linha + linha em branco) |
| `packages/web/src/lib/server/push-service.ts` | Modificado | Adicionada `import "server-only"` como linha 1 (+1 linha + linha em branco) |
| `packages/web/package.json` | Modificado | Dependência `"server-only": "^0.0.1"` adicionada em `dependencies` |
| `packages/web/pnpm-lock.yaml` | Modificado | Auto-update pelo `pnpm add` para registrar `server-only@0.0.1` |

## QA Results

**Verdict:** PASS | **Reviewer:** Quinn (@qa) | **Date:** 2026-05-12

10/10 ACs cumpridos. `import "server-only"` confirmado como linha 1 em `google.ts`, `email.ts` e `server/push-service.ts`. Package `^0.0.1` em `dependencies`. Build PASS (exit 0, 3.6s) — zero vazamentos. Defesa build-time complementar a `serverExternalPackages` (Story 28.1) ativa.

Gate file: `/Users/ogabrielhr/trifold-crm/docs/qa/gates/28-4-qa-gate.md`

Status: Ready → Done. Handoff: @devops *push.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-12 | 1.0 | Story criada — Epic 28, Story 28.4. Spike realizado: 3 paths confirmados, server-only package não instalado, zero vazamentos de client component encontrados. Status: Ready. | River (@sm) |
| 2026-05-12 | 1.1 | Implementação completa: server-only adicionado em 3 módulos sensíveis, package instalado (^0.0.1). Validação: type-check PASS, lint dos arquivos modificados PASS, build PASS (exit 0, compiled em 3.6s, zero erros de server-only leak). | Dex (@dev) |
| 2026-05-12 | 1.2 | QA Gate PASS — 10/10 ACs cumpridos, `import "server-only"` confirmado como primeira linha nos 3 arquivos, package em `dependencies`, build PASS reproduz. Status: Ready → Done. Gate file: `docs/qa/gates/28-4-qa-gate.md`. | Quinn (@qa) |

---
epic: 28
title: Next.js Config Quick Wins — Ligar otimizações default-off do Next 16
status: Ready
created_at: 2026-05-12
updated_at: 2026-05-12
created_by: Morgan (@pm)
priority: P0
source_plan: docs/audits/PERFORMANCE-PLAN.md (seção 4)
po_review: docs/audits/PERFORMANCE-PLAN-PO-REVIEW.md (aprovado sem ajustes para Epic 28)
depends_on: []
blocks: []
stories_planned: [28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8]
estimated_points: 19
estimated_duration: ~3 dias úteis (1 sprint curto)
---

# Epic 28 — Next.js Config Quick Wins

## Objetivo do Epic

Ligar todas as otimizações default-off do Next 16 que hoje estão desativadas por configuração vazia, mais um conjunto de ajustes de TypeScript, tree-shaking, server-only enforcement, loading states e cache de borda. ROI gigante × esforço mínimo: 1 sprint resolve 8 frentes complementares com zero risco arquitetural.

## Por que agora (urgência operacional)

**Sinal de campo (2026-05-12):** O usuário relata que "a plataforma está extremamente lerda" — sintoma agudo que exige melhoria perceptível antes do roadmap de longo prazo.

**Decisão tática:** Epic 27 (Observability Foundation) foi temporariamente diferido. Embora Quinn (@qa) argumente que medição vem antes de otimização, a urgência operacional inverte a ordem para este Epic 28: ganhos aqui são imediatos, visíveis sem instrumentação RUM, e não dependem de baseline. Epic 27 retorna ao plano logo depois (ou em paralelo a partir da Story 28.3).

**Por que este epic primeiro entre as otimizações:**
- `packages/web/next.config.ts` tem **7 linhas e zero configuração efetiva** — confirmado por leitura direta. Todas as flags default-off do Next 16 (compiler.removeConsole, optimizePackageImports, serverExternalPackages, staleTimes, image formats) estão desligadas.
- Esforço total: **~3 dias úteis** (19 SP); a maior parte é onda 1 de fixes do `noUncheckedIndexedAccess` (Story 28.3).
- Zero risco arquitetural — todas mudanças são **aditivas e backward-compatible**.
- Toca múltiplos sintomas de lentidão em PRs pequenos e isolados: cold start de rotas que carregam `googleapis` (194 MB no node_modules), bundle inicial inflado por imports não tree-shakeáveis de `lucide-react`/`recharts`, navegação sem feedback visual (zero `loading.tsx` no `/app`), payload duplicado por falta de cache headers em `/api/analytics/*`.

## Contexto do Sistema Existente

- **Stack:** Next.js 16.2.2 (App Router), React 19, TypeScript, Supabase, Vercel
- **Monorepo:** `packages/web` (app principal) + `packages/shared` (lib compartilhada)
- **Build:** Turbopack via pnpm; 293 arquivos TS/TSX em `packages/web`; 112 API routes
- **Estado de `next.config.ts`:** 7 linhas, vazio (`{ /* config options here */ }`)
- **Estado de `loading.tsx` no `/app`:** **zero arquivos** (auditoria confirma)
- **`next/dynamic` no codebase:** **zero ocorrências** (todos imports são síncronos)
- **`React.cache()` / `unstable_cache`:** **zero ocorrências**
- **Dependências pesadas que sangram cold start:** `googleapis@171` (194 MB), `web-push`, `resend`, `google-auth-library`
- **Avisos do projeto:** `packages/web/AGENTS.md` declara explicitamente "This is NOT the Next.js you know — APIs, conventions, and file structure may all differ from your training data. Read `node_modules/next/dist/docs/` before writing any code." → Cada story deve validar APIs no doc local antes de aplicar mudanças.

## Enhancement Details

### O que está sendo adicionado

1. **`next.config.ts` completo** — compiler.removeConsole, experimental.optimizePackageImports, serverExternalPackages, images (formats + remotePatterns), experimental.staleTimes, headers para `/sw.js` e `/_next/static`, `poweredByHeader: false`. Configuração completa recomendada está documentada em `docs/audits/performance-architecture-audit.md` (seção "Recomendações de configuração").

2. **`tsconfig.json` mais estrito** — target `ES2022`, ativar `noUncheckedIndexedAccess: true` para apanhar `undefined` em acessos por índice/chave que hoje silenciam runtime errors.

3. **Onda 1 de fixes do `noUncheckedIndexedAccess`** — diretórios `lib/`, `hooks/`, `components/`. API routes ficam para onda 2 (Epic 34, Story 34.9).

4. **`import "server-only"`** em módulos que tocam APIs server-only (`lib/google.ts`, `lib/email.ts`, `lib/server/push-service.ts`) — previne vazamento desses módulos pesados para o bundle client.

5. **`"sideEffects": false`** em `packages/shared/package.json` — habilita tree-shaking agressivo de re-exports da lib compartilhada.

6. **`loading.tsx`** em rotas chave do dashboard e portal cliente — feedback visual imediato durante navegação (Suspense boundary nativo do App Router).

7. **Cache headers de borda** em `vercel.json` para `/api/analytics/*` (`s-maxage=60, swr=300`) e `/api/dashboard/metrics` (`s-maxage=30, swr=120`) + **consolidação de `vercel.json`** root vs `packages/web/vercel.json` numa única fonte (hoje existem dois — confirmado).

8. **Housekeeping:** deletar `logo-Trifold-laranja.webp` da raiz do projeto (confirmado duplicado e não referenciado; o arquivo usado é `packages/web/public/logo-trifold.webp`).

### Como integra com o sistema existente

- **Aditivo apenas.** Nenhum comportamento de runtime é removido. `optimizePackageImports` e `serverExternalPackages` são pure-wins do Next compiler.
- **`removeConsole` em produção** mantém `console.error` (Next default) — não quebra logging de erros existentes.
- **`loading.tsx`** introduz Suspense boundary apenas onde adicionado — não afeta rotas sem o arquivo.
- **Cache headers** são adicionados via `vercel.json` (edge), não tocam código de rota — rotas hot já são read-only e seguras para cache curto.
- **`noUncheckedIndexedAccess`** vai gerar erros novos em compile time — Story 28.3 trata onda 1 (~80% do código produto); onda 2 (`api/*`) fica para Epic 34.9.
- **`import "server-only"`** falha o build se um módulo server-only for importado por código client — comportamento desejado, defensivo.

### Pré-requisitos verificáveis

```bash
# Estado atual confirmado em 2026-05-12:
wc -l packages/web/next.config.ts           # → 7 linhas, vazio
grep -r "loading.tsx" packages/web/src/app  # → zero ocorrências
grep -r "next/dynamic" packages/web/src     # → zero ocorrências
ls vercel.json packages/web/vercel.json     # → ambos existem (consolidar)
ls logo-Trifold-laranja.webp                # → existe na raiz (deletar)
```

### Sucesso mensurável

- **Bundle inicial cai ≥10%** comparando `.next/static/chunks/*` antes/depois (verificável via `du -sh` ou bundle-analyzer quando Epic 27.7 entregar; até lá, comparação heurística de tamanho de chunks principais).
- **Cold start de rotas que tocam `googleapis`** cai sensivelmente — avaliar tempo de boot empírico em `/api/cron/campaign-poll` e `/api/forms-callback` (Google Forms).
- **`pnpm type-check` passa** após Story 28.3 (zero erros TS).
- **Navegação visualmente diferente:** abrir `/dashboard/leads` mostra skeleton (loading.tsx) em vez de tela branca.
- **`/api/analytics/*` responde em <50ms** quando cacheado pela edge (verificável em DevTools → Network → cache hit).

---

## Stories Propostas (a serem criadas por @sm)

> **Nota:** @pm cria o esqueleto do epic. Stories detalhadas com AC completos, dev notes, executor assignment e quality_gate são responsabilidade do @sm via `*draft` durante `*execute-epic`. Os resumos abaixo servem como input para o @sm.

### Story 28.1 — Atualizar `next.config.ts` completo

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[next_config_validation, build_smoke_test, bundle_diff]`
**Complexidade:** P (1h) | **Story points:** 3 | **Prioridade:** P0 (fundação do epic)
**Dependências:** nenhuma (primeira do epic)

**Descrição:** Substituir o `next.config.ts` atual (7 linhas vazio) pela configuração completa recomendada no relatório arquitetural. Blocos esperados:
- `compiler.removeConsole: { exclude: ['error'] }` em produção
- `experimental.optimizePackageImports: ['lucide-react', 'recharts', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers', '@trifold/shared']`
- `serverExternalPackages: ['googleapis', 'web-push', 'resend', 'google-auth-library']`
- `images.formats: ['image/avif', 'image/webp']` + `images.remotePatterns` (Supabase Storage + Meta CDN)
- `experimental.serverActions.bodySizeLimit: '10mb'`
- `experimental.staleTimes: { dynamic: 30, static: 180 }`
- `headers()` para `/sw.js` (no-cache) e `/_next/static/*` (immutable)
- `poweredByHeader: false`

**Fonte da config completa:** `docs/audits/performance-architecture-audit.md` → seção "Recomendações de configuração".

**Validação obrigatória:** rodar `pnpm build` antes do commit; rodar `pnpm dev` e verificar zero warnings novos; confirmar que o Service Worker continua sendo servido com `Cache-Control: no-cache`.

**Risco:** BAIXO. Backward-compatible. Rollback = `git revert` da PR.

---

### Story 28.2 — Atualizar `tsconfig.json` (target ES2022 + noUncheckedIndexedAccess)

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[ts_strict_validation, type_check_diff]`
**Complexidade:** P (1h, mas gera centenas de erros TS) | **Story points:** 2 | **Prioridade:** P0
**Dependências:** 28.1 (mesma sprint, sequência preferida)

**Descrição:** Atualizar `tsconfig.json` em duas localizações:
- `/Users/ogabrielhr/trifold-crm/tsconfig.json` (root do monorepo)
- `/Users/ogabrielhr/trifold-crm/packages/web/tsconfig.json` (web)

Mudanças:
- `target: "ES2022"` (de ES2017 ou similar) — habilita output de top-level await, Object.hasOwn, etc.
- `compilerOptions.noUncheckedIndexedAccess: true` — força narrowing em `array[i]` e `obj[key]` (retorno passa a ser `T | undefined`).

**Esperado:** `pnpm type-check` falha com **centenas de erros TS2532/TS18048**. Esta story **não resolve os erros** — apenas habilita o flag. Os fixes são Story 28.3 (onda 1) e Story 34.9 (onda 2).

**Estratégia para não bloquear o time:** marcar `noUncheckedIndexedAccess` como temporariamente desabilitado se houver outras stories em curso (Epic 25, Epic 26 em InReview), ou rodar esta story DEPOIS de Story 28.3 estar pronta para mergear junta.

**Risco:** MÉDIO-BAIXO. Não muda comportamento de runtime, só de compile time. Risco real é bloquear outros PRs que herdem o flag antes dos fixes da 28.3 chegarem — mitigação: garantir que 28.2 e 28.3 entrem na MESMA PR ou em PRs encadeados sem janela aberta.

---

### Story 28.3 — Resolver erros novos de TS (onda 1: lib/, hooks/, components/)

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@qa`
**Quality Gate Tools:** `[ts_error_resolution, no_any_creep, unit_test_run]`
**Complexidade:** G (1 dia) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** 28.2 (consume os erros gerados)

**Descrição:** Resolver erros TS gerados pelo `noUncheckedIndexedAccess` nos seguintes diretórios:
- `packages/web/src/lib/**`
- `packages/web/src/hooks/**`
- `packages/web/src/components/**`

**Estratégia de fix preferida (em ordem):**
1. **Type guard explícito:** `if (!item) continue;` antes de usar.
2. **Non-null assertion `!`:** APENAS quando há invariante claro (ex: `array.length > 0` checado antes).
3. **Default value `??`:** `const value = array[0] ?? defaultValue`.
4. **`any` é proibido** — se a tipagem ficar impossível, escalar para @architect.

**API routes (`packages/web/src/app/api/**`)** ficam **fora do escopo** desta story — vão para Epic 34, Story 34.9 (onda 2). Isso é decisão consciente do plano mestre para não fazer 1 PR gigantesco.

**Validação obrigatória:**
- `pnpm type-check` passa zero erros após a story.
- `pnpm test` (os 2 test files existentes) continua passando.
- Sem novos `any` ou `@ts-ignore` adicionados (validar via grep no diff).

**Risco:** MÉDIO. Surface de mudança é grande. Mitigação: cada commit pequeno por subdiretório; CodeRabbit self-healing ativo para apanhar regressões.

---

### Story 28.4 — Adicionar `import "server-only"` em módulos server-only

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[server_only_audit, build_smoke_test]`
**Complexidade:** P (30 min) | **Story points:** 1 | **Prioridade:** P1
**Dependências:** 28.1 (paralelizável após config)

**Descrição:** Adicionar `import "server-only"` no topo de cada um dos módulos abaixo (ou similares se houver):
- `packages/web/src/lib/google.ts` — wrapper de googleapis (Google Drive/Forms)
- `packages/web/src/lib/email.ts` — wrapper de Resend
- `packages/web/src/lib/server/push-service.ts` — wrapper de web-push

**Por que:** garantir que qualquer client component que acidentalmente importar esses módulos pesados quebre o build em vez de inflar o bundle silenciosamente. É defensivo, não destrutivo — se hoje algum component client importa qualquer um deles, este import vai REVELAR o problema (positivo). A story DEVE rodar `pnpm build` e, se quebrar, registrar a quebra como ITEM a fixar dentro da story (não vire epic novo).

**Risco:** BAIXO. Se revelar import errado, o fix é remover o import do client (pequeno).

---

### Story 28.5 — Adicionar `"sideEffects": false` em `packages/shared/package.json`

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[tree_shake_validation, bundle_diff, sideeffects_audit]`
**Complexidade:** P (1h) | **Story points:** 2 | **Prioridade:** P1
**Dependências:** 28.1

**Descrição:** Adicionar `"sideEffects": false` ao `package.json` de `packages/shared`. Isto sinaliza ao webpack/turbopack que módulos importados de `@trifold/shared` podem ser tree-shaken agressivamente — qualquer função/constante não usada pelo consumer é eliminada do bundle.

**Validação obrigatória:**
- Auditar `packages/shared/src` em busca de side-effects implícitos: `console.log` no top-level, `process.env.X = ...`, polyfills, registros em singletons. Se houver, OU declarar `sideEffects: ["./src/path-com-efeito.ts"]` (array) ou refatorar para function call explícita.
- Rodar `pnpm build` e verificar bundle de `/dashboard` antes/depois — esperar redução visível em chunks que importam `@trifold/shared`.
- Smoke test: navegar pelas rotas que mais consomem `@trifold/shared` (e.g., `/dashboard/campaigns/meta`) e confirmar zero quebra.

**Risco:** MÉDIO-BAIXO. Tree-shaking agressivo pode remover código que tinha efeito não declarado — daí o audit obrigatório.

---

### Story 28.6 — Criar `loading.tsx` em rotas chave (dashboard + portal cliente)

**Executor sugerido:** `@dev` (com review de @ux-design-expert se houver dúvida sobre skeleton) | **Quality Gate sugerido:** `@qa`
**Quality Gate Tools:** `[loading_state_visual, accessibility_audit_aria]`
**Complexidade:** M (2h) | **Story points:** 3 | **Prioridade:** P1
**Dependências:** nenhuma (paralelizável)

**Descrição:** Criar `loading.tsx` (Server Component, async-friendly skeleton) em:
- `packages/web/src/app/dashboard/loading.tsx`
- `packages/web/src/app/dashboard/leads/loading.tsx`
- `packages/web/src/app/dashboard/pipeline/loading.tsx`
- `packages/web/src/app/dashboard/conversas/loading.tsx`
- `packages/web/src/app/dashboard/analytics/loading.tsx`
- `packages/web/src/app/cliente/[obra_id]/loading.tsx`

**Padrão de skeleton:** layout simplificado com Tailwind `animate-pulse`, mesma estrutura visual da página real (header bar, grid de cards, table rows). Sem regredir UX existente. Para o portal cliente, manter brand visual recém-alinhada (commit `63f2b86` — redesign visual portal cliente).

**Acessibilidade:** `<div role="status" aria-live="polite" aria-label="Carregando...">` em cada skeleton.

**Risco:** BAIXO. Adição pura; rollback = deletar arquivos.

---

### Story 28.7 — Cache headers em `vercel.json` + consolidação root vs packages/web

**Executor sugerido:** `@devops` (config Vercel é do escopo Gage) | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[vercel_config_validation, edge_cache_smoke_test, single_source_of_truth_audit]`
**Complexidade:** M (1h) | **Story points:** 2 | **Prioridade:** P1
**Dependências:** nenhuma (paralelizável)

**Descrição:** Duas mudanças:

1. **Consolidar `vercel.json`** em uma única fonte. Hoje existem dois (confirmado): `/Users/ogabrielhr/trifold-crm/vercel.json` (root) e `/Users/ogabrielhr/trifold-crm/packages/web/vercel.json`. Auditar diff entre eles, decidir com @devops qual permanece (geralmente o que está no `rootDirectory` apontado pelo Vercel Project Settings) e remover o outro, garantindo paridade de conteúdo.

2. **Adicionar headers de cache** ao `vercel.json` consolidado:
```json
{
  "headers": [
    {
      "source": "/api/analytics/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, s-maxage=60, stale-while-revalidate=300" }
      ]
    },
    {
      "source": "/api/dashboard/metrics",
      "headers": [
        { "key": "Cache-Control", "value": "public, s-maxage=30, stale-while-revalidate=120" }
      ]
    }
  ]
}
```

**Validação obrigatória:**
- Após deploy: `curl -I https://<deploy>/api/analytics/whatever` retorna `Cache-Control` esperado.
- Garantir que rotas autenticadas que usam `cookies()` ou `auth.getUser()` **não** estão na lista (cache público nelas vaza dados). `/api/analytics/*` e `/api/dashboard/metrics` precisam ser auditadas: se ainda usam auth contextual, mudar para `private, s-maxage=...` ou excluir desta story.

**Risco:** MÉDIO. Cache em rota autenticada errada = vazamento de dados entre orgs. Por isso o quality gate é @architect e o quality_gate_tools incluem `edge_cache_smoke_test`. Rollback = remover o bloco `headers` do `vercel.json` e redeploy.

---

### Story 28.8 — Deletar `logo-Trifold-laranja.webp` duplicado da raiz

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[file_deletion_safety, reference_audit]`
**Complexidade:** P (5 min) | **Story points:** 1 | **Prioridade:** P3 (housekeeping)
**Dependências:** nenhuma

**Descrição:** Deletar `/Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp`. Confirmado:
- Existe na raiz do monorepo (não é um asset servido).
- Arquivo de logo usado em produção é `/Users/ogabrielhr/trifold-crm/packages/web/public/logo-trifold.webp` (servido como `/logo-trifold.webp`).
- Nenhum import/reference para o arquivo da raiz encontrado.

**Validação obrigatória:** rodar `Grep` por `logo-Trifold-laranja` em todo o monorepo antes de deletar. Se houver match, escalar para @architect e NÃO deletar nesta story.

**Risco:** BAIXO. Rollback = `git revert`.

---

## Estimativa e Sequência

| Story | Complexidade | Story Points | Estimativa | Pré-requisito |
|-------|--------------|--------------|------------|---------------|
| 28.1 — next.config.ts completo | P | 3 | 1h | — |
| 28.2 — tsconfig + noUncheckedIndexedAccess | P | 2 | 1h | 28.1 |
| 28.3 — Fixes TS onda 1 (lib/hooks/components) | G | 5 | 1 dia | 28.2 |
| 28.4 — import "server-only" | P | 1 | 30 min | 28.1 |
| 28.5 — sideEffects: false em shared | P | 2 | 1h | 28.1 |
| 28.6 — loading.tsx (6 rotas) | M | 3 | 2h | — |
| 28.7 — vercel.json (cache + consolidação) | M | 2 | 1h | — |
| 28.8 — Deletar logo duplicado | P | 1 | 5 min | — |
| **Total** | — | **19 SP** | **~3 dias úteis** | — |

**Sequência sugerida (otimizada para paralelizar):**

```
Dia 1 manhã   : 28.1 (next.config) → 28.4 (server-only) → 28.5 (sideEffects)
Dia 1 tarde   : 28.2 (tsconfig flag)  +  28.6 (loading.tsx) em paralelo
Dia 2 inteiro : 28.3 (fixes TS onda 1) — mais pesada do epic
Dia 3 manhã   : 28.7 (vercel.json cache) → 28.8 (delete logo)
Dia 3 tarde   : QA final + medição empírica de bundle e cold start
```

## Compatibilidade

- [x] **APIs existentes inalteradas.** `next.config.ts` é configuração; não muda contratos de rota.
- [x] **Schema de banco inalterado.** Zero migration neste epic.
- [x] **UI sem regressão.** `loading.tsx` é adição; não substitui página real. Skeletons seguem brand recém-alinhada (commit `63f2b86`).
- [x] **`packages/shared` mantém API pública.** `sideEffects: false` só habilita tree-shake; não remove exports.
- [x] **`removeConsole` mantém `console.error`** — logging de erros existente preservado.
- [x] **Rollback simples por story.** Cada PR é revertível independentemente — `git revert` do hash.

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `noUncheckedIndexedAccess` bloqueia PRs em curso (Epic 25, 26) | Alta | Mergear 28.2 + 28.3 juntas; OU manter 28.2 em branch separada até 28.3 estar pronta para co-merge |
| `serverExternalPackages` incompleto deixa googleapis no bundle client | Média | Story 28.4 (`import "server-only"`) é a rede de segurança — falha o build se vazar |
| `optimizePackageImports` quebra alguma lib (lucide-react fork @1.7.0?) | Média | Smoke test obrigatório em 28.1: navegar pelas rotas principais após config; manter lucide-react como item de auditoria contínua (Story 32.9 cobre identidade da versão) |
| Cache header errado em rota autenticada vaza dados entre orgs | Alta | Quality gate de 28.7 é @architect; AC obrigatório: validar via curl que `Cache-Control: public` só vai para rotas SEM contexto user |
| Two `vercel.json` causam config drift após deploy | Média | Story 28.7 trata diretamente; @devops valida via Vercel Project Settings qual é o efetivo |
| `sideEffects: false` em shared remove código com efeito implícito | Média | Audit obrigatório em 28.5 antes do flag; smoke test pós-merge nas rotas que mais usam shared |
| Breaking changes do Next 16 mascarando suposições | Média | Cada story DEVE consultar `node_modules/next/dist/docs/` antes de aplicar mudança (conforme `packages/web/AGENTS.md`) |
| `loading.tsx` causa flash desnecessário em rotas rápidas | Baixa | Skeletons curtos + Next.js só renderiza loading se Suspense suspender; observar após deploy |

## Definition of Done (Epic)

- [ ] Todas as 8 stories concluídas com AC verificado e QA gate PASS
- [ ] `pnpm type-check` passa com zero erros após Story 28.3
- [ ] `pnpm build` passa sem warnings novos
- [ ] `next.config.ts` agora reflete configuração completa documentada em `performance-architecture-audit.md`
- [ ] Navegação visual: skeleton aparece ao mudar de rota no dashboard (verificável a olho nu)
- [ ] `curl -I` em `/api/analytics/*` mostra `Cache-Control: public, s-maxage=...`
- [ ] **Heurística de bundle:** `du -sh packages/web/.next/static/chunks` reduz vs baseline pré-epic (ou bundle-analyzer da Story 27.7 confirma ≥10% caso Epic 27 entre em paralelo)
- [ ] **Heurística de cold start:** rota `/api/cron/campaign-poll` (toca googleapis) boot perceptivelmente mais rápido em logs Vercel
- [ ] Sem regressão em features ativas: Epic 21 (WhatsApp), Epic 22 (PWA portal cliente), Epic 25 (Meta Ads campaign actions) continuam funcionais
- [ ] `vercel.json` consolidado em fonte única (root OU packages/web — não ambos)
- [ ] `logo-Trifold-laranja.webp` removido da raiz
- [ ] @devops fez push de cada story após QA gate PASS

## Out of Scope (explícito)

Este epic **NÃO inclui**:
- **Índices de banco** — Epic 29 (Database Performance Blitz)
- **Reescrita de queries over-fetch** (analytics, conversas, pipeline) — Epic 30 (Over-fetch & N+1 Killers)
- **`React.cache()` e `unstable_cache`** — Epic 31 (Caching Layer & Auth)
- **`next/dynamic` imports e Suspense por card** — Epic 32 (Bundle & Rendering)
- **Refactor do `campaign-detail-client.tsx` em islands** — diferido para Epic 34 (Hardening) conforme bloqueante B1 do PO review
- **Fixes TS de `noUncheckedIndexedAccess` em `api/*`** — Story 34.9 (Epic 34, onda 2)
- **Sentry, Speed Insights, error.tsx** — Epic 27 (Observability Foundation) — diferido, retorna ao plano logo após este epic
- **Edge runtime em rotas read-only** — Epic 32, Story 32.10
- **`googleapis` slim/refactor para imports específicos** — Epic 32, Story 32.8
- **Service Worker scope/cache strategy** — Epic 33, Story 33.7

## Métricas-alvo do Epic (heurísticas, pré-Speed Insights)

| Métrica | Baseline pré-epic | Target pós-epic | Como medir |
|---------|-------------------|-----------------|------------|
| `du -sh packages/web/.next/static/chunks` | a capturar antes da Story 28.1 | -10% mínimo | `du` antes/depois |
| Tempo de boot empírico `/api/cron/campaign-poll` | a capturar via Vercel logs | redução visível | logs Vercel "Init Duration" |
| Tela branca em mudança de rota dashboard | sim (zero loading.tsx) | não (skeleton visível) | navegação manual |
| `curl -I /api/analytics/leads-by-source` `Cache-Control` | nenhum | `public, s-maxage=60, swr=300` | `curl` em prod |
| `pnpm type-check` erros novos com flag ativo | 0 hoje (flag off) | 0 após Story 28.3 | `pnpm type-check` |

## Handoff para @pm `*execute-epic` (próximo passo)

> **Epic 28 está marcado como `status: Ready`** — validado pelo PO via `PERFORMANCE-PLAN-PO-REVIEW.md` (Epic 28 aprovado sem ajustes; bloqueantes B1/B2/B3 do PO se aplicam a Epic 29 e 32, não a Epic 28).
>
> **Próxima ação do @pm:**
> ```
> @pm *execute-epic 28
> ```
>
> Isso gera `EPIC-28-EXECUTION.yaml` com waves paralelas e dispara `@sm *draft 28.1`.

## Handoff para @sm (quando `*execute-epic` rodar)

> "Criar stories detalhadas para o **Epic 28 — Next.js Config Quick Wins**.
>
> **Contexto crítico do projeto:**
> - Stack: Next.js 16.2.2 (App Router), React 19, Turbopack, monorepo pnpm
> - `packages/web/AGENTS.md` declara que Next 16 tem breaking changes vs training data — **cada story DEVE consultar `node_modules/next/dist/docs/` antes de aplicar mudança**
> - `next.config.ts` atual: 7 linhas, vazio (confirmado por leitura)
> - Loading states: ZERO `loading.tsx` no `/app` hoje
> - Dependências pesadas: googleapis (194 MB), web-push, resend, google-auth-library
>
> **Fontes técnicas para cada story:**
> - Configuração completa do `next.config.ts`: `docs/audits/performance-architecture-audit.md` → seção "Recomendações de configuração"
> - Motivação por trás de cada flag: `docs/audits/performance-bundle-audit.md`
> - Plano mestre com contexto cross-epic: `docs/audits/PERFORMANCE-PLAN.md`
>
> **Sequência obrigatória dentro do epic:**
> - 28.1 (config) → 28.4 (server-only) → 28.5 (sideEffects) → 28.6 (loading.tsx) em paralelo (com 28.7 e 28.8)
> - 28.2 (tsconfig flag) **deve mergear junto com** 28.3 (TS fixes onda 1) para não bloquear outros PRs
>
> **Padrões existentes a respeitar:**
> - Brand visual portal cliente: commit `63f2b86` (redesign laranja) — skeletons devem honrar
> - Service Worker: cuidado especial em headers (Story 28.1 inclui `/sw.js` no-cache)
> - Migration de número não é parte deste epic (zero migrations aqui — paz de espírito para o Epic 29)
>
> **Quality gates predição:**
> - Stories 28.1, 28.2, 28.4, 28.5, 28.8 → quality_gate `@architect` (validação de config + reference audit)
> - Stories 28.3, 28.6 → quality_gate `@qa` (TS resolution + visual/acessibilidade)
> - Story 28.7 → executor `@devops` + quality_gate `@architect` (config Vercel + auditoria de cache pública vs autenticada)
>
> **Stack:** Next.js 16.2.2 App Router, React 19, Supabase, Vercel, TypeScript estrito."

---

**Status do epic:** `Ready` — pronto para `@pm *execute-epic 28`.

— Morgan, planejando o futuro 📊

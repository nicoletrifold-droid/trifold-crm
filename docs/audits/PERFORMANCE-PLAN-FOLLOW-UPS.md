# Performance Plan — Follow-ups out-of-scope

Tracking de achados arquiteturais que emergem durante execução de stories do Epic 29 (Database Performance Blitz) e correlatos, mas que estão fora do escopo original do AC.

---

## Origem: Story 29.8 (Connection pooler / SUPABASE_URL no Vercel) — 2026-05-13

Durante a execução desta story, @devops descobriu um bug grave em produção (`NEXT_PUBLIC_SUPABASE_URL` vazia em todos os 3 ambientes do Vercel) e o corrigiu dentro da story. Os 3 achados abaixo NÃO foram corrigidos por estarem fora do AC original e exigirem coordenação dedicada.

### 29.8b — Health route lê `NEXT_PUBLIC_*` diretamente (Turbopack inlining risk)

| Campo | Valor |
|-------|-------|
| Severidade | MEDIUM |
| Arquivo | `packages/web/src/app/api/health/route.ts:26` |
| Sintoma | Falso-positivo "Missing" no health check apesar de env estar configurada |
| Causa raiz | `process.env["NEXT_PUBLIC_SUPABASE_URL"]` no server pode ser inlinado como `undefined` pelo Turbopack durante build de produção |
| Solução | Migrar para `SUPABASE_URL` (private) com fallback `|| NEXT_PUBLIC_SUPABASE_URL`, igual a `server.ts` / `admin.ts` / `middleware.ts` |
| Executor sugerido | `@dev` |
| Quality gate | `@architect` |
| Tempo estimado | 30min (1 arquivo, lint, smoke) |
| Dependências | Nenhuma |

### 29.8c — `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` apenas em Production

| Campo | Valor |
|-------|-------|
| Severidade | MEDIUM |
| Arquivos | Vercel Project Settings → Environment Variables |
| Sintoma | Preview deploys (PRs) podem quebrar ao chamar Supabase com service-role |
| Causa raiz | Configuração inicial só em Production — não foi estendida a Preview/Development |
| Solução | `printf <ANON_KEY> | vercel env add SUPABASE_ANON_KEY preview` e idem para `development` e para `SUPABASE_SERVICE_ROLE_KEY` |
| Executor sugerido | `@devops` |
| Quality gate | `@architect` |
| Tempo estimado | 15min (4 comandos + redeploy preview) |
| Dependências | Nenhuma |
| Risco | Vazamento de service-role em build de preview público — validar que Vercel não expõe envs server para client (já garantido pelo prefixo) |

### 29.8d — `ANTHROPIC_API_KEY` reportado como Missing no health check

| Campo | Valor |
|-------|-------|
| Severidade | HIGH |
| Sintoma | `/api/health` em produção retorna `env_required.status: fail` com `Missing: ANTHROPIC_API_KEY` |
| Impacto | Nicole AI agent (consumidor primário da chave) potencialmente offline em produção |
| Verificação | 2026-05-13 22:05 UTC — bug persistente |
| Hipóteses | (a) Env vazia no Vercel, mesmo padrão de `NEXT_PUBLIC_SUPABASE_URL`; (b) Nome diferente (`ANTHROPIC_KEY` vs `ANTHROPIC_API_KEY`); (c) Edge runtime não expõe env Node |
| Diagnóstico inicial | `mkdir /tmp/vercel-anthro && cd /tmp/vercel-anthro && vercel env pull .env.prod --environment production && grep ANTHROPIC .env.prod && cd - && rm -rf /tmp/vercel-anthro` |
| Solução | Depende da causa: re-adicionar com valor correto OU renomear var no código OU migrar runtime |
| Executor sugerido | `@devops` (diagnóstico) → possivelmente `@dev` (se mudança de código) |
| Quality gate | `@architect` |
| Tempo estimado | 30min-2h dependendo da causa |
| Dependências | Nenhuma |

---

## Priorização sugerida

1. **29.8d** (HIGH) — Nicole AI pode estar offline; investigar imediatamente
2. **29.8b** (MEDIUM) — Falso-positivo em health, baixo esforço
3. **29.8c** (MEDIUM) — Hardening de Preview, baixo esforço

---

## Notas de processo

Estes follow-ups foram extraídos do quality gate de Story 29.8 (`docs/qa/gates/29-8-architect-gate.md`). Manter este arquivo como artefato vivo — adicionar novos achados conforme stories do Epic 29 forem executadas, mover para `## Concluídos` quando uma story for criada e fechada para o item.

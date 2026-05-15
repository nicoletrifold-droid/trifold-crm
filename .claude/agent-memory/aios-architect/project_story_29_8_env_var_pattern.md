---
name: Vercel env var failure pattern (SUPABASE_URL bug — Story 29.8)
description: Padrão de bug onde env var existe no Vercel mas tem valor vazio; diagnóstico via vercel env pull, sintoma via health check Missing
type: project
---

## Padrão de bug — env var vazia no Vercel

**Story 29.8 (2026-05-13)** descobriu que `NEXT_PUBLIC_SUPABASE_URL` estava cadastrada no Vercel em P+P+D mas com valor VAZIO há >40 dias. Resultado: aplicação funcionando apenas pelo fallback `SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL` em server-side, browser quebrado, health check reportando "Missing".

**Why:** `vercel env ls` confirma existência mas NÃO mostra valor. Único modo de detectar valor vazio: `vercel env pull --environment <env>` em diretório temporário + `grep` no `.env.tmp`. `/api/health` route reporta `env_required: Missing` para variáveis com valor vazio.

**How to apply:**
1. Em qualquer story que toque Vercel env vars, exigir spike com `vercel env pull` em `/tmp/...` para confirmar valor (não apenas existência).
2. Sempre limpar `/tmp` após pull para evitar vazamento de credenciais.
3. Padrão dual `SUPABASE_URL` (private) + `NEXT_PUBLIC_SUPABASE_URL` (public) é correto — Turbopack inlina `NEXT_PUBLIC_*` como `undefined` no proxy bundle de prod.
4. Se Health Check reportar "Missing" em var conhecidamente cadastrada, primeira hipótese é valor vazio (não Turbopack inlining), segunda é runtime mismatch (Edge vs Node).

**Hotfixes correlacionados:** commits `cb7000c` (turbo globalEnv) e `e166879` (notação de colchetes) eram tentativas de contornar este mesmo bug sem identificar a causa raiz (env vazia).

**Follow-ups abertos (`docs/audits/PERFORMANCE-PLAN-FOLLOW-UPS.md`):**
- 29.8b: `/api/health` route migrar para `SUPABASE_URL` (private) — MEDIUM
- 29.8c: estender `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` a Preview/Dev — MEDIUM
- 29.8d: investigar `ANTHROPIC_API_KEY` Missing — HIGH (Nicole pode estar offline)

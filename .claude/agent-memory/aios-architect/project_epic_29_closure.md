---
name: Epic 29 Closure Patterns
description: Padrões consolidados no fechamento do Epic 29 — Database Performance Blitz. Smoke runtime validável via Management API; fechamento de epic com sumário consolidado de ganhos.
type: project
---

# Epic 29 — Database Performance Blitz: padrões de fechamento

**Why:** Epic 29 fechou 100% em 2026-05-14 com 8 stories + 8 quality gates PASS. Smoke runtime do AC 8 (pg_cron job_run_details) era marcado como "pendente humano" mas estava validável via Management API. Sumário consolidado de ganhos fica no próprio epic file, não em doc separado.

**How to apply:**
1. **Smoke runtime via Management API:** quando AC menciona "aguardar X minutos para job executar", checar `cron.job_run_details` antes de marcar como pendente. Em muitos casos o job já rodou e o gate pode ser PASS direto.
2. **Fechamento de epic:** epic file ganha `status: Done` + `closed_at` + `closed_by` no frontmatter, sumário tabela final com ganhos mensurados por story, e DoD checkboxes auditados (tickar os técnicos; deixar smokes humanos puramente operacionais como `[ ]` com nota não-bloqueante).
3. **Não criar doc separado de fechamento** — o próprio epic file é a fonte canônica.

## Ganhos consolidados Epic 29 (registro histórico)
- RAG search ~45x (Story 29.4)
- ROAS query ~31x + refresh 30min (29.6 + 29.7)
- Queues pending ~9x (29.5)
- Migration tree saudável (29.1)
- pg_cron + 5 jobs ativos (29.7)
- Vercel env var stack (29.8)

## Gate file naming
`docs/qa/gates/{epic}-{story}-architect-gate.md` — pattern existente; gate de fechamento de epic vai no gate da última story (não doc separado).

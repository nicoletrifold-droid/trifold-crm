---
name: epic86-capi-outbox-schema
description: Reprocessamento CAPI outbox — schema da tabela meta_capi_outbox e fluxo de reset/dispatch validado em prod
metadata:
  type: project
---

Reprocessamento de leads travados na `meta_capi_outbox` (Epic 86 P0, evento "Visitou") validado ponta a ponta em prod (`dsopqkqjkmhytudaaolv`) em 2026-08-10.

Fluxo que funcionou: `UPDATE meta_capi_outbox SET status='pending', attempts=0, last_error=NULL WHERE status='failed'` (via Supabase Management API PAT `...54b14f`) → dispara cron manual `GET https://crm.trifold.eng.br/api/cron/meta-capi-dispatch` com header `Authorization: Bearer {CRON_SECRET}` → JSON `{ok,scanned,sent,failed,skipped}`. Cron roda sozinho a cada 3 min (Vercel Cron) se não disparar manual.

Schema notes:
- Tabela `meta_capi_outbox` NAO tem coluna `updated_at` — só `created_at` e `sent_at`. Query com `updated_at` retorna 42703.
- Colunas confirmadas: `id`, `lead_id`, `status`, `attempts`, `last_error`, `created_at`, `sent_at`.
- Estados: `pending` / `sent` / `failed`. `sent` popula `sent_at` e zera `last_error`.

**Why:** env vars `META_CAPI_ACCESS_TOKEN` (System User "Trifold API", não expira) e `META_CAPI_DATASET_ID=1337310707164669` foram gravadas em prod só depois de leads já entrarem em "visitou", deixando linhas `failed` com `last_error="META_CAPI_ACCESS_TOKEN is not configured"`. Ver [[epic86-capi-prod-state]] e [[supabase-prod-migration-method]].

**How to apply:** se aparecerem linhas `failed` na outbox de novo, checar `last_error` de TODAS antes de resetar em massa — só resetar se o erro for transitório (token/config). O `CRON_SECRET` de prod está em `.env.local` (raiz) e `packages/web/.env.local`. Usar WITH...RETURNING para contar linhas afetadas com precisão.

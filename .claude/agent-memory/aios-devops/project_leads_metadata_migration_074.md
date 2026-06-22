---
name: project-leads-metadata-migration-074
description: Migration 074 adiciona leads.metadata JSONB — historia, idempotencia e como aplicar
metadata:
  type: project
---

`supabase/migrations/074_leads_metadata.sql` cria `leads.metadata JSONB NOT NULL DEFAULT '{}'` + indice parcial `idx_leads_metadata_ad_id ON leads ((metadata->>'ad_id')) WHERE metadata->>'ad_id' IS NOT NULL`.

Historia: a coluna era referenciada por codigo em prod (webhook Meta `route.ts:206` faz REPLACE, webhook WhatsApp da Story 50-3 faz MERGE) mas NAO existia no Supabase de prod. Falhas silenciosas atras de try/catch mascararam o bug. Comentario stale em `016_meta_campaign_roas_view.sql:34` declarava que a coluna "nao existe" — agora desatualizado.

PR de deploy: https://github.com/nicoletrifold-droid/trifold-crm/pull/5 (draft em 2026-06-08).

**Why:** Foi o principal bloqueio para attribution Meta funcionar em producao. Toda a Epic 50 (CreativeChip + Story 50-3 CTWA) depende dessa coluna existir.

**How to apply:** A migration e idempotente (`IF NOT EXISTS`). Rollback seguro APENAS antes da coluna ter dados: `ALTER TABLE leads DROP COLUMN IF EXISTS metadata`. Apos primeiros leads com attribution, rollback exige backup. Tooling local (supabase CLI, psql) nao esta instalado no host do user — aplicar via Supabase SQL Editor ou em ambiente com CLI disponivel.

Linkado a [[project-meta-subscription]].

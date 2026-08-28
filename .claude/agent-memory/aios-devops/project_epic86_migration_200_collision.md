---
name: epic86-migration-200-collision
description: PR #358 (Epic 86 CAPI) traz migration 200 que colide com 200_marketing_brand_assets_icone.sql ja em main; renumerar antes de deploy
metadata:
  type: project
---

O PR #358 (Epic 86 P0 — Meta CAPI, branch `feat/86-meta-capi-tracking`) inclui `supabase/migrations/200_meta_capi_outbox.sql`, mas `origin/main` ja contem `200_marketing_brand_assets_icone.sql` (mergeada) e vai ate a migration `214`. Colisao de numero 200.

**Why:** o numero 200 foi atribuido ao arquivo do Epic 86 antes de `main` avancar ~50 commits (stories 75-233..75-272 + hotfixes de seguranca). A migration NAO foi aplicada em nenhum banco (decisao do usuario: aplicacao fica para deploy coordenado da story 86-1, quando o token CAPI for provisionado).

**How to apply:** antes de mergear/deployar o PR #358, renumerar `200_meta_capi_outbox.sql` para o proximo livre (na epoca, `215_...`), conferindo contra o schema remoto de prod — mesma classe de risco da colisao historica 074/075 ([[project_leads_metadata_migration_074]]). O cron `meta-capi-dispatch` (a cada 3min no vercel.json) fica inocuo sem o token e sem a tabela; linhas ficam `pending` sem perda. Ver tambem [[reference_supabase_prod_migration_method]] para aplicar via Management API.

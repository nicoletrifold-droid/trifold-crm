---
name: project-epic51-google-ads
description: Epic 51 Google Ads criado com 3 stories (51-1 schema+auth, 51-2 sync cron, 51-3 UI spend). Blocker externo: Developer Token com aprovação manual Google.
metadata:
  type: project
---

Epic 51 — Google Ads Marketing API Integration criado em 2026-06-08.

**Why:** MVP de spend tracking para Google Ads espelhando padrão Meta Ads (Epic 16). Responder "quanto gastamos no Google Ads na semana X?" direto no CRM.

**Stories criadas:**
- `docs/stories/epics/epic-51-google-ads-marketing-api.md`
- `docs/stories/51-1-google-ads-schema-and-auth.story.md` — migration 076, tabelas google_ads_*, RLS, google_ads_config em organizations. Executor: @data-engineer.
- `docs/stories/51-2-google-ads-sync-insights.story.md` — cron /api/cron/google-ads-sync-insights, GAQL searchStream, upsert em google_ads_insights_daily. Executor: @dev.
- `docs/stories/51-3-google-ads-spend-ui.story.md` — substituir placeholder "Em breve" em configuracoes/integracoes/page.tsx linhas 200-216, API /api/google-ads/campaigns, página /dashboard/campaigns/google. Executor: @dev.

**Blocker externo crítico:** Google Ads API exige Developer Token aprovado manualmente. Basic Access (15K ops/dia) geralmente rápido. Iniciar antes de 51-2.

**Diferenças arquiteturais Google vs Meta:**
- Auth: OAuth 2.0 refresh_token (não System User Token estático)
- Moeda: valores em micros (÷ 1.000.000 para BRL)
- customer_id: remover hífens na URL da API
- API: GAQL via searchStream, não Graph API

**How to apply:** Ao criar stories futuras do Epic 51 (ad_group level, conversion tracking, etc.), referenciar estas 3 stories como fundação. Nunca modificar AC ou escopo destas stories — apenas @po pode fazer isso.

[[project_epic38]]

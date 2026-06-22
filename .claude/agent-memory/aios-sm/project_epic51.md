---
name: project-epic51
description: Estado atual do Epic 51 — Google Ads Marketing API Integration; 5 stories criadas; PM review aplicado; action plan pronto para @po validar
metadata:
  type: project
---

## Epic 51 — Google Ads Marketing API Integration

**Status:** Draft → Aguardando @po validar (após PM review NEEDS_CHANGES resolvido)
**Criado:** 2026-06-08
**PM review aplicado:** 2026-06-08

### Stories (5 total)

| Story | Arquivo | Status | Owner |
|-------|---------|--------|-------|
| 51-0 | `docs/stories/51-0-google-ads-setup-externo.story.md` | Draft | lucas@ (humano) |
| 51-1 | `docs/stories/51-1-google-ads-schema-and-auth.story.md` | Draft | @data-engineer |
| 51-2 | `docs/stories/51-2-google-ads-sync-insights.story.md` | Draft | @dev |
| 51-3 | `docs/stories/51-3-google-ads-spend-ui.story.md` | Draft | @dev |
| 51-4 | `docs/stories/51-4-google-ads-oauth-ui.story.md` | Draft | @dev |

### Artefatos do Epic

- Epic: `docs/stories/epics/epic-51-google-ads-marketing-api.md`
- PM Review: `docs/stories/epics/epic-51-pm-review.md`
- Action Plan: `docs/stories/epics/epic-51-action-plan.md`

### Decisões técnicas cravadas

- **Fonte canônica de "conta conectada":** `organizations.google_ads_config->>'status' = 'connected'` (NÃO `google_ads_accounts.status`)
- **`average_cpc` é em micros** (Google Ads API v17 confirmado) — dividir por 1.000.000
- **GAQL não suporta `date_preset`** — usar `WHERE segments.date = 'YYYY-MM-DD'` calculado em UTC
- **`refresh_token` em plaintext** — débito técnico documentado em 51-1 AC8, revisão futura
- **Upsert de campanhas no cron** — Story 51-2 T4.7 faz upsert leve em `google_ads_campaigns` quando `campaign.name` retorna no GAQL (sem isso UI exibe IDs numéricos)
- **OAuth flow:** `access_type=offline` + `prompt=consent` obrigatórios para obter `refresh_token`

### Blocker externo

Developer Token Google Ads — aprovação manual. Timeout: 5 dias úteis → Plan B (seed SQL).
Owner: lucas@trifold.eng.br

### Migration número

Story 51-1 usa migration `076_google_ads_schema.sql` (última aplicada: 075_leads_metadata)

**Why:** PM review identificou 3 gaps blocantes (OAuth UI ausente, campaigns metadata sync ausente, average_cpc incerto) e gerou 15 action items (AI-1 a AI-15). Todos blocantes (AI-1 a AI-7) foram aplicados na rodada de 2026-06-08.

**How to apply:** Ao criar próximas stories do Epic 51, verificar dependências nesta tabela. Ao criar stories de outros epics, verificar se migration 076 foi aplicada antes de criar migrations novas.

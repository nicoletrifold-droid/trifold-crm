---
name: meta-capi-tracking-audit
description: Auditoria do tracking Meta — NÃO há pixel browser nem CAPI no repo; trigger 124 é o hook point p/ evento "Visitou"; kanban bypassa API route
metadata:
  type: project
---

Auditoria do tracking Meta Pixel/Conversões do trifold-crm (2026-08-04, @architect).

**Fato central:** NÃO existe Meta Pixel browser (`fbq`) nem Conversions API (CAPI) neste codebase. Os PageView (2,4k) e Lead (22) do Events Manager (pixel `1337310707164669`) vêm de FORA do repo — LP WordPress (`/y/`, `/vind-residence/`) e/ou Instant Forms nativos. Match quality 3.9/10 é porque não controlamos o advanced matching desses eventos.

**O que existe de Meta (tudo read-only/ingestão):**
- `packages/shared/src/meta/client.ts` — `metaFetch`/`metaBatch` (Marketing API, retry/backoff/rate-limit). Só GET/insights.
- `packages/web/src/lib/meta/process-lead.ts` + `api/webhooks/meta-ads/route.ts` — ingestão leadgen (token `META_PAGE_ACCESS_TOKEN`).
- crons `meta-sync-*` / `api/meta-ads/*` — Ads insights read-only (token por-org em `meta_ad_accounts.access_token`).
- CTWA: `ctwa-metadata.ts` captura `ctwa_clid` em `leads.metadata`.
- Env disponível: META_APP_ID/SECRET, META_PAGE_ACCESS_TOKEN, META_WHATSAPP_VERIFY_TOKEN. NÃO há META_PIXEL_ID nem CAPI token.

**Status "Visitou":** `STAGE_IDS.visitou = 00000000-0000-0000-0001-000000000005` (`packages/shared/src/constants/stages.ts:11`). É conversão OFFLINE/CRM (card movido manualmente).

**Três caminhos escrevem `leads.stage_id` (importante p/ design):**
1. Kanban drag-drop faz UPDATE DIRETO no Supabase do CLIENT (`kanban-board.tsx:312`) — BYPASSA API route.
2. `POST /api/leads/[id]/stage` (route.ts) — admin/supervisor.
3. `PATCH /api/leads/[id]`, bulk, supremo-sync, campaign-poll, cron followup.

**Hook point único = trigger de banco** `trg_log_lead_stage_change` (migration `124_stage_change_activity_trigger.sql`, SECURITY DEFINER, AFTER UPDATE OF stage_id). É o ÚNICO ponto que vê TODAS as transições. Nasceu porque insert client-side do kanban falhava silenciosamente — lição: não confiar em efeito colateral client-side.

**Design proposto p/ evento "Visitou":** Opção A (recomendada) = estender trigger 124 p/ enfileirar em `meta_capi_outbox` quando stage=visitou → cron `api/cron/meta-capi-dispatch` drena e chama `metaFetch` POST `/{PIXEL_ID}/events`. Custom Event "Visitou" + custom conversion. Gap de atribuição: não capturamos fbclid/fbc/fbp (só utm_* + metadata.ad_id + ctwa_clid). PII deve ser SHA-256. Ver [[project_epic52_agente_crm]] p/ contexto de acesso do agente ao pipeline.

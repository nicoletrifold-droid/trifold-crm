---
epic: 86
title: Conversions API (CAPI) e Rastreamento Meta — Evento "Visitou"
status: Draft
created_at: 2026-08-04
updated_at: 2026-08-04
created_by: River (@sm)
priority: High
sub_epics:
  - 86A: Base CAPI (credenciais, outbox, dispatcher, helper de payload)
  - 86B: Atribuição de Origem (fbclid/fbc/fbp) e Migração de Landing/Forms
stories_planned: [86-1, 86-2, 86-3, 86-4, 86-5, 86-6, 86-7, 86-8]
stories_added: []
stories_done: []
---

# Epic 86 — Conversions API (CAPI) e Rastreamento Meta

## Origem

Auditoria de tracking Meta conduzida por @architect (Aria) e @analyst (Atlas) em
2026-08-04 (memória: `.claude/agent-memory/aios-architect/project_meta_capi_tracking_audit.md`).

## Achado central

O repositório `trifold-crm` **não tem Meta Pixel no browser nem Conversions API
(CAPI)**. Os eventos `PageView` (~2,4 mil) e `Lead` (~22/mês) vistos no Events
Manager (Pixel/Dataset ID `1337310707164669`, conta "TRIFOLD - VIND") são
disparados **fora deste repo** — pela landing page WordPress e pelos Instant Forms
nativos do Meta. Match quality em 3.9/10 porque nada no nosso código controla o
advanced matching.

O repo só tem **entrada** de dados Meta:
- Marketing API read-only: `packages/shared/src/meta/client.ts` (`metaFetch`, `META_BASE = graph.facebook.com/v21.0`)
- Ingestão de leadgen: `packages/web/src/lib/meta/process-lead.ts` (`META_API_BASE`, mesma versão v21)
- Webhook Meta Ads: `packages/web/src/app/api/webhooks/meta-ads/route.ts`
- CTWA (WhatsApp Click-to-Ad): `packages/web/src/app/api/webhook/whatsapp/ctwa-metadata.ts` (`buildCtwaMetadata`)

Zero chamada `/events` (CAPI) de conversão. Nenhuma captura de `fbclid`/`fbc`/`fbp`
no frontend deste repo.

## Objetivo de negócio

Enviar ao Meta dois eventos que a campanha precisa:
1. **Lead** — já entra via Instant Forms/WordPress (fora deste repo, sem mudança nesta entrega).
2. **"Visitou"** — o lead de fundo de funil, registrado no CRM quando o card é
   **movido para o stage `visitou`** no kanban (`STAGE_IDS.visitou`,
   `packages/shared/src/constants/stages.ts:11`). É o lead mais qualificado; a
   campanha precisa deste sinal para medir e (futuramente) buscar leads
   parecidos via Lookalike.

## Decisões de Produto (Travadas — não reabrir)

> Decisões tomadas pelo stakeholder (lucas@) em 2026-08-04. Stories não devem
> reabrir estes pontos.

1. **Migrar os forms/landing para o CRM.** Em vez de depender do
   WordPress/Instant Forms (sem controle de tracking), o CRM passa a ter
   landing pages/forms próprios, instrumentados com Pixel + captura de clique
   por padrão. Dá controle total do tracking. Escopo maior — story própria (86-5).
2. **Evento de conversão = standard event `Schedule`**, com
   `custom_data.content_name = "Visitou"` (rótulo interno, não nome de evento).
   NÃO usar custom event puro — `Schedule` é reconhecido nativamente pelo Meta,
   tem melhor delivery e permite Custom Conversion.
3. Avançar para stories agora (esta é a formalização do plano da auditoria).

## Arquitetura recomendada (do @architect)

- **Ponto de convergência único** para o evento Visitou: o trigger de banco
  `trg_log_lead_stage_change` (`supabase/migrations/124_stage_change_activity_trigger.sql`)
  já vê 100% das transições de `stage_id` — inclusive o `UPDATE` direto do
  client em `packages/web/src/components/pipeline/kanban-board.tsx` (chamada
  `supabase.from("leads").update({ stage_id: newStageId }).eq("id", leadId)`)
  que bypassa qualquer API route. Estender esse trigger (não substituir) para
  também enfileirar em uma nova tabela `meta_capi_outbox` quando
  `NEW.stage_id = STAGE_IDS.visitou`.
- **Cron `meta-capi-dispatch`** drena a outbox e chama a CAPI via o `metaFetch`
  existente, com retry e idempotência por `event_id` determinístico
  (`visit_<lead_id>_<outbox_row_id>`).
- Persistir dados de atribuição em `leads.metadata` (coluna JSONB da migration
  075 já existe, mesmo padrão de `buildCtwaMetadata`): shape
  `metadata.meta_ad = { fbc, fbp, fbclid, client_ip, client_ua, captured_at }`.

## Detalhes técnicos CAPI (do @analyst, best practices 2025/2026)

- Endpoint: `POST https://graph.facebook.com/v25.0/{DATASET_ID}/events?access_token={SYSTEM_USER_TOKEN}`
  (Dataset ID = Pixel ID = `1337310707164669`). `META_API_BASE`/`META_BASE` do
  repo estão em v21 — atualizar para v23+ (v25 estável em 02/2026) faz parte
  desta entrega (story 86-3), mas SOMENTE no módulo novo de CAPI — não é
  escopo tocar os módulos read-only existentes (`process-lead.ts`, `client.ts`)
  nesta entrega, salvo se a story explicitamente disser o contrário.
- Token: System User token com `ads_management`, guardado como env var —
  seguir o gotcha Vercel do `CLAUDE.md` (nunca `vercel env add` via pipe; usar
  REST API / `scripts/vercel-env-set.sh`).
- Payload do evento Visitou: `event_name:"Schedule"`, `event_time`,
  `action_source:"system_generated"`, `event_id` determinístico, `user_data`
  (em, ph, fn, ln, external_id=lead_id, fbc, fbp, client_ip_address,
  client_user_agent), `custom_data:{content_name:"Visitou", value, currency:"BRL"}`.
- Hashing: SHA-256 hex lowercase, com normalização ANTES do hash (email
  trim+lower; phone E.164 sem `+` com prefixo `55` — reusar `normalizePhoneBR`
  de `@trifold/shared`; nomes lowercase). NUNCA hashear `fbc`/`fbp`/IP/user-agent.
  Cada campo hasheado vai como array (`em: [hash]`).
- Formato `fbc`: `fb.1.{creation_time_ms}.{fbclid}`. Formato `fbp`:
  `fb.1.{creation_time_ms}.{random}`.
- Dedup: `event_id` + `event_name`, janela 48h. Para Visitou (evento
  server-side apenas) o `event_id` já serve como idempotência.
- Advanced matching no pixel do browser (das novas landings do CRM): ligar
  Automatic Advanced Matching + passar `external_id` (lead_id), `em`, `ph` no
  `fbq('init')`. `external_id` é o campo que mais sobe o EMQ.
- **Estratégia de campanha** (documentar como Dev Note/runbook, não é código):
  com ~22 leads/mês, NÃO otimizar a campanha diretamente por "Visitou" (ficaria
  em Learning Limited permanente — Meta pede ~50 conv/semana). Usar Visitou
  como (a) sinal de mensuração via Custom Conversion, (b) semente de Lookalike;
  continuar otimizando a campanha por `Lead`.

## Sequência de Execução (dependências)

```
86-1 (credenciais, @devops)
  └─▶ 86-2 (migration outbox + trigger, @data-engineer)
        └─▶ 86-3 (helper CAPI + hashing, @dev)
              └─▶ 86-4 (cron dispatcher, @dev)
                    └─▶ [P0 completo — evento Visitou fluindo]

86-4 completo
  └─▶ 86-6 (captura fbclid/fbc/fbp + persistência, @dev)
        └─▶ 86-7 (Advanced Matching no pixel, @dev) [depende também de 86-5]
  └─▶ 86-5 (landing/form próprio no CRM, @dev + @ux-design-expert) [pode iniciar em paralelo a 86-6, mas pixel do form depende do 86-7 pra AAM completo]
        └─▶ 86-8 (Custom Conversion + Lookalike + otimização, @devops — runbook manual)
```

## Stories

| ID | Título | Executor | Prioridade | Depende de |
|----|--------|----------|------------|-------------|
| 86-1 | Provisionar credenciais CAPI (System User token) | @devops | P0 | — |
| 86-2 | Migration: `meta_capi_outbox` + extensão do trigger de stage change | @data-engineer | P0 | 86-1 |
| 86-3 | Módulo CAPI server-side (payload + hashing + POST v25) | @dev | P0 | 86-2 |
| 86-4 | Cron `meta-capi-dispatch` (drena outbox, retry, idempotência) | @dev | P0 | 86-3 |
| 86-5 | Landing/form próprio no CRM com Pixel instrumentado | @dev + @ux-design-expert | P1 | 86-4 |
| 86-6 | Captura de fbclid/fbc/fbp + IP/UA na entrada do lead | @dev | P1 | 86-4 |
| 86-7 | Advanced Matching no Pixel (AAM + external_id/em/ph) | @dev | P1 | 86-5, 86-6 |
| 86-8 | Custom Conversion "Visitou" + Lookalike + ajuste de otimização | @devops (runbook manual) | P1 | 86-4, 86-7 |

## Fora do escopo deste epic

- Migrar o Lead Ad Form nativo do Meta para o CRM (mantido como está —
  Instant Forms continua sendo a origem do evento `Lead`).
- Descontinuar a landing page WordPress imediatamente — 86-5 cria a alternativa
  no CRM; a migração de tráfego/DNS é decisão de negócio posterior, fora do
  escopo técnico.
- Qualquer mudança nos módulos read-only existentes de Marketing API
  (`packages/shared/src/meta/client.ts`, `packages/web/src/lib/meta/process-lead.ts`)
  além do necessário para os novos módulos CAPI coexistirem (nenhuma mudança
  prevista nesta entrega).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Epic criado a partir da auditoria de tracking Meta (@architect Aria + @analyst Atlas). 8 stories esboçadas, sequenciadas por dependência. | @sm (River) |

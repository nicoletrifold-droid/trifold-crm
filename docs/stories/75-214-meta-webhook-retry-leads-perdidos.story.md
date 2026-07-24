# Story 75-214 — Webhook Meta Ads: falhas silenciosas + retry automático de leads perdidos

**Status:** Done
**Tipo:** Bug fix / resiliência
**Epic:** Integrações — Meta Ads
**Complexidade:** M (refactor de rota p/ lib compartilhada + cron novo; sem migration)

## Contexto
Incidente 24/07/2026: auditoria do `webhook_logs` revelou **15 eventos `leadgen` com
`processed=false` e `processing_error=null` desde 09/06** — destes, **12 nunca viraram lead**
(~20% dos leads de formulário do Meta perdidos silenciosamente). O evento chega, a assinatura
valida, o webhook responde 200 (então o Meta considera entregue e **não reenvia**), mas o
processamento assíncrono via `after()` morre sem deixar rastro.

Causas de silêncio identificadas em `processLeadAsync` (`api/webhooks/meta-ads/route.ts`):
1. `resolveOrgId()` null → `return` sem gravar `processing_error`;
2. insert do lead falha → `{ data: newLead }` ignora o `error` do PostgREST → `return` sem gravar erro;
3. o próprio `after()` da Vercel pode ser morto antes de concluir (nada roda, nada é gravado).

O cron `webhook-health` só detecta **silêncio de recebimento** — não vê evento recebido e não processado.

## Acceptance Criteria
1. **AC1 — Nenhuma falha silenciosa:** todo caminho de saída de `processMetaLead` sem lead
   criado/atualizado grava `processing_error` descritivo no `webhook_logs` (incl. erro real do
   PostgREST no insert e `no_active_org`).
2. **AC2 — Retry automático:** cron novo `/api/cron/meta-leads-retry` (a cada 15 min) reprocessa
   eventos `source=meta_ads`, `event_type=leadgen`, `processed=false`, `signature_valid=true`,
   com idade > 10 min e < 60 dias (retenção Graph API = 90d), máx. 3 tentativas por evento,
   lote máx. 20/execução. Auth padrão `CRON_SECRET`.
3. **AC3 — Idempotência:** antes de criar, verifica lead existente por `metadata->>leadgen_id`
   (e dedup por telefone, como hoje). Evento duplicado do Meta nunca cria lead duplicado.
4. **AC4 — Side effects com política de idade:** evento com < 6h → fluxo normal completo
   (automations + roleta). Evento com ≥ 6h (recuperação tardia) → cria lead **sem**
   `triggerAutomations`/`distributeLeadToNextBroker`, com `created_at` retrodatado ao
   `created_time` original do lead no Meta (não distorce "Leads hoje"/analytics — ver
   [[project-analytics-visao-executiva]] gotcha de importação) e `metadata.recovered_at` marcado.
5. **AC5 — Recuperação dos 12:** na primeira execução do cron em prod, os 12 leads perdidos são
   criados (política AC4 tardia). Evento de teste (`leadgen_id` não numérico) e eventos cujo
   leadgen já tem lead são marcados `processed=true` sem ação.
6. **AC6 — Zero regressão no caminho feliz:** webhook continua respondendo 200 imediato com
   processamento via `after()`; comportamento atual de dedup/utm/finalidade/property preservado.

## Tasks
- [x] Extrair processamento de `api/webhooks/meta-ads/route.ts` para
      `lib/meta/process-lead.ts` (`processMetaLead(leadgenId, value, entry, logId, opts)`,
      opts: `{ sideEffects, backdateTo }`) — rota não pode exportar símbolos extras no Next.
- [x] AC1: gravar `processing_error` em todos os caminhos de falha; capturar `error` do insert.
- [x] AC3: guard de idempotência por `metadata->>leadgen_id`.
- [x] Cron `/api/cron/meta-leads-retry/route.ts` (AC2/AC4/AC5) — contador de tentativas em
      `processing_error` (`retry N/3: <msg>`), sem migration.
- [x] `vercel.json`: registrar cron `*/15 * * * *`.
- [x] Testes unitários da lib (idempotência, política de idade, marcação de erro) + do cron — 13 testes.
- [x] tsc + eslint + `vitest run` (1204 pass) + `turbo build` OK.

## Out of Scope
- Alerta Telegram para `processed=false` acumulado (webhook-health cobre silêncio; retry cobre falha).
- Migration de coluna `retry_count` (marcador em `processing_error` é suficiente p/ tabela de log).
- Causa-raiz do Supabase Micro subdimensionado (resize → pendência própria).

## Dev Agent Record
### File List
- `packages/web/src/lib/meta/process-lead.ts` (novo — processamento extraído da rota, AC1/AC3/AC4)
- `packages/web/src/lib/meta/process-lead.test.ts` (novo — 7 testes)
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` (enxuto — delega à lib, comportamento preservado)
- `packages/web/src/app/api/cron/meta-leads-retry/route.ts` (novo — AC2/AC4/AC5)
- `packages/web/src/app/api/cron/meta-leads-retry/route.test.ts` (novo — 6 testes)
- `packages/web/vercel.json` (cron `*/15 * * * *`)
- `docs/stories/75-214-meta-webhook-retry-leads-perdidos.story.md` (novo)

## QA Results
### Review Date: 2026-07-24 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| AC1 sem falha silenciosa | PASS | `fail()` grava `processing_error` em no_active_org, insert (erro real do PostgREST), update e catch geral; testes cobrem os 3 caminhos. |
| AC2 retry cron | PASS | Janela 10min–60d, lote 20, máx 3 tentativas (`retry N/3` em processing_error), auth `CRON_SECRET` (padrão dos demais crons). |
| AC3 idempotência | PASS | Guard `metadata->>leadgen_id` ANTES da Graph API (economiza chamadas); evento duplicado → processed sem lead novo (teste). |
| AC4 política de idade | PASS | <6h fluxo completo; ≥6h sem automations/roleta, `created_at` retrodatado (`created_time` do Meta > timestamp do evento) — testes em lib e cron. |
| AC6 zero regressão | PASS | Rota preserva assinatura/ping/log estruturado/after(); lógica movida 1:1 (dedup phone, utm, finalidade 75-114, property 75-44, syncAdOnDemand). |
| Testes/Build | PASS | 13 testes novos; suíte 1204 pass; tsc, eslint e `turbo build` limpos. |

Nota: dedup por telefone com `.single()` (falha se >1 lead com mesmo phone) é comportamento
pré-existente mantido de propósito — fora de escopo.
Gate: PASS
— Quinn 🛡️

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-24 | 0.1 | Story criada a partir do incidente dos leads perdidos. | @sm (River) |
| 2026-07-24 | 1.0 | Implementação completa: lib compartilhada + cron de retry + testes. QA PASS. | @dev (Dex) + @qa (Quinn) |
| 2026-07-24 | 1.1 | PR #285 squash-merged em `main` (`9649742f`). Deploy Vercel de produção disparado; recuperação dos 12 monitorada em prod. Done. | @devops (Gage) |

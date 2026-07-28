# Story 75-224 — Webhook imoveis-sync: log persistido + constraint de `source` rejeitando landing_page

**Status:** InReview
**Tipo:** Observabilidade + bug fix
**Epic:** Integrações externas (webhook REM/imoveis-sync)
**Complexidade:** S

## Contexto
Questionário do diretor (28/07) pediu prova de consumo do webhook que o REM dispara
ao publicar tabela. Verificação: o receptor `/api/webhooks/imoveis-sync` está armado
em prod (`IMOVEIS_SYNC_WEBHOOK_SECRET` configurado há ~41 dias, HMAC-SHA256 ok), mas
**não grava nenhum log persistido** — impossível provar consumo ou diagnosticar
falha de integração (assinatura errada, evento inesperado, unidade não encontrada).

Na análise, um segundo bug foi **confirmado em prod**: o CHECK de `webhook_logs.source`
(mig 015) só aceita `('meta_ads','whatsapp','google_forms','other')`, mas o webhook
de landing page insere `source: 'landing_page'` desde que nasceu. Resultado em prod
(28/07): 367 linhas `meta_ads`, **0 linhas `landing_page`** — todos os inserts do
landing-page vêm sendo rejeitados pela constraint silenciosamente (o código ignora o
erro do insert, só usa `logEntry?.id`). O update pós-processamento
(`processed: true`) também é no-op, e o dedup/observabilidade do canal site nunca
funcionou.

## Acceptance Criteria
1. **AC1 — Migration** amplia o CHECK de `webhook_logs.source` para incluir
   `'landing_page'` e `'imoveis_sync'` (mantendo os 4 valores atuais). Nome real da
   constraint conferido em prod antes de escrever o DROP.
2. **AC2 — Log de todo request** no `POST /api/webhooks/imoveis-sync`, gravado ANTES
   de qualquer early return (padrão do meta-ads): `source: 'imoveis_sync'`,
   `event_type` = `payload.event`, `payload` completo, `signature_valid`. Cobre os
   desfechos: assinatura inválida (`processing_error: 'invalid_signature'`), JSON
   inválido, evento ignorado, campos faltando, status não reconhecido, property/unit
   não encontrada, e sucesso (`processed: true` + `org_id` do empreendimento).
3. **AC3 — Fail-safe:** falha na gravação do log NUNCA quebra o processamento do
   webhook (mesma postura fail-open do resto do sistema).
4. **AC4 — UI** `/dashboard/sistema/webhooks`: `SOURCE_LABELS` + filtro de origem
   ganham `imoveis_sync` ("Sync Imóveis (REM)") e `landing_page` ("Landing Page").
5. **AC5 — Testes** unitários do route imoveis-sync: assinatura inválida loga com
   `signature_valid: false` e retorna 401; evento ≠ `unit.status_changed` loga e
   responde 200; sucesso loga `processed: true`; falha do insert de log não impede o
   processamento.
6. **AC6 — Ordem de deploy (@devops):** migration aplicada em prod ANTES do merge do
   código (o insert `imoveis_sync` depende da constraint nova; o fix do
   landing_page passa a valer no instante da migration, sem depender de deploy).

## Fora de escopo
- Log persistido dos demais webhooks sem log (whatsapp, sienge, clicksign, resend,
  telegram) — avaliar em story própria se houver demanda.
- Backfill dos logs de landing_page perdidos (irrecuperáveis — nunca foram gravados).

## File List
- `supabase/migrations/194_webhook_logs_sources_imoveis_sync_landing_page.sql` (novo)
- `packages/web/src/app/api/webhooks/imoveis-sync/route.ts`
- `packages/web/src/app/api/webhooks/imoveis-sync/route.test.ts` (novo)
- `packages/web/src/app/dashboard/sistema/webhooks/page.tsx`

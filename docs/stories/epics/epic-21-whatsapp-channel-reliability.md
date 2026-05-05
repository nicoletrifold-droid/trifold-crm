---
epic: 21
title: WhatsApp Channel Reliability — Idempotência, Phone Normalization & Lead Deduplication
status: Draft
created_at: 2026-05-04
updated_at: 2026-05-04
created_by: River (@sm)
priority: P0 — Bug em produção
objetivo_negocio:
  - Garantir que cada usuário do WhatsApp gera exatamente 1 lead por org
  - Eliminar criação de leads duplicados causada por mensagens rápidas em sequência
  - Tornar webhook idempotente para que retries da Meta nunca causem side-effects
depends_on:
  - Story 3.7 (WhatsApp Cloud API adapter — base do webhook)
  - Story 15.12 (campaign status tracking no mesmo webhook)
stories_planned: [21.1]
---

# Epic 21 — WhatsApp Channel Reliability

## Problema em Produção (P0)

O webhook de WhatsApp (`packages/web/src/app/api/webhook/whatsapp/route.ts`) possui uma
combinação de falhas que resulta em **múltiplos leads para o mesmo usuário real**:

| Evidência | Detalhe |
|-----------|---------|
| Lead `f66c0e5e`, `14291778`, `c5a17e7a` | Mesmo phone `554499689446`, mesmo org_id, criados em ~15 min |
| Lead antigo `8f73e920` | Phone `44999689446` (sem prefixo 55) — desde abril, mesmo usuário real |
| Causa raiz | `.single()` retorna erro com 0 rows → cria novo lead em vez de reusar |
| Agravante | Sem normalização de phone → `44999689446` e `554499689446` são tratados como entidades distintas |
| Risco futuro | Processamento síncrono Nicole (~8s) pode exceder janela de retry da Meta (20s), duplicando chamadas |

## Escopo do Epic

Uma única story abrangente que resolve todos os bugs identificados:

### Story 21.1 — Webhook Idempotente + Phone Normalization + Lead Deduplication

Resolve 6 bugs simultâneos identificados na análise:
1. **Bug #1** — Sem idempotência por `whatsapp_message_id`
2. **Bug #2** — `.single()` fail-silent em find-lead com 0 ou 2+ rows
3. **Bug #3** — `.single()` fail-silent em find-conversation
4. **Bug #4** — Phone não normalizado ao salvar/buscar
5. **Bug #5** — Processamento síncrono Nicole ultrapassa window de retry Meta
6. **Bug #6** — Sem UNIQUE constraint em `(org_id, phone_normalized)` no schema

Inclui:
- Migration de schema com coluna `phone_normalized` + UNIQUE constraint
- Script de cleanup dos leads duplicados em produção
- Utility function `normalizePhoneBR()` em `packages/shared`
- Testes unitários: idempotência, normalização phone, find-or-create

## Decisões Técnicas

**Async pattern:** `after()` from `next/server` (Next.js 16 — já usado em `api/webhooks/meta-ads/route.ts`)

**Phone canonical format:** E.164 brasileiro com nono dígito — ex `5544999689446`

**UNIQUE guard:** coluna `phone_normalized` (GENERATED ALWAYS AS) + index UNIQUE em `(org_id, phone_normalized)`

**Cleanup:** Script standalone `scripts/cleanup-duplicate-leads.ts` (não migration — depende de dados de produção específicos)

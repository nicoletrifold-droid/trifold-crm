---
epic: 60
title: Roleta — Retry de Distribuição para Leads Sem Corretor
status: In Progress
created_at: 2026-06-17
created_by: River (@sm)
priority: P1
objetivo_negocio:
  - Garantir que nenhum lead fique permanentemente sem corretor por falha de timing na distribuição
  - Leads que chegam fora do horário ou com todos os corretores no limite devem ser redistribuídos no próximo ciclo válido
depends_on:
  - Epic 51 (Roleta de Leads) — distributor.ts + roleta_pick_and_advance RPC em produção
  - Story 21.1 (webhook WhatsApp) — ponto de entrada dos leads
related:
  - packages/web/src/lib/roleta/distributor.ts — função distributeLeadToNextBroker
  - packages/web/src/app/api/cron/followup/route.ts — cron existente (padrão a reusar)
  - packages/web/src/app/api/webhook/whatsapp/route.ts — disparo único na entrada do lead
stories_planned: [60.1]
---

# Epic 60 — Roleta: Retry de Distribuição para Leads Sem Corretor

## Problema

Quando um lead entra (`_brand_new === true`), a roleta tenta distribuí-lo uma única vez.
Se falhar — por `fora_horario`, `sem_corretor_disponivel`, `roleta_inativa` ou qualquer outra razão —
o lead fica com `assigned_broker_id = null` para sempre. Não há retry.

Exemplo real: lead Arnaldo (559391777273) entrou em 14/jun às 08:00 (domingo).
A roleta estava (ou não estava) configurada para domingo, mas independente disso
o sistema deveria ter tentado novamente no próximo ciclo válido.

## Solução

Um cron periódico verifica leads ativos sem corretor atribuído e tenta redistribuí-los,
respeitando o horário de funcionamento da roleta. Reutiliza `distributeLeadToNextBroker`
diretamente — sem duplicar lógica.

## Stories

| # | Story | Status |
|---|-------|--------|
| 60.1 | Cron de retry para leads sem corretor | Draft |

## Critérios de Sucesso do Epic

- Leads sem `assigned_broker_id` são redistribuídos automaticamente no próximo horário válido
- Nenhum lead ativo fica sem corretor por mais de 24h em dia útil
- O retry respeita `max_leads_per_day` e horário de funcionamento da roleta
- Lead Arnaldo (e similares) nunca mais ficam "Sem corretor" por timing

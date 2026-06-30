---
epic: 64
title: Bolsão de Leads — pool de leads não-atendidos para puxada rápida
status: Draft
created_at: 2026-06-30
updated_at: 2026-06-30
created_by: Morgan (@pm)
priority: P1
objetivo_negocio:
  - Atender todo lead com a maior velocidade possível — lead não-atendido não pode "morrer" na base de um corretor.
  - Lead distribuído e não atendido em 15 min sai do corretor e vira disponível para QUALQUER corretor puxar.
  - Dar visibilidade à gerência quando leads ficam parados no pool (sem ninguém puxar).
depends_on:
  - Story 75-73 (PR #61, ABERTO) — menu "Bolsão" + páginas placeholder /dashboard/bolsao e /broker/bolsao. A mergear no Epic 64.
  - Pacote SLA (Stories 75-46 a 75-60, 75-78) — cron sla-alerts, business-time, lead_distribution_log, primeiro_atendimento_em, escalonamento gestor.
  - Roleta (broker_assignments p/ empreendimento, max_leads p/ teto, RPC de distribuição).
related:
  - packages/web/src/app/api/cron/sla-alerts/route.ts (timings/escalonamento — reconciliar)
  - packages/web/src/lib/roleta/distributor.ts (regras de teto/empreendimento p/ puxar)
  - packages/web/src/lib/notificacoes.ts / notify-broker.ts (canais + templates)
  - packages/web/src/app/dashboard/bolsao/page.tsx + /broker/bolsao/page.tsx (PR #61)
stories_planned: [75-80, 75-81, 75-82]
---

# Epic 64 — Bolsão de Leads

## Problema
Lead distribuído ao corretor cai em "Aguardando atendimento". Se o corretor não atende, o lead fica preso na
base dele indefinidamente. Queremos que, após **15 min** sem atendimento, o lead saia do corretor e vá pro
**bolsão** (sem dono), de onde **qualquer corretor** pode puxá-lo — maximizando a velocidade de atendimento.

## Decisões (usuário, 2026-06-30)
- **Relógio: da distribuição** (consistente com o SLA), só em **horário comercial**.
- **Puxar do bolsão respeita teto (max_leads) + empreendimento (broker_assignments)** — mesmas regras da roleta.
- **Ciclo reinicia por dono:** corretor que puxa vira dono e tem novos 15 min; se não atender, volta pro bolsão.
- **60 min é ABSOLUTO** (desde a 1ª distribuição, lead nunca atendido) → escala ao **Alexandre** (não reinicia no bolsão).
- **Aviso de bolsão à Fernanda = resumo periódico** ("há N leads no bolsão"), não 1 por lead.
- Lead no bolsão **continua em "Aguardando atendimento"**, só sem `assigned_broker_id`. **Não volta pra roleta automática.**

## Timeline consolidada (notificações — pente-fino)
| Momento (desde a distribuição, horário comercial) | Ação | Onde |
|---|---|---|
| 10 min | push ao corretor "lead sem atendimento" | ✅ já existe (SLA corretor, 75-78) |
| 15 min | lead → bolsão (remove `assigned_broker_id`) | 🆕 Story 75-80 |
| 30 min (15 min no bolsão) | WhatsApp resumo à Fernanda "há N leads no bolsão" | 🆕 Story 75-82 (template `aviso_bolsao_gestor`) |
| 60 min absoluto sem atender | escala ao Alexandre | ✅ existe; mover destinatário p/ só Alexandre (75-82) |

## Stories
- **75-80** — Backend: estado "bolsão" + cron de rebalanceamento (unassign 15 min, horário comercial, idempotente).
- **75-81** — UI: merge do menu (75-73) + função de **puxar lead** (teto+empreendimento) + lista dashboard/corretor + realtime.
- **75-82** — Notificações: resumo periódico à Fernanda (template novo, já submetido) + escalada 60 min só p/ Alexandre.

## Fora de escopo (Epic 64)
- Não altera a roleta de distribuição inicial. Não mexe no relógio do SLA (segue distribuição→atendimento).
- Não cria UI de config dos tempos do bolsão (poderia reusar a UI de SLA da 75-78 num follow-up).

---
epic: 61
title: Nicole — Agendamento de Visita com Confirmação do Cliente
status: In Progress
created_at: 2026-06-17
created_by: River (@sm)
priority: P0
objetivo_negocio:
  - Eliminar agendamentos criados sem confirmação do cliente
  - Nicole nunca agenda visita unilateralmente — sempre exige resposta explícita do cliente
  - Oferecer Calendly como opção de auto-agendamento pelo cliente
depends_on:
  - Epic 51 (pipeline Nicole + fluxo de visitas)
related:
  - packages/ai/src/chat/pipeline.ts — bloco de auto-agendamento (linhas 650-722)
  - packages/ai/src/prompts/visit-scheduling.ts — prompt de visitas
  - packages/ai/src/flows/qualification.ts — extração de visit_availability
stories_planned: [61.1]
---

# Epic 61 — Nicole: Agendamento de Visita com Confirmação do Cliente

## Problema

O pipeline da Nicole possui um bloco que cria agendamentos automaticamente (pipeline.ts:650-722)
toda vez que o cliente menciona um dia da semana — sem pedir confirmação, sem esperar resposta.

Casos reais problemáticos:
- Cliente menciona "sábado" em qualquer contexto → Nicole já agenda para sábado
- Cliente para a conversa → Nicole já criou um appointment no banco
- Cliente diz "não sei, preciso ver" → Nicole ignora e agenda mesmo assim

## Solução

1. Remover o auto-agendamento unilateral do pipeline
2. Novo fluxo conversacional: Nicole pergunta data → oferece Calendly + opção de ela agendar
3. Agendamento só é criado após confirmação explícita do cliente

## Stories

| # | Story | Status |
|---|-------|--------|
| 61.1 | Corrigir auto-agendamento e adicionar fluxo Calendly | Draft |

## Critérios de Sucesso do Epic

- Nicole NUNCA cria appointment sem o cliente ter confirmado explicitamente
- Quando cliente mostra interesse em visitar: Nicole pergunta data E oferece Calendly
- Link Calendly disponível para Nicole compartilhar quando adequado
- Appointments criados via Calendly são sincronizados pelo cron existente (já funciona)

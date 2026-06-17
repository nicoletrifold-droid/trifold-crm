---
epic: 59
title: Nicole — Comportamento de Apresentação em Follow-ups
status: In Progress
created_at: 2026-06-17
created_by: River (@sm)
priority: P1
objetivo_negocio:
  - Evitar que a Nicole se reapresente em mensagens de follow-up, causando confusão ao lead
  - Eliminar nomes de corretores hardcoded em templates de follow-up
depends_on:
  - Epic 51 (Handoff Nicole → Corretor) — cron de follow-up em produção
  - Story 21.1 (webhook WhatsApp) — pipeline da Nicole
related:
  - packages/ai/src/chat/pipeline.ts — pipeline principal da Nicole
  - packages/ai/src/prompts/personality.ts — prompt de personalidade (contém "Sou a Nicole")
  - packages/web/src/app/api/cron/followup/route.ts — cron de follow-up (template hardcoded)
stories_planned: [59.1]
---

# Epic 59 — Nicole: Comportamento de Apresentação em Follow-ups

## Problema

O lead recebe mensagens com apresentações inconsistentes: primeiro "Sou a Nicole, da Trifold Engenharia"
e depois "Sou Roberto Colichio, da equipe Trifold" — mesmo sendo ambas mensagens da IA.

Isso ocorre porque:
1. **Pipeline Nicole** — a IA se apresenta organicamente na primeira resposta (via `PERSONALITY_PROMPT`)
2. **Cron de follow-up** — o `message_template` em `follow_up_rules` tem o nome do corretor hardcoded no texto

## Solução

**Opção 2 escolhida:** A Nicole não deve se reapresentar em follow-ups.

- Na IA (pipeline): detectar se já há mensagens anteriores na conversa e, se sim, instruir a Nicole a NÃO se reapresentar
- No cron de follow-up: remover apresentação da Nicole dos templates (o template deve ser contextual, não introdutório)
- Adicionar `{corretor}` como variável de substituição nos templates, para que nomes nunca sejam hardcoded

## Stories

| # | Story | Status |
|---|-------|--------|
| 59.1 | Nicole não se reapresenta em follow-ups | Draft |

## Critérios de Sucesso do Epic

- Leads que já interagiram com a Nicole NÃO recebem nova apresentação em mensagens subsequentes
- Templates de follow-up não contêm nomes de corretores hardcoded
- A variável `{corretor}` é substituída corretamente pelo nome do corretor atribuído ao lead

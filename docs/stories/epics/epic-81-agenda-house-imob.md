---
epic: 81
title: Agenda HOUSE × IMOB — duas equipes na mesma agenda, link público por imobiliária
status: Done
created_at: 2026-07-17
updated_at: 2026-07-17 (completo — 4/4 stories em prod)
created_by: Morgan (@pm)
priority: P1
objetivo_negocio:
  - Duas equipes de atendimento compartilham a agenda — HOUSE (corretores, gerente comercial, Nicole) e IMOB (Daiana + imobiliárias parceiras externas) — sem uma bloquear o horário da outra.
  - Imobiliária parceira marca visita SOZINHA por link público (por imobiliária), preenchendo tudo que o interno já preenche — sem depender da Daiana digitar.
  - Bater o olho na agenda e distinguir HOUSE de IMOB (cor + badge).
  - Aposentar Google Calendar e Calendly: a agenda do CRM vira fonte única.
depends_on:
  - Agenda atual (appointments, Story 75-103 governança, duração fixa 60min/hora cheia).
  - Módulo IMOB (cadastro de imobiliárias — tabela `imobiliarias`, mig 173) para o token do link.
  - Padrão de página pública com token já estabelecido (/agendar/cancelar/[token] mig 073; Pastas).
related:
  - packages/web/src/lib/appointments/governance.ts (isConflict + canMutateAppointment — coração da regra)
  - packages/web/src/app/api/appointments/route.ts + [id]/route.ts (POST/PUT usam isConflict; POST chama createCalendarEvent)
  - packages/ai/src/flows/visit-slot.ts (isSlotFree / checkSlotAvailability — Nicole)
  - packages/ai/src/chat/pipeline.ts (~929: insert de visita da Nicole; ~971/1025: google_event_id)
  - packages/web/src/components/appointments/new-appointment-modal.tsx (PROPERTY_MAP: locais hardcoded)
  - packages/web/src/app/dashboard/agenda/page.tsx + /broker/agenda/page.tsx (render dos cards)
  - packages/web/src/app/api/cron/calendly-sync/route.ts + packages/web/vercel.json:73 (cron a desligar)
  - packages/web/src/lib/google-calendar.ts (integração a desligar)
stories_planned: [81-1, 81-2, 81-3, 81-4]
---

# Epic 81 — Agenda HOUSE × IMOB

## Problema
Hoje a agenda é uma só e a regra de conflito é global: um compromisso ocupa o horário para TODOS.
Mas o negócio tem **duas equipes distintas atendendo**: a house (corretores/gerente comercial/Nicole)
e a IMOB (Daiana com imobiliárias parceiras). Um compromisso da house não deveria impedir a Daiana
de marcar no mesmo horário — são operações independentes. Além disso, imobiliárias parceiras não têm
como marcar sozinhas (dependem da Daiana), e mantemos duas integrações externas (Google Calendar,
Calendly) que o link público torna desnecessárias.

## Decisões (Marcos, 2026-07-17)
- **`appointments.team` = `'house' | 'imob'`** (default `house` — histórico intacto).
- **Conflito de horário SÓ dentro da mesma equipe.** Cruzado NUNCA bloqueia — **nem no mesmo
  decorado** (decisão explícita: duas visitas no mesmo decorado ao mesmo tempo, equipes diferentes, PODE).
- **Team automático:** corretor/gerente-comercial/Nicole → `house`; perfil `imob` (Daiana) ou link
  público → `imob`. Admin/supervisor: seletor no modal (default house).
- **Link público POR IMOBILIÁRIA** (token no cadastro IMOB existente): rastreia quem marcou, revogável
  por parceira. Página mostra só livre/ocupado da equipe IMOB (sem detalhes de nenhum compromisso).
- **Google Calendar E Calendly desligam JUNTO no deploy do link** (não fica período em paralelo).
  Compromissos Calendly antigos permanecem na base até passarem.
- **Locais: só decorados** (remover "Sala de Reuniões" das opções; histórico não muda).
- **Visualização livre para todos.** Edição/cancelamento por equipe (tabela abaixo).
- Duração fixa 60min/hora cheia **não muda**.

## Governança de edição/cancelamento
| Quem | HOUSE | IMOB |
|---|---|---|
| admin / supervisor | ✅ | ✅ |
| corretor responsável (broker_id) | ✅ | ❌ |
| gerente-comercial | ✅ | ❌ |
| Nicole (remarcar/cancelar a pedido do cliente) | ✅ | ❌ |
| perfil `imob` (Daiana) | ❌ | ✅ |

## Stories
- **81-1 — Backend: equipe + conflito por equipe + Nicole house-only.** Migration (`appointments.team`
  + backfill default), `isConflict()` exige mesma equipe, stamping automático do team no POST
  (role imob → imob), `isSlotFree()`/`checkSlotAvailability()` da Nicole filtram `team='house'`.
- **81-2 — UI: badge/cores HOUSE·IMOB + só decorados + seletor.** Badge e cor distinta nos cards
  (dashboard/agenda + broker/agenda), remover "Sala de Reuniões" do PROPERTY_MAP, seletor de equipe
  visível só para admin/supervisor no modal.
- **81-3 — Governança por equipe.** `canMutateAppointment()` estendido conforme tabela acima
  (+ rotas PUT/DELETE usam a regra nova; testes de matriz completa).
- **81-4 — Link público por imobiliária + desligamentos.** Token na tabela `imobiliarias` + UI de
  copiar/revogar link no cadastro IMOB; página pública `/agendar/[token]` (slots livres IMOB, form
  completo: cliente/telefone/e-mail/decorado/observações, find-or-create de lead por telefone,
  cria `team='imob'` com imobiliária identificada); notificação à Daiana (push); **no mesmo deploy**
  desligar `createCalendarEvent` (rotas + pipeline da Nicole) e cron `calendly-sync` (vercel.json).

## Sequência e dependências
81-1 → (81-2, 81-3 em qualquer ordem) → 81-4. A 81-4 só entra depois que a regra de conflito por
equipe estiver em produção (o link público depende dela para calcular slots livres IMOB).

## Fora de escopo (Epic 81)
- Não muda a duração/grade de horários (60min, hora cheia) nem o horário comercial.
- Não cria agenda separada — é UMA agenda com duas equipes.
- Não migra/apaga compromissos históricos (Sala de Reuniões e Calendly antigos ficam como estão).
- Cliente final marcando sozinho (substituto do Calendly para o público) = épico futuro se necessário;
  o link desta epic é para IMOBILIÁRIAS parceiras.

## Riscos
- **Desligar Google+Calendly junto com o link (decisão do Marcos):** sem retaguarda externa se o link
  nascer com bug. Mitigação: religar é 1 redeploy (flag/env); validar o fluxo ponta-a-ponta no @qa
  antes do push da 81-4.
- **Nicole:** o filtro house-only muda o cálculo de disponibilidade dela — cobrir com testes de
  visit-slot (slot ocupado por imob NÃO deve bloquear a Nicole).

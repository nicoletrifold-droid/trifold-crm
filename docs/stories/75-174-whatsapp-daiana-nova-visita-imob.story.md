# Story 75-174 — WhatsApp para a Daiana quando imobiliária marca visita pelo link

## Metadata
- **Status:** InReview
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/75-174-whatsapp-daiana-nova-visita

## Context
Pedido do Marcos (2026-07-17): quando uma imobiliária parceira marca visita pelo link público
(/agendar/[token], Story 81-4), a Daiana deve receber **WhatsApp** com nome do lead, dia/hora
e nome da imobiliária. Hoje só há push in-app (81-4). WhatsApp proativo (fora da janela de 24h)
SÓ sai por **template HSM aprovado** — mesmo padrão do relatório do diretor / avisos de bolsão.

## O que foi feito
- [x] **Template Meta** `nova_visita_imob` (pt_BR, UTILITY, 3 params posicionais + botão URL
  "Ver agenda"): {{1}} lead · {{2}} dia/hora BRT · {{3}} imobiliária. Submetido via WhatsApp
  Business Management API (waba_id da whatsapp_config). **Só mergear com status APPROVED.**
- [x] Helper `lib/appointments/notify-imob-visit.ts` (`notifyImobVisitWhatsApp`): envia o
  template para TODOS os usuários role=imob ativos com telefone (hoje: Daiana; à prova de
  futuro). Espelha `reports/send-daily-report.ts`. Fire-and-forget: acumula erros, nunca lança.
- [x] POST `/api/agendar/[token]` chama o helper junto com o push existente (não bloqueia a
  resposta — a visita já foi gravada).
- [x] type-check/lint/suíte verdes (1064/1064).

## Acceptance Criteria
- [x] AC1: Visita via link → WhatsApp à Daiana com lead + dia/hora + imobiliária.
- [x] AC2: Vários usuários IMOB ativos c/ telefone → todos recebem (dedup por telefone).
- [x] AC3: Falha de WhatsApp NÃO derruba o agendamento (fire-and-forget + log).
- [x] AC4: Não altera o push in-app já existente (81-4) — os dois convivem.

## Out of Scope
- WhatsApp ao CORRETOR PARCEIRO (a Story 81-5 já guarda o telefone dele em metadata —
  feature futura separada).
- Notificar visitas criadas pelo MODAL interno da Daiana (ela mesma criou — sem sentido
  notificar; só o link externo gera aviso).

## Dev Notes
- Meta: template UTILITY costuma aprovar em minutos; se REJECTED, ajustar texto e reenviar.
- Se o template ainda não estiver aprovado em runtime, o send retorna erro (logado) e a
  visita segue normal — degradação graciosa.

## File List
- `docs/stories/75-174-whatsapp-daiana-nova-visita-imob.story.md` (this file)
- `packages/web/src/lib/appointments/notify-imob-visit.ts` (novo)
- `packages/web/src/app/api/agendar/[token]/route.ts`

## Change Log
- @dev (Dex): template Meta submetido + helper + integração no POST do link.
- @qa (Quinn): PASS — fire-and-forget confirmado; dedup por telefone; gate de merge = template APPROVED.

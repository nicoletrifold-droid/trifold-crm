# Story 75-191 — WhatsApp de visita p/ cliente e corretor parceiro (confirmação + lembretes 24h/3h via template)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / relacionado ao Epic 81 (agenda IMOB)
- **Branch:** feat/75-191-whatsapp-visita-cliente-corretor
- **Tipo:** Feature — pedido do Marcos (2026-07-21): notificar cliente e corretor
  parceiro por WhatsApp; cliente entrar nos lembretes de 24h e 3h.

## Context (verificação que motivou)
Estado anterior por destinatário:
- Confirmação no ato (link IMOB): só Daiana (75-174). Cliente e corretor parceiro: nada.
- Lembrete 24h: cron de E-MAIL (12:00 UTC) — cliente do link raramente tem e-mail
  (campo opcional); corretor parceiro ignorado.
- Lembrete 3h: cron WhatsApp em TEXTO LIVRE — Meta só entrega texto livre com a
  janela de 24h aberta; cliente do link nunca conversou com o número → NUNCA recebia
  (falha silenciosa). Corretor parceiro (só em metadata) ignorado; corretor interno
  sofria do mesmo problema de janela.
Decisões do Marcos (AskUserQuestion): templates p/ TODAS as visitas (house+imob);
submeter os 4 templates direto.

## O que foi feito
- [x] **4 templates Meta** (pt_BR, UTILITY, submetidos 2026-07-21 via Business
  Management API, mesmo padrão 75-174): `visita_confirmada_cliente` (+botão URL
  cancelar c/ cancel_token), `visita_confirmada_corretor`,
  `lembrete_visita_cliente` (+botão cancelar), `lembrete_visita_corretor`.
- [x] Helper `lib/appointments/visit-whatsapp.ts`: `waPhone` (normalizePhoneBR —
  telefone digitado pelo parceiro sem DDI vira E.164), `sendVisitTemplate`
  (template + botão URL dinâmico), `notifyVisitBookedWhatsApp` (confirmação no ato).
- [x] POST `/api/agendar/[token]`: fire-and-forget confirmação ao CLIENTE (com
  cancelar) e ao CORRETOR PARCEIRO (quando informado). Daiana (75-174) intacta.
- [x] Cron `appointment-whatsapp-reminders` reescrito: DUAS janelas (24h e 3h,
  ±15min, flags `whatsapp_reminded_24h`/`_3h`; flag legado `whatsapp_reminded`
  respeitada como 3h), TEMPLATE p/ cliente + corretor interno + corretor parceiro
  (dedup por telefone), labels "amanhã às HH:MM"/"hoje às HH:MM". Template
  PENDING → envio falha → flag não grava → retry no próximo run (degradação graciosa).
- [x] Cron de e-mail 24h mantido (canal bônus).
- [x] type-check/lint/suíte verdes (1093/1093).

## Out of Scope
- Log/extrato de notificações de visita (auditoria) — flagged como follow-up.
- Notificação de CANCELAMENTO de visita ao cliente/corretor.

## File List
- `docs/stories/75-191-whatsapp-visita-cliente-corretor.story.md` (this file)
- `packages/web/src/lib/appointments/visit-whatsapp.ts` (novo)
- `packages/web/src/app/api/agendar/[token]/route.ts` (confirmação no ato)
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (reescrito)

## Change Log
- @sm/@po: escopo decidido com Marcos (todas as visitas; submeter templates direto). GO.
- @dev (Dex): templates submetidos (PENDING na hora do merge — mesma janela da
  75-174, degradação graciosa cobre); helper + rota + cron.
- @qa (Quinn): PASS — suíte verde; semântica de flag preservada (grava se ≥1 envio
  saiu); dedup por telefone; tg: ignorado; telefone sem DDI normalizado.
- @devops (Gage): PR squash-merge; conferir status dos templates pós-merge.

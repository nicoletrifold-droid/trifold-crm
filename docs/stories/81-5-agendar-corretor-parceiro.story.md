# Story 81-5 — Link público: campos do corretor parceiro (nome + telefone, opcionais)

## Metadata
- **Status:** InReview
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-5-corretor-parceiro-form

## Context
Pedido do Marcos (2026-07-17, testando o link em prod): a visita marcada pela imobiliária
costuma vir acompanhada de um **corretor da parceira** — o form precisa capturar
**nome e telefone do corretor** para podermos notificá-lo sobre a visita depois.
**NÃO obrigatórios** (pode não ir ninguém da equipe deles).

## Acceptance Criteria
- [x] AC1: Form público ganha "Nome do corretor (da imobiliária)" e "Telefone do corretor",
  ambos OPCIONAIS, abaixo dos dados do cliente.
- [x] AC2: POST grava estruturado em `metadata.corretor_parceiro = {nome, telefone}` (só
  quando informado) E anexa linha humana nas `notes` ("Corretor parceiro: X · (44) 9...")
  — visível em qualquer tela que mostre o compromisso, sem mudança de UI interna.
- [x] AC3: Push à Daiana inclui o corretor parceiro quando informado ("· corr. X").
- [x] AC4: type-check/lint/suíte verdes.

## Out of Scope
- Notificação AO corretor parceiro (WhatsApp) — feature futura; o dado já nasce estruturado.

## File List
- `docs/stories/81-5-agendar-corretor-parceiro.story.md` (this file)
- `packages/web/src/app/agendar/[token]/booking-form.tsx`
- `packages/web/src/app/api/agendar/[token]/route.ts`

## Change Log
- @sm/@po: story P criada e validada no fluxo mínimo (pedido direto do diretor, escopo trivial).
- @dev (Dex): campos no form + metadata.corretor_parceiro + linha nas notes + push. 1059/1059.
- @qa (Quinn): PASS (opcionais não bloqueiam; dado estruturado p/ notificação futura).

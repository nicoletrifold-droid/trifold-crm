# Story 75-140 — Pontos de entrada: ícone/botão de WhatsApp abrindo a conversa do lead

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #136 · **Complexidade:** S (3 pontos) · **Branch:** feat/75-139-lead-whatsapp-deteccao
- **executor:** @dev · **quality_gate:** @qa · **depende de:** 75-139

## Contexto
Fase 1 do epic. O corretor (e gestor) precisa iniciar/continuar o atendimento de WhatsApp **pelo sistema, com o número da empresa**. Ponto de entrada pedido pelo diretor: um **ícone de WhatsApp na lista de leads** e um **botão no drawer do pipeline**, ambos levando à **conversa do lead**. Usa a detecção da [[75-139]] pra decidir a visibilidade (celular válido). A confirmação real de que o número tem WhatsApp e o disparo por template (leads frios) vêm nas Stories 75-141 e Fase 2.

## Escopo
**IN:**
1. **`components/leads/leads-bulk-table.tsx`:** ícone verde de WhatsApp (`MessageCircle`) ao lado do telefone quando `whatsAppState({phone, source}) !== "none"`; link para `/dashboard/leads/{id}?tab=conversa` (abre a aba Conversa); `stopPropagation` p/ não conflitar com o clique da linha.
2. **`components/leads/lead-detail-drawer.tsx`:** botão "Conversar no WhatsApp" (verde) na área de contato quando `whatsAppState !== "none"`; link `${leadBasePath}/{id}?tab=conversa` (funciona no dashboard e no /broker).

**OUT:** disparo por template p/ leads frios (Fase 2); aviso "número não tem WhatsApp" (75-141); mudança na tela de conversa em si.

## Acceptance Criteria
1. **Given** um lead com celular válido, **then** aparece o ícone de WhatsApp na lista e o botão no drawer; **given** telefone não-celular/Telegram, **then** não aparecem.
2. **Given** clico no ícone/botão, **then** vou para a conversa do lead (aba Conversa no dashboard; chat no /broker), pronto pra falar pelo número da empresa.
3. **Given** clico no ícone na lista, **then** a linha não dispara navegação dupla (stopPropagation).
4. tsc/lint/vitest limpos; tema light/dark; ícone verde consistente.

## Dev Agent Record (@dev — 2026-07-06)
- **leads-bulk-table.tsx:** import `MessageCircle` + `whatsAppState`; ícone-link verde no cell do telefone (`?tab=conversa`, stopPropagation).
- **lead-detail-drawer.tsx:** import `whatsAppState`; botão "Conversar no WhatsApp" abaixo da linha de contato (`${leadBasePath}/{id}?tab=conversa`).
- **Checks:** tsc 0 · eslint 0 (warnings pré-existentes) · vitest 795/795.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (visível só p/ celular válido, via 75-139) ✓ · AC2 (abre a conversa do lead — dashboard `?tab=conversa`, broker chat) ✓ · AC3 (stopPropagation na lista) ✓ · AC4 (tsc/eslint/795, verde light/dark) ✓. Reaproveita rota/tela de conversa existentes; sem migration.

## Change Log
- 2026-07-06 — @devops — PR #136 (junto com 75-139) + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 4 ACs, 795/795.
- 2026-07-06 — @dev — Implementado (ícone na lista + botão no drawer). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**.
- 2026-07-06 — @sm — Story criada.

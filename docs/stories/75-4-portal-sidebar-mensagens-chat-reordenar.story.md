# Story 75-4 — Portal: renomear "Mensagens" para "Chat" e mover para penúltima posição (sidebar)

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
No menu lateral (desktop) do portal do cliente (`cliente/[obra_id]/_components/sidebar.tsx`), o item "Mensagens" deve ser renomeado para **"Chat"** e movido para a **penúltima posição** do menu (logo antes de "Notificações").

Estado atual do `NAV_ITEMS`: Início, Fases da Obra, Galeria de Fotos, Documentos, **Mensagens**, Financeiro, Notificações.
Ordem desejada: Início, Fases da Obra, Galeria de Fotos, Documentos, Financeiro, **Chat**, Notificações.

Observações:
- A tab bar **mobile** (`obra-tab-nav.tsx`) **já** usa o rótulo "Chat" — sem mudança lá.
- O badge de mensagens não-lidas no sidebar hoje é detectado por `label === "Mensagens"`. Ao renomear, essa checagem precisa passar a se basear na **rota** (`/mensagens`), senão o badge para de aparecer.
- Vale para **todos os clientes** (não é condicional por obra).

## Acceptance Criteria
- [x] AC1: No sidebar desktop, o item antes chamado "Mensagens" passa a exibir o rótulo **"Chat"** (mesma rota `/cliente/[id]/mensagens`, mesmo ícone).
- [x] AC2: A ordem do menu passa a ser: Início, Fases da Obra, Galeria de Fotos, Documentos, Financeiro, Chat, Notificações — ou seja, "Chat" é a **penúltima** opção (antes de "Notificações").
- [x] AC3: O badge de mensagens não-lidas continua aparecendo no item "Chat" (detecção passa a ser por rota `/mensagens`, não por label), inclusive sumindo quando o usuário está na própria página de mensagens.
- [x] AC4: Sem mudança na tab bar mobile (já é "Chat") nem em rotas/back-end.

## Out of Scope
- Renomear a rota/URL `/mensagens` (continua igual).
- Qualquer mudança na página de mensagens em si.
- Reordenar a tab bar mobile.

## Dependencies
- Nenhuma.

## Complexity
- **T-shirt:** XS (reordenar um item do array + renomear + ajustar detecção do badge).

## Business Value
Linguagem mais clara pro cliente ("Chat" comunica melhor a conversa em tempo real) e posição mais coerente no menu.

## Risks
- Baixo. Único cuidado: manter o badge de não-lidas funcionando após o rename (coberto pelo AC3).

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-4-portal-sidebar-mensagens-chat-reordenar.story.md` (this file)
- `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx` (to update)

## Dev Notes (@dev / Dex)
- `sidebar.tsx`: no `NAV_ITEMS`, o bloco de mensagens foi movido para depois de "Financeiro" e antes de "Notificações", com `label` alterado de "Mensagens" para "Chat" (rota e ícone inalterados).
- Badge de não-lidas: `isMensagens` passou de `label === "Mensagens"` para `to.endsWith("/mensagens")` — desacopla do rótulo; `onMensagensPage` segue escondendo o badge na própria página.
- eslint EXIT 0; type-check 0 erros no arquivo.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC4 atendidos. Rótulo "Chat", posição penúltima (Financeiro → Chat → Notificações), badge de não-lidas preservado via detecção por rota. Mobile (já "Chat") e back-end inalterados. eslint EXIT 0; type-check limpo.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): rename + reorder + badge por rota no sidebar. Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.
- @devops: pendente de push (acumulando com 75-2, 75-3).

# Story (UX) — Área de mensagens da conversa maior (altura responsiva)

**Status:** Ready (aguardando conferência de preview + merge)
**Tipo:** UX / polish
**Epic:** UI / Conversa (chat do lead)
**Relacionado:** Story 75-155 (`ConversationThread` compartilhado /dashboard + /broker), [[project-transferir-conversa]]
**Complexidade:** XS (1 linha de className; sem migration, sem lógica)

## Contexto
Feedback geral (todos os perfis — corretor, supervisor, admin): a **área visível de mensagens** da
aba "Conversa" do lead é pequena — dá pra ver ~1 mensagem por vez. O componente `ConversationThread`
tem altura fixa curta no desktop (`lg:h-[34rem]` = 544px); banner da IA + botões + composer consomem a
maior parte, sobrando ~260px pras mensagens.

## Diagnóstico
- A área de rolagem das mensagens **já** cresce corretamente (`flex-1 min-h-0`) — não é o problema.
- Header (título/badge + banner) e composer são `shrink-0` (fixos).
- **Causa-raiz:** o container raiz tem altura fixa `lg:h-[34rem]`. Todo espaço extra dado a ele flui
  para a área de mensagens (que rola internamente).
- Sem cap de altura em nenhum wrapper pai (`/dashboard` e `/broker` renderizam o thread direto).

## Decisão de UX
Trocar a altura fixa desktop por **responsiva à tela**, com piso e teto:
`lg:h-[calc(100dvh-13rem)] lg:min-h-[34rem] lg:max-h-[52rem]`.
- **Piso `min-h-[34rem]`** = nunca menor que hoje (telas curtas mantêm o comportamento atual).
- **Cresce** com a altura da tela (reserva conservadora de 13rem p/ chrome acima → não estoura o viewport).
- **Teto `max-h-[52rem]`** (832px) evita ficar exagerado em telas muito altas.
- Mobile inalterado (`h-[calc(100dvh-8rem)]` já preenche a tela).

## Acceptance Criteria
1. **AC1** — No desktop, a área de mensagens fica visivelmente **maior** (mais bolhas visíveis) em telas
   de altura normal/grande.
2. **AC2** — Banner da IA, aviso de janela 24h, os dois botões de ação e o **composer** continuam
   presentes e fixos (nada some/quebra) — todo o espaço extra vai só pras mensagens, que rolam.
3. **AC3** — Em telas curtas, o tamanho **não fica menor** que o atual (piso `min-h-[34rem]`).
4. **AC4** — Vale para **/dashboard e /broker** (componente compartilhado) e em light/dark.
5. **AC5** — Mobile inalterado. Sem migration, sem mudança de lógica.

## Tasks
- [x] `conversation-thread.tsx:209` — altura desktop responsiva (`calc(100dvh-13rem)` + min/max).
- [x] Verificação: eslint 0, `next build` OK (Tailwind compila os arbitrary values), `npm test` 975 pass.
- [ ] Conferência visual no preview (altura em telas diferentes; composer/botões intactos).

## Out of Scope
- Layout do banner/composer/botões (inalterados).
- Mobile (já preenche a tela).

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 1.0 | Altura da conversa desktop → responsiva (`calc(100dvh-13rem)`, min 34rem, max 52rem); área de mensagens cresce sem tocar banner/composer. eslint 0, build OK, 975 testes. | @ux-design-expert (Uma) + @dev |

## Dev Agent Record
### File List
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx`
- `docs/stories/ux-conversa-area-mensagens-maior.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | 1 className na raiz; scroll area já `flex-1 min-h-0` absorve o extra; header/composer `shrink-0` intactos. |
| Unit tests | PASS | 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC5 (visual final no preview). |
| No regressions | PASS | Só altura do container; nenhum outro componente tocado; mobile inalterado. |
| Documentation | PASS | Story + gate. |

Build: eslint 0 · next build OK · npm test 975 pass. Nota: mudança visual — conferência de aparência no preview.
Gate: PASS → docs/qa/gates/ux-conversa-area-mensagens-maior.yml
— Quinn 🛡️

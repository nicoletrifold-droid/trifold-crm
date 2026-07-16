# Story 75-165 — Conversa rotula o remetente real (não "Você" para todos)

## Metadata
- **Status:** Done · **Epic:** Transferir conversa / atendimento compartilhado · **PR:** #214 · **Complexidade:** S (3 pontos) · **Branch:** feat/75-165-conversa-rotula-remetente-real
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (Marcos, 2026-07-16): na conversa, mensagens do corretor aparecem como **"Você"** independentemente de quem enviou. No banco, o "oi Lucas" foi da **Valeria**, mas como o **Marcos** estava vendo, aparecia "Você". Causa: `getBubbleStyle(role)` retorna label "Você" fixo para `role='broker'`, ignorando o `metadata.sent_by` (que já temos). Em atendimento compartilhado (vários operadores + admin/supervisor observando), isso confunde quem falou o quê. Decisão do Marcos: mostrar o **nome de quem enviou**; "Você" só quando for o próprio espectador.

## Escopo
**IN:**
1. **`bubble-styles.ts`:** `resolveBubbleLabel(msg, { currentUserId, senderNames })` — para `broker`: "Você" se `sent_by === currentUserId`; senão `senderNames[sent_by]` (nome real) ou "Corretor"; sem `sent_by` (legado/otimista) mantém "Você". Outros roles (lead/Nicole/sistema) usam o rótulo padrão. +testes.
2. **`conversation-thread.tsx`:** novos props `currentUserId` + `senderNames`; render usa `resolveBubbleLabel`.
3. **`dashboard/leads/[id]/page.tsx` e `broker/leads/[id]/page.tsx`:** resolvem `senderNames` (mapa `sent_by → users.name` dos remetentes das mensagens) e passam `currentUserId={user.id}` + `senderNames`.

**OUT:** rótulo em /dashboard/chat (inbox Relacionamento — server component sem thread client); mudar cor por remetente; mostrar avatar.

## Acceptance Criteria
1. **Given** Marcos vê uma conversa com uma mensagem enviada pela Valeria, **then** a bolha mostra **"Valeria Costa"** (não "Você").
2. **Given** a mensagem foi enviada pelo próprio espectador, **then** mostra **"Você"**.
3. **Given** mensagem de corretor sem `sent_by` (legado/otimista), **then** mantém "Você" (sem regressão no envio próprio).
4. **Given** `sent_by` de um usuário fora do mapa, **then** mostra "Corretor" (neutro, nunca "Você" falso).
5. **Given** bolhas de lead/Nicole/sistema, **then** rótulo inalterado (Lead/Nicole/—).
6. tsc/lint/vitest limpos.

## Dev Notes
- `bubble-styles.ts` (`getBubbleStyle`); `conversation-thread.tsx` render ~L227-252 (usa `resolveBubbleLabel`); ambas as páginas reusam o `ConversationThread`. `ThreadMessage.metadata` já traz `sent_by`. Ver [[project-transferir-conversa]] (chat compartilhado usa `metadata.sent_by`).

## Dev Agent Record (@dev — 2026-07-16)
- `bubble-styles.ts`: `resolveBubbleLabel` (puro). `conversation-thread.tsx`: props `currentUserId`/`senderNames` + uso no render. Páginas /broker e /dashboard: mapa `sent_by → nome` (1 query `users` pelos ids dos remetentes) + `currentUserId=user.id`.
- **Testes:** +5 (resolveBubbleLabel: próprio→Você, outro→nome, desconhecido→Corretor, sem sent_by→Você, lead/Nicole padrão).
- **Checks:** tsc web 0 · eslint 0 · vitest **1026/1026** (+5). Sem regressão.
- **Branch:** `feat/75-165-conversa-rotula-remetente-real`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (msg da Valeria → "Valeria Costa") ✓ · AC2 (própria → "Você") ✓ · AC3 (sem sent_by → "Você", sem regressão) ✓ · AC4 (desconhecido → "Corretor") ✓ · AC5 (lead/Nicole/sistema inalterados) ✓ · AC6 (tsc/eslint/1026) ✓. Realtime de remetente novo fora do mapa → "Corretor" até refresh (aceitável).

## Change Log
- 2026-07-16 — @devops — PR #214 + squash-merge. Deploy prod **SUCCESS** (206f05a). Status → **Done**.
- 2026-07-16 — @qa — **QA GATE: PASS**. 6 ACs, 1026/1026.
- 2026-07-16 — @dev — Implementado (resolveBubbleLabel + props + mapa nas páginas). Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Draft → Ready.
- 2026-07-16 — @sm — Story criada.

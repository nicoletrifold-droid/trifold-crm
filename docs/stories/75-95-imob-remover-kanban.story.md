# Story 75-95 — IMOB: remover o Kanban do módulo (deixar só o cadastro)

## Metadata
- **Status:** ✅ DONE / LIVE — PR #86 merged (86bed28), deploy Vercel success · **Epic:** IMOB · **Branch:** feat/75-95-imob-remover-kanban · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, navegação]
- **Prioridade:** 🟢 Média — pedido do diretor: o kanban não fica no IMOB (vai pra outro local depois).

## Story
**As a** gestão, **I want** que o módulo IMOB abra direto no **cadastro de imobiliárias**, sem o Kanban, **so that** o IMOB fique focado no cadastro — o board vai para outro local no futuro.

## Contexto
O IMOB tinha 2 abas (Kanban | Imobiliárias). O board (Story 75-88) **não será usado aqui** — irá para outro local. Board vazio em prod (4 colunas semeadas, **0 cards, 0 comentários**) → sem dado a preservar. Decisão: **desligar o kanban do IMOB, mantendo o código do board + tabelas DORMENTES** (não apagar) p/ reuso no outro local. Documentado em [[project-imob-kanban]] pra ressuscitar.

## Escopo
**IN:**
1. `dashboard/imob/page.tsx`: remover seed de colunas + `ImobBoard` + `ImobTabs`; passar a **redirecionar** para `/dashboard/imob/imobiliarias` (mantendo o guard `canAccess("imob")`). Assim o menu "IMOB" (href `/dashboard/imob`) cai direto no cadastro.
2. `dashboard/imob/imobiliarias/page.tsx`: remover `<ImobTabs />` (tela única agora).
3. Deletar `dashboard/imob/_components/imob-tabs.tsx` (sem uso após 1 e 2).

**OUT / mantido dormente (p/ reuso no "outro local"):**
- **NÃO apagar** `imob-board.tsx`, `imob-card-modal.tsx`, as APIs `/api/imob/cards*` e `/api/imob/columns*`, o `imobGuard`, nem as tabelas `imob_columns/imob_cards/imob_card_comments` (migration 129). Ficam dormentes.
- Não mexe no cadastro de imobiliárias (75-92) nem na permissão do módulo (75-93).

## Acceptance Criteria
1. **Given** o menu IMOB, **when** clico, **then** vejo o **cadastro de imobiliárias** (sem abas, sem board).
2. **Given** acesso direto a `/dashboard/imob`, **then** redireciona para `/dashboard/imob/imobiliarias`.
3. **Given** quem não tem acesso ao módulo "imob", **then** continua bloqueado (guard preservado).
4. **Given** o board/API/tabelas, **then** continuam no repo/banco (dormentes) — nada apagado.
5. typecheck/lint limpos (sem import quebrado do `imob-tabs` deletado).

## Dev Notes
- `imob/page.tsx`: substituir corpo por `getServerUser` + `if (!await canAccess(...,"imob")) redirect("/dashboard")` + `redirect("/dashboard/imob/imobiliarias")`. Remover imports de ImobBoard/ImobTabs e o seed de colunas.
- `imobiliarias/page.tsx`: tirar import + uso de `ImobTabs`.
- Menu (layout `imobItem.href="/dashboard/imob"`) não muda — o redirect cobre.

## File List
- `packages/web/src/app/dashboard/imob/page.tsx` — vira redirect p/ o cadastro.
- `packages/web/src/app/dashboard/imob/imobiliarias/page.tsx` — remove ImobTabs.
- `packages/web/src/app/dashboard/imob/_components/imob-tabs.tsx` — deletado.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Remoção limpa e reversível; board/tabelas preservados p/ reuso (documentado). Sem dado perdido (board vazio). Escopo mínimo, sem risco ao cadastro/permissões. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] `imob/page.tsx`: agora só `getServerUser` + guard `canAccess("imob")` + `redirect("/dashboard/imob/imobiliarias")`. Removidos seed de colunas, ImobBoard e ImobTabs.
- [x] `imobiliarias/page.tsx`: removido import + uso de `ImobTabs`.
- [x] `imob-tabs.tsx` **deletado** (sem referências — confirmado por grep).
- [x] Dormentes (NÃO apagados): `imob-board.tsx`, `imob-card-modal.tsx`, `/api/imob/cards*`, `/api/imob/columns*`, tabelas `imob_*`. Board estava vazio (0 cards/0 comentários).
- **Checks:** `tsc` 0; `eslint` 0. Sem migration.
- Memória atualizada ([[project-imob-kanban]]) com o passo-a-passo de reuso do board no "outro local".
- Branch `feat/75-95-imob-remover-kanban`, commit local (sem push).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅
- **Integridade:** `tsc` 0, `eslint` 0 — sem import quebrado após deletar `imob-tabs.tsx` (grep confirma zero referências). Guard `canAccess("imob")` preservado no redirect.
- **Rastreabilidade:** AC1/AC2 — `/dashboard/imob` redireciona pro cadastro (menu cai direto lá, sem abas/board). AC3 — guard mantido. AC4 — board/APIs/tabelas intactos no repo/banco (dormentes). AC5 — checks limpos.
- **Observação:** board vazio em prod (0 cards) → remoção sem perda; reuso documentado na memória.

**Gate → PASS.** Pronto para @devops (push + PR + deploy). Sem migration.

## Change Log
- 2026-07-01 — @devops (Gage) — PR #86 merged (86bed28) + deploy Vercel success. Kanban desligado do IMOB; board dormente. Story LIVE.
- 2026-07-01 — @qa (Quinn) — Gate PASS (tsc/lint 0, sem import órfão; guard preservado). Status → Done.
- 2026-07-01 — @dev (Dex) — imob/page redireciona p/ cadastro; ImobTabs removido; imob-tabs deletado; board dormente. Memória de reuso atualizada. Sem push.
- 2026-07-01 — @po (Pax) — GO. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic IMOB). Desliga o kanban do IMOB (redirect p/ cadastro), mantém board/tabelas dormentes p/ reuso.

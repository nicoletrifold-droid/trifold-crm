# Story 75-166 — Texto-espelho da abertura acompanha o template Meta ("da equipe Trifold")

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** — · **Complexidade:** XS (1 ponto) · **Branch:** feat/75-166-espelho-abertura-da-equipe-trifold
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Follow-up da 75-164. O template Meta `abertura_atendimento_corretor` (id 5467297326827755) foi editado via API p/ wording neutro e **APROVADO pela Meta em 2026-07-16** (novo corpo: "…Aqui é {{2}}, **da equipe Trifold**…"). O texto-espelho gravado no histórico do CRM (`start-whatsapp/route.ts`) ainda dizia "corretor da Trifold" → agora bate com o que o lead recebe.

## Escopo
**IN:** `api/leads/[id]/start-whatsapp/route.ts` — `renderedText` (mirror) de "corretor da Trifold" → "da equipe Trifold".
**OUT:** qualquer outra mudança.

## Acceptance Criteria
1. **Given** o corretor clica "Iniciar atendimento", **then** a mensagem gravada no histórico diz "…, da equipe Trifold…" (igual ao template aprovado).
2. tsc/lint/vitest limpos; sem regressão.

## Dev Agent Record (@dev — 2026-07-16)
- `start-whatsapp/route.ts` L97: mirror "corretor da Trifold" → "da equipe Trifold". tsc web 0 · eslint 0 · vitest 1026/1026.
- Template Meta confirmado **APPROVED** (via Management API) antes de mergear — sem descompasso.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (mirror = template aprovado) ✓ · AC2 (tsc/eslint/1026) ✓.

## Change Log
- 2026-07-16 — @devops — PR + merge + deploy prod. Status → **Done**.
- 2026-07-16 — @qa — **PASS**.
- 2026-07-16 — @dev — mirror atualizado. 
- 2026-07-16 — @po/@sm — GO (template já APPROVED).

# Story 75-143 — Meus Leads (corretor): ícone de conversa em verde WhatsApp

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #140 · **Complexidade:** XS (1 ponto) · **Branch:** feat/75-143-icone-whatsapp-verde
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Na lista "Meus Leads" do corretor (`/broker/leads`) o ícone de abrir conversa estava cinza/apagado (`text-stone-400`), pouco visível. O diretor pediu para deixá-lo **verde estilo WhatsApp**, mais visível e reconhecível. Ver [[project-corretor-whatsapp-atendimento]].

## Escopo
**IN:** em `leads-list-with-drawer.tsx`, trocar a cor do ícone `MessageCircle` (link "Abrir conversa") para verde (emerald) nos dois layouts — card mobile e tabela desktop. Ajustar `aria-label` para "Abrir conversa no WhatsApp".

**OUT:** mudar comportamento/gating do ícone; outros ícones da tela.

## Acceptance Criteria
1. **Given** a lista Meus Leads, **then** o ícone de conversa aparece em verde (emerald), visível em light e dark; **when** hover, realce verde.
2. Card mobile e tabela desktop consistentes. tsc/lint/vitest limpos.

## Dev Agent Record (@dev — 2026-07-06)
- `leads-list-with-drawer.tsx`: desktop `text-stone-400/orange-hover` → `text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400`; mobile `bg-orange-50/text-orange-500` → `bg-emerald-50/text-emerald-600` (ring/hover emerald). aria-label atualizado.
- **Checks:** tsc 0 · eslint 0 · vitest 816/816.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (verde visível light/dark + hover) ✓ · AC2 (mobile+desktop, tsc/eslint/816) ✓. Só apresentação.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #140** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 2 ACs, 816/816.
- 2026-07-06 — @dev — Ícone em verde WhatsApp. Status → InReview.
- 2026-07-06 — @po — **GO**. @sm — Story criada.

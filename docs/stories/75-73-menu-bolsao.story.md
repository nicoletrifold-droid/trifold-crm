# Story 75-73 — Menu "Bolsão" (sidebar dashboard + nav corretor)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** feature/75-73-menu-bolsao · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]
- **Nota:** escopo intencionalmente mínimo — "a princípio apenas criar este menu" (função definida depois).

## Story
**As a** gestão comercial e corretores, **I want** um menu "Bolsão" na navegação, **so that** futuramente
acessem a funcionalidade (a definir). Por ora, só o item de menu + rota placeholder.

## Escopo
**IN:**
- **Sidebar do dashboard** (`dashboard/layout.tsx`): item "Bolsão" (ícone `Boxes`) inserido **logo abaixo da Roleta**,
  gate hardcoded `admin || supervisor || gerente-comercial`. (Gate do "Fluxo de Pagamento" permanece
  `admin || gerente-comercial` — sem regressão.)
- **Nav do corretor** (`broker/layout.tsx`): item "Bolsão" entre "Imóveis" e "Fluxo de Pagamento" (índice ≥ 4 →
  vai pro sheet "Mais" no mobile, sem alterar as 4 tabs do bottom bar). Visível a todo `broker`.
- **Páginas placeholder:** `/dashboard/bolsao` (tema light/dark) e `/broker/bolsao` (dark) — "Em breve".

**OUT:**
- Nenhuma funcionalidade do Bolsão (definida em story futura).
- Não cria módulo de permissão no banco (gate hardcoded por ora).
- Guard de acesso fino nas páginas placeholder (hoje qualquer um que chega em /dashboard alcança a rota por URL —
  inofensivo no placeholder; endurecer quando a função existir).

## Acceptance Criteria
1. **Given** admin, supervisor ou gerente-comercial em `/dashboard`, **then** vê "Bolsão" na sidebar logo abaixo de "Roleta".
2. **Given** um corretor em `/broker`, **then** vê "Bolsão" no nav (grupo "Mais" no mobile).
3. **Given** perfil "obras" no dashboard, **then** NÃO vê "Bolsão". E o "Fluxo de Pagamento" permanece só admin/gerente-comercial (supervisor não passa a vê-lo).
4. **Given** o clique no menu, **then** abre a página placeholder (sem 404).
5. typecheck/lint limpos.

## Dev Notes
- Ícone `Boxes` (lucide). Gate dashboard reaproveita a lógica de inserção pós-Roleta (junto do Fluxo de Pagamento).
- Supervisor **não** incluído (não solicitado); fácil adicionar ao gate se necessário.

## File List
- `packages/web/src/app/dashboard/layout.tsx` — item Bolsão abaixo da Roleta (admin/gerente-comercial).
- `packages/web/src/app/broker/layout.tsx` — item Bolsão no nav do corretor.
- `packages/web/src/app/dashboard/bolsao/page.tsx` — placeholder (light/dark).
- `packages/web/src/app/broker/bolsao/page.tsx` — placeholder (dark).

## QA Results
- **Verdict:** PASS — tsc 0, lint 0. Inserção de nav + placeholders; gate por role conforme ACs. Sem render live (exigiria sessão autenticada); lógica revisada.

## Change Log
- 2026-06-29 — @dev — Cria menu "Bolsão" (sidebar dashboard p/ admin+gerente-comercial, abaixo da Roleta; nav do
  corretor) + páginas placeholder. Só o menu; função a definir. Ver [[project-roles-permissoes]].

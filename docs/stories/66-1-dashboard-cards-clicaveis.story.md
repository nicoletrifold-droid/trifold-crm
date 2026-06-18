# Story 66-1 — Dashboard: cards de métricas clicáveis

## Metadata
- **Status:** Done
- **Epic:** 66 — Dashboard: Navegação por Métricas
- **Branch:** feature/66-1-dashboard-cards-clicaveis
- **Complexidade:** S (2 pontos) — 4 links + 1 filtro novo na página de leads

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, visual]

## Story

**As a** admin/gestor no dashboard,
**I want** clicar em cada card de métrica e cair na visão filtrada correspondente,
**so that** eu navegue direto para os dados daquele indicador sem precisar montar o filtro manualmente.

## Contexto

Os 5 cards do topo do dashboard (`packages/web/src/app/dashboard/page.tsx`, linhas 162-189)
são `div` estáticos. O usuário quer que sejam clicáveis, levando "diretamente e somente"
aos dados de cada campo.

Mapeamento (decidido com o usuário):
- **Leads hoje** → `/dashboard/leads?criados=hoje` (filtro NOVO — não existe hoje)
- **Leads ativos** → `/dashboard/leads` (view padrão "ativos" = mesmo número, mesma exclusão)
- **Total no pipeline** → `/dashboard/pipeline`
- **Empreendimentos** → `/dashboard/properties`
- **Unidades totais** → SEM link (não há tela "somente unidades"; fica estático — decisão do usuário)

Referência da métrica "Leads hoje" no dashboard (linha 23-33): `created_at >= today` onde
`today = new Date(); today.setHours(0,0,0,0)`. O filtro novo deve casar com isso.

A página de leads já parseia `view`, `stage_id`, `property_id`, `broker_id`, `days`, `search`,
`page`. Falta `criados`.

**Arquivos alvo:**
- `packages/web/src/app/dashboard/page.tsx` (cards → Link)
- `packages/web/src/app/dashboard/leads/page.tsx` (parse `criados=hoje` + query `gte created_at`)

## Escopo

**IN (esta story):**
- Envolver 4 cards em `<Link>` com feedback de hover (cursor + ring/realce sutil).
- Adicionar o filtro `criados=hoje` na página de leads: quando presente, `created_at >=` meia-noite
  de hoje (mesma lógica do dashboard). Combina com a view "ativos" padrão.
- "Unidades totais" permanece `div` estático (sem link).

**OUT (fora desta story):**
- Página "somente unidades" cross-empreendimento.
- Outros valores de `criados` (ex: ontem, semana) — só `hoje` nesta story.
- Mudança visual além do realce de clicabilidade.

## Acceptance Criteria

1. Card **Leads hoje** é um link para `/dashboard/leads?criados=hoje`.
2. Card **Leads ativos** → `/dashboard/leads`.
3. Card **Total no pipeline** → `/dashboard/pipeline`.
4. Card **Empreendimentos** → `/dashboard/properties`.
5. Card **Unidades totais** permanece sem link (div estático).
6. Na página de leads, `?criados=hoje` filtra para leads com `created_at >=` meia-noite de hoje;
   ausente, comportamento inalterado.
7. O número de leads exibido com `?criados=hoje` (na view ativos) é coerente com o card "Leads hoje".
8. Cards clicáveis têm feedback visual de hover; typecheck sem erros.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Fuso: meia-noite server vs exibição | Baixa | Replicar exatamente a lógica do dashboard (`setHours(0,0,0,0)`) |
| Link dentro de grid quebra layout | Baixa | `<Link>` com `block` mantendo as classes do card |
| `criados=hoje` conflita com `view=perdidos` | Baixa | Filtro é aditivo (gte created_at); independe da view |

## Tasks / Subtasks

- [x] **Task 1 — Filtro `criados=hoje` na página de leads** (AC: 6, 7)
  - [x] 1.1 `criados` adicionado ao tipo de `searchParams`
  - [x] 1.2 `criados === "hoje"` aplica `gte("created_at", meia-noite hoje)` em query e countQuery

- [x] **Task 2 — Cards clicáveis no dashboard** (AC: 1-5, 8)
  - [x] 2.1 4 cards envolvidos em `<Link block>` com hover `ring-orange-500/40`
  - [x] 2.2 "Unidades totais" mantido como div estático

- [x] **Task 3 — Typecheck** (AC: 8)
  - [x] 3.1 `tsc --noEmit` no pacote web — zero erros nos arquivos tocados

## Dev Notes

`Link` já é importado em `dashboard/page.tsx` (linha 3). Padrão de href com query: string literal.
Hover sugerido: adicionar `transition hover:ring-2 hover:ring-orange-500/40` às classes do card.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada | River (@sm) |
| 2026-06-18 | 1.1 | Validação 10/10 GO — Status → Ready | Pax (@po) |
| 2026-06-18 | 1.2 | Implementação concluída — typecheck 0 erros — Status → InReview | Dex (@dev) |
| 2026-06-18 | 1.3 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |

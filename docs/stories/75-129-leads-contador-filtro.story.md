# Story 75-129 — Leads: contador de resultados do filtro + contagem na aba

## Metadata
- **Status:** Done · **Epic:** Leads/UX · **Branch:** feat/75-129-leads-contador · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Na tela `/dashboard/leads`, ao aplicar filtros (etapa/empreendimento/corretor/período/busca), o gestor não vê quantos leads sobraram — só há a contagem no rodapé da paginação, e apenas quando há >1 página (>50). Precisa contar na mão. O `totalCount` (contagem exata da query filtrada) **já é calculado** no server component, só não é exibido de forma visível. Decisão UX (@ux-design-expert): mostrar uma **linha de resultado abaixo dos filtros** + dar paridade à aba "Em atendimento" com contagem (como "Perdidos (689)").

## Escopo
**IN:**
1. **Linha de resultado** abaixo dos filtros / acima da tabela em `dashboard/leads/page.tsx`: "**N** leads" (usa o `totalCount` já existente — reflete todos os filtros + busca + view). Sempre visível.
2. **Contagem na aba "Em atendimento"**: "Em atendimento (N)" — N = total da view ativos **sem** filtros (nova count query, paridade com Perdidos). Perdidos já tem.

**OUT:** mudar a lógica dos filtros/paginação; contadores no Pipeline/outras telas.

## Acceptance Criteria
1. **Given** a tela de Leads com qualquer combinação de filtros, **then** aparece "N leads" abaixo dos filtros com o total exato que casou o filtro (mesmo com ≤50, sem paginação).
2. **Given** nenhum resultado, **then** mostra "0 leads".
3. **Given** a aba "Em atendimento", **then** exibe a contagem total da aba (sem filtro), como "Perdidos (N)".
4. Singular/plural correto ("1 lead" / "N leads"). tsc/lint/testes limpos; sem regressão de filtros/paginação.

## Tasks (@dev)
- [ ] `page.tsx`: count query da aba ativos (sem filtros) → "Em atendimento (N)".
- [ ] Linha "N leads" (totalCount) abaixo do `<LeadFilters/>`.
- [ ] tsc/eslint.

## Riscos
- Baixíssimo: só exibe um número já calculado + 1 count query adicional (head:true, barata).

## Dev Agent Record (@dev — 2026-07-06)
- `page.tsx`: nova count query `ativosCount` (aba ativos sem filtro) no Promise.all; aba "Em atendimento (N)"; linha "N leads" (totalCount, singular/plural) abaixo dos filtros. Reusa o totalCount que já alimentava o rodapé.
- **Checks:** tsc 0 · eslint 0 erros (só warning pré-existente `isAdmin` não usado, fora de escopo) · vitest 757/757.
- **Files:** `packages/web/src/app/dashboard/leads/page.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (linha "N leads" reflete o filtro, sempre visível) ✓ · AC2 (0 leads) ✓ · AC3 (aba "Em atendimento (N)") ✓ · AC4 (plural) ✓. totalCount = mesma contagem do rodapé (já validada); sem regressão (757/757).

## Change Log
- 2026-07-06 — @qa — **PASS**. 4 ACs, 757/757.
- 2026-07-06 — @dev — Implementado (contador de filtro + aba). Status → InReview.
- 2026-07-06 — @po — GO (10/10). Ready.
- 2026-07-06 — @sm — Story criada (Draft).

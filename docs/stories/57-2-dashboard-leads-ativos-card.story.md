# Story 57-2 — Card "Leads Ativos" no Dashboard

## Metadata
- **Status:** Ready
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
O card "Total no pipeline" inclui leads das etapas "Represamento" e "Corretores Antigos", que são banco de dados histórico — não negociações ativas. Gestores precisam enxergar rapidamente quantos leads estão efetivamente em negociação.

## Acceptance Criteria
- [x] AC1: Novo card "Leads ativos" exibido entre "Leads hoje" e "Total no pipeline"
- [x] AC2: Valor = Total no pipeline − Represamento − Corretores Antigos
- [x] AC3: Etapas excluídas identificadas pelos slugs `represamento` e `corretores-antigo`
- [x] AC4: Ordem final dos cards: Leads hoje / Leads ativos / Total no pipeline / Empreendimentos / Unidades totais
- [x] AC5: Grid passa de 4 para 5 colunas em desktop (lg:grid-cols-5)
- [x] AC6: Sem nova query ao banco — usa `stageCounts` já carregado

## Out of Scope
- Tooltip explicando a exclusão das etapas
- Tornar as etapas excluídas configuráveis via UI

## File List
- `docs/stories/57-2-dashboard-leads-ativos-card.story.md` (this file)
- `packages/web/src/app/dashboard/page.tsx` (updated)

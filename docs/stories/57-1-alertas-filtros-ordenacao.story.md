# Story 57-1 — Filtros e Ordenação na Página de Alertas

## Metadata
- **Status:** Done
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
A página de Alertas (`/dashboard/alertas`) lista leads sem contato recente, mas hoje não tem nenhuma forma de filtrar ou ordenar. Com dezenas de leads na lista, gestores e supervisores precisam conseguir focar nos mais urgentes ou filtrar por corretor, empreendimento e origem do lead — sem precisar percorrer a lista inteira.

## Acceptance Criteria
- [x] AC1: Barra de filtros acima da tabela com os campos: Corretor, Empreendimento, Origem (source), Dias mínimos sem contato
- [x] AC2: Filtro de Corretor — dropdown com opções: "Todos", "Sem corretor" + nome dos corretores presentes na lista
- [x] AC3: Filtro de Empreendimento — dropdown com opções: "Todos" + nomes dos empreendimentos presentes na lista
- [x] AC4: Filtro de Origem — dropdown com opções: "Todas" + valores únicos de `leads.source` presentes na lista (ex: whatsapp, instagram, site); coluna e filtro só aparecem se houver ao menos um valor
- [x] AC5: Filtro de Dias mínimos — input numérico; só mostra leads com `daysSinceContact >= valor`
- [x] AC6: Colunas clicáveis para ordenar — Lead (A→Z), Dias sem contato (padrão: maior primeiro), Empreendimento, Corretor
- [x] AC7: Filtros e ordenação são client-side (os dados já vêm do server component)
- [x] AC8: Query do server component inclui campo `source` do lead para exibição e filtro
- [x] AC9: Filtros resetam ao clicar em "Limpar filtros"
- [x] AC10: Tema dark/light correto (seguir padrão `dark:` do dashboard)

## Out of Scope
- Persistência de filtros no localStorage ou URL
- Paginação server-side
- Exportação CSV dos alertas

## File List
- `docs/stories/57-1-alertas-filtros-ordenacao.story.md` (this file)
- `packages/web/src/app/dashboard/alertas/page.tsx` (updated — adicionar source ao select + usar AlertasTable)
- `packages/web/src/app/dashboard/alertas/_components/alertas-table.tsx` (new — client component com filtros, ordenação e tabela)
- `packages/web/src/app/api/alertas/nicole-trigger/route.ts` (new — wrapper para acionar cron da Nicole)
- `packages/web/src/app/api/alertas/done/route.ts` (new — marcar follow_up_log como done)

## Dev Notes
- A página atual é um server component puro. A tabela e os filtros devem ser extraídos para `AlertasTable` (client component), que recebe `alerts: AlertItem[]` e `properties: string[]` e `brokers: string[]` como props.
- O campo `source` precisa ser adicionado ao select do `staleLeads` e ao `AlertItem` type, mapeado para `sourceName`.
- Evitar re-fetch: todo o estado de filtro/ordenação fica em `useState` local no `AlertasTable`.
- Ordenação padrão: `daysSinceContact` descendente (igual ao comportamento atual).

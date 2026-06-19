# Story 74-2 — Contador de Compromissos no menu "Agenda" (sidebar)

## Metadata
- **Status:** InReview
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
O item de menu "Agenda" não dá nenhuma pista de quantos compromissos o usuário tem pela frente. Um contador (badge) no menu deixa visível, à primeira vista, o volume de compromissos futuros, incentivando o acompanhamento.

A regra de contagem é por "compromisso ainda não realizado": conta os compromissos **futuros e ativos** (status `scheduled`/`confirmed`, `scheduled_at >= agora`). Conforme cada compromisso passa do horário, ele sai da contagem automaticamente (o número diminui).

O escopo depende do perfil:
- **Corretor** (`/broker/agenda`): conta apenas os próprios compromissos (`broker_id = user.id`).
- **Gerente comercial e demais perfis com acesso à agenda** (`/dashboard/agenda`): conta **todos** os compromissos da organização — coerente com o que a página `/dashboard/agenda` já exibe (org-wide).

A infraestrutura de badge já existe: `SidebarNav` aceita `badge?: number` por item e renderiza no menu lateral (desktop). Falta (a) alimentar o badge do item "Agenda" em ambos os layouts e (b) renderizar o badge também no menu inferior do mobile.

## Acceptance Criteria
- [x] AC1: O item "Agenda" do menu lateral (desktop) exibe um badge com a contagem de compromissos futuros ativos quando > 0; sem badge quando 0.
- [x] AC2: No layout do corretor (`/broker`), a contagem usa `appointments` filtrados por `org_id = user.orgId`, `broker_id = user.id`, `status in (scheduled, confirmed)` e `scheduled_at >= agora`.
- [x] AC3: No layout do dashboard (`/dashboard`), a contagem usa `appointments` filtrados por `org_id = user.orgId`, `status in (scheduled, confirmed)` e `scheduled_at >= agora` — SEM filtro por `broker_id` (todos os compromissos da org). Só é computada se o usuário tiver permissão de `agenda`.
- [x] AC4: A contagem reflete "todos os futuros" (hoje em diante), não só os de hoje. Compromissos com `scheduled_at` já passado não entram; isso faz o número diminuir naturalmente com o tempo.
- [x] AC5: O badge também aparece no menu inferior do mobile para os itens visíveis nele (os 5 primeiros), cobrindo o caso do corretor (Agenda é um dos 5). Ajuste feito em `SidebarNav` sem quebrar os demais itens.
- [x] AC6: O badge segue o estilo já usado (pílula laranja, "99+" acima de 99) e respeita o estado ativo (não exibe badge no item atualmente selecionado, conforme padrão atual do desktop).
- [x] AC7: Sem nova migration; reaproveita a tabela `appointments` (coluna `org_id` já existente, migration 006).
- [x] AC8: No bottom bar do mobile, o item "Mais" exibe um indicador (ponto) quando qualquer item oculto sob ele (índice 5+) tiver badge > 0 — incluindo a "Agenda" no dashboard. O ponto some quando não há badges pendentes nos itens ocultos.

## Out of Scope
- Contagem numérica no "Mais" do mobile (será apenas um ponto indicador, não a soma — evita conflar tipos de badge diferentes sob o mesmo item).
- Filtro por broker individual no contador do dashboard (sempre org-wide).
- Notificações/push de compromissos.
- Alterar a página da agenda em si.

## Dependencies
- Tabela `appointments` com `org_id`, `broker_id`, `scheduled_at`, `status` (migration 006).
- `SidebarNav` (`components/layout/sidebar-nav.tsx`) — já suporta `badge?: number` no desktop.

## Complexity
- **T-shirt:** S (2 queries de contagem + injeção de badge nos dois layouts + 1 ajuste no SidebarNav mobile).

## Business Value
Dá visibilidade imediata da carga de compromissos no menu, ajudando corretor e gestão a priorizar a agenda.

## Risks
- A "Agenda" no nav do dashboard fica fora dos 5 primeiros itens → no mobile cai sob "Mais" (documentado em Out of Scope).
- Garantir que o badge mobile não vaze para itens externos/sem badge.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/74-2-agenda-contador-compromissos-sidebar.story.md` (this file)
- `packages/web/src/components/layout/sidebar-nav.tsx` (updated — badge no bottom bar mobile)
- `packages/web/src/app/broker/layout.tsx` (updated — count próprio + badge Agenda)
- `packages/web/src/app/dashboard/layout.tsx` (updated — count org-wide + badge Agenda)

## Dev Notes (@dev / Dex)
- Reuso total do `badge?: number` já existente no `SidebarNav` (desktop). Único acréscimo de UI: badge no bottom bar mobile (pílula absoluta sobre o ícone), seguindo o mesmo padrão de cor/limite "99+".
- Broker: 1 query `count head:true` filtrada por `org_id + broker_id + status + scheduled_at >= now`; badge injetado via `.map` sobre `NAV_ITEMS`.
- Dashboard: query equivalente sem `broker_id` (org-wide), gated por `permissions["agenda"]`; badge injetado no `baseFiltered.map`.
- `new Date().toISOString()` (UTC) compara corretamente com `scheduled_at timestamptz`.

## QA Results (@qa / Quinn)
**Veredito: PASS**

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review | OK — reuso de `badge`; injeção legível; comentários de escopo |
| 2 | Unit tests | N/A — layouts server; lógica é contagem declarativa |
| 3 | Acceptance Criteria | OK — AC1–AC7 |
| 4 | Sem regressões | OK — badges/itens existentes (Alertas, Obras, Mensagens, Suporte) intactos |
| 5 | Performance | OK — `count head:true`; 1 await adicional por layout |
| 6 | Segurança | OK — `org_id` em ambas; broker restrito a `broker_id`; dashboard gated por permissão |
| 7 | Documentação | OK — story atualizada |

**Verificações:** `pnpm type-check` (0 erros nos arquivos alterados; remanescentes pré-existentes em `email-templates/visual-editor.tsx`). `eslint` nos 3 arquivos → EXIT 0, 0 problemas.

**Cobertura mobile do dashboard (AC8):** "Agenda" fica além dos 5 primeiros itens → no mobile entra sob "Mais", que agora exibe um ponto indicador laranja quando há badge pendente nos itens ocultos. O ponto é agregado: também reflete Obras/Mensagens/Suporte se tiverem pendências (comportamento esperado de um indicador de "Mais"). `ring` garante contraste sobre a barra clara/escura.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): implementação em sidebar-nav + broker/layout + dashboard/layout. Status Ready → InReview.
- @qa (Quinn): QA gate PASS.
- @po (Pax): escopo ampliado — AC8 (ponto indicador no "Mais" mobile); removida limitação do Out of Scope.
- @dev (Dex): implementado `moreHasBadge` + ponto no item "Mais" (sidebar-nav).
- @qa (Quinn): re-gate PASS. Pronta para @devops *push.

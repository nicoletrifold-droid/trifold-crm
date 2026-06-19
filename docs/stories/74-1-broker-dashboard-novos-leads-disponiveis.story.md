# Story 74-1 — Lista de "Novos Leads Disponíveis" no Dashboard do Corretor

## Metadata
- **Status:** InReview
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
No dashboard do corretor (`/broker`), o card "Próximos compromissos" ocupa metade do grid inferior ("Meu Funil de Vendas"). Na prática a maioria dos corretores raramente tem compromissos agendados — o card fica quase sempre no estado vazio ("Nenhum compromisso agendado"), desperdiçando o espaço mais nobre da tela.

O dashboard já destaca, no topo, o número de **Novos Leads Disponíveis** (`counts.novos`) — leads atribuídos ao corretor que ainda estão na etapa inicial "Aguardando atendimento" (stage `00000000-0000-0000-0001-000000000001`) e ainda não foram trabalhados. Hoje só existe o número; o corretor precisa navegar até `/broker/leads` para ver quais são.

Trocar "Próximos compromissos" por uma **lista dos novos leads disponíveis** coloca a ação de maior valor (atender lead novo) diretamente na home, reduzindo cliques e acelerando o primeiro contato.

## Acceptance Criteria
- [x] AC1: O card "Próximos compromissos" do grid inferior é substituído por um card "Novos Leads Disponíveis".
- [x] AC2: A lista exibe os leads atribuídos ao corretor logado (`assigned_broker_id = user.id`) que estão na etapa "Aguardando atendimento" (stage `00000000-0000-0000-0001-000000000001`), ordenados do mais recente para o mais antigo (`created_at` desc), limitado a 5.
- [x] AC3: Cada item mostra: nome do lead (fallback para telefone se sem nome), origem/canal do lead e o tempo decorrido desde a entrada (ex.: "há 2h", "há 3 dias").
- [x] AC4: Clicar em um item navega para `/broker/leads/[id]`.
- [x] AC5: O cabeçalho do card tem um link "Ver todos" apontando para `/broker/leads?stage=00000000-0000-0000-0001-000000000001` (mesmo destino do card de contagem no topo).
- [x] AC6: Estado vazio ("Nenhum lead novo no momento") quando não houver leads na etapa, sem o botão "Novo Compromisso".
- [x] AC7: O contador exibido no card bate com `counts.novos` já carregado no topo (mesma fonte/semântica).
- [x] AC8: Estilo seguiu a convenção real do arquivo (classes duais `light + dark:`, que o layout do `/broker` renderiza sempre em dark) — consistente com o card irmão "Pendências de follow-up". Ver nota QA.

## Out of Scope
- Pegar/atribuir lead direto da lista (apenas visualização + navegação).
- Mexer no card "Próximos compromissos" em qualquer outra tela (somente o dashboard do corretor).
- Mexer no card "Pendências de follow-up" (permanece como está, ao lado).
- Mexer no botão/modal "Novo Compromisso" (continua acessível via /broker/agenda).

## Dependencies
- Stage "Aguardando atendimento" já existente (Story 62-1).
- Campo de origem/canal do lead disponível na tabela `leads` (validar nome exato da coluna na implementação — `source`/`metadata`).

## Complexity
- **T-shirt:** S (uma query adicional + um bloco de UI; sem migration).

## Business Value
Reduz o tempo até o primeiro contato com leads novos e aproveita o espaço mais visível do dashboard, que hoje fica majoritariamente vazio.

## Risks
- Nome da coluna de origem pode variar; mapear corretamente para não quebrar a build (typecheck).
- Garantir que a nova query não duplique custo desnecessário (reaproveitar padrão de `Promise.all` existente).

## Definition of Done
- ACs atendidos, `pnpm typecheck`/`lint` passando, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/74-1-broker-dashboard-novos-leads-disponiveis.story.md` (this file)
- `packages/web/src/app/broker/page.tsx` (updated)

## Dev Notes (@dev / Dex)
- Coluna de origem confirmada: `leads.source`, com labels reusados de `@web/lib/constants` (`SOURCE_LABELS`).
- Query nova substituiu a de `appointments` no `Promise.all` existente (mesmo padrão, sem custo extra de round-trip). Variável renomeada `upcomingAppointments` → `novosLeads`.
- Removidos símbolos órfãos: import `now`/`nowIso`, `NewAppointmentButton`, ícones `CalendarDays/MapPin/Clock`, helpers `formatDate/formatTime`. Adicionado helper `timeAgo` + ícone `UserPlus`.
- Badge do card mostra `counts.novos` (total real da etapa); a lista é truncada em 5 itens com link "Ver todos".
- `lib/permissions`/`org_id`: `leads.org_id` confirmado em uso em `lib/analytics-report-data.ts` — filtro mantido por segurança multi-tenant.

## QA Results (@qa / Quinn)
**Veredito: PASS**

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review (padrões/legibilidade) | OK — espelha card irmão "Pendências de follow-up"; reuso de `SOURCE_LABELS` |
| 2 | Unit tests | N/A — componente server sem lógica nova testável isolada; helper `timeAgo` é determinístico e trivial |
| 3 | Acceptance Criteria | OK — AC1–AC8 atendidos |
| 4 | Sem regressões | OK — `appointments`/"Novo Compromisso" continuam acessíveis via `/broker/agenda` (modal não removido, só o uso nesta home) |
| 5 | Performance | OK — query substitui a anterior dentro do mesmo `Promise.all`; sem round-trip adicional |
| 6 | Segurança | OK — filtros `org_id` + `assigned_broker_id` (isolamento multi-tenant e por corretor) |
| 7 | Documentação | OK — story atualizada |

**Verificações executadas:** `pnpm type-check` (0 erros no arquivo; erros remanescentes são pré-existentes em `email-templates/visual-editor.tsx`, módulo `react-email-editor` ausente — fora do escopo). `eslint src/app/broker/page.tsx` → 0 erros (3 warnings pré-existentes de vars não usadas da roleta, não introduzidas por esta story).

**Nota (AC8):** A convenção de memória diz "/broker sempre dark hardcoded", mas o arquivo inteiro usa classes duais `light + dark:` e o layout aplica dark. Mantida a consistência com o arquivo (não introduz inconsistência visual). CONCERNS-livel apenas documental; não bloqueante.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready. Obs: confirmar nome da coluna de origem na implementação.
- @dev (Dex): implementação concluída em `broker/page.tsx`. Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.

# Story 78-15 — UI de Assinaturas Fixas (extensão do Painel de Saúde & Billing)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-15
- **Status:** InReview
- **Priority:** P2 — completa a entrega de valor da categoria "Assinaturas Fixas" (78-14) tornando-a visível e editável pelo usuário; sem esta story, o backend de 78-14 fica sem UI (dado existe no banco, mas ninguém consegue completar o cadastro nem ver o total).
- **Complexity:** M (0 rotas novas, 0 migration; 2 componentes novos + extensão de tipos + 2 arquivos existentes com filtro pontual; ~6-9h)
- **Created:** 2026-07-14
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @ux-design-expert (Uma)
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[ui_review, accessibility_check, admin_guard_review, empty_state_review, financial_source_badge_review]`

> Nota de sequenciamento (dependência rígida, diferente da 78-9→78-8): esta story consome diretamente a função pura `somarAssinaturasFixasPorMoeda` (`packages/web/src/lib/billing/subscription-summary.ts`) e os 7 campos novos do `GET /api/admin/billing-reminders` — ambos entregues pela **Story 78-14**, que na data desta redação (2026-07-14) ainda está em `Status: Draft`, **sem nenhum arquivo implementado** (confirmado: `packages/web/src/lib/billing/subscriptions/` e `subscription-summary.ts` não existem no repositório nesta data; última migration real é `171_billing_cost_alerts_summary.sql`). Diferente da 78-9 (que tolerava a 78-8 ainda não existir, tratando `404` como estado vazio), **esta story não deve entrar em `*develop` antes de 78-14 estar implementada** (ao menos `InReview`, com `subscription-summary.ts` e a extensão do GET/PATCH já mergeados) — a dependência aqui é de **compilação** (import de função que não existe), não apenas de dado ausente em runtime.

---

## User Story

**Como** administrador do Trifold CRM,
**Quero** ver e completar o cadastro das assinaturas fixas (Claude Team, Vercel Pro, Supabase Pro) diretamente no Painel de Saúde & Billing — com o total mensal somado por moeda e indicação clara do que veio automático via API versus do que preciso preencher manualmente —
**Para que** eu nunca deixe uma assinatura fixa sem data de renovação cadastrada (o que impediria o alerta automático de disparar) e tenha visibilidade do gasto fixo mensal separado do gasto de uso variável.

---

## Context

A Story 78-14 (backend, Draft) estende `service_billing_reminders` com 7 campos novos (`is_fixed_subscription`, `subscription_plan`, `subscription_seats`, `value_source`, `seats_source`, `excluded_from_subscription_total`, `last_enriched_at`) e relaxa `due_date` para nullable, semeando 3 linhas (`claude_team`, `vercel`, `supabase`) com valores manuais nulos até o preenchimento via UI — **esta story**. Ela também entrega 2 enriquecedores via API (Supabase: plano+assentos+preço-por-tabela; Vercel: assentos apenas) que rodam 1×/dia, uma função pura de agregação (`somarAssinaturasFixasPorMoeda`) e estende `GET`/`PATCH /api/admin/billing-reminders` para expor/aceitar os novos campos — deixando o contrato pronto para esta UI consumir (Scope OUT da 78-14, Scope IN desta story).

O painel de billing já existe (Story 78-9, `InReview`) em `packages/web/src/app/dashboard/sistema/billing/page.tsx`, com 3 seções: "Total do mês (infraestrutura)", "Saúde dos serviços" (cards de custo de USO, um por `platform_services.enabled=true`) e "Próximos vencimentos" (lista de `service_billing_reminders` consumida de `GET /api/admin/billing-reminders`, já buscada pela página). Esta story **adiciona uma 4ª seção**, "Assinaturas Fixas", **reusando os dois fetches que a página já faz** (`/api/admin/billing-panel` e `/api/admin/billing-reminders`) — **nenhuma chamada de API nova** é necessária para renderizar a seção (só o `PATCH` de edição, que já existe desde 78-8).

---

## Scope

### IN (esta story entrega)
- Seção **"Assinaturas Fixas"** na página `/dashboard/sistema/billing`, entre "Saúde dos serviços" e "Próximos vencimentos", listando as linhas com `is_fixed_subscription = true` (hoje: 3, mas a UI não hardcoda esse número — itera o que a API retornar).
- Card por assinatura: nome do serviço, plano (com indicador de fonte), nº de assentos (com indicador de fonte), valor mensal + moeda (com indicador de fonte), próxima renovação com contagem de dias, deep-link para o billing (correlacionado por `slug` com o payload que `GET /api/admin/billing-panel` **já retorna** — sem nova chamada).
- **Total mensal de Assinaturas Fixas** por moeda, reusando `somarAssinaturasFixasPorMoeda` (78-14) — exclui `excluded_from_subscription_total=true` e `expected_amount=null`; nunca soma moedas diferentes.
- **Formulário de edição** (cadastro único) por assinatura: `expected_amount`+`currency`, `due_date`, `billing_cycle` (mensal/anual), `alert_days_before`, `subscription_seats` — sempre editáveis; `subscription_plan` editável **somente** para `claude_team` (sem enriquecedor automático); para `vercel`/`supabase` mostrado como informativo/somente-leitura (auto-gerenciado pelo enriquecedor da 78-14, sem coluna de proteção contra sobrescrita como `expected_amount`/`subscription_seats` têm).
- CTA "Completar cadastro" em destaque quando `due_date === null` ou `expected_amount === null`.
- Remoção de duplicação: linhas `is_fixed_subscription=true` deixam de aparecer em "Próximos vencimentos" (mesmo após `due_date` preenchida); `claude_team` deixa de aparecer no grid de "Saúde dos serviços" (nunca terá custo de uso real — `has_auto_cost_collection=false`, 78-14 AC2).
- Estados vazio (nenhuma assinatura fixa ainda — schema da 78-14 não aplicado) e de erro (reusa o mesmo estado de erro já tratado para `/api/admin/billing-reminders`).

### OUT (não entra nesta story)
- Qualquer rota de API nova ou migration — 100% client-side, consumindo o que 78-8/78-9/78-14 já expõem.
- Alteração no enriquecedor (`enrich-supabase.ts`/`enrich-vercel.ts`) ou no cron `billing-subscription-enrich` — 78-14.
- Adicionar uma 4ª assinatura fixa via UI (create) — o whitelist de `PATCH` (78-14) não inclui `is_fixed_subscription`; esta story só edita linhas já semeadas.
- Qualquer alteração em `/api/admin/billing-panel/route.ts` ou `/api/admin/billing-reminders/route.ts` (GET) — a exclusão de `claude_team` do grid de uso e a exclusão das assinaturas fixas de "Próximos vencimentos" são filtros **client-side** apenas (ver Dev Notes, decisão de design).
- Conversão de moeda BRL↔USD (NFR-7 do épico, herdado).

---

## Acceptance Criteria

- [x] **AC1 — Seção "Assinaturas Fixas" lista as linhas `is_fixed_subscription=true`:** Novo componente `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscriptions.tsx`, renderizado em `page.tsx` entre a seção "Saúde dos serviços" e a seção "Próximos vencimentos". Filtra o array `reminders` (já buscado por `fetchReminders()`) por `is_fixed_subscription === true` e renderiza 1 card por linha, com: nome do serviço (via `firstService(r.platform_services)`, reuso de `shared.ts`), plano, assentos, valor mensal formatado na moeda de origem (reuso de `formatMoney`), próxima renovação (`due_date` formatada + `daysUntil`/`dueLabel`-equivalente, reuso do padrão já implementado em `upcoming-reminders.tsx`) ou "—" se `due_date === null`, e um link de deep-link para `billing_url` (`target="_blank" rel="noreferrer"`) obtido por **correlação client-side de `slug`** entre a linha do reminder (`firstService(r.platform_services)?.slug`) e o array `panel.services` (já retornado por `GET /api/admin/billing-panel`, que inclui `billing_url`/`billing_url_confirmed` por serviço) — **nenhuma chamada de API nova**.

- [x] **AC2 — Badges de fonte corretos (auto via API / manual / tabela de preços / não informado):** Para `value_source`: `null` → texto neutro "não informado" (sem badge); `'manual'` → badge "Manual"; `'api_price_table'` → badge "Tabela de preços". Para `seats_source`: `null` → "não informado"; `'manual'` → badge "Manual"; `'api'` → badge "Auto via API". Para `subscription_plan`: quando o serviço é `vercel` ou `supabase` **e** `last_enriched_at !== null`, mostrar badge "Auto via API" (valor não editável, ver AC4); em qualquer outro caso (incl. `claude_team`, ou `vercel`/`supabase` antes do 1º enriquecimento) mostrar o valor cru sem badge (ou "—" se `null`).

- [x] **AC3 — CTA "Completar cadastro" quando faltar valor ou renovação:** Todo card cuja linha tenha `due_date === null` **ou** `expected_amount === null` exibe um destaque visual (borda/badge âmbar, mesma paleta semântica de `STATUS_STYLES.no_data`/`upcoming-reminders.tsx`) com um botão "Completar cadastro" que abre o formulário de edição (AC4). Este é o estado esperado logo após a migration 78-14 aplicada, antes de qualquer enriquecimento ou edição manual — a seção deve renderizar corretamente nesse estado (3 cards, todos com CTA, sem crash).

- [x] **AC4 — Formulário de edição admin-only com regras de editabilidade corretas:** Novo componente `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscription-form.tsx`. Campos SEMPRE editáveis para qualquer assinatura: `expected_amount` (número) + `currency` (select `USD`/`BRL`), `due_date` (date), `billing_cycle` (select restrito a `monthly`/`annual` — a UI não oferece `usage`, que é irrelevante para assinatura fixa recorrente, embora o `CHECK` do banco permita), `alert_days_before` (inteiro `>= 0`), `subscription_seats` (inteiro `>= 0` ou vazio) — **exceto**: quando o serviço é `vercel` ou `supabase`, `subscription_plan` e `subscription_seats` são exibidos como informativos/somente-leitura (não há campo de formulário editável para eles), porque o enriquecedor da 78-14 sobrescreve `subscription_plan` incondicionalmente a cada ciclo (sem coluna de proteção como `value_source`/`seats_source` têm) e `subscription_seats` é o dado que o enriquecedor existe justamente para preencher automaticamente. `subscription_plan` só é campo de texto livre editável para `claude_team` (sem enriquecedor — 100% manual, 78-14 Context). O formulário só está acessível a admin (herdado — a página inteira já é admin-only desde 78-9 AC1; nenhuma nova checagem de role é necessária no client, mas o `PATCH` é protegido no servidor por `requireAuth`+`requireRole(["admin"])`, 78-8).

- [x] **AC5 — Submit envia PATCH correto e a UI reflete a mudança sem esperar o polling de 30s:** Ao salvar, chama `PATCH /api/admin/billing-reminders/{id}` (rota já existente, 78-8, estendida por 78-14 AC14) enviando **apenas os campos alterados** (payload parcial, mesmo contrato de `ReminderUpdate`/`validateUpdate`). Em caso de sucesso (`200`), a linha correspondente no estado local `reminders` é atualizada com o `data` retornado (merge por `id`, sem esperar o próximo ciclo de polling) e o formulário fecha; se a atualização incluiu `due_date` (antes `null`, agora preenchida), o card deixa de exibir o CTA "Completar cadastro" (AC3) imediatamente. Em caso de erro (`400`/`500`), o formulário permanece aberto exibindo a mensagem de erro retornada pela API, sem perder os valores digitados.

- [x] **AC6 — Total mensal por moeda, reusando a função pura da 78-14:** `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscriptions.tsx` importa `somarAssinaturasFixasPorMoeda` de `@web/lib/billing/subscription-summary` e aplica ao array de reminders filtrado por `is_fixed_subscription=true`, exibindo o resultado (formatado via `formatMoneyList`, reuso) no cabeçalho da seção — reusar a prop `meta` já suportada pelo componente `SectionHeader` local de `page.tsx` (linhas 11-21), sem inventar um novo bloco de resumo. O total exclui automaticamente (comportamento da função reusada, não reimplementado aqui): linhas com `excluded_from_subscription_total=true` (ex.: Vercel se a 78-14 confirmar overlap com o custo de uso) e linhas com `expected_amount=null`; nunca soma `USD` com `BRL` na mesma exibição.

- [x] **AC7 — Sem duplicação em "Próximos vencimentos":** `packages/web/src/app/dashboard/sistema/billing/_components/upcoming-reminders.tsx` recebe um filtro adicional `!r.is_fixed_subscription` (aplicado junto ao filtro existente de `status IN (pending, alerted)`, antes do `sort`/`daysUntil`) — uma assinatura fixa com `due_date` preenchida (após AC5) nunca aparece nessa seção, mesmo estando com `status='pending'`; ela só é visível na seção "Assinaturas Fixas" (AC1). Isso também evita, por construção, qualquer chamada de `daysUntil`/`.localeCompare` sobre um `due_date=null` nessa seção (defeito de runtime que existiria sem este filtro, já que `due_date` passa a ser nullable a partir da 78-14 AC1).

- [x] **AC8 — `claude_team` não aparece no grid "Saúde dos serviços" (evita card-zumbi de custo de uso):** Em `page.tsx`, o array `panel.services` passado para o grid de "Saúde dos serviços" é filtrado para excluir `slug === "claude_team"` antes da renderização (mesmo padrão já existente de tratamento especial de `slug === "meta_ads"`, só que aqui aplicado no client em vez de no servidor — ver Dev Notes para a justificativa de não tocar `billing-panel/route.ts`). `vercel` e `supabase` **continuam** aparecendo normalmente nesse grid com seus cards de custo de USO (distintos e complementares à sua assinatura fixa, que aparece só na nova seção).

- [x] **AC9 — Estados vazio/erro/pré-migration tratados sem crash:** Se `reminders === null` (erro de fetch — mesmo estado `remindersError` já existente em `page.tsx`), a seção "Assinaturas Fixas" reflete esse erro (reuso do mesmo tratamento, sem uma segunda mensagem de erro divergente). Se `reminders` existe mas nenhuma linha tem `is_fixed_subscription === true` (schema da 78-14 ainda não aplicado, ou a chave `is_fixed_subscription` ainda nem existe no payload — cenário "78-15 implementada antes de 78-14 estar em produção"), a seção mostra estado vazio explicativo (ex. "Nenhuma assinatura fixa cadastrada ainda") — chaves `undefined` dos 7 campos novos são tratadas como equivalentes a `null`/`false` (`r.is_fixed_subscription === true` já é `false` para `undefined`, sem exigir tratamento extra).

- [x] **AC10 — Não-admin → 403 (herdado, sem superfície nova):** Como a seção reusa os dois fetches que a página já faz (AC1) e o `PATCH` de edição usa a mesma rota admin-guardada desde 78-8, um usuário não-admin nunca alcança esta UI (a página inteira redireciona antes, 78-9 AC1) e, mesmo que chame o `PATCH` diretamente, recebe `403` (guard já existente, não modificado por esta story).

---

## Tasks / Subtasks

- [x] **T1 — Preparação** (pré-requisito de todos os ACs)
  - [x] T1.1 — Confirmar que a Story 78-14 está implementada (ao menos `InReview`) e que `packages/web/src/lib/billing/subscription-summary.ts` existe no repositório antes de iniciar; se não estiver, **não prosseguir** — escalar para @po/@sm (ver nota de sequenciamento).
  - [x] T1.2 — Reler o contrato exato dos 7 campos novos e das regras de não-sobrescrita (AC9 da 78-14) antes de desenhar o formulário.
  - [x] T1.3 — Reler `packages/web/src/app/dashboard/sistema/billing/page.tsx`, `_components/shared.ts`, `_components/service-card.tsx`, `_components/upcoming-reminders.tsx` (78-9) — padrão visual e de fetch a reusar.

- [x] **T2 — Extensão de tipos** (AC1, AC7, AC9)
  - [x] T2.1 — Em `_components/shared.ts`: `ReminderRow.due_date` passa de `string` para `string | null` (78-14 AC1); adicionar os 7 campos novos como opcionais (`is_fixed_subscription?`, `subscription_plan?`, `subscription_seats?`, `value_source?`, `seats_source?`, `excluded_from_subscription_total?`, `last_enriched_at?`) para tolerar payload antigo (AC9).
  - [x] T2.2 — Ajustar `upcoming-reminders.tsx` para o novo tipo de `due_date` (`string | null`) — ver T5.

- [x] **T3 — Componente `fixed-subscriptions.tsx`** (AC1, AC2, AC3, AC6, AC9)
  - [x] T3.1 — Filtrar `reminders` por `is_fixed_subscription === true`.
  - [x] T3.2 — Correlacionar cada linha com `panel.services` por `slug` (via `firstService`) para obter `billing_url`/`billing_url_confirmed`.
  - [x] T3.3 — Renderizar cards com badges de fonte (AC2) e CTA condicional (AC3).
  - [x] T3.4 — Calcular e exibir o total (AC6) via `somarAssinaturasFixasPorMoeda` + `formatMoneyList`, usando a prop `meta` de `SectionHeader`.
  - [x] T3.5 — Estado vazio/erro (AC9).

- [x] **T4 — Componente `fixed-subscription-form.tsx`** (AC3, AC4, AC5)
  - [x] T4.1 — Formulário controlado com os campos da AC4, `subscription_plan`/`subscription_seats` condicionalmente somente-leitura para `vercel`/`supabase`.
  - [x] T4.2 — Conversão de tipos antes do `PATCH`: `expected_amount`/`subscription_seats` precisam ser enviados como `number` (não `string`) — `validateUpdate` (78-14) rejeita com `400` se vier string (ver Dev Notes).
  - [x] T4.3 — `onSubmit` monta payload só com campos alterados, chama `PATCH`, trata sucesso (merge por `id`, fecha formulário) e erro (mantém formulário aberto + mensagem).
  - [x] T4.4 — Labels associados (`htmlFor`/`id`) e formulário fechável via botão "Cancelar" (acessibilidade — `accessibility_check`).

- [x] **T5 — Dedup "Próximos vencimentos"** (AC7)
  - [x] T5.1 — Adicionar filtro `!r.is_fixed_subscription` em `upcoming-reminders.tsx`, antes do `sort`/`daysUntil`.
  - [x] T5.2 — Confirmar que `daysUntil`/`.localeCompare` só recebem `due_date` não-nulo após o filtro (ajuste de tipo/type guard conforme T2.2).

- [x] **T6 — Dedup "Saúde dos serviços"** (AC8)
  - [x] T6.1 — Em `page.tsx`, filtrar `panel.services` para excluir `slug === "claude_team"` antes de passar para o grid existente.

- [x] **T7 — Wiring em `page.tsx`** (AC1, AC5, AC6)
  - [x] T7.1 — Importar e renderizar `<FixedSubscriptions reminders={reminders} panelServices={panel?.services ?? []} errored={remindersError} onUpdated={...} />` entre "Saúde dos serviços" e "Próximos vencimentos".
  - [x] T7.2 — Implementar o callback de merge local (`onUpdated`) que atualiza `reminders` por `id` sem novo fetch (AC5).

- [ ] **T8 — Validação manual em DEV** (todos os ACs)
  - [ ] T8.1 — Confirmar as 3 assinaturas aparecem com CTA "Completar cadastro" logo após a migration 78-14 aplicada (pré-enriquecimento).
  - [ ] T8.2 — Preencher manualmente `expected_amount`+`due_date` da Claude Team → confirmar CTA some, total (AC6) atualiza sem reload.
  - [ ] T8.3 — Rodar o cron de enriquecimento (78-14) → confirmar `subscription_plan`/`subscription_seats` de Vercel/Supabase aparecem como somente-leitura com badge "Auto via API".
  - [ ] T8.4 — Confirmar `claude_team` não aparece em "Saúde dos serviços" e a assinatura fixa (após due_date preenchida) não aparece em "Próximos vencimentos".
  - [ ] T8.5 — Testar como não-admin: página redireciona antes de qualquer chamada (herdado 78-9).

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscriptions.tsx`
- `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscription-form.tsx`

### Arquivos a editar
- `packages/web/src/app/dashboard/sistema/billing/_components/shared.ts` — extensão de `ReminderRow` (T2.1)
- `packages/web/src/app/dashboard/sistema/billing/_components/upcoming-reminders.tsx` — filtro de dedup (T5)
- `packages/web/src/app/dashboard/sistema/billing/page.tsx` — import, render, filtro de dedup do grid de uso, callback de merge (T6, T7)

### Arquivos NÃO tocados por esta story (confirmar antes de editar por engano)
- `packages/web/src/app/api/admin/billing-panel/route.ts` — nenhuma mudança; a exclusão de `claude_team` do grid é **client-side** (ver decisão de design abaixo).
- `packages/web/src/app/api/admin/billing-reminders/route.ts` (GET) e `[id]/route.ts` (PATCH) — já estendidos pela 78-14 (AC13/AC14); esta story só **consome**.
- `packages/web/src/lib/billing/subscriptions/*` e `subscription-summary.ts` — criados pela 78-14; esta story só importa `somarAssinaturasFixasPorMoeda`.
- `packages/web/src/lib/billing/reminder-schedule.ts`/`reminder-validation.ts` — não modificados; `service-card.tsx`/`meta-ads-section.tsx` (78-9) — não modificados.

### Decisão de design — por que NÃO tocar `billing-panel/route.ts` para excluir `claude_team`
`GET /api/admin/billing-panel` já retorna `claude_team` dentro de `services` (porque a 78-14 semeia `enabled=true` para ele, AC2 daquela story, e a rota da 78-9 seleciona genericamente `WHERE enabled=true`). Sem tratamento, `claude_team` apareceria como um card "Sem dado" eterno no grid de custo de uso (ele nunca terá `service_cost_snapshots`, pois `has_auto_cost_collection=false`). Duas opções foram avaliadas (IDS REUSE > ADAPT > CREATE):
1. **ADAPT `billing-panel/route.ts`** (replicar o `if (svc.slug === "meta_ads") {...} else {...}` já existente para também separar `claude_team`) — tecnicamente mais "correto" (dado nunca sai do servidor incorreto), mas exigiria decidir onde colocar o `claude_team` separado na resposta (um 3º campo? dentro de um array genérico de "fixas"?) — over-engineering para o que é, na prática, um filtro de exibição.
2. **Filtro client-side** (escolhido) — `page.tsx` já recebe `panel.services` completo; um `.filter(s => s.slug !== "claude_team")` na hora de montar o grid é suficiente, não introduz superfície de API nova, e mantém `billing-panel/route.ts` (78-9, já `InReview`) intocado. O mesmo `panel.services` (não filtrado) é reusado por `fixed-subscriptions.tsx` para obter o `billing_url` de `claude_team`/`vercel`/`supabase` (AC1) — então o dado "extra" de `claude_team` em `panel.services` não é desperdiçado, é a fonte do deep-link.

`evaluated_patterns`: extensão de `billing-panel/route.ts` (padrão `meta_ads`). `rejection_reasons`: exigiria decidir um novo formato de resposta de API só para resolver um filtro de exibição; o filtro client-side é mais barato e não deixa nenhuma superfície nova para o QA gate revisar. `new_capability`: nenhuma — é apenas onde o dado já existente é consumido.

### Regras de editabilidade do formulário (AC4) — resumo
| Campo | `claude_team` | `vercel` / `supabase` |
|---|---|---|
| `expected_amount` + `currency` | editável | editável |
| `due_date` | editável | editável |
| `billing_cycle` (select monthly/annual) | editável | editável |
| `alert_days_before` | editável | editável |
| `subscription_seats` | editável | **somente-leitura** (badge de fonte, AC2) |
| `subscription_plan` | editável (texto livre) | **somente-leitura** (badge de fonte, AC2) |

Motivo da assimetria (78-14 Dev Notes, AC9): `expected_amount`/`subscription_seats` têm colunas de proteção (`value_source`/`seats_source`) que impedem o enriquecedor de sobrescrever um valor editado manualmente — então, tecnicamente, `subscription_seats` de Vercel/Supabase **poderia** ser editado com segurança (a próxima edição marcaria `seats_source='manual'` e ficaria protegida). Mas `subscription_plan` **não tem** essa proteção (nenhuma coluna `plan_source` existe no schema da 78-14) — o enriquecedor sobrescreve `subscription_plan` incondicionalmente a cada ciclo, então um valor editado manualmente ali seria silenciosamente perdido no dia seguinte. Para não criar essa armadilha assimétrica (editável mas não confiável), esta story trata `subscription_plan` **e** `subscription_seats` como o par informativo "auto-gerenciado" para os serviços com enriquecedor (`vercel`/`supabase`), reservando edição manual real só para `claude_team` (sem enriquecedor nenhum) — coerente com o pedido original do usuário ("valor/assentos/renovação do Claude Team, e o dia de renovação de Vercel/Supabase").

### Contrato de dados consumido (78-14, referência exata)
- `GET /api/admin/billing-reminders` (já buscado por `page.tsx`, `fetchReminders()`) retorna, por linha, os campos herdados de 78-8 **mais** (78-14 AC13): `is_fixed_subscription`, `subscription_plan`, `subscription_seats`, `value_source` (`'api_price_table' | 'manual' | null`), `seats_source` (`'api' | 'manual' | null`), `excluded_from_subscription_total`, `last_enriched_at`.
- `PATCH /api/admin/billing-reminders/{id}` (78-14 AC14) aceita, além dos campos já existentes (78-8), `subscription_plan` (string ou `null`) e `subscription_seats` (inteiro `>= 0` ou `null`); se o payload contém `expected_amount`, a resposta reflete `value_source: 'manual'`; se contém `subscription_seats`, reflete `seats_source: 'manual'`. **Não** aceita `is_fixed_subscription`/`excluded_from_subscription_total` (fora do whitelist — Scope OUT da 78-14, não tentar editar esses campos nesta story).
- `somarAssinaturasFixasPorMoeda(rows)` (`@web/lib/billing/subscription-summary`, 78-14 AC6) — função pura, sem I/O, soma `expected_amount` por `currency` filtrando `is_fixed_subscription=true AND excluded_from_subscription_total=false`, ignorando `expected_amount=null`. **Cuidado de tipo:** o `ReminderRow` do client (`expected_amount: number | string | null`, herdado de 78-9) pode não bater 1:1 estruturalmente com o parâmetro esperado pela função (que provavelmente tipa `expected_amount` como `number | null`, já que vem direto de uma query server-side); se o TS reclamar, fazer um mapeamento leve (`Number(r.expected_amount)`) antes de chamar a função — não duplicar a lógica de soma.
- `GET /api/admin/billing-panel` (já buscado por `page.tsx`, `fetchPanel()`) — `panel.services: ServiceSummary[]` inclui `slug`, `billing_url`, `billing_url_confirmed` para todo `platform_services.enabled=true`, incluindo `claude_team`/`vercel`/`supabase` — fonte do deep-link (AC1), sem chamada nova.

### Conversão numérica no formulário (armadilha conhecida)
`expected_amount`/`subscription_seats` no payload do `PATCH` **devem** ser `number`, não `string` — `validateUpdate` (78-14, espelhando `reminder-validation.ts` já existente) rejeita com `400 "expected_amount deve ser um número"` se receber uma string (ex. valor cru de um `<input type="number">` sem `Number(...)` explícito, ou `event.target.value` sem conversão). Mesmo cuidado que qualquer formulário HTML padrão do projeto — não é uma regra nova desta story, só um lembrete porque é a primeira vez que este formulário específico é escrito.

### Padrão de UI a REUSAR (evidência concreta, mesmo padrão da 78-9 — não inventar novo design system)
- Classe de card padrão: `"rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"` (repetida em `service-card.tsx`/`upcoming-reminders.tsx`/`meta-ads-section.tsx`) — usar literalmente para os novos cards.
- `SectionHeader({icon, title, meta})` já definido localmente em `page.tsx` (linhas 11-21) — a prop `meta` (texto à direita do título) é o lugar certo para o total (AC6), sem inventar um bloco de resumo novo.
- Paleta semântica: `emerald`/`blue`/`amber`/`red` (`STATUS_STYLES` em `shared.ts`) para os badges de fonte (AC2) e destaque de CTA (AC3) — reusar as mesmas classes Tailwind já em uso, não inventar cores novas.
- Sem shadcn/ui (confirmado na 78-9) — Tailwind puro, formulário em HTML nativo controlado por `useState`.
- Botão/link de deep-link: mesmo padrão `text-[#E8856A] hover:underline` + `<ExternalLink className="h-3 w-3" />` de `service-card.tsx`.

### Testing Standards
- Sem suíte de testes automatizados de UI/E2E no projeto para páginas admin equivalentes (mesmo padrão observado em `dashboard/sistema/*` e confirmado pela 78-9) — validação é manual (T8).
- Não inventar testes Playwright/Jest que não existem como padrão estabelecido nesta área do projeto.

---

## Testing

### Abordagem
- Validação manual em DEV, logado como admin, **após** a migration/seed da 78-14 estar aplicada.
- Sem migration nesta story — depende apenas de 78-14 já aplicada (schema + seed) e 78-9 já implementada (base da página).

### Cenários de teste
1. **3 assinaturas aparecem com CTA:** logo após a migration 78-14 (pré-enriquecimento), a seção mostra 3 cards (Claude Team, Vercel, Supabase), todos com CTA "Completar cadastro" (`due_date=null`).
2. **Completar cadastro da Claude Team:** preencher `expected_amount`, `currency`, `due_date`, `billing_cycle`, `alert_days_before`, `subscription_plan`, `subscription_seats` (todos editáveis para este slug) → salvar → CTA some, card reflete os novos valores sem reload, total (AC6) atualiza.
3. **Vercel/Supabase pós-enriquecimento:** após o cron de 78-14 rodar, `subscription_plan`/`subscription_seats` aparecem como texto informativo com badge "Auto via API", **sem** campo de formulário editável para eles; `expected_amount`/`due_date` continuam editáveis normalmente.
4. **Edição não sobrescrita:** editar manualmente `expected_amount` de uma assinatura já enriquecida → salvar → rodar o enriquecedor de novo (fora desta story, mas observável) → valor manual permanece (comportamento da 78-14, esta story só precisa não quebrar isso).
5. **Erro de validação:** tentar salvar com `expected_amount` inválido (ex. campo vazio tratado como string) → API retorna `400` → formulário permanece aberto com mensagem de erro, valores digitados preservados.
6. **Sem duplicação em "Próximos vencimentos":** após completar o cadastro de uma assinatura fixa (due_date preenchida), ela **não** aparece na seção "Próximos vencimentos" — só na seção "Assinaturas Fixas".
7. **Sem duplicação em "Saúde dos serviços":** `claude_team` nunca aparece no grid de cards de custo de uso, mesmo com `enabled=true`; `vercel`/`supabase` continuam aparecendo lá normalmente (com seus dados de custo de USO, independentes da assinatura fixa).
8. **Total por moeda:** com Claude Team em `USD` e uma assinatura hipotética de teste em `BRL` (inserida via SQL), o total exibe os dois valores separadamente, nunca somados.
9. **Estado vazio pré-78-14:** simular payload sem os 7 campos novos (ex. mockar resposta antiga) → seção mostra "Nenhuma assinatura fixa cadastrada ainda", sem crash.
10. **Não-admin:** usuário não-admin não alcança a página (redirect herdado da 78-9); tentativa direta de `PATCH` retorna `403`.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Iniciar `*develop` antes de 78-14 estar implementada, quebrando o build por import inexistente (`subscription-summary.ts`) | Alta (se ignorado) | Nota de sequenciamento explícita no topo da story + T1.1 bloqueante |
| R2 | Editar `subscription_plan`/`subscription_seats` de Vercel/Supabase como se fossem seguros, criando a "armadilha de sobrescrita silenciosa" (sem `plan_source`) | Média | AC4 e Dev Notes documentam a assimetria explicitamente, com tabela de editabilidade por campo/serviço |
| R3 | Reimplementar a soma por moeda em vez de reusar `somarAssinaturasFixasPorMoeda`, divergindo da lógica já testada (Vitest) da 78-14 | Média (correção financeira) | AC6 exige reuso explícito da função; Dev Notes alerta sobre possível ajuste de tipo, não de lógica |
| R4 | Duplicar a exibição de uma assinatura fixa em "Próximos vencimentos" depois que `due_date` for preenchida | Média (confusão de UX) | AC7 é Acceptance Criteria própria, com cenário de teste dedicado (#6) |
| R5 | `claude_team` aparecer como card "Sem dado" eterno em "Saúde dos serviços", confundindo o usuário sobre por que um serviço sem coleta de uso está ali | Baixa/Média | AC8 + decisão de design documentada (filtro client-side, não toca a rota da 78-9) |
| R6 | Enviar `expected_amount`/`subscription_seats` como string no payload do `PATCH`, causando `400` silencioso ou mal tratado no formulário | Baixa | Dev Notes documenta a armadilha explicitamente (T4.2); AC5 exige tratamento de erro sem perder os valores digitados |

---

## Dependencies

- **Depende de (bloqueante, compilação):** Story 78-14 (Draft nesta data — precisa estar ao menos `InReview` com `subscription-summary.ts` e a extensão de `GET`/`PATCH` já implementadas antes do `*develop` desta story).
- **Depende de (base visual/estrutural):** Story 78-9 (`InReview` — página, `shared.ts`, `service-card.tsx`, `upcoming-reminders.tsx`, `SectionHeader`, os 2 fetches já existentes).
- **Reusa integralmente (sem modificar):** Story 78-8 (rota `PATCH /api/admin/billing-reminders/[id]`, guard admin), Story 78-11 (motor de lembretes — a linha passa a ser considerada automaticamente assim que `due_date` é preenchida, sem nenhuma mudança nesta story).
- **Bloqueia:** nenhuma story conhecida do épico.
- **Dependências técnicas:**
  - `packages/web/src/lib/billing/subscription-summary.ts` (`somarAssinaturasFixasPorMoeda`, 78-14)
  - `packages/web/src/app/api/admin/billing-reminders/route.ts` (GET, estendido por 78-14)
  - `packages/web/src/app/api/admin/billing-reminders/[id]/route.ts` (PATCH, estendido por 78-14)
  - `packages/web/src/app/api/admin/billing-panel/route.ts` (GET, 78-9, não modificado — fonte do `billing_url`)
  - `packages/web/src/app/dashboard/sistema/billing/page.tsx` + `_components/shared.ts` + `_components/upcoming-reminders.tsx` (78-9)

---

## Definition of Done

- [x] `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscriptions.tsx` e `fixed-subscription-form.tsx` criados
- [x] `_components/shared.ts` estendido (`ReminderRow` com os 7 campos novos + `due_date` nullable)
- [x] `_components/upcoming-reminders.tsx` filtra `is_fixed_subscription=true` (AC7)
- [x] `page.tsx` filtra `claude_team` do grid de uso (AC8), renderiza a nova seção, implementa merge local pós-`PATCH` (AC5)
- [x] Total mensal por moeda reusa `somarAssinaturasFixasPorMoeda` (AC6), sem reimplementação
- [x] Formulário respeita a assimetria de editabilidade documentada (AC4) — `subscription_plan`/`subscription_seats` somente-leitura para Vercel/Supabase
- [x] CTA "Completar cadastro" funcional (AC3), estados vazio/erro tratados (AC9)
- [x] `tsc`/`eslint` limpos nos arquivos desta story (4 erros pré-existentes, alheios: react-email-editor, pdf-lib)
- [ ] Validado manualmente em DEV (T8) — pendente @qa/usuário
- [ ] @dev executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente, mesmo estado observado nas demais stories do Epic 78).
> Validação de qualidade usará processo de revisão manual pelo @dev (quality gate desta story, mesmo mapping usado pela story-irmã de UI do épico — 78-9).

**Story Type Analysis (para referência futura, caso CodeRabbit seja habilitado):**
- **Primary Type:** Frontend (novos componentes de apresentação + formulário controlado, extensão de tipos client-side)
- **Secondary Type:** Integration (reuso de função pura server-side `somarAssinaturasFixasPorMoeda` em contexto client; consumo de contrato de API estendido pela 78-14)
- **Complexity:** Medium (0 rotas/migration novas, mas 2 pontos de dedup entre seções existentes + assimetria de editabilidade a não confundir)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-14 | 1.0 | **@dev (Dex) implementação — Status Ready → InReview.** Todos os 10 ACs implementados sobre o backend da 78-14 (já no working tree). 3 arquivos criados (`fixed-subscriptions.tsx`, `fixed-subscription-form.tsx`, `section-header.tsx`), 3 editados (`page.tsx`, `shared.ts`, `upcoming-reminders.tsx`). Seção "Assinaturas Fixas" entre "Saúde dos serviços" e "Próximos vencimentos", com total mensal por moeda via `somarAssinaturasFixasPorMoeda` (reuso, sem reimplementar — AC6), badges de fonte (AC2), CTA "Completar cadastro" (AC3), formulário com assimetria de editabilidade `claude_team` vs `vercel/supabase` (AC4), merge local pós-PATCH sem esperar polling (AC5), dedup em "Próximos vencimentos" (`!is_fixed_subscription`, AC7) e em "Saúde dos serviços" (filtro client-side de `claude_team`, AC8). `type-check`/`eslint` limpos nos arquivos da story (4 erros pré-existentes alheios). Decisão-chave: `SectionHeader` extraído para módulo próprio (evita ciclo `page.tsx` ⇄ `fixed-subscriptions.tsx`). T8 (validação manual em DEV) pendente @qa/usuário. | @dev (Dex) |
| 2026-07-14 | 0.2 | **@po (Pax) validação GO — Status Draft → Ready.** Score 9.5/10. Checklist de 10 pontos aprovado. Alegações técnicas verificadas contra o código real: (a) `GET /api/admin/billing-reminders` (L26-28) NÃO seleciona os 7 campos novos hoje → AC13 da 78-14 é pré-requisito real desta UI; (b) `upcoming-reminders.tsx` L44 faz `a.due_date.localeCompare(...)` e L58 `daysUntil(r.due_date)` — quebrariam com `due_date=null` (nullable a partir da 78-14 AC1); o filtro `!r.is_fixed_subscription` da AC7 remove exatamente as linhas de due_date nulo antes do sort, prevenindo o crash; (c) `shared.ts` L33 tem `due_date: string` e `ReminderRow` sem os 7 campos → T2.1 os estende corretamente; helpers citados (`firstService`, `formatMoney`, `formatMoneyList`, `daysUntil`, `STATUS_STYLES`) e `SectionHeader({meta})` (page.tsx L11) confirmados existentes; (d) `subscription-summary.ts`/`lib/billing/subscriptions/` confirmados INEXISTENTES no repo nesta data → dependência de compilação com a 78-14 é real; sequenciamento 78-14 antes de 78-15 é MANDATÓRIO (78-14 ao menos InReview). **Correção aplicada:** typo de referência cruzada "79-14" → "78-14" no cabeçalho da seção "Contrato de dados consumido" (L161). Nenhum outro defeito. | @po (Pax) | [AUTO-DECISION] Nenhuma rota de API nova/migration → reason: os dois fetches que a página `/dashboard/sistema/billing` já faz (`billing-panel`, `billing-reminders`) já contêm todo o dado necessário (billing_url via correlação client-side de slug com `panel.services`; os 7 campos novos via 78-14 AC13) — introduzir uma 3ª chamada ou uma rota agregadora seria duplicação evitável (REUSE > CREATE). [AUTO-DECISION] Exclusão de `claude_team` do grid "Saúde dos serviços" feita **client-side** em `page.tsx`, não em `billing-panel/route.ts` → reason: evita reabrir/expandir o contrato de resposta de uma rota já `InReview` (78-9) só para resolver um filtro de exibição; `panel.services` não filtrado continua sendo a fonte do `billing_url` de `claude_team` na nova seção, então nada é desperdiçado. [AUTO-DECISION] `subscription_plan` E `subscription_seats` tratados como somente-leitura/informativos para `vercel`/`supabase` (não só `subscription_plan`) → reason: embora `subscription_seats` tenha coluna de proteção (`seats_source`) que tecnicamente permitiria edição segura, a 78-14 não criou proteção equivalente para `subscription_plan` (sem `plan_source`) — tratar os dois campos de forma assimétrica (um editável, um não, para o mesmo par plano+assentos "auto-gerenciados") criaria uma UI inconsistente; a decisão do usuário no pedido original ("plano/assentos do Supabase/Vercel" como auto-preenchidos read-only) já apontava para os dois juntos. [AUTO-DECISION] Assinaturas fixas removidas de "Próximos vencimentos" (AC7) mesmo após `due_date` preenchida → reason: evita exibição duplicada da mesma informação em 2 seções da mesma página, e evita por construção qualquer chamada de `daysUntil`/`.localeCompare` sobre `due_date=null` num componente (`upcoming-reminders.tsx`) que não foi desenhado para tolerar isso. [AUTO-DECISION] Dependência de 78-14 tratada como bloqueante de `*develop` (não apenas de dado, como a 78-9 tratou a 78-8) → reason: esta story importa uma função (`somarAssinaturasFixasPorMoeda`) que ainda não existe no repositório nesta data — é uma dependência de compilação, não contornável com um estado "vazio" como a 78-9 fez com `404`. [AUTO-DECISION] Executor @ux-design-expert / Quality Gate @dev → reason: mesmo mapping da story-irmã de UI do épico (78-9), consistente com a natureza desta story (componentes de apresentação + formulário, sem schema/migration). | @sm (River) |

---

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — @dev (Dex), modo autônomo YOLO.

### Debug Log References
- `npm run type-check` (packages/web): apenas os 4 erros pré-existentes/alheios à story
  (`react-email-editor` x3, `pdf-lib` x1). Nenhum erro nos arquivos desta story.
- `npx eslint` nos 6 arquivos tocados: 0 erros / 0 warnings.

### Completion Notes List
- **IDS — REUSE dominante.** Reusados sem modificar: `formatMoney`, `formatMoneyList`, `daysUntil`,
  `firstService`, `STATUS_STYLES` (`shared.ts`); classe de card padrão; padrão de deep-link
  (`text-[#E8856A]` + `<ExternalLink/>`) de `service-card.tsx`; `somarAssinaturasFixasPorMoeda`
  (78-14, sem reimplementar a soma — AC6); rotas `GET`/`PATCH` (78-14, só consumidas).
- **IDS — CREATE justificado.** `fixed-subscriptions.tsx` e `fixed-subscription-form.tsx` (mandados
  pela story; sem equivalente reutilizável). `section-header.tsx`: **extração** do `SectionHeader`
  que era local (não exportado) em `page.tsx`.
- **[AUTO-DECISION] Extrair `SectionHeader` de `page.tsx` para `_components/section-header.tsx`**
  em vez de exportá-lo do próprio `page.tsx` → reason: importar um named export de volta de um
  arquivo de rota `page.tsx` criaria um ciclo de módulo (`page.tsx` ⇄ `fixed-subscriptions.tsx`) e,
  neste Next.js (ver `packages/web/AGENTS.md` — "not the Next.js you know"), exports não-reservados
  em arquivos de página podem ter tratamento especial. A extração é REUSE limpo, sem ciclo e sem
  acoplamento ao arquivo de rota; `page.tsx` passa a importar do mesmo módulo. A prop `meta` (AC6)
  segue sendo o local do total — comportamento idêntico ao pedido pela story.
- **[AUTO-DECISION] Badge "não informado"** exibido só quando o dado E a fonte são ambos nulos
  (`expected_amount == null && value_source == null`; idem seats) → reason: evita a UI contraditória
  de mostrar um valor real ao lado de "não informado"; cobre o cenário principal da AC2/AC3
  (seed pré-enriquecimento, tudo nulo). Badges "Manual"/"Auto via API"/"Tabela de preços" seguem a
  AC2 literalmente.
- **[AUTO-DECISION] `billing_cycle` comparado ao valor cru** (não ao normalizado) no diff do PATCH →
  reason: se o seed vier com `usage`, salvar corrige para `monthly`/`annual` (a UI não oferece
  `usage` para assinatura fixa recorrente, AC4).
- **due_date não é enviado como `null` no PATCH** (o whitelist da 78-14 não aceita `due_date: null`):
  o form só inclui `due_date` quando preenchido; limpar o campo não tenta anular no servidor.
- Testing: sem suíte de UI/E2E nesta área (padrão da 78-9 — Testing Standards); validação T8 é
  manual, pendente @qa/usuário.

### File List
**Criados:**
- `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscriptions.tsx`
- `packages/web/src/app/dashboard/sistema/billing/_components/fixed-subscription-form.tsx`
- `packages/web/src/app/dashboard/sistema/billing/_components/section-header.tsx` (extração do `SectionHeader`)

**Editados:**
- `packages/web/src/app/dashboard/sistema/billing/page.tsx` — import/render da nova seção, filtro `claude_team` do grid (AC8), callback de merge local pós-PATCH (AC5), `SectionHeader` movido para módulo próprio
- `packages/web/src/app/dashboard/sistema/billing/_components/shared.ts` — `ReminderRow.due_date` nullable + 7 campos de assinatura fixa opcionais + tipos `ValueSource`/`SeatsSource` (T2.1)
- `packages/web/src/app/dashboard/sistema/billing/_components/upcoming-reminders.tsx` — filtro `!is_fixed_subscription` + guard `due_date != null` (AC7/T5)

---

## QA Results

### Review Date: 2026-07-14

### Reviewed By: Quinn (Test Architect & Quality Advisor)

### Escopo da revisão
Revisão estática cuidadosa (7 quality checks) dos 3 arquivos criados (`fixed-subscriptions.tsx`, `fixed-subscription-form.tsx`, `section-header.tsx`) e 3 editados (`page.tsx`, `_components/shared.ts`, `_components/upcoming-reminders.tsx`), cruzada com o backend consumido da 78-14 já no working tree (`subscription-summary.ts`, `GET`/`PATCH /api/admin/billing-reminders`, `reminder-validation.ts`). Sem aplicar em banco, sem commit/push. Validação funcional em browser (renderização real) deferida ao deploy.

### Traceability AC → evidência
| AC | Status | Evidência |
|----|--------|-----------|
| AC1 | MET | `fixed-subscriptions.tsx` L123 `filter(is_fixed_subscription===true)`; renderizada em `page.tsx` L174 entre "Saúde dos serviços" e "Próximos vencimentos"; card com nome/plano/assentos/valor/renovação + deep-link `billing_url` via `panelBySlug` (`target=_blank rel=noreferrer`). |
| AC2 | MET | `value_source`: `api_price_table`→"Tabela de preços", `manual`→"Manual", ambos-null→`NotInformed`; `seats_source`: `api`→"Auto via API", `manual`→"Manual"; `subscription_plan` badge auto só p/ vercel/supabase com `last_enriched_at != null` (`planAuto` L153). |
| AC3 | MET | `needsSetup = due_date==null \|\| expected_amount==null` (L148) → borda âmbar + CTA "Completar cadastro" (L219-234). |
| AC4 | MET | Assimetria correta: `isEnriched`(vercel/supabase)→`seats`/`plan` somente-leitura; `planEditable=claude_team`; amount/currency/due_date/cycle(monthly\|annual)/alert_days sempre editáveis. |
| AC5 | MET | Payload parcial só de campos alterados; `Number()` em amount/alertDays/seats (não string); 200→merge por `id` (`{...r,...updated}` preserva `platform_services` ausente no `select` do PATCH); erro→form aberto + msg, valores preservados. |
| AC6 | MET | Importa e chama `somarAssinaturasFixasPorMoeda` (não reimplementa); agrupa por moeda, ignora `excluded_from_subscription_total` e `expected_amount=null`; nunca soma USD+BRL; total no `meta` do `SectionHeader`. |
| AC7 | MET | `upcoming-reminders.tsx` L45-51 `filter(!is_fixed_subscription && due_date!=null)` antes de `sort`/`localeCompare`/`daysUntil` — previne crash com `due_date` null. |
| AC8 | MET | `page.tsx` L155/L161 `filter(slug!=="claude_team")`; vercel/supabase permanecem; filtro client-side, `billing-panel/route.ts` intocado. |
| AC9 | MET | Estados errored/vazio tratados; campos opcionais `undefined` tratados como null/false (`shared.ts` L52-58); funciona pré-enricher. |
| AC10 | MET | Herdado: page redireciona em 401/403; PATCH `requireAuth`+`requireRole(["admin"])`; rota não modificada. |

### 7 Quality Checks
- **Code review:** PASS — Tailwind puro, HTML nativo controlado; extração de `section-header.tsx` quebra corretamente o ciclo de import `page.tsx` ⇄ `fixed-subscriptions.tsx`.
- **Unit tests:** N/A — sem suíte de UI/E2E nesta área (padrão 78-9); a função de soma tem teste próprio na 78-14.
- **Acceptance criteria:** PASS — 10/10 verificados estaticamente.
- **No regressions:** PASS — `upcoming-reminders` reforçado (guard `due_date` null); rotas GET/PATCH intocadas; merge preserva `platform_services`.
- **Performance:** PASS — correlação client-side O(n) via `Map`; zero chamadas de API novas.
- **Security:** PASS — PATCH admin-guardado; `value_source`/`seats_source` derivados no servidor (não crus); deep-link `rel=noreferrer`; sem injeção.
- **Documentation:** PASS — File List / Dev Notes / Change Log completos.

### Lint / Type-check
- `npm run type-check` (packages/web): **limpo nos 6 arquivos da story**; apenas os 4 erros pré-existentes alheios (`react-email-editor` x3, `pdf-lib` x1).
- `npx eslint` nos 6 arquivos: **exit 0 / 0 erros / 0 warnings**.

### Observações (não bloqueantes)
- **T8 (validação manual em DEV / browser)** deferida ao deploy — requer 78-14 aplicada (schema+seed) e login admin. Não é FAIL.
- `billing_cycle` é normalizado silenciosamente para `monthly` em qualquer save quando o valor cru for `usage` (AUTO-DECISION documentada, intencional — a UI não oferece `usage` para assinatura recorrente). Baixo impacto.

### Gate Status

Gate: PASS → docs/qa/gates/78.15-ui-assinaturas-fixas.yml

### Recommended Status
**✅ Ready for Done** (após validação manual T8 em DEV e push por @devops). Sem issues bloqueantes. Alterações de código, se houver, são do @dev — nenhuma requerida por esta revisão.

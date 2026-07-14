# Story 78-14 — Assinaturas Fixas (Backend): modelo de dados + enriquecimento via API

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-14
- **Status:** InReview
- **Priority:** P2 — completa a visão de custo do épico com uma categoria que faltava (valor FIXO mensal de assinatura), distinta do custo de USO variável já coletado por 78-3/78-5/78-6/78-7
- **Complexity:** L (migration aditiva com ALTER em coluna existente + 1 catálogo novo + 2 enriquecedores via API + 1 cron novo + 3 rotas existentes modificadas + correção de um risco de runtime no cron da 78-11 + testes unitários novos; ~10-14h)
- **Created:** 2026-07-14
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[schema_migration_review, contract_boundary_review, double_counting_risk_review, manual_override_invariant_check, cron_auth_review]`

> Story fora da decomposição original do Epic 78 (§7) — pedido direto do usuário em 2026-07-14, identificando uma segunda categoria de custo (assinaturas de valor FIXO mensal: Claude Team, Vercel Pro, Supabase Pro) distinta do custo de USO variável que 78-3/78-5/78-7 já coletam. Mapping de executor/quality gate segue o mesmo padrão das demais stories de schema+cron do épico (78-11/78-12/78-13: @dev / @architect).

---

## User Story

**Como** Trifold CRM (plataforma),
**Quero** um modelo de dados e um enriquecedor de dados que rastreiem o valor e a renovação de assinaturas de valor **FIXO** mensal (Claude Team, Vercel Pro, Supabase Pro) — preenchendo automaticamente o que a API de cada fornecedor permite (assentos, plano) e deixando claramente sinalizado o que só pode ser cadastrado manualmente (valor da Claude Team, todas as datas de renovação) —
**Para que** o Painel de Saúde & Billing tenha uma categoria de custo "Assinaturas Fixas" somável separadamente do custo de USO variável já coletado, sem duplicar contagem (em especial no caso da Vercel, cuja mensalidade Pro pode já estar embutida no custo de uso coletado pela Story 78-5) e sem exigir cadastro manual repetido do que a própria API já sabe responder.

---

## Context

O Epic 78 já resolve **custo de USO variável** (Anthropic/OpenAI/Vercel/WhatsApp cobrados por consumo, coletados automaticamente pelos coletores 78-3/78-4/78-5/78-6; Supabase/Resend com uso técnico via 78-7) e **vencimentos manuais genéricos** (78-8/78-11, motor de lembretes com escalonamento). O que faltava — identificado pelo usuário nesta sessão — é uma terceira categoria conceitualmente diferente: **assinaturas de valor FIXO mensal** que a organização já paga independentemente do uso (o "seat" da Claude Team, o plano Pro da Vercel, o plano Pro do Supabase). Hoje nada no épico distingue "isto é uma assinatura fixa recorrente" de "isto é um vencimento manual avulso qualquer" — ambos usariam a mesma tabela `service_billing_reminders` sem nenhuma marcação, e nenhum dado de assentos/plano é auto-preenchido.

**Descoberta de API (factual, base desta story — não inventar além disso):**
- **Vercel:** `GET /v1/billing/charges` (FOCUS, já consumido pelo coletor da 78-5) **provavelmente já inclui** a cobrança fixa do plano Pro dentro do `ChargeCategory` (`Purchase`/`Adjustment`/`Credit`/`Tax`/`Usage`) — mas isso **não está confirmado** por nenhum exemplo concreto na doc oficial; `vercelCollector` (78-5) hoje **soma tudo** num único `cost_usd` diário, sem distinguir categorias. Risco real de **dupla contagem** se esta story também somar a mensalidade Pro separadamente. Nº de assentos: `GET /v2/teams/{teamId}/members`.
- **Supabase:** `GET /v1/organizations/{slug}` retorna `plan` (`free|pro|team|enterprise|platform` — **confirmado empiricamente na Story 78-7**, ver Completion Notes daquela story). O valor fixo (US$25/mês no plano `pro`) **não vem por API** — deriva de tabela de preços conhecida a partir do `plan`. Data de renovação **não existe** em nenhum endpoint — cadastro único.
- **Claude Team (claude.ai):** **sem API pública nenhuma** (billing separado da Admin API de uso/custo já usada pela 78-3). Plano, assentos, valor e data de renovação são **100% cadastro manual**.

---

## Scope

### IN (esta story entrega)

- **Migration aditiva** estendendo `service_billing_reminders` com 6 colunas novas + relaxando `due_date` para nullable (AC1).
- **1 catálogo novo** em `platform_services` (`claude_team`) — Vercel e Supabase **reusam** o `service_id` já seedado na 78-1, sem catálogo duplicado (AC2).
- **Seed de 3 linhas** "assinatura fixa" em `service_billing_reminders`, com valores manuais nulos até o preenchimento via UI (Story 78-15) (AC4).
- **2 enriquecedores via API** (Supabase: plano+assentos+preço-por-tabela; Vercel: assentos apenas) — módulo próprio, **não** o contrato `BillingCollector` (justificativa de design nos Dev Notes) (AC7, AC8).
- **Resolução factual (não presumida) do risco de dupla contagem da Vercel**, via chamada real em DEV documentada no Dev Agent Record (AC10).
- **1 cron novo** que roda os 2 enriquecedores 1×/dia, best-effort por serviço (AC11).
- **Correção de um risco de runtime real** no cron de lembretes existente (78-11), que quebraria com `due_date = null` sem este ajuste (AC12).
- **Extensão pontual** de 2 rotas já existentes (GET/PATCH de `service_billing_reminders`, 78-8) para expor/aceitar os novos campos, preparando o contrato para a Story 78-15 (AC13, AC14).
- **Função pura de agregação** "Total Assinaturas Fixas" por moeda, testada isoladamente (AC6, AC15).

### OUT (não entra nesta story)

- **UI** de cadastro/edição/visualização das assinaturas fixas — Story 78-15, que consome o contrato de API deixado pronto aqui (GET/PATCH estendidos).
- **Criação de novas assinaturas fixas além das 3 seedadas** (Claude Team, Vercel Pro, Supabase Pro) via API — o whitelist de PATCH desta story não inclui `is_fixed_subscription`/`excluded_from_subscription_total`; adicionar uma 4ª assinatura fixa no futuro é uma extensão pontual, não implementada agora.
- **Wire-up da nova função de agregação (AC6) em `GET /api/admin/billing-panel`** (78-9) — a Story 78-15 decide onde/como exibir o total; esta story só garante que o dado e a função existem e estão corretos.
- **Qualquer alteração nos coletores 78-3/78-4/78-5/78-6/78-7** (`billing-collectors/*`) — mesmo a investigação de dupla contagem da Vercel (AC10) não deve alterar `vercelCollector`/`run-collector.ts` nesta story; se o ramo "overlap descartado" for confirmado, a mudança fica limitada ao módulo novo desta story (tabela de preços + enriquecedor Vercel), não ao coletor existente.
- **Tabela de preços da Claude Team** — não existe nenhum dado auto-derivável para ela (sem API); segue 100% manual, sem tabela de preços associada.
- Qualquer migration em `platform_services`/`service_cost_snapshots` além do INSERT do catálogo novo (AC2) — os coletores de uso/custo já existentes continuam intocados.

---

## Acceptance Criteria

- [x] **AC1 — Migration aditiva estende `service_billing_reminders` (6 colunas novas + `due_date` nullable):** `ADD COLUMN IF NOT EXISTS` de `is_fixed_subscription boolean NOT NULL DEFAULT false`, `subscription_plan text`, `subscription_seats integer`, `value_source text CHECK (value_source IN ('api_price_table','manual'))`, `seats_source text CHECK (seats_source IN ('api','manual'))`, `excluded_from_subscription_total boolean NOT NULL DEFAULT false`, `last_enriched_at timestamptz`; e `ALTER COLUMN due_date DROP NOT NULL` (hoje `NOT NULL` desde a migration 164/Story 78-1 — precisa relaxar porque uma assinatura fixa pode existir "cadastrada" antes de o admin preencher a data de renovação, Story 78-15). Idempotente — reexecutar não falha. Nenhum ALTER em `platform_services`/`service_cost_snapshots` além do INSERT de AC2.

- [x] **AC2 — Catálogo novo `claude_team`, Vercel/Supabase reusam `service_id` existente:** `INSERT ... ON CONFLICT (slug) DO NOTHING` em `platform_services`: `slug='claude_team'`, `name='Claude Team (claude.ai)'`, `category='ia'`, `automation_tier='fraca'`, `has_auto_cost_collection=false`, `billing_url` de melhor esforço com `billing_url_confirmed=false` (URL não verificada nesta story contra documentação oficial — Article IV, mesmo padrão dos placeholders `vercel`/`supabase` na 78-1), `enabled=true`, `display_order=8`, `notes` explicando que este slug é **distinto** de `anthropic` (billing separado: claude.ai vs console.anthropic.com — a Admin API de custo da 78-3 nunca cobre este slug). Nenhuma linha nova de catálogo para Vercel/Supabase — a assinatura fixa desses 2 usa o `service_id` já seedado pela 78-1.

- [x] **AC3 — No máximo 1 linha "assinatura fixa" por serviço:** `CREATE UNIQUE INDEX ... ON service_billing_reminders (service_id) WHERE is_fixed_subscription = true`. Este índice parcial é o mecanismo de idempotência do seed (AC4, via `ON CONFLICT (service_id) WHERE is_fixed_subscription`) e a garantia que o enriquecedor (AC7/AC8) sempre encontra no máximo 1 linha para atualizar por serviço.

- [x] **AC4 — Seed de 3 linhas "assinatura fixa", valores manuais nulos até 78-15:** `INSERT ... ON CONFLICT (service_id) WHERE is_fixed_subscription DO NOTHING` de 3 linhas em `service_billing_reminders`, todas com `is_fixed_subscription=true`, `due_date=NULL`, `billing_cycle='monthly'`, `currency='USD'`, `expected_amount=NULL`, `value_source=NULL`, `seats_source=NULL`, `alert_days_before` no DEFAULT (7):
  - `claude_team`: `subscription_plan='team'`, `subscription_seats=NULL`, `excluded_from_subscription_total=false`.
  - `vercel`: `subscription_plan='pro'`, `subscription_seats=NULL`, `excluded_from_subscription_total=true` (default seguro contra dupla contagem até a investigação factual da AC10 concluir; NÃO presumir `false` sem evidência).
  - `supabase`: `subscription_plan=NULL` (preenchido pelo enriquecedor, AC7 — não presumido no seed), `subscription_seats=NULL`, `excluded_from_subscription_total=false`.

- [x] **AC5 — Distinção CUSTO DE USO vs ASSINATURA FIXA é estrutural, não lógica de UI:** Nenhuma linha desta story é escrita em `service_cost_snapshots` (essa tabela permanece 100% dos coletores 78-3/78-5/78-6/78-7, granularidade diária). "Assinatura Fixa" vive exclusivamente em `service_billing_reminders` com `is_fixed_subscription=true` — os 2 totais ("gasto de uso do mês", já existente via 78-12, e "total de assinaturas fixas", AC6 desta story) são somáveis separadamente por construção do schema, sem overlap de linhas entre as duas tabelas.

- [x] **AC6 — Função pura de agregação "Total Assinaturas Fixas":** `somarAssinaturasFixasPorMoeda(rows)` em `packages/web/src/lib/billing/subscription-summary.ts` soma `expected_amount` (ignorando `null`) agrupado por `currency`, filtrando `is_fixed_subscription=true AND excluded_from_subscription_total=false`; nunca soma `USD` com `BRL` na mesma chave (NFR-7). Sem I/O — mesmo padrão de `cost-summary.ts`/`reminder-schedule.ts`/`collection-health.ts`.

- [x] **AC7 — Enriquecedor Supabase (plano + assentos + preço-por-tabela, nunca sobrescreve manual):** `packages/web/src/lib/billing/subscriptions/enrich-supabase.ts` usa `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG` (já provisionados pela 78-2, já usados pela 78-7 — **nenhum secret novo**) para chamar `GET /v1/organizations/{slug}` (campo `plan`) + o endpoint de contagem de membros da Management API (nome exato do endpoint a confirmar contra a OpenAPI oficial `https://api.supabase.com/api/v1-json`, mesma disciplina de descoberta da T1.3 da Story 78-7 — não assumir o path sem confirmar). Localiza a única linha `is_fixed_subscription=true` do `service_id` do slug `supabase` (garantida pela AC3) e faz `UPDATE`: `subscription_plan=plan`, `subscription_seats=contagem` (com `seats_source='api'`), `last_enriched_at=now()`; e `expected_amount=SUBSCRIPTION_PRICE_TABLE.supabase[plan].amount` com `value_source='api_price_table'` **somente se** `value_source` atual da linha for `NULL` ou `'api_price_table'` (nunca `'manual'` — ver AC9). Se `plan` não constar na tabela de preços (ex.: `free`/`enterprise`), `expected_amount` não é alterado.

- [x] **AC8 — Enriquecedor Vercel (assentos apenas, sem tabela de preços nesta story):** `packages/web/src/lib/billing/subscriptions/enrich-vercel.ts` usa `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` (já provisionados pela 78-2, já usados pela 78-5 — **nenhum secret novo**) para chamar `GET /v2/teams/{teamId}/members` e contar assentos. Atualiza a linha `vercel` com `subscription_seats` (`seats_source='api'`) e `last_enriched_at=now()`. **Não** deriva `expected_amount` automaticamente nesta implementação base — a decisão de auto-derivar valor para a Vercel é condicional ao resultado da AC10.

- [x] **AC9 — Enriquecedor nunca sobrescreve edição manual (invariante central):** Se `value_source` da linha já é `'manual'`, o enriquecedor pula a escrita de `expected_amount` (mas ainda atualiza `subscription_plan`/`subscription_seats`/`last_enriched_at` normalmente); se `seats_source` já é `'manual'`, pula a escrita de `subscription_seats`. `due_date`, `billing_cycle`, `alert_days_before`, `status`, `notes` **nunca** são tocados pelo enriquecedor em nenhuma circunstância — pertencem exclusivamente ao fluxo manual (78-8/78-11/78-15).

- [ ] **AC10 — Risco de dupla contagem da Vercel resolvido com evidência real, documentada, não presumida:** Task dedicada (ver Tasks/T-Vercel-Dedup) exige 1 chamada real a `GET /v1/billing/charges` em DEV/staging e inspeção se alguma linha com `ChargeCategory`/`PricingCategory` correspondente à mensalidade Pro (valor fixo mensal reconhecível, não metered) aparece dentro do que `vercelCollector` (78-5) já soma em `cost_usd`. Resultado registrado no Dev Agent Record desta story:
  - **Se overlap CONFIRMADO** (mensalidade já dentro do `cost_usd` agregado): `excluded_from_subscription_total` permanece `true` (default do seed, AC4) — nenhuma mudança de código adicional; a linha existe só para exibir plano/assentos, nunca soma ao total de assinaturas fixas.
  - **Se overlap DESCARTADO**: 1 `UPDATE` pontual (via novo passo da migration ou script de correção documentado) seta `excluded_from_subscription_total=false` para a linha `vercel`; `SUBSCRIPTION_PRICE_TABLE` (AC7) ganha uma entrada `vercel.pro` com o preço público confirmado na documentação oficial da Vercel **no momento da implementação** (não inventado nesta story); o enriquecedor Vercel (AC8) passa a setar `expected_amount`/`value_source='api_price_table'` seguindo exatamente a mesma regra de não-sobrescrita da AC9.
  - Em ambos os ramos, `vercelCollector`/`run-collector.ts` (78-5/78-3) permanecem **intocados** (fora de escopo, ver Scope OUT).

- [x] **AC11 — Cron novo, best-effort por serviço, sem colisão de horário:** `packages/web/src/app/api/cron/billing-subscription-enrich/route.ts`, auth `CRON_SECRET` idêntico ao padrão da 78-3/78-7. Roda os 2 enriquecedores (AC7, AC8) com `Promise.allSettled` — falha ao enriquecer Supabase não impede tentar Vercel e vice-versa. **Diferente** do padrão single-provider "503 sem credencial" dos coletores 78-3..78-7 (este cron toca 2 serviços independentes): ausência de credencial de UM serviço apenas pula aquele serviço no resumo da resposta (200), sem bloquear o outro. `packages/web/vercel.json` ganha 1 entry novo: `{ "path": "/api/cron/billing-subscription-enrich", "schedule": "45 10 * * *" }` (10:45 UTC) — livre, confirmado contra a lista completa e real do arquivo (não só memória), entre o coletor Vercel (`10:20`) e o motor de lembretes (`12:10`).

- [x] **AC12 — Correção obrigatória de risco de runtime no cron de lembretes (78-11) para suportar `due_date` nulo:** `packages/web/src/app/api/cron/billing-reminders/route.ts` hoje chamaria `deveAlertar()`/`diffDiasAteVencer()` com `due_date=null`, o que quebra em runtime (`diffDias` faz `.split()` num valor `null`). O tipo `ReminderRow.due_date` passa a `string | null`; a query de candidatos ou o filtro em memória exclui explicitamente `due_date === null` **antes** de chamar `deveAlertar()` (ex.: `candidatos.filter((r) => r.due_date !== null).filter((r) => deveAlertar(r, hoje))`). Validado chamando `GET /api/cron/billing-reminders?dry=1` (com CRON_SECRET válido) após o seed desta story (3 linhas `due_date=NULL`) sem erro 500, e confirmando que essas 3 linhas **não** aparecem em `wouldAlert`.

- [x] **AC13 — `GET /api/admin/billing-reminders` expõe os novos campos:** O `SELECT` da rota (78-8) passa a incluir `is_fixed_subscription, subscription_plan, subscription_seats, value_source, seats_source, excluded_from_subscription_total, last_enriched_at`, disponibilizando o contrato completo para a Story 78-15 sem exigir rota nova.

- [x] **AC14 — `PATCH /api/admin/billing-reminders/[id]` aceita edição manual dos novos campos e marca a fonte como manual:** `reminder-validation.ts` (`ReminderUpdate`/`validateUpdate`) passa a aceitar `subscription_plan` (string ou `null`) e `subscription_seats` (inteiro `>= 0` ou `null`). Na rota `[id]/route.ts`: se o payload contém `expected_amount`, a atualização inclui `value_source: 'manual'`; se contém `subscription_seats`, inclui `seats_source: 'manual'` — garantindo que uma edição manual (78-15) nunca seja silenciosamente sobrescrita pelo próximo ciclo do enriquecedor (reforça AC9 do lado da escrita manual). `is_fixed_subscription`/`excluded_from_subscription_total` **não** entram no whitelist de PATCH nesta story (Scope OUT).

- [x] **AC15 — Testes unitários (Vitest, sem I/O) para `subscription-summary.ts`:** cobrindo soma correta por moeda, exclusão de linhas `excluded_from_subscription_total=true`, exclusão de `expected_amount=null`, e não-mistura de `USD`/`BRL` na mesma soma — mesmo padrão de `cost-summary.test.ts`/`reminder-schedule.test.ts`/`collection-health.test.ts`.

---

## Tasks / Subtasks

- [ ] **T1 — Preparação e confirmação de contrato/API** (AC1, AC2, AC7, AC8, AC10)
  - [x] T1.1 — Reler Story 78-1 (migration 164, contrato de `service_billing_reminders`/`platform_services`) e a migration real no repo
  - [x] T1.2 — Reler Story 78-11 (migration 169, `last_alerted_on`, `reminder-schedule.ts`, cron `billing-reminders/route.ts`) — entender exatamente onde o filtro de `due_date` nulo precisa entrar (AC12)
  - [x] T1.3 — Reler Story 78-2 (nomes exatos `SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG`, `VERCEL_BILLING_TOKEN`, `VERCEL_TEAM_ID` — não inventar variação) e confirmar se os 4 já estão provisionados (Change Log da 78-2)
  - [x] T1.4 — Confirmar via documentação oficial da Supabase Management API (`https://api.supabase.com/api/v1-json`, mesma fonte usada pela Story 78-7 T1.3) o endpoint exato de contagem de membros da organização
  - [x] T1.5 — Confirmar via documentação oficial da Vercel (`https://openapi.vercel.sh`, mesma fonte usada pela Story 78-5) o formato exato de `GET /v2/teams/{teamId}/members` (campo de contagem/paginação)
  - [ ] **T-Vercel-Dedup (AC10) — chamada real em DEV/staging:** chamar `GET /v1/billing/charges` com `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` reais numa janela que cubra o ciclo de cobrança mensal completo; inspecionar `ChargeCategory`/`ServiceName`/`PricingCategory` de cada linha JSONL procurando uma cobrança fixa reconhecível como a mensalidade Pro; documentar o achado literal (payload relevante, redigindo valores sensíveis se necessário) no Dev Agent Record; decidir o ramo da AC10 com base na evidência, não em suposição

- [x] **T2 — Migration** (AC1, AC2, AC3, AC4)
  - [x] T2.1 — Confirmar o próximo número livre de migration via `ls supabase/migrations/*.sql | sort | tail` no momento do `*develop` (não presumir `172` sem reconfirmar — histórico do épico já teve renumeração 170→171 por colisão com `origin/main`, ver Change Log da Story 78-12)
  - [x] T2.2 — `ALTER TABLE service_billing_reminders ADD COLUMN IF NOT EXISTS ...` (6 colunas, AC1) + `ALTER COLUMN due_date DROP NOT NULL`
  - [x] T2.3 — `CREATE UNIQUE INDEX IF NOT EXISTS ux_service_billing_reminders_fixed_subscription_service ON service_billing_reminders (service_id) WHERE is_fixed_subscription = true` (AC3)
  - [x] T2.4 — `INSERT ... ON CONFLICT (slug) DO NOTHING` do catálogo `claude_team` (AC2)
  - [x] T2.5 — `INSERT ... ON CONFLICT (service_id) WHERE is_fixed_subscription DO NOTHING` das 3 linhas de assinatura fixa (AC4), resolvendo `service_id` de `vercel`/`supabase` via subquery em `platform_services` pelo `slug` (não hardcodar UUID)
  - [x] T2.6 — Comentários de coluna (`COMMENT ON COLUMN ...`) explicando a invariante "enriquecedor nunca sobrescreve manual" (AC9) diretamente no schema, mesmo padrão de documentação usado nas migrations 164/169/171

- [x] **T3 — Módulo de enriquecimento (novo, não é `BillingCollector`)** (AC6, AC7, AC8, AC9)
  - [x] T3.1 — Criar `packages/web/src/lib/billing/subscriptions/types.ts` (tipo de resultado do enriquecimento, sem reusar `CostSnapshotRow`/`BillingCollector` da 78-3 — alvo de escrita e semântica diferentes, ver Dev Notes)
  - [x] T3.2 — Criar `packages/web/src/lib/billing/subscriptions/price-table.ts` (`SUBSCRIPTION_PRICE_TABLE`, documentando que precisa manutenção manual quando os fornecedores mudarem preço)
  - [x] T3.3 — Criar `packages/web/src/lib/billing/subscriptions/enrich-supabase.ts` (AC7) — chamadas isoladas (plano / assentos) com `Promise.allSettled`, mesmo padrão defensivo de `supabase-usage.ts` (78-7)
  - [x] T3.4 — Criar `packages/web/src/lib/billing/subscriptions/enrich-vercel.ts` (AC8)
  - [x] T3.5 — Implementar a lógica de não-sobrescrita (AC9) em ambos os enriquecedores — cada função de enriquecimento recebe o estado atual da linha (`value_source`/`seats_source`) e retorna só os campos que DEVEM ser atualizados
  - [x] T3.6 — Criar `packages/web/src/lib/billing/subscription-summary.ts` (AC6) + `subscription-summary.test.ts` (AC15)

- [x] **T4 — Cron de enriquecimento** (AC11)
  - [x] T4.1 — Criar `packages/web/src/app/api/cron/billing-subscription-enrich/route.ts` — auth `CRON_SECRET`, best-effort por serviço, `UPDATE` direto via `createAdminClient()` (mesmo client já usado pelo cron `billing-reminders`)
  - [x] T4.2 — Adicionar entry em `packages/web/vercel.json` (`"45 10 * * *"`), conferido contra a lista completa e real do arquivo

- [ ] **T5 — Correção do cron de lembretes existente (78-11)** (AC12)
  - [x] T5.1 — Atualizar tipo `ReminderRow.due_date` para `string | null` em `billing-reminders/route.ts`
  - [x] T5.2 — Adicionar filtro explícito de `due_date !== null` antes de `deveAlertar()`
  - [ ] T5.3 — Validar manualmente com `?dry=1` após o seed desta story (AC12)

- [x] **T6 — Extensão das rotas de CRUD existentes (78-8)** (AC13, AC14)
  - [x] T6.1 — Atualizar `SELECT` de `GET /api/admin/billing-reminders/route.ts` (AC13)
  - [x] T6.2 — Estender `ReminderUpdate`/`validateUpdate` em `reminder-validation.ts` (AC14)
  - [x] T6.3 — Atualizar `PATCH /api/admin/billing-reminders/[id]/route.ts` para derivar `value_source='manual'`/`seats_source='manual'` (AC14)

- [ ] **T7 — Validação manual em DEV** (AC1, AC4, AC7, AC8, AC9, AC10, AC11, AC12)
  - [ ] T7.1 — Aplicar migration, confirmar as 3 linhas seedadas via `SELECT * FROM service_billing_reminders WHERE is_fixed_subscription = true`
  - [ ] T7.2 — Rodar `GET /api/cron/billing-subscription-enrich` com secrets válidos → confirmar `subscription_plan`/`subscription_seats` preenchidos em `vercel`/`supabase`, `last_enriched_at` atualizado
  - [ ] T7.3 — Editar manualmente `expected_amount` da linha `supabase` via PATCH → confirmar `value_source='manual'`; rodar o enriquecedor de novo → confirmar que `expected_amount` **não** foi sobrescrito, mas `subscription_seats`/`last_enriched_at` continuam atualizando
  - [ ] T7.4 — Confirmar `GET /api/cron/billing-reminders?dry=1` não quebra com as 3 linhas `due_date=NULL` (AC12)
  - [ ] T7.5 — Rodar `somarAssinaturasFixasPorMoeda` contra os dados reais pós-enriquecimento e conferir a soma manualmente

- [x] **T8 — Documentar no Change Log / Dev Agent Record**
  - [x] T8.1 — Registrar o número real de migration usado (T2.1) e se houve renumeração
  - [x] T8.2 — Registrar o achado da T-Vercel-Dedup e qual ramo da AC10 foi seguido
  - [x] T8.3 — Registrar o endpoint exato de membros confirmado para Supabase (T1.4) e o formato de resposta da Vercel (T1.5)

---

## Dev Notes

### Decisão de modelo de dados — ESTENDER `service_billing_reminders`, não criar `platform_subscriptions`

**Decisão: estender a tabela existente**, não criar uma tabela nova. Justificativa (IDS ADAPT, não CREATE):

1. Uma "assinatura fixa" **é**, na essência, um vencimento com valor + ciclo + data de renovação — exatamente o que `service_billing_reminders` já modela desde a Story 78-1 (migration 164). Criar uma tabela paralela duplicaria o conceito de due_date/billing_cycle/currency/status.
2. Reusa **100% de graça** o motor de alertas com escalonamento (78-11: D-N/D-0/vencida, dedup por dia via `last_alerted_on`, recorrência-ao-pagar no PATCH) — uma assinatura fixa cadastrada com data de renovação passa a ser lembrada automaticamente pelo mesmo cron, sem nenhuma lógica nova de agendamento.
3. Reusa a máquina de estados já existente (`pending → alerted → paid → ...`) e a UI futura (78-15) pode reaproveitar o mesmo componente de lista/edição de vencimentos, só filtrando por `is_fixed_subscription`.

**6 colunas novas + `due_date` nullable** (todas aditivas, `IF NOT EXISTS`):
- `is_fixed_subscription boolean NOT NULL DEFAULT false` — distingue uma assinatura fixa de um vencimento manual avulso qualquer (a única forma de diferenciar hoje seria heurística por serviço, frágil).
- `subscription_plan text` — rótulo do plano/tier (`'pro'`, `'team'`, texto livre).
- `subscription_seats integer` — nº de assentos, auto (API) ou manual.
- `value_source text CHECK IN ('api_price_table','manual')` — de onde veio `expected_amount`.
- `seats_source text CHECK IN ('api','manual')` — de onde veio `subscription_seats`.
- `excluded_from_subscription_total boolean NOT NULL DEFAULT false` — evita dupla contagem quando o valor já está dentro de outro total coletado automaticamente (hoje: só a Vercel, ver AC10).
- `last_enriched_at timestamptz` — observabilidade do enriquecedor (quando rodou com sucesso pela última vez).
- `due_date DROP NOT NULL` — uma assinatura fixa pode existir "cadastrada" (seedada) antes de o admin informar a data de renovação real (Story 78-15); a coluna era `NOT NULL` desde a 78-1 porque, até esta story, todo vencimento tinha data conhecida no momento da criação.

**Índice parcial `UNIQUE (service_id) WHERE is_fixed_subscription = true`** — garante no máximo 1 linha "assinatura fixa" por serviço, o que permite (a) `ON CONFLICT` idempotente no seed e (b) o enriquecedor sempre atualizar exatamente 1 linha por `UPDATE ... WHERE service_id = X AND is_fixed_subscription = true`, sem precisar de lógica de desambiguação.

### Por que o enriquecedor NÃO é um `BillingCollector` (78-3) — decisão de design explícita

O contrato `BillingCollector`/`runCollector()` (Story 78-3, `packages/web/src/lib/billing-collectors/`) foi desenhado para popular `service_cost_snapshots`: uma série temporal diária (`snapshot_date` + `metric` + `value`), com upsert por `(service_id, snapshot_date, metric)`. O enriquecimento desta story é fundamentalmente diferente: é uma atualização **de estado atual** (quantos assentos existem HOJE, qual plano está ativo AGORA) sobre uma linha **única e já existente** (`service_billing_reminders` com `is_fixed_subscription=true`), sem conceito de "dia" nem de série temporal. Forçar esse enriquecimento no contrato de `CostSnapshotRow` exigiria inventar um `snapshot_date`/`metric` sem sentido semântico para o alvo real da escrita. Por isso: **CREATE** (não ADAPT) de um módulo próprio em `packages/web/src/lib/billing/subscriptions/`, documentado explicitamente aqui para não ser lido como uma tentativa de recriar o contrato da 78-3 por descuido.

`evaluated_patterns`: `BillingCollector`/`runCollector()` (78-3). `rejection_reasons`: alvo de persistência diferente (`service_billing_reminders`, linha única de estado) e semântica diferente (estado atual, não série temporal diária) — reusar forçaria campos sem sentido (`snapshot_date` para "quantos assentos existem hoje"). `new_capability`: atualização condicional (nunca sobrescreve edição manual, AC9) de uma linha única por serviço, algo que `runCollector()` não resolve (ele sempre faz upsert de novas linhas, nunca "atualiza condicionalmente uma linha existente preservando um campo se a fonte for manual").

### Tabela de preços — mantida manualmente, não é fonte de verdade de API

```ts
// packages/web/src/lib/billing/subscriptions/price-table.ts
export const SUBSCRIPTION_PRICE_TABLE: Record<
  string,
  Partial<Record<string, { currency: "USD"; amount: number }>>
> = {
  supabase: {
    pro: { currency: "USD", amount: 25 },
    // team/enterprise/platform: sem preço público fixo conhecido — não inventar.
  },
  // vercel.pro: adicionado SOMENTE se a T-Vercel-Dedup (AC10) confirmar que a mensalidade
  // NÃO está embutida no cost_usd já coletado pela 78-5 — preço a confirmar na doc oficial
  // da Vercel no momento da implementação, não inventado agora.
}
```
Esta tabela precisa de manutenção manual quando os fornecedores mudarem preço — não há endpoint que devolva o preço do plano Supabase Pro (CON-3-like, mesma limitação já documentada para Supabase/Resend no épico).

### Risco de dupla contagem — por que só a Vercel, não Supabase

O coletor de uso técnico do Supabase (`supabase-usage.ts`, Story 78-7) **sempre** grava `currency: null` (invariante AC4 daquela story) — nunca há um valor monetário coletado automaticamente para o Supabase hoje, então não existe risco de dupla contagem entre o "Total Assinaturas Fixas" desta story e qualquer coleta automática de custo do Supabase. O risco é **exclusivo da Vercel**, cujo coletor (`vercelCollector`, 78-5) soma `BilledCost` de **todas** as categorias de cobrança (`ChargeCategory` ∈ `Adjustment/Credit/Purchase/Tax/Usage`, conforme a spec FOCUS citada na própria Story 78-5) num único `cost_usd` diário — se a mensalidade Pro entrar como uma linha `Purchase` nesse somatório (não confirmado, ver AC10), ela já está contada no "gasto de uso" mensal (78-12) e contá-la de novo em "Assinaturas Fixas" duplicaria o número exibido ao usuário.

### Arquivos a criar
- `supabase/migrations/{N}_platform_subscriptions_fixed.sql` — número a reconfirmar no `*develop` (última migration real confirmada nesta data: `171_billing_cost_alerts_summary.sql`; próximo número esperado `172`, mas reconfirmar via `ls supabase/migrations/*.sql | sort | tail`, pois o épico já teve 1 renumeração por colisão com `origin/main` — Story 78-12, `170→171`)
- `packages/web/src/lib/billing/subscriptions/types.ts`
- `packages/web/src/lib/billing/subscriptions/price-table.ts`
- `packages/web/src/lib/billing/subscriptions/enrich-supabase.ts`
- `packages/web/src/lib/billing/subscriptions/enrich-vercel.ts`
- `packages/web/src/lib/billing/subscription-summary.ts`
- `packages/web/src/lib/billing/subscription-summary.test.ts`
- `packages/web/src/app/api/cron/billing-subscription-enrich/route.ts`

### Arquivos a modificar
- `packages/web/src/app/api/cron/billing-reminders/route.ts` — AC12 (correção de risco de runtime, tipo `due_date: string | null` + filtro)
- `packages/web/src/app/api/admin/billing-reminders/route.ts` — AC13 (SELECT)
- `packages/web/src/app/api/admin/billing-reminders/[id]/route.ts` — AC14 (PATCH deriva `value_source`/`seats_source`)
- `packages/web/src/lib/billing/reminder-validation.ts` — AC14 (whitelist de `validateUpdate`)
- `packages/web/vercel.json` — AC11 (1 novo entry de cron)

### Arquivos NÃO tocados por esta story (confirmar antes de editar por engano)
- `packages/web/src/lib/billing-collectors/*` (`types.ts`, `run-collector.ts`, `anthropic.ts`, `vercel.ts`, `supabase-usage.ts`, `resend-usage.ts`) — contrato de OUTRA categoria de dado (custo de uso em série temporal); esta story não é um `BillingCollector` e não deve importar/modificar esse contrato (ver justificativa de design acima)
- `packages/web/src/lib/billing/cost-summary.ts`/`collection-health.ts` — reusados só como referência de padrão (funções puras + `.test.ts`), não modificados
- `packages/web/src/app/dashboard/sistema/billing/*` (UI, Story 78-9) e qualquer wiring do total desta story em `billing-panel/route.ts` — fora de escopo, decisão da Story 78-15

### Arquivos de referência obrigatórios (ler antes de implementar)
- `supabase/migrations/164_platform_services_billing.sql` (Story 78-1) — schema base de `platform_services`/`service_billing_reminders`/`service_cost_snapshots`, padrão RLS `public.user_role() = 'admin'` sem cast
- `supabase/migrations/169_service_billing_reminders_last_alerted.sql` (Story 78-11) — padrão de `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` aditivo sobre `service_billing_reminders`, mesmo padrão a seguir nesta story
- `packages/web/src/lib/billing/reminder-schedule.ts` (Story 78-11) — `hojeSaoPaulo`/`toIsoDate`/`deveAlertar`/`diffDiasAteVencer`/`avancarCiclo`; **não modificar**, só entender o ponto exato onde o filtro de `due_date` nulo (AC12) precisa entrar no cron consumidor
- `packages/web/src/app/api/cron/billing-reminders/route.ts` (Story 78-11) — cron a corrigir (AC12); ver `ReminderRow` type e o `.filter((r) => deveAlertar(r, hoje))`
- `packages/web/src/app/api/admin/billing-reminders/route.ts` e `.../[id]/route.ts` (Story 78-8) — rotas a estender (AC13/AC14)
- `packages/web/src/lib/billing/reminder-validation.ts` (Story 78-8) — whitelist a estender (AC14)
- `packages/web/src/lib/billing-collectors/vercel.ts` (Story 78-5) — **ler, não modificar** — entender exatamente como `aggregateDailyCost()` soma `BilledCost` por `ChargeCategory`, para a investigação da AC10 (T-Vercel-Dedup)
- `packages/web/src/lib/billing-collectors/supabase-usage.ts` (Story 78-7) — **ler, não modificar** — padrão de `mgmtFetch`/derivação de `SUPABASE_ORG_SLUG`/tratamento defensivo, referência de estilo para `enrich-supabase.ts`
- `packages/web/src/lib/billing/cost-summary.ts` + `.test.ts` (Story 78-12) — referência de estilo para `subscription-summary.ts`/`.test.ts` (funções puras, sem I/O, agregação por moeda, exclusão de bookkeeping)
- `docs/stories/78-2-provisionamento-secrets-billing.story.md` — contrato exato dos 4 secrets reusados (`SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG`, `VERCEL_BILLING_TOKEN`, `VERCEL_TEAM_ID`) — nenhum secret novo nesta story

### Testing Standards
- Não há suíte automatizada para os enriquecedores em si (chamadas `fetch` reais, mesmo padrão observado em `supabase-usage.ts`/`vercel.ts`) — validação é manual em DEV (T7)
- As funções PURAS (`subscription-summary.ts`) **devem** ter teste Vitest (AC15) — este é o padrão já estabelecido pelas 3 últimas stories do épico (78-11/78-12/78-13, todas com `.test.ts` para suas funções puras)

---

## Testing

### Abordagem
- Migration aplicada em ambiente DEV (Supabase `xnxvygyfyyyzwhiuoehz`)
- Enriquecedores e cron validados manualmente chamando as rotas diretamente com headers corretos/incorretos
- `subscription-summary.ts` com suíte Vitest automatizada (AC15)

### Cenários de teste

1. **Migration idempotente:** reaplicar a migration não falha nem duplica colunas/índice/seed.
2. **`due_date` nullable:** `INSERT` de uma linha com `due_date=NULL` não viola constraint.
3. **Índice parcial:** tentar inserir uma 2ª linha `is_fixed_subscription=true` para o mesmo `service_id` falha por violação de unicidade.
4. **Seed correto:** as 3 linhas existem com os valores exatos da AC4 logo após a migration, antes de qualquer enriquecimento.
5. **Enriquecedor Supabase, primeira execução:** `subscription_plan`/`subscription_seats`/`expected_amount` (se `plan='pro'`)/`value_source='api_price_table'`/`last_enriched_at` preenchidos.
6. **Enriquecedor Vercel, primeira execução:** `subscription_seats`/`seats_source='api'`/`last_enriched_at` preenchidos; `expected_amount` permanece `NULL` (a menos que a AC10 tenha resolvido o ramo "overlap descartado").
7. **Não-sobrescrita (AC9):** editar `expected_amount` manualmente (PATCH) → `value_source='manual'`; rodar o enriquecedor de novo → `expected_amount` inalterado, mas `subscription_seats`/`last_enriched_at` continuam atualizando.
8. **Cron de enriquecimento sem credencial de 1 serviço:** faltando só `SUPABASE_MANAGEMENT_PAT` → resposta 200 com Supabase marcado como pulado no resumo, Vercel enriquecido normalmente.
9. **Cron de lembretes não quebra com `due_date=NULL` (AC12):** `GET /api/cron/billing-reminders?dry=1` retorna 200, as 3 linhas seedadas não aparecem em `wouldAlert`.
10. **`GET /api/admin/billing-reminders` retorna os novos campos (AC13).**
11. **`PATCH .../[id]` aceita `subscription_plan`/`subscription_seats` e deriva `value_source`/`seats_source='manual'` corretamente (AC14).**
12. **`somarAssinaturasFixasPorMoeda` (AC6, Vitest):** soma correta por moeda; exclui `excluded_from_subscription_total=true`; exclui `expected_amount=null`; nunca mistura `USD`/`BRL`.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Dupla contagem da mensalidade Vercel Pro se a T-Vercel-Dedup não for executada com rigor (assumir em vez de confirmar) | Alta (se ocorrer) | AC10 exige evidência real documentada, não presunção; default seguro do seed é `excluded_from_subscription_total=true` (nunca soma até prova em contrário) |
| R2 | Relaxar `due_date` para nullable quebra o cron de lembretes existente (78-11) em runtime | Alta (se não corrigido) | AC12 é Acceptance Criteria própria com cenário de teste dedicado (#9); a correção é pequena e localizada (1 filtro + 1 tipo) |
| R3 | Endpoint exato de contagem de membros do Supabase (`/v1/organizations/{slug}/members` ou variante) não confirmado nesta story | Média | T1.4 exige confirmação contra a OpenAPI oficial antes de implementar — mesma disciplina da T1.3 da Story 78-7 |
| R4 | Enriquecedor sobrescrever silenciosamente um valor que o admin acabou de editar manualmente (78-15), corrompendo a confiança no cadastro manual | Alta (se ocorrer) | AC9 é Acceptance Criteria própria; AC14 garante que a origem do PATCH já marca `value_source`/`seats_source='manual'` no mesmo request, sem depender de uma 2ª chamada |
| R5 | Tabela de preços (`SUBSCRIPTION_PRICE_TABLE`) ficar desatualizada quando o fornecedor mudar preço, gerando valor auto-preenchido incorreto | Média (aceita, documentada) | Comentário explícito no arquivo + nos Dev Notes; a 78-15 (UI) deve permitir edição manual que sobrepõe a tabela (AC9/AC14 já suportam isso) |
| R6 | Novo cron em `vercel.json` colide de horário com cron existente ou com stories irmãs ainda não aplicadas | Baixa | Dev Notes lista os horários já ocupados no arquivo real; `"45 10 * * *"` escolhido livre entre `billing-collect-vercel` (10:20) e `billing-reminders` (12:10) |
| R7 | Número de migration proposto (`172`) colidir com uma story concorrente aplicada em paralelo (já ocorreu 1× no épico, 78-12) | Baixa/Média (histórico) | T2.1 exige reconfirmação via `ls` no momento do `*develop`, não confiar no número desta story sem checar |

---

## Dependencies

- **Depende de:** Story 78-1 (Status: Ready — schema base, migration 164), Story 78-2 (secrets `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG`/`VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` — todos já reusados por 78-5/78-7, nenhum secret novo desta story), Story 78-5 (coletor Vercel, `vercelCollector`/`aggregateDailyCost` — leitura obrigatória para a investigação AC10), Story 78-7 (coletor de uso Supabase — referência de estilo + confirmação empírica do campo `plan`), Story 78-11 (motor de lembretes com escalonamento — reusado integralmente pela recorrência/alerta de assinaturas fixas; e alvo da correção AC12)
- **Não depende de:** Story 78-4 (OpenAI), 78-6 (WhatsApp/Meta), 78-10 (Meta Ads) — nenhuma relação com assinaturas fixas
- **Bloqueia:** Story 78-15 (UI de Assinaturas Fixas) — consome o contrato de GET/PATCH estendido nesta story (AC13/AC14) e a função de agregação (AC6)
- **Dependências técnicas:**
  - `packages/web/src/lib/billing/reminder-schedule.ts` (Story 78-11) — reusado, não modificado
  - `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`)
  - `packages/web/vercel.json` (registro de cron)
  - `packages/web/src/lib/api-auth.ts` (`requireAuth()`/`requireRole()`, já usado por `billing-reminders/route.ts`)

---

## Definition of Done

- [ ] Migration aditiva aplicada (número real confirmado no `*develop`, documentado no Change Log) — 6 colunas novas + `due_date` nullable + índice parcial + catálogo `claude_team` + seed de 3 linhas
- [ ] `packages/web/src/lib/billing/subscriptions/{types,price-table,enrich-supabase,enrich-vercel}.ts` criados
- [ ] `packages/web/src/lib/billing/subscription-summary.ts` + `.test.ts` criados e passando (AC6, AC15)
- [ ] `packages/web/src/app/api/cron/billing-subscription-enrich/route.ts` criado, `CRON_SECRET`, best-effort por serviço
- [ ] `packages/web/vercel.json` atualizado com o novo cron (`"45 10 * * *"`), sem colisão
- [ ] `packages/web/src/app/api/cron/billing-reminders/route.ts` corrigido para `due_date` nulo (AC12), validado com `?dry=1`
- [ ] `GET /api/admin/billing-reminders` e `PATCH .../[id]` estendidos (AC13, AC14), incl. `reminder-validation.ts`
- [ ] T-Vercel-Dedup (AC10) executada e documentada no Dev Agent Record, com o ramo escolhido claramente registrado
- [ ] Validação manual em DEV completa (T7): seed correto, enriquecimento funciona, não-sobrescrita de manual confirmada, cron de lembretes não quebra
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos (foco: correção do risco de runtime AC12, invariante de não-sobrescrita AC9, resolução factual do risco de dupla contagem AC10 — não recriação do contrato `BillingCollector`)
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente, mesmo estado observado nas demais stories do Epic 78).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story, conforme mapping usado pelas demais stories de schema+cron do épico — 78-11/78-12/78-13).

**Story Type Analysis (para referência futura, caso CodeRabbit seja habilitado):**
- **Primary Type:** Database (ALTER aditivo em tabela existente + índice parcial + seed condicional)
- **Secondary Type:** Integration (2 enriquecedores via API externa) + API (2 rotas existentes estendidas + 1 cron novo)
- **Complexity:** High (migration com ALTER em coluna NOT NULL existente, risco de runtime corrigido num cron já em produção, invariante de não-sobrescrita cross-módulo, decisão condicional de dupla contagem)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-14 | 0.2 | **@po (Pax) validação GO — Status Draft → Ready.** Score 10/10. Checklist de 10 pontos aprovado. Riscos técnicos verificados contra o código real: (1) AC12 (due_date null quebra o cron 78-11) CONFIRMADO — `reminder-schedule.ts` L44 faz `dueDateIso.split("T")` que lança TypeError com `null`; o cron `billing-reminders/route.ts` (L143) chama `deveAlertar()` sem filtro de null e ESTÁ live (`vercel.json` L133-134, `10 12 * * *`); mitigação da AC12 (filtro `due_date !== null` antes de `deveAlertar`) é necessária e suficiente. (2) AC10 (dupla contagem Vercel) — default seguro `excluded_from_subscription_total=true` no seed + exigência de chamada real documentada antes de somar é disciplina Article IV sólida; AC6 filtra `excluded=false`, então a linha nunca soma até prova em contrário. (3) Migration 172 confirmada como próximo número livre (última real: `171_billing_cost_alerts_summary.sql`). (4) Horário de cron `45 10 * * *` confirmado LIVRE contra a lista completa e real do `vercel.json` (vizinhos reais: anthropic 10:00, vercel 10:20, daily-report 10:59, monthly-summary 11:30, reminders 12:10 — nenhum às 10:45). Nenhuma correção necessária nesta story. | @po (Pax) | [AUTO-DECISION] Modelo de dados = **estender** `service_billing_reminders` (não criar `platform_subscriptions`) → reason: uma assinatura fixa é estruturalmente um vencimento (valor+ciclo+data de renovação); estender reusa de graça o motor de alertas com escalonamento (78-11) e a máquina de estados já existente, evitando duplicar conceito e lógica de agendamento numa tabela paralela. [AUTO-DECISION] `due_date` relaxado para nullable → reason: pedido explícito do usuário ("dias de renovação ficam nulos até o usuário preencher"), o que exige tratamento cuidadoso (AC12) porque o cron de lembretes existente (78-11) quebraria em runtime com um `due_date=null` sem esse ajuste — risco identificado nesta redação, não presumido seguro. [AUTO-DECISION] Enriquecedor **não** reusa o contrato `BillingCollector`/`runCollector()` (78-3) → reason: alvo de persistência e semântica diferentes (estado atual de 1 linha única vs. série temporal diária); justificativa completa de IDS CREATE (não ADAPT) registrada nos Dev Notes. [AUTO-DECISION] `excluded_from_subscription_total=true` como default seguro da linha Vercel no seed → reason: Article IV — não presumir que a mensalidade Pro está fora do `cost_usd` já agregado pela 78-5 sem evidência real; a AC10 exige uma chamada real em DEV/staging antes de decidir, com ambos os ramos (overlap confirmado/descartado) documentados e aceitáveis. [AUTO-DECISION] Tabela de preços conhecida (plano→valor) só criada para Supabase nesta story (Vercel condicional à AC10, Claude Team sem tabela — sem API nenhuma) → reason: não inventar preço Vercel sem confirmar a doc oficial no momento da implementação; não inventar tabela de preço para um serviço sem qualquer fonte de dado (Claude Team). [AUTO-DECISION] Migration numerada como `172` nesta redação (última real confirmada: `171_billing_cost_alerts_summary.sql`), com instrução explícita de reconfirmar no `*develop` → reason: o épico já teve 1 renumeração por colisão com `origin/main` (Story 78-12, 170→171); não repetir o mesmo erro presumindo o número sem checar. [AUTO-DECISION] Executor @dev / Quality Gate @architect → reason: mesmo mapping usado pelas demais stories de schema+cron+lógica de aplicação do épico (78-11/78-12/78-13), consistente com a natureza desta story (migration + 2 rotas de API + 1 cron novo + correção de cron existente). | @sm (River) |
| 2026-07-14 | 0.4 | **@dev (Dex) correção cirúrgica REL-001 (QA gate, medium) — Status permanece InReview.** Guard `atual.due_date != null` adicionado ao ramo de recorrência do `PATCH /api/admin/billing-reminders/[id]` (`[id]/route.ts` L85-86): marcar `status='paid'` numa assinatura fixa recorrente (`billing_cycle='monthly'/'annual'`) com `due_date=NULL` (linhas seedadas pela migration 172) NÃO chama mais `avancarCiclo(null)` (que fazia `null.split("T")` → TypeError → HTTP 500). Agora apenas registra `paid_at=now()` sem avançar ciclo nem inventar data — simétrico ao filtro de null do cron (AC12). Comportamento inalterado para reminders com `due_date` preenchido (recorrência avança normalmente). Novo teste de rota `[id]/route.test.ts` (2 casos: null→200 sem avançar; preenchido→avança). tsc/eslint limpos (só os 4 pré-existentes), testes da rota passando. NÃO commitado, NÃO deployado, migration NÃO aplicada. | @dev (Dex) | [AUTO-DECISION] com `due_date=null` mantém `status='paid'` (não força 'pending') → reason: sem data-base não há próximo ciclo a agendar; a linha registra o pagamento e permanece paga até o usuário cadastrar o vencimento. |
| 2026-07-14 | 0.3 | **@dev (Dex) implementação — Status Ready → InReview.** Migration `172_service_billing_fixed_subscriptions.sql` criada (6 colunas + due_date nullable + índice parcial UNIQUE + catálogo claude_team + seed de 3 linhas). Módulo `subscriptions/` (types/price-table/enrich-supabase/enrich-vercel) + `subscription-summary.ts` (+ teste 7/7) + cron `billing-subscription-enrich` (`45 10 * * *`). AC12 corrigido no cron 78-11 (due_date nullable + filtro de null antes de deveAlertar). GET/PATCH de billing-reminders estendidos (AC13/AC14) + whitelist em reminder-validation. **Correção factual (Article IV):** endpoint GET de membros da Vercel é `/v3/teams/{teamId}/members` (a story assumia `/v2`, que só tem POST) — confirmado na OpenAPI oficial; Supabase confirmado em `/v1/organizations/{slug}/members` (array puro). **AC10 aberta:** T-Vercel-Dedup não executável nesta sessão (sem token real) — default seguro mantido (Vercel `excluded=true`, nunca soma), verificação delegada ao @devops no deploy. tsc/eslint limpos (só os 4 erros pré-existentes), 73/73 testes billing passando. T5.3/T7 (validação manual em DEV) pendentes de migration aplicada + secrets. | @dev (Dex) | [AUTO-DECISION] Cron path = `billing-subscription-enrich` (não `billing-enrich-subscriptions` do prompt do lead) → reason: a story (AC11/DoD/Files) é autoritativa. [AUTO-DECISION] Paginação Vercel v3 seguindo `pagination.next` via param `since`, limit=100, salvaguarda MAX_PAGES=20 + set de cursores vistos → reason: contrato v3 usa cursor de timestamp; defensivo contra loop caso o param divirja (time da Trifold cabe na 1ª página). [AUTO-DECISION] `GET billing-reminders` ordenado com `nullsFirst:false` → reason: due_date agora nullable; não jogar assinaturas fixas sem data no topo da lista. |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M) — @dev (Dex), modo autônomo YOLO.

### Debug Log References
- `npx tsc --noEmit` (packages/web): 0 erros novos. Restam apenas os 4 pré-existentes não relacionados (`react-email-editor` ×3, `pdf-lib` ×1 — módulos não instalados no ambiente).
- `npx eslint` nos 11 arquivos criados/alterados: 0 erros / 0 warnings.
- `npx vitest run packages/web/src/lib/billing/subscription-summary.test.ts`: 7/7 passando.
- `npx vitest run packages/web/src/lib/billing/`: 73/73 passando (sem regressão nas suítes 78-11/78-12/78-13 após a mudança de tipo `due_date`).

### Completion Notes List

**Migration (T2.1 / T8.1):** número confirmado via `ls supabase/migrations/*.sql | sort | tail` = última real `171_billing_cost_alerts_summary.sql` → **`172`** livre (sem renumeração). Arquivo: `172_service_billing_fixed_subscriptions.sql`. Idempotente (`ADD COLUMN IF NOT EXISTS`, `DROP NOT NULL` no-op se já nullable, `CREATE UNIQUE INDEX IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`). **NÃO aplicada em banco** (fora do escopo @dev — @devops aplica no deploy).

**Endpoints de membros confirmados na OpenAPI oficial (T1.4 / T1.5 / T8.3):**
- **Supabase:** `GET /v1/organizations/{slug}/members` — CONFIRMADO em `https://api.supabase.com/api/v1-json`. Responde um **ARRAY puro** de `V1OrganizationMemberResponse` (sem paginação no contrato) → `seats = array.length`.
- **Vercel — CORREÇÃO factual à story (Article IV):** a story assumia `GET /v2/teams/{teamId}/members`, mas na OpenAPI oficial (`https://openapi.vercel.sh`) o **`/v2/teams/{teamId}/members` só tem POST**; o método **GET** de listagem de membros está em **`/v3/teams/{teamId}/members`**, respondendo `{ members: [...], pagination: { count, hasNext, next, prev } }` (paginação por cursor de timestamp via param `since`). `enrich-vercel.ts` usa **v3** e pagina defensivamente (limit=100, segue `pagination.next`, salvaguarda de MAX_PAGES=20 e cursores repetidos). Registrado no cabeçalho do arquivo.

**T-Vercel-Dedup (AC10 / T8.2) — NÃO executada nesta sessão; default seguro mantido:** a chamada real a `GET /v1/billing/charges` exige `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` reais, ausentes no ambiente de desenvolvimento desta sessão. Conforme decisão do lead, **mantido o default seguro** (`excluded_from_subscription_total=true` no seed da linha `vercel`, `SUBSCRIPTION_PRICE_TABLE` sem entrada `vercel`, `enrich-vercel.ts` NÃO deriva `expected_amount`). Consequência: a linha Vercel **nunca soma** ao Total de Assinaturas Fixas (AC6 filtra `excluded=false`) até prova em contrário — **anti-dupla-contagem por construção**. **AÇÃO PENDENTE @devops (no deploy):** rodar `GET /v1/billing/charges` numa janela de ciclo completo e inspecionar se a mensalidade Pro (`ChargeCategory=Purchase`, valor fixo reconhecível) já entra no `cost_usd` agregado pela 78-5. Se **overlap DESCARTADO**: setar `excluded_from_subscription_total=false` na linha `vercel` + adicionar `vercel.pro` à `SUBSCRIPTION_PRICE_TABLE` (preço confirmado na doc oficial) + habilitar a derivação de `expected_amount` no `enrich-vercel.ts` (seguindo a mesma regra AC9). `vercelCollector`/`run-collector.ts` permanecem intocados em qualquer ramo. AC10 e a DoD de dedup ficam **abertos** aguardando essa verificação.

**AC12 (fix de runtime no cron 78-11):** `ReminderRow.due_date` tipado como `string | null`; filtro `.filter((r): r is ReminderRow & { due_date: string } => r.due_date !== null)` aplicado ANTES de `deveAlertar()` — evita o `TypeError` de `diffDias().split()` num `null` que as 3 linhas seedadas (due_date=NULL) provocariam. `reminder-schedule.ts` NÃO foi tocado. Validação com `?dry=1` (T5.3) é manual em DEV pós-migration (@devops/@qa).

**AC9 (invariante de não-sobrescrita):** implementada em funções puras `buildSupabaseUpdate`/`buildVercelUpdate` — `subscription_plan`/`last_enriched_at` sempre atualizam; `subscription_seats` só se `seats_source != 'manual'`; `expected_amount` (Supabase) só se `value_source ∉ {'manual'}` e há preço na tabela. `due_date`/`billing_cycle`/`alert_days_before`/`status`/`notes` nunca tocados. AC14 reforça do lado da escrita manual: um PATCH com `expected_amount` marca `value_source='manual'`; com `subscription_seats` marca `seats_source='manual'`, no mesmo request.

**IDS:** módulo `subscriptions/` é **CREATE** justificado (não `BillingCollector`) — alvo/semântica diferentes (estado atual de linha única vs. série temporal diária), conforme Dev Notes. **REUSE**: `createAdminClient`, `logEvent`, `mgmtFetch`-pattern (de `supabase-usage.ts`), motor de alertas 78-11 (intocado), estilo `cost-summary.ts` para a função pura + teste.

**REL-001 (correção pós-QA, medium) — guard de `due_date=null` no PATCH:** o QA gate (Quinn) sinalizou que `PATCH /api/admin/billing-reminders/[id]` com `status='paid'` sobre uma assinatura fixa recorrente sem vencimento (`due_date=NULL`, `billing_cycle='monthly'/'annual'` — estado das 3 linhas seedadas pela migration 172) entrava no ramo de recorrência e chamava `avancarCiclo(atual.due_date, cicloEfetivo)` com `null` → `reminder-schedule.ts` L68 faz `dueDateIso.split("T")` → `TypeError` → HTTP 500 (mesmo risco de runtime da AC12, mas no caminho do PATCH). **Fix mínimo:** a condição do ramo de recorrência passou a exigir `atual.due_date != null`; com `due_date=null`, o PATCH apenas registra `paid_at=now()` (já setado antes do fetch) e devolve 200 sem avançar ciclo, sem resetar `status`/`last_alerted_on`, sem inventar data. A lógica de recorrência para os casos com `due_date` preenchido é **idêntica** (nenhuma mudança). `reminder-schedule.ts` NÃO foi tocado (o TypeError é evitado no chamador, simétrico à AC12 no cron). Cobertura: `[id]/route.test.ts` — caso null→200/`paid_at` setado/sem avançar, e caso preenchido→avança (regressão preservada). Só `[id]/route.ts` + seu teste alterados.

**Desvio de nomenclatura:** o prompt do lead citou `billing-enrich-subscriptions`, mas a story (AC11/DoD/Files) especifica `billing-subscription-enrich` — segui a **story** (autoritativa). Path final: `/api/cron/billing-subscription-enrich`.

**Cron (AC11):** horário `45 10 * * *` confirmado LIVRE contra a lista real e completa do `vercel.json` (vizinhos 10:xx: anthropic 10:00, vercel 10:20, daily-report 10:59 — nenhum 10:45). Best-effort por serviço via `Promise.allSettled`; credencial ausente de um serviço → `skipped` no resumo (200), não bloqueia o outro. Claude Team sem enricher (sem API).

**Validação em DEV (T7):** requer migration aplicada + secrets reais → executada por @qa/@devops no ambiente. As funções puras (AC6/AC15) já cobertas por testes automatizados.

### File List

**Criados:**
- `supabase/migrations/172_service_billing_fixed_subscriptions.sql`
- `packages/web/src/lib/billing/subscriptions/types.ts`
- `packages/web/src/lib/billing/subscriptions/price-table.ts`
- `packages/web/src/lib/billing/subscriptions/enrich-supabase.ts`
- `packages/web/src/lib/billing/subscriptions/enrich-vercel.ts`
- `packages/web/src/lib/billing/subscription-summary.ts`
- `packages/web/src/lib/billing/subscription-summary.test.ts`
- `packages/web/src/app/api/cron/billing-subscription-enrich/route.ts`
- `packages/web/src/app/api/admin/billing-reminders/[id]/route.test.ts` (REL-001 — teste de recorrência-ao-pagar com `due_date=null`)

**Modificados:**
- `packages/web/vercel.json` (novo cron `billing-subscription-enrich`, `45 10 * * *`)
- `packages/web/src/app/api/cron/billing-reminders/route.ts` (AC12 — `due_date` nullable + filtro)
- `packages/web/src/app/api/admin/billing-reminders/route.ts` (AC13 — SELECT + `nullsFirst:false`)
- `packages/web/src/app/api/admin/billing-reminders/[id]/route.ts` (AC14 — deriva `value_source`/`seats_source`, SELECT estendido; **REL-001** — guard `due_date != null` no ramo de recorrência do PATCH)
- `packages/web/src/lib/billing/reminder-validation.ts` (AC14 — whitelist `subscription_plan`/`subscription_seats`)

---

## QA Results

### Review Date: 2026-07-14

### Reviewed By: Quinn (Test Architect)

### Veredito: CONCERNS

Revisão estática completa + execução de testes. 14 dos 15 ACs plenamente satisfeitos; AC10 deferido ao @devops por design (default seguro). O fix crítico do cron (AC12) está **correto e completo** — o risco de produção nº 1 (cron quebrar com `due_date=NULL`) foi eliminado. Um risco de runtime **simétrico** permanece num segundo consumidor de `due_date` (o PATCH de recorrência-ao-pagar) que a mudança de nullable introduziu e a story não cobriu.

#### 7 Quality Checks
| Check | Resultado | Nota |
|-------|-----------|------|
| Code review | PASS | Padrões consistentes com o épico (funções puras + `.test.ts`, `mgmtFetch`, `createAdminClient`, `logEvent`). IDS CREATE do módulo `subscriptions/` bem justificado. |
| Unit tests | PASS | `subscription-summary.test.ts` 7/7; suíte billing 73/73 (sem regressão). |
| Acceptance criteria | CONCERNS | 14/15 met; AC10 deferido (safe default); risco adjacente no PATCH (REL-001). |
| No regressions | PASS | GET/PATCH estendidos preservam CRUD 78-8; `nullsFirst:false` correto; tsc/eslint sem novos erros. |
| Performance | PASS | Enrichers com timeout + paginação defensiva (MAX_PAGES=20); best-effort `allSettled`. |
| Security | PASS | `CRON_SECRET` no enricher; RLS admin-only (164); `value_source`/`seats_source`/`last_enriched_at` derivados no servidor, nunca crus do cliente (whitelist de `validateUpdate`). |
| Documentation | PASS | Comentários de coluna documentam a invariante AC9 no schema; cabeçalhos de arquivo explicam decisões. |

#### AC12 (foco do gate) — VALIDADO
`billing-reminders/route.ts` L151-153: `.filter((r): r is ReminderRow & { due_date: string } => r.due_date !== null)` aplicado **antes** de `deveAlertar()`. Confirmado contra `reminder-schedule.ts` L44 (`diffDias` faz `.split()` num valor que seria `null`). O dry-run path (L157-165) opera sobre `r` já estreitado. **As 3 linhas seedadas com `due_date=NULL` NÃO quebram o cron live** e não aparecem em `wouldAlert`. Filtro completo e suficiente.

#### AC10 (anti-dupla-contagem Vercel) — SEGURO POR CONSTRUÇÃO
Seed `vercel` com `excluded_from_subscription_total=true` + `SUBSCRIPTION_PRICE_TABLE` sem `vercel` + `enrich-vercel.ts` não deriva `expected_amount` + `somarAssinaturasFixasPorMoeda` filtra `excluded=false` ⇒ a Vercel **nunca soma** ao total. A verificação real das charges está corretamente delegada ao @devops (não bloqueia). Correto.

#### Testes
- `npx vitest run subscription-summary.test.ts` → **7/7 passed**
- `npx vitest run packages/web/src/lib/billing/` → **73/73 passed** (sem regressão)
- `tsc --noEmit` → apenas 4 erros pré-existentes (`react-email-editor`, `pdf-lib`, implicit any em `visual-editor.tsx`) — **nenhum** nos arquivos da 78-14
- `eslint` nos 11 arquivos da story → **0 erros / 0 warnings**
- Cron `45 10 * * *` → **único**, sem colisão (vizinhos 10:20 e 10:59); migration `172` = próximo número livre confirmado.

#### Issues
- **REL-001 (medium):** `PATCH /api/admin/billing-reminders/[id]` com `status='paid'` sobre uma assinatura fixa (`due_date=NULL`, `billing_cycle='monthly'`) entra no ramo de recorrência e chama `avancarCiclo(null, 'monthly')` → `null.split("T")` → TypeError → HTTP 500. **Mesmo risco de runtime da AC12, mas no PATCH** (não coberto pela story). Não alcançável por UI hoje (78-15 não existe) nem pelo cron; alcançável por chamada direta à API ou pela futura UI da 78-15. **Sugestão (@dev, antes/na 78-15):** só entrar no ramo de recorrência se `atual.due_date != null` (guard em `[id]/route.ts` L86).
- **REQ-001 (low):** AC10 [ ] — T-Vercel-Dedup pendente de token real; não é defeito (default seguro cobre). @devops executa no deploy.

#### Próximo passo
Pode seguir para @devops push — o cron está seguro e não há regressão. REL-001 deve ser corrigido pelo @dev antes/durante a 78-15 (que constrói a UI capaz de disparar o path). @devops executa a verificação AC10 no deploy mantendo `excluded=true` enquanto pendente.

### Gate Status

Gate: CONCERNS → docs/qa/gates/78.14-assinaturas-fixas-backend.yml

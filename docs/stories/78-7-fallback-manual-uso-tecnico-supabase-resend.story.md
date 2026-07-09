# Story 78-7 — Fallback Manual + Uso Técnico (Supabase & Resend)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-7
- **Status:** Ready
- **Priority:** P2 — visibilidade complementar (não bloqueia o "coração" do épico, que é a Story 78-8); mas fecha a camada FRACA do catálogo (Supabase, Resend), os únicos 2 dos 7 serviços sem qualquer API de custo/fatura
- **Complexity:** M (2 coletores de USO — não de custo — adaptando o contrato da 78-3; 2 rotas de cron novas; sem migration; ~6-8h)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[contract_adaptation_review, currency_null_invariant_check, idempotency_test, cron_auth_review]`

> Mapping confirmado no Epic 78 (§7, tabela de stories): "78-7 | Fallback manual + uso técnico (Supabase & Resend) | ... | @dev | @architect".

---

## User Story

**Como** Trifold CRM (plataforma),
**Quero** dois coletores de **uso técnico** (não de custo em $) para Supabase (plano + requests/egress via Management API) e Resend (quota via headers de resposta + contagem de envios via `email_logs`), rodando via cron autenticado e adaptando o mesmo contrato `BillingCollector`/`runCollector()` fixado na Story 78-3, gravando snapshots idempotentes sem nunca inserir uma moeda,
**Para que** o Painel de Saúde & Billing (78-9) tenha visibilidade de uso desses 2 serviços sem endpoint de fatura, deixando claro — por construção do dado, não por lógica nova na UI — que o **valor/vencimento** desses 2 serviços continua **100% manual** (Story 78-8), nunca inventado a partir de uma métrica de uso.

---

## Context

O Epic 78 classifica os 7 serviços em 3 camadas de automação (§2.1). Anthropic/OpenAI/Vercel (FORTE) e WhatsApp/Meta Ads (MÉDIA) têm APIs de custo em $ e são cobertos pelas Stories 78-3 a 78-6/78-10. **Supabase e Resend são a camada FRACA — CON-3 do épico é explícito: "Supabase e Resend não têm endpoint de fatura/valor — custo desses dois é sempre manual; a automação só traz uso técnico."**

Esta story **não coleta custo**. Ela coleta **uso técnico** (requests, egress, plano de assinatura no caso do Supabase; quota mensal + contagem de envios no caso do Resend) e grava esse uso em `service_cost_snapshots` (a mesma tabela dos coletores de custo, fixada na Story 78-1) — mas **sempre com `currency = null`**, porque nenhuma dessas métricas é monetária. O valor esperado e a data de vencimento desses 2 serviços continuam vindo **exclusivamente** do cadastro manual da Story 78-8 (`service_billing_reminders`), que já está pronta para consumir esses 2 slugs sem nenhuma mudança.

**Por que isso importa para 78-9 (UI):** a Story 78-9 (Draft) já documentou a regra de agregação de "gasto do mês" como `service_cost_snapshots WHERE currency IS NOT NULL`. Se esta story, por engano, gravasse uma métrica de uso com `currency` preenchida (ex.: um valor de "custo estimado" inventado a partir de bytes de egress), o gasto do mês do painel ficaria **poluído** com um número que não é uma fatura real — violação direta do CON-3 e do NFR-7 (não inventar conversão/custo). Por isso a invariante "esta story nunca grava `currency`" é uma Acceptance Criteria explícita (AC4), não um detalhe implícito.

**Padrão de referência (adaptar, não recriar — IDS: 78-3 cria o contrato, 78-4 a 78-7/78-10 adaptam):** `packages/web/src/lib/billing-collectors/types.ts` (`BillingCollector`, `CostSnapshotRow`, `CollectorResult`) e `run-collector.ts` (`runCollector()` — resolve `service_id` por slug, upsert idempotente, isola falha), ambos já implementados e documentados na Story 78-3 (Status: Draft nesta data, mas o contrato já está fixado e é a referência canônica desde a criação daquela story).

---

## Scope

### IN (esta story entrega)

- **Coletor de uso Supabase** (`supabase-usage.ts`): implementa `BillingCollector` para o slug `supabase`, chamando a Supabase Management API (`GET /v1/organizations/{slug}` para plano + `GET /v1/projects/{ref}/analytics/endpoints/usage.*` para requests/egress — nomes exatos de endpoint/campo a confirmar em T1, ver Dev Notes) e gravando linhas com `currency = null` — FR-6.
- **Coletor de uso Resend** (`resend-usage.ts`): implementa `BillingCollector` para o slug `resend`, lendo o header `x-resend-monthly-quota` de uma chamada autenticada read-only ao Resend, **e** contando envios via `email_logs` (tabela já existente, populada por `sendTemplateEmail()` e pelo webhook `/api/webhook/resend` já em produção) — gravando `currency = null` — FR-6.
- **2 rotas de cron autenticadas**: `packages/web/src/app/api/cron/billing-collect-supabase/route.ts` e `.../billing-collect-resend/route.ts`, seguindo o padrão `CRON_SECRET` idêntico ao usado na Story 78-3.
- **Registro no `vercel.json`**: 2 novos entries de cron 1×/dia, em horários sem colisão com os já ocupados.
- **Nenhuma mudança** em `platform_services` (os 2 slugs já existem, seedados na 78-1 com `automation_tier = 'fraca'` e `has_auto_cost_collection = false` — esta story **não altera** esse flag, porque o custo continua manual; só o **uso** passa a ser automático).

### OUT (não entra nesta story)

- Qualquer coleta de **custo em $** para Supabase ou Resend — CON-3 do épico proíbe isso (não existe endpoint); se o produto algum dia mudar de plano/fornecedor com API de fatura, isso seria uma revisão futura de escopo, não implementada aqui.
- CRUD de vencimentos/valor manual (`service_billing_reminders`) — já entregue pela Story 78-8; esta story não toca nessa tabela nem sua API.
- Alterar `platform_services.billing_url_confirmed` do slug `supabase` (mesmo que `SUPABASE_ORG_SLUG` da Story 78-2 já habilite isso) — está fora do escopo desta story; fica como nota para o @po/@sm decidirem quem faz esse `UPDATE` pontual (ver Riscos).
- UI do painel (78-9) — esta story só grava dado; a UI já tem a regra de agregação correta (`WHERE currency IS NOT NULL`) e não precisa de nenhuma mudança para excluir corretamente as linhas desta story.
- Coletores de Anthropic/OpenAI/Vercel/WhatsApp/Meta Ads (78-3 a 78-6/78-10).
- Qualquer migration nova — reaproveita 100% o schema da Story 78-1.

---

## Acceptance Criteria

- [ ] **AC1 — Ambos os coletores adaptam o contrato `BillingCollector` da 78-3, sem modificá-lo:** `packages/web/src/lib/billing-collectors/supabase-usage.ts` e `.../resend-usage.ts` importam `BillingCollector`, `CostSnapshotRow`, `CollectorResult` de `types.ts` e são executados através de `runCollector()` (mesmo import, sem editar `types.ts`/`run-collector.ts`). Nenhum novo runner, nenhuma nova função de upsert é criada.

- [ ] **AC2 — Coletor Supabase grava uso técnico, nunca custo:** `collectSupabaseUsage(window)` chama a Supabase Management API com `Authorization: Bearer ${SUPABASE_MANAGEMENT_PAT}` e grava ao menos: (a) uma linha `metric = 'supabase_plan_info'` com `value = 1` e `raw_response` contendo o nome/tier do plano retornado pela API (o valor numérico da coluna `value` não pode carregar uma string — o nome do plano vive em `raw_response`, nunca inventado como número); (b) linhas de uso técnico quando disponíveis pela API de analytics (ex.: `metric = 'supabase_requests_total'`, `metric = 'supabase_egress_bytes'`), sempre com `currency = null` e `collection_status = 'ok'`.

- [ ] **AC3 — Coletor Resend grava quota + contagem de envios, nunca custo:** `collectResendUsage(window)` (a) faz uma chamada autenticada de baixo custo à API do Resend (`Authorization: Bearer ${RESEND_API_KEY}` — env var **já existente** no projeto, usada por `packages/web/src/lib/email.ts`; não é um secret novo) e lê o header de resposta `x-resend-monthly-quota`, gravando `metric = 'resend_monthly_quota_limit'`, `value = Number(header)`, `currency = null`, `collection_status = 'ok'`; (b) conta em paralelo, via query direta em `email_logs` (`status != 'failed' AND sent_at BETWEEN window.from AND window.to`), o total de envios do período, gravando `metric = 'resend_emails_sent_count_email_logs'`, `value = count`, `currency = null`, `collection_status = 'ok'`.

- [ ] **AC4 — Invariante: nenhuma linha desta story tem `currency` preenchida:** Toda `CostSnapshotRow` produzida por `supabase-usage.ts` e `resend-usage.ts` tem `currency: null` explicitamente (nunca `"USD"`/`"BRL"`). Isso garante que a query de agregação de "gasto do mês" da Story 78-9 (`WHERE currency IS NOT NULL`) **nunca** inclui essas linhas — validado manualmente consultando `service_cost_snapshots` após rodar os 2 coletores (ver Testing).

- [ ] **AC5 — Ausência de secret degrada graciosamente (mesmo padrão da AC8 da 78-3):** Se `SUPABASE_MANAGEMENT_PAT` não estiver definida, `GET /api/cron/billing-collect-supabase` retorna `503 { error: "SUPABASE_MANAGEMENT_PAT not set" }` sem chamar a API e sem gravar snapshot algum. Se `RESEND_API_KEY` não estiver definida, `GET /api/cron/billing-collect-resend` retorna `503 { error: "RESEND_API_KEY not set" }` sem chamar a API — mas **ainda assim tenta** a contagem via `email_logs` (essa parte não depende do Resend estar configurado; documentar essa distinção no Completion Notes se implementada dessa forma, ou justificar por que optou por bloquear as duas partes juntas).

- [ ] **AC6 — Falha isolada de uma sub-chamada não derruba o coletor inteiro:** Se a chamada de plano (Supabase) ou de quota (Resend) falhar mas a chamada de uso/contagem tiver sucesso (ou vice-versa), o coletor retorna as linhas que conseguiu obter — não propaga exceção só porque uma das 2 sub-chamadas falhou (mesmo princípio do AC9 da 78-3 para `usage_report/messages` opcional). Se **ambas** falharem, o `collect()` lança exceção e o `runCollector()` (78-3) grava a linha `collection_status='error'` padrão, sem intervenção adicional desta story.

- [ ] **AC7 — Idempotência (NFR-4, reuso do runner):** Rodar cada coletor 2× para a mesma janela resulta em exatamente uma linha por `(service_id, snapshot_date, metric)` — comportamento herdado do `runCollector()` da 78-3, sem lógica adicional necessária nesta story; validado manualmente (ver Testing).

- [ ] **AC8 — Cron autenticado por `CRON_SECRET` (idêntico ao padrão da 78-3):** `GET /api/cron/billing-collect-supabase` e `GET /api/cron/billing-collect-resend` retornam `503` sem `CRON_SECRET` configurado, `401` com header `Authorization` incorreto, e prosseguem com auth correta — nenhuma variação do padrão já usado em `billing-collect-anthropic`.

- [ ] **AC9 — `vercel.json` atualizado sem colisão de horário:** 2 novos entries — `{ "path": "/api/cron/billing-collect-supabase", "schedule": "0 13 * * *" }` e `{ "path": "/api/cron/billing-collect-resend", "schedule": "0 14 * * *" }` (13:00 e 14:00 UTC, horários livres confirmados contra a lista completa de crons já existentes em `packages/web/vercel.json`, incluindo o `"0 10 * * *"` já adicionado pela Story 78-3).

- [ ] **AC10 — Nenhuma mudança em `platform_services`/`service_billing_reminders`:** Esta story não executa nenhum `UPDATE`/`INSERT`/`DELETE` em `platform_services` (os slugs `supabase`/`resend` e seus flags `automation_tier`/`has_auto_cost_collection` permanecem exatamente como seedados na 78-1) nem em `service_billing_reminders` (cadastro manual continua 100% responsabilidade da Story 78-8, sem duplicação de lógica).

---

## Tasks / Subtasks

- [ ] **T1 — Preparação e confirmação de contrato/API** (AC1, AC2, AC3)
  - [ ] T1.1 — Reler Story 78-1 (contrato de `service_cost_snapshots`: `metric` livre sem CHECK, `currency` nullable, `collection_status` enum) e Story 78-2 (nomes exatos `SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG` — não inventar variação)
  - [ ] T1.2 — Reler Story 78-3 (contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult`, `runCollector()`, padrão de cron `CRON_SECRET`) — este é o código a **adaptar**, não recriar
  - [ ] T1.3 — Confirmar via documentação oficial da Supabase Management API os endpoints e nomes de campo exatos de `GET /v1/organizations/{slug}` (campo de plano) e `GET /v1/projects/{ref}/analytics/endpoints/usage.*` (nomes reais dos endpoints de uso — o épico usa `usage.*` como wildcard, não como nome literal) — via `context7`/busca web; não inventar nomes de campo (Artigo IV). Documentar o formato real encontrado em Completion Notes
  - [ ] T1.4 — Confirmar como derivar o **project ref** do Supabase sem criar env var nova: extrair do subdomínio de `NEXT_PUBLIC_SUPABASE_URL` (já existente, ex. `https://dsopqkqjkmhytudaaolv.supabase.co` → ref `dsopqkqjkmhytudaaolv`) — nenhuma nova credencial necessária além das já fixadas na 78-2
  - [ ] T1.5 — Confirmar via documentação oficial do Resend qual endpoint autenticado de baixo custo retorna o header `x-resend-monthly-quota` na resposta (ex.: `GET /domains` ou `GET /api-keys` — confirmar em T1, não assumir) — via `context7`/busca web
  - [ ] T1.6 — Ler `packages/web/src/lib/email.ts` (`sendTemplateEmail`, `RESEND_API_KEY`) e `packages/web/src/app/api/webhook/resend/route.ts` (já grava `email_logs.sent_at`/`status` para envios via template) para confirmar exatamente quais envios ficam registrados em `email_logs`
  - [ ] T1.7 — Confirmar com @po/@sm se o status atual das Stories 78-2 (secrets) e 78-3 (contrato) já avançou o suficiente para permitir validação end-to-end; se não, prosseguir mesmo assim (AC5 cobre a ausência de secret)

- [ ] **T2 — Coletor de uso Supabase** (AC2, AC4, AC6)
  - [ ] T2.1 — Criar `packages/web/src/lib/billing-collectors/supabase-usage.ts` implementando `BillingCollector` (`serviceSlug: 'supabase'`)
  - [ ] T2.2 — Chamada de plano (`GET /v1/organizations/{slug}` com `SUPABASE_ORG_SLUG`) → linha `metric='supabase_plan_info'`, `value=1`, `raw_response` com o payload relevante, `currency=null`
  - [ ] T2.3 — Chamada(s) de uso técnico (`GET /v1/projects/{ref}/analytics/endpoints/usage.*`, ref derivado de T1.4) → linha(s) `metric='supabase_requests_total'`/`'supabase_egress_bytes'` (nomes exatos conforme confirmado em T1.3), `currency=null`
  - [ ] T2.4 — Isolar cada sub-chamada em seu próprio try/catch (AC6) — se uma falhar, retornar só as linhas que tiveram sucesso; se ambas falharem, propagar exceção (o runner trata)
  - [ ] T2.5 — Se `SUPABASE_MANAGEMENT_PAT` ausente, lançar erro tipado tratado pela rota como 503 (AC5), distinto do erro genérico do runner

- [ ] **T3 — Coletor de uso Resend** (AC3, AC4, AC6)
  - [ ] T3.1 — Criar `packages/web/src/lib/billing-collectors/resend-usage.ts` implementando `BillingCollector` (`serviceSlug: 'resend'`)
  - [ ] T3.2 — Chamada autenticada ao endpoint confirmado em T1.5 → ler header `x-resend-monthly-quota` → linha `metric='resend_monthly_quota_limit'`, `currency=null`
  - [ ] T3.3 — Query em `email_logs` (usando `createAdminClient()`) contando `status != 'failed' AND sent_at BETWEEN window.from AND window.to` → linha `metric='resend_emails_sent_count_email_logs'`, `currency=null`
  - [ ] T3.4 — Isolar as 2 sub-chamadas (AC6); documentar explicitamente no JSDoc do arquivo que esta contagem **não** inclui envios feitos via `sendEmail()` direto fora do fluxo de template (ex.: caminho legado de campanhas) — é uma métrica de uso **parcial**, não a contagem total real de envios Resend (AC10 exige essa transparência)
  - [ ] T3.5 — Se `RESEND_API_KEY` ausente, decidir e documentar (Completion Notes) se a rota bloqueia as 2 sub-chamadas juntas (503 simples) ou só a parte de quota, deixando a contagem via `email_logs` prosseguir — AC5 exige ao menos justificar a escolha

- [ ] **T4 — Rotas de cron** (AC5, AC8, AC9)
  - [ ] T4.1 — Criar `packages/web/src/app/api/cron/billing-collect-supabase/route.ts` com auth `CRON_SECRET` idêntico ao padrão de `billing-collect-anthropic` (78-3)
  - [ ] T4.2 — Criar `packages/web/src/app/api/cron/billing-collect-resend/route.ts`, mesmo padrão
  - [ ] T4.3 — Cada rota: checar o respectivo secret antes de chamar o coletor (AC5), default de janela = ontem em `America/Sao_Paulo` (NFR-8, mesma abordagem da 78-3), aceitar `?from=&to=` opcionais (FR-10)
  - [ ] T4.4 — Chamar `runCollector(admin, collector, window)` e retornar `CollectorResult` como JSON
  - [ ] T4.5 — Adicionar as 2 entries em `packages/web/vercel.json` (AC9)

- [ ] **T5 — Validação manual em DEV** (AC4, AC5, AC7, AC8)
  - [ ] T5.1 — Chamar as 2 rotas sem auth → 401; sem `CRON_SECRET` → 503
  - [ ] T5.2 — Chamar sem os respectivos secrets de terceiro → 503 (Supabase) / comportamento documentado em T3.5 (Resend)
  - [ ] T5.3 — Com secrets válidos, confirmar linhas gravadas com `currency = null` em ambos os coletores (AC4) — `SELECT metric, value, currency FROM service_cost_snapshots WHERE service_id IN (SELECT id FROM platform_services WHERE slug IN ('supabase','resend'))`
  - [ ] T5.4 — Rodar cada rota 2× para a mesma janela → confirmar 1 linha por métrica/dia (AC7)
  - [ ] T5.5 — Confirmar que `platform_services` e `service_billing_reminders` não sofreram nenhuma alteração após rodar os coletores (AC10)

- [ ] **T6 — Documentar no Change Log / Completion Notes**
  - [ ] T6.1 — Registrar o formato real das APIs Supabase/Resend encontrado em T1.3/T1.5
  - [ ] T6.2 — Registrar a decisão tomada em T3.5 (bloqueio total vs. parcial na ausência de `RESEND_API_KEY`)

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/lib/billing-collectors/supabase-usage.ts` — coletor de uso técnico Supabase
- `packages/web/src/lib/billing-collectors/resend-usage.ts` — coletor de uso técnico Resend
- `packages/web/src/app/api/cron/billing-collect-supabase/route.ts` — rota de cron autenticada
- `packages/web/src/app/api/cron/billing-collect-resend/route.ts` — rota de cron autenticada

### Arquivo a modificar
- `packages/web/vercel.json` — 2 novos entries de cron (AC9)

### Arquivos NÃO tocados por esta story (confirmar antes de editar por engano)
- `packages/web/src/lib/billing-collectors/types.ts` e `run-collector.ts` — contrato fixado pela 78-3, **adaptado, não modificado**
- `packages/web/src/app/api/webhook/resend/route.ts` — webhook já existente que popula `email_logs`/`campaign_entries`; esta story só **lê** `email_logs`, não altera o webhook
- `docs/stories/78-8-...story.md` (`service_billing_reminders`) — cadastro manual de valor/vencimento continua 100% naquela story; esta story não duplica CRUD nem lógica de lembrete

### Arquivos de referência obrigatórios (ler antes de implementar)
- `docs/stories/78-1-modelo-dados-billing.story.md` — contrato de `service_cost_snapshots` (`metric` livre, `currency` nullable, `collection_status` enum `ok`/`manual`/`no_data`/`error`) e seed dos slugs `supabase`/`resend` (`automation_tier='fraca'`, `has_auto_cost_collection=false` — **não alterar**)
- `docs/stories/78-2-provisionamento-secrets-billing.story.md` — nomes exatos `SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG` (contrato fixado, não inventar variação); `RESEND_API_KEY` **não faz parte** desse contrato porque já existe no projeto desde antes do Epic 78 (não é uma credencial nova de billing)
- `docs/stories/78-3-coletor-anthropic-padrao.story.md` — o contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult` e o `runCollector()` completos (código de referência incluso naquela story), além do padrão de cron `CRON_SECRET`/`maxDuration`/janela `America/Sao_Paulo`
- `packages/web/src/lib/email.ts` — `sendTemplateEmail()` grava `email_logs` (`status`, `sent_at`, `resend_email_id`); `sendEmail()` (uso legado, ex. caminho de campanhas) **não** grava `email_logs` — ver limitação documentada abaixo
- `packages/web/src/app/api/webhook/resend/route.ts` — já processa eventos `email.delivered`/`email.opened`/`email.bounced`/`email.clicked`/`email.complained` e atualiza `email_logs`/`campaign_entries`; esta story não modifica esse arquivo, apenas confirma que `email_logs.sent_at` é uma fonte de dado válida para contagem
- `supabase/migrations/018_email_central.sql` — schema de `email_logs` (colunas `status`, `sent_at`, `org_id`, etc.)
- `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`) — usado tanto pelo `runCollector()` quanto pela query direta de contagem em `email_logs` dentro do coletor Resend

### Por que "uso técnico" nunca deve carregar `currency` (AC4 — a invariante central desta story)
A Story 78-9 (UI) já fixou a regra de agregação do "gasto do mês" consolidado como `SUM(value) FROM service_cost_snapshots WHERE currency IS NOT NULL`. Essa regra **já exclui corretamente** qualquer linha desta story, **desde que** os coletores nunca preencham `currency`. Não há nenhuma lógica nova a escrever na UI — a exclusão é uma consequência automática de os coletores desta story nunca setarem `currency`. É por isso que AC4 é uma Acceptance Criteria própria (não apenas um detalhe de implementação): um erro aqui (ex.: por copiar/colar do coletor Anthropic e esquecer de zerar `currency`) contaminaria silenciosamente o total consolidado do painel com um número que não é uma fatura real — exatamente o tipo de erro que CON-3/NFR-7 do épico pedem para evitar.

### Limitação conhecida e documentada — contagem de envios Resend é parcial (AC10)
`email_logs` é populada por `sendTemplateEmail()` (fluxo de template, Epic 18) e atualizada pelo webhook `/api/webhook/resend/route.ts`. O caminho **legado** de campanhas (`sendEmail()` chamado diretamente, sem passar por `sendTemplateEmail()`) **não grava** uma linha em `email_logs` — o webhook, para esse caminho, atualiza `campaign_entries`/`campaign_events` diretamente via a tag `entry_id` (ver `route.ts`, ramo `entry_id` vs. `email_log_id`). Isso significa que `metric='resend_emails_sent_count_email_logs'` desta story **subconta** o uso real do Resend sempre que campanhas legadas estiverem ativas no período. Esta é uma limitação **conhecida e aceita** (Article IV — não inventar uma contagem "completa" que o dado atual não sustenta); o nome da métrica (`..._email_logs`, não `..._total`) já comunica esse escopo parcial no próprio dado, e o JSDoc do coletor deve repetir essa ressalva. Se o produto quiser uma contagem 100% precisa no futuro, a opção mais robusta seria contar diretamente pelos webhooks do Resend (todo envio gera ao menos um evento) somando `campaign_events` + `email_logs` — fora do escopo desta story (não inventar essa consolidação agora).

### Header de quota do Resend — o que ele representa (não confundir com "uso")
`x-resend-monthly-quota` (conforme classificação do próprio épico, §2.1) é o **limite** do plano contratado, não o consumo atual. Por isso esta story grava esse valor com um nome de métrica explícito (`resend_monthly_quota_limit`) em vez de `resend_usage` — evita que a UI (78-9) ou um humano lendo `service_cost_snapshots` confunda "quanto pode enviar" com "quanto já enviou". O "quanto já enviou" é a métrica separada `resend_emails_sent_count_email_logs` (com a ressalva de parcialidade documentada acima). `x-resend-daily-quota` só existe no plano free (conforme discovery do épico) — não assumir que ele sempre estará presente.

### Uso técnico Supabase — por que `supabase_plan_info` grava `value=1`
A coluna `service_cost_snapshots.value` é `numeric NOT NULL` (contrato fixado na 78-1) — não existe uma coluna de texto para "nome do plano". Em vez de inventar uma conversão numérica sem sentido para o nome do plano (ex.: mapear "Pro"→1, "Free"→0 como se fosse uma escala), esta story usa `value=1` como um marcador de presença ("esta linha existe, o dado real está em `raw_response`") e grava o payload relevante (incluindo o campo de plano, uma vez confirmado o nome exato em T1.3) dentro de `raw_response jsonb` — coluna já pensada para isso na 78-1 ("payload bruto da API para depuração"). A Story 78-9 (UI), ao exibir esse dado, deve ler `raw_response` para mostrar o nome do plano, não o campo `value`.

### Project ref do Supabase — de onde vem (sem nova credencial)
O épico e a Story 78-2 não criaram uma env var dedicada para o "project ref" do Supabase de produção — porque ele já está disponível: `NEXT_PUBLIC_SUPABASE_URL` (ex. `https://dsopqkqjkmhytudaaolv.supabase.co`) já existe no ambiente Vercel de produção (ver `.claude/agent-memory/.../reference_supabase_management_api.md`), e o subdomínio antes de `.supabase.co` **é** o project ref usado pela Management API (`GET /v1/projects/{ref}/...`). Extrair com uma regex simples (`new URL(url).hostname.split('.')[0]`), sem adicionar nenhuma env var nova.

### Padrão de cron autenticado (reuso literal da 78-3)
```ts
// Idêntico ao padrão de packages/web/src/app/api/cron/billing-collect-anthropic/route.ts (Story 78-3)
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

### `vercel.json` — horários escolhidos (confirmar contra a lista completa antes de editar)
Horários já ocupados (ver `packages/web/vercel.json` na íntegra + o entry já adicionado pela 78-3): `*/30` (3 crons), `0 */2`, `*/3` (2 crons), `0 8`, `0 */4` (2 crons), `0 9`, `0 11` (2 crons), `0 * * * *` (a cada hora), `0 12` (appointment-email-reminders, e a 78-8 propôs o mesmo horário para `billing-reminders` — fora do escopo desta story revisar essa colisão), `*/30` (mais 2), `0 2 * * 1`, `0 6 * * 1`, `0 */6`, `0 4`, `59 10` (daily-report), `*/10`, `*/5`, `0 12,15,18,21` (boleto-scan), `0 10` (billing-collect-anthropic, 78-3). Esta story usa **`0 13 * * *`** (Supabase) e **`0 14 * * *`** (Resend) — ambos livres, sem colisão com nenhum horário fixo específico já listado (a existência do cron horário `0 * * * *` de `email-queue` não é uma "colisão" no sentido bloqueante; é uma execução independente que roda todo hora de qualquer forma).

### Nota fora de escopo — `platform_services.billing_url_confirmed` do Supabase
A Story 78-2 documentou que `SUPABASE_ORG_SLUG` "também destrava a atualização futura do seed `billing_url_confirmed=true`" da 78-1 para o slug `supabase`, mas explicitamente "fora do escopo desta story" (78-2). Esta Story 78-7 também **não assume** essa atualização — ela usa `SUPABASE_ORG_SLUG` apenas para a chamada de uso técnico, sem tocar em `platform_services`. Se o time quiser resolver esse `UPDATE` pontual, é uma tarefa de escopo mínimo que deveria ser explicitamente atribuída (ao @po/@sm decidir onde encaixar — não inventado aqui como tarefa implícita desta story).

### Testing Standards
- Não há suíte de testes automatizados para os coletores no projeto até o momento (mesmo padrão observado nas Stories 78-1/78-3) — validação é manual em DEV chamando as rotas diretamente e inspecionando `service_cost_snapshots`
- Se o @dev optar por mockar `fetch`/`email_logs` com Vitest, seguir o padrão já usado em testes de rota de cron existentes (ex.: `packages/web/src/app/api/cron/boleto-scan/route.test.ts`, citado como referência pela Story 78-8) — adicional bem-vindo, não bloqueante

---

## Testing

### Abordagem
- Validação manual em ambiente DEV (Supabase `xnxvygyfyyyzwhiuoehz`), chamando `/api/cron/billing-collect-supabase` e `/api/cron/billing-collect-resend` diretamente com os headers corretos/incorretos
- Sem suíte automatizada obrigatória nesta story (ver Testing Standards acima)

### Cenários de teste

1. **Auth ausente (ambas rotas):** Chamar sem header `Authorization` → 401.
2. **Secret de cron não configurado:** Sem `CRON_SECRET` → 503.
3. **Secret Supabase ausente:** Sem `SUPABASE_MANAGEMENT_PAT` → 503, nenhuma linha nova gravada.
4. **Secret Resend ausente:** Sem `RESEND_API_KEY` → comportamento conforme decisão documentada em T3.5/Completion Notes (503 total ou 503 parcial + contagem via `email_logs` ainda executada).
5. **Coleta Supabase bem-sucedida:** Com `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG` configurados, chamar a rota → linha(s) `metric` começando com `supabase_` aparecem em `service_cost_snapshots`, todas com `currency = null`.
6. **Coleta Resend bem-sucedida:** Com `RESEND_API_KEY` configurada, chamar a rota → linhas `resend_monthly_quota_limit` e `resend_emails_sent_count_email_logs` aparecem, ambas com `currency = null`.
7. **Invariante `currency = null` (AC4):** `SELECT DISTINCT currency FROM service_cost_snapshots WHERE service_id IN (SELECT id FROM platform_services WHERE slug IN ('supabase','resend'))` retorna **apenas** `NULL` (nunca `'USD'`/`'BRL'`).
8. **Idempotência (AC7):** Rodar cada rota 2× para a mesma janela → `count(*)` por `(service_id, snapshot_date, metric)` permanece `1`.
9. **Falha isolada de sub-chamada (AC6):** Simular falha só na chamada de plano do Supabase (mantendo a de uso funcionando, ou vice-versa) → o coletor ainda retorna a(s) linha(s) que conseguiu obter, sem lançar exceção total.
10. **Nenhuma mudança em `platform_services`/`service_billing_reminders` (AC10):** Comparar um dump dessas 2 tabelas antes/depois de rodar os coletores — nenhuma diferença.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Nomes exatos dos endpoints de uso técnico do Supabase (`usage.*`) e do endpoint Resend que retorna o header de quota não estão confirmados nos documentos do projeto | Média | T1.3/T1.5 exigem consulta à documentação oficial antes de implementar; Completion Notes registra o formato real encontrado (mesmo tratamento dado pela 78-3 aos parâmetros da Anthropic Admin API) |
| R2 | Confundir `x-resend-monthly-quota` (limite do plano) com "uso atual", poluindo a leitura do painel | Média | Nome de métrica explícito (`resend_monthly_quota_limit` vs. `resend_emails_sent_count_email_logs`) documentado nos Dev Notes |
| R3 | Gravar `currency` por engano (copiar/colar do coletor Anthropic) e contaminar o "gasto do mês" agregado da 78-9 | Alta (se ocorrer) | AC4 é uma Acceptance Criteria própria, com cenário de teste dedicado (#7) verificando a invariante via query direta |
| R4 | Contagem de envios Resend via `email_logs` ser interpretada como "uso real total" quando na verdade é parcial (não cobre o caminho legado de campanhas) | Média | AC10 exige o nome da métrica (`..._email_logs`) e o JSDoc comunicarem o escopo parcial explicitamente; documentado nos Dev Notes |
| R5 | `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG` ainda não provisionados (78-2 em Draft) impedem validação end-to-end completa | Média (conhecida) | Mesma mitigação da 78-3: AC5 garante degradação graciosa (503) sem bloquear a implementação/revisão de código |
| R6 | Novo cron em `vercel.json` colide de horário com cron existente | Baixa | Dev Notes lista todos os horários já ocupados (incluindo o já adicionado pela 78-3); `"0 13 * * *"`/`"0 14 * * *"` escolhidos como livres |

---

## Dependencies

- **Depende de:** Story 78-1 (Status: Ready — schema `platform_services`/`service_cost_snapshots`, migration `164`), Story 78-3 (Status: Draft — contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult` + `runCollector()`; esta story **adapta**, não recria), Story 78-2 (Status: Draft — `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG`; `RESEND_API_KEY` já existe independentemente do Epic 78)
- **Não depende de:** Story 78-8 (motor de lembretes/valor manual — independente; ambas as stories escrevem em tabelas diferentes e não têm ordem de execução obrigatória entre si)
- **Bloqueada parcialmente por:** Story 78-2 (Status: Draft) — validação end-to-end completa do coletor Supabase só é possível após `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG` estarem gravados; o coletor Resend não tem essa dependência (`RESEND_API_KEY` já existe)
- **Bloqueia parcialmente:** Story 78-9 (UI) no que se refere a ter dado real de uso técnico de Supabase/Resend para exibir (a UI pode ser construída antes, já que sua regra de agregação já está correta por construção — ver Dev Notes)
- **Dependências técnicas:**
  - `packages/web/src/lib/billing-collectors/types.ts` e `run-collector.ts` (Story 78-3)
  - `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`)
  - `packages/web/src/lib/logger.ts` (`logEvent()`, via `runCollector()`)
  - `packages/web/vercel.json` (registro de cron)
  - `email_logs` (migration `018_email_central.sql`)

---

## Definition of Done

- [ ] `packages/web/src/lib/billing-collectors/supabase-usage.ts` criado, implementando `BillingCollector` sem modificar `types.ts`/`run-collector.ts`
- [ ] `packages/web/src/lib/billing-collectors/resend-usage.ts` criado, idem
- [ ] `packages/web/src/app/api/cron/billing-collect-supabase/route.ts` e `.../billing-collect-resend/route.ts` criados com auth `CRON_SECRET` idêntico ao padrão da 78-3
- [ ] `packages/web/vercel.json` atualizado com os 2 novos entries (`"0 13 * * *"`, `"0 14 * * *"`), sem remover/alterar entradas existentes
- [ ] Validação manual em DEV: auth ausente (401), secret de cron ausente (503), secrets de terceiro ausentes (503, comportamento documentado), coleta com sucesso em ambos os coletores, idempotência confirmada, `currency = null` confirmado em 100% das linhas gravadas por esta story
- [ ] Nenhuma alteração em `platform_services`/`service_billing_reminders` após rodar os coletores
- [ ] Limitação da contagem parcial de envios Resend documentada no nome da métrica e no JSDoc do coletor
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos (foco: invariante `currency=null` e reuso correto do contrato da 78-3, não recriação)
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente, mesmo estado observado nas demais stories do Epic 78).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story, conforme tabela de decomposição do Épico 78 §7).

**Story Type Analysis (para referência futura, caso CodeRabbit seja habilitado):**
- **Primary Type:** Integration (adaptação do contrato de coletor da 78-3 para 2 fornecedores adicionais + leitura de tabela existente)
- **Secondary Type:** API (2 novas rotas de cron)
- **Complexity:** Medium (4 arquivos novos + `vercel.json`; sem migration; reuso extensivo do contrato/runner da 78-3)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-7). Dois coletores de **uso técnico** (não custo) adaptando o contrato `BillingCollector`/`runCollector()` fixado na Story 78-3: Supabase (plano + requests/egress via Management API, `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG` da 78-2) e Resend (quota via header `x-resend-monthly-quota` + contagem de envios via `email_logs`, `RESEND_API_KEY` já existente). [AUTO-DECISION] Invariante `currency = null` elevada a Acceptance Criteria própria (AC4) → reason: a regra de agregação de "gasto do mês" da Story 78-9 (`WHERE currency IS NOT NULL`) depende inteiramente de os coletores desta story nunca preencherem `currency`; um erro de cópia do padrão Anthropic (que sempre seta `currency='USD'`) poluiria silenciosamente o total consolidado do painel com uso técnico disfarçado de custo. [AUTO-DECISION] Nome de métrica `resend_emails_sent_count_email_logs` (não `resend_emails_sent_total`) → reason: Article IV — `email_logs` não captura envios do caminho legado de campanhas (`sendEmail()` direto, sem `sendTemplateEmail()`); o nome da métrica já comunica o escopo parcial em vez de reivindicar uma contagem completa que o dado atual não sustenta. [AUTO-DECISION] `supabase_plan_info` grava `value=1` com o nome do plano em `raw_response` (não em `value`) → reason: `service_cost_snapshots.value` é `numeric NOT NULL` (contrato da 78-1); inventar uma escala numérica para nome de plano seria dado fabricado, proibido pelo Artigo IV. [AUTO-DECISION] Project ref do Supabase derivado de `NEXT_PUBLIC_SUPABASE_URL` (já existente) em vez de nova env var → reason: evitar credencial/config redundante quando o dado já está disponível no ambiente. [AUTO-DECISION] Horários de cron `"0 13 * * *"`/`"0 14 * * *"` escolhidos por não colidirem com nenhum horário fixo já ocupado em `vercel.json`, incluindo o `"0 10 * * *"` já adicionado pela Story 78-3. [AUTO-DECISION] Nenhuma atualização de `platform_services.billing_url_confirmed` do slug `supabase` nesta story, apesar de `SUPABASE_ORG_SLUG` (78-2) habilitar isso → reason: já documentado como fora de escopo pela própria Story 78-2; não assumir tarefa não atribuída explicitamente (evitar scope creep silencioso). | @sm (River) |
| 2026-07-08 | 0.2 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** Invariante central `currency = null` (AC4) validada como o mecanismo que mantém o "gasto do mês" da 78-9 (`WHERE currency IS NOT NULL`) livre de uso técnico disfarçado de custo — coerência de contrato de dados confirmada ponta-a-ponta. Nenhuma env var fora do contrato da 78-2 (`SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG` no contrato; `RESEND_API_KEY` pré-existente; project ref derivado de `NEXT_PUBLIC_SUPABASE_URL`). Horários de cron `"0 13"`/`"0 14"` confirmados livres. Ponto em aberto menor (bloqueio total vs. parcial na ausência de `RESEND_API_KEY`, T3.5) corretamente deixado como decisão documentável do @dev — não bloqueia. | @po (Pax) |

---

## Dev Agent Record

_A ser preenchido pelo @dev durante a implementação._

### Agent Model Used
—

### Debug Log References
—

### Completion Notes List
—

### File List
—

---

## QA Results

_A ser preenchido pelo @architect durante o quality gate._

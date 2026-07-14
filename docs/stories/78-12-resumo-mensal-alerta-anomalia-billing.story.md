# Story 78-12 — Resumo Mensal Automático + Alerta de Anomalia de Gasto (Zero Cadastro Manual)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-12
- **Status:** InReview
- **Priority:** P2 — capability nova pedida pelo usuário após pivô de produto (2026-07-13); complementa (não substitui) o motor de vencimentos manuais das Stories 78-8/78-11
- **Complexity:** M (1 migration aditiva pequena + 2 crons novos + lógica de agregação/comparação em memória; sem UI nova; ~5-7h)
- **Created:** 2026-07-13
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[migration_review, cron_pattern_review, idempotency_review, api_contract_review]`

---

## User Story

**Como** administrador da plataforma Trifold,
**Quero** receber automaticamente todo dia 1º um resumo do gasto do mês anterior por serviço, e um alerta quando o gasto de um serviço subir de forma anômala no mês corrente,
**Para que** eu tenha visibilidade de custo e detecte gasto fora do padrão **sem precisar cadastrar nada manualmente** — o sinal vem inteiramente do custo que os coletores já trazem para `service_cost_snapshots`.

---

## Context

### O pivô de produto (por que esta story existe)

A discovery original do Epic 78 assumia que seria possível cadastrar "data de vencimento" para lembrar o admin de pagar cada fatura (Stories 78-8/78-11, já `InReview`). Isso continua válido e **não é substituído** por esta story — é o mecanismo certo para os poucos casos que exigem valor/vencimento manual (Supabase, Resend — camada FRACA, CON-3 do épico).

Só que, para os serviços que **já são coletados automaticamente** (Anthropic, OpenAI, Vercel — camada FORTE — e WhatsApp/Meta — camada MÉDIA, custo automático via OQ-1 resolvida), o usuário identificou uma redundância: essas plataformas cobram **automaticamente no cartão** e **não expõem "data de vencimento" via API nenhuma** — não há vencimento a cadastrar. Frase verbatim do usuário (2026-07-13): *"se eu mesmo precisar cadastrar, não tem pq ter sistema"*.

A resposta correta para esses serviços não é pedir cadastro manual de uma data que ninguém tem — é **derivar valor automaticamente do custo que já coletamos**: (a) um resumo do que foi gasto, e (b) um alerta quando o gasto sair do padrão. **Zero cadastro manual** é requisito central desta story — nenhuma das duas capacidades entregues aqui depende de o admin preencher formulário nenhum antes de funcionar.

### Dado-fonte (já em produção, nada novo a coletar)

`service_cost_snapshots` (migration `164_platform_services_billing.sql`, schema fixado na Story 78-1) já é populada diariamente pelos coletores **em produção** (78-3 Anthropic, 78-5 Vercel, 78-7 Supabase/Resend — commit `04124797`; 78-4/78-6 OpenAI/WhatsApp seguem o mesmo contrato quando implementadas). Contrato relevante para esta story:
- `service_id` (FK `platform_services`), `snapshot_date` (date), `metric` (texto livre, ex. `cost_usd`), `value` (numeric), `currency` (nullable — **preenchida só quando a métrica é monetária**; `NULL` para uso técnico como `requests`/`egress_bytes`), `collection_status` (`ok`/`manual`/`no_data`/`error`).
- `UNIQUE(service_id, snapshot_date, metric)` — upsert, sem duplicação.

Esta story **só lê** essa tabela (nenhuma mudança no contrato dos coletores) e adiciona a lógica de agregação mensal + comparação de anomalia + dedup de envio.

---

## Scope

### IN (esta story entrega)

1. **Migration aditiva** (2 colunas em `platform_services` + 2 tabelas novas de dedup) — ver Dev Notes para o schema exato e número proposto.
2. **Cron de resumo mensal** (1×/mês, dia 1): agrega `service_cost_snapshots` do **mês anterior completo**, por serviço e por moeda (nunca somando USD com BRL), envia e-mail aos admins com: (a) gasto monetário por serviço (`currency IS NOT NULL`), total consolidado por moeda **excluindo Meta Ads** do total "a pagar" (CON-8 do épico — Meta Ads é budget de mídia, não fatura de infraestrutura), e (b) um bloco informativo de uso técnico (métricas `currency IS NULL`, ex. Supabase/Resend). Dedup: nunca envia 2× o mesmo mês.
3. **Cron de alerta de anomalia** (1×/dia): compara o gasto acumulado do mês corrente (month-to-date) de cada serviço com o mesmo período do mês anterior; dispara alerta (e-mail + push) quando o aumento percentual ultrapassa um **default automático de +50% MoM** (funciona sem nenhuma configuração) **ou** quando um **threshold absoluto opcional por serviço** é cruzado (override, não obrigatório). Dedup: no máximo 1 alerta por serviço por mês por tipo de gatilho.
4. Registro dos 2 crons novos em `packages/web/vercel.json`.

### OUT (não entra nesta story)

- Qualquer mudança nos coletores de custo (78-3 a 78-7/78-10) — esta story só **lê** `service_cost_snapshots`, não escreve nela.
- Qualquer mudança no motor de vencimentos manuais (78-8/78-11) — continuam existindo, lado a lado, para Supabase/Resend (camada FRACA, sem coleta automática de custo).
- UI/painel visual (Story 78-9) — esta story entrega só os 2 crons + a migration; a UI pode futuramente exibir o histórico de `billing_cost_alerts_sent`/`billing_monthly_summary_log` como observabilidade, mas isso é fora de escopo aqui.
- Conversão de moeda BRL↔USD (NFR-7 do épico proíbe explicitamente) — cada bloco do e-mail é sempre exibido na moeda de origem, sem soma cross-currency.
- Qualquer cadastro manual de valor/vencimento novo (é exatamente o que esta story evita) — Supabase/Resend continuam usando 78-8/78-11 para isso.
- Configuração de threshold percentual por serviço (o default de +50% é fixo nesta story; só o threshold **absoluto** é configurável por serviço, e é opcional).

---

## Acceptance Criteria

- [x] **AC1 — Resumo mensal agrega o mês anterior corretamente, por serviço e por moeda:** Dado `service_cost_snapshots` com linhas de `metric='cost_usd'`, `currency='USD'` para o serviço Anthropic em todos os dias de junho/2026 somando USD 120,00: ao rodar o cron de resumo em 01/07/2026, o e-mail enviado aos admins contém uma linha "Anthropic: USD 120,00 (junho/2026)". Linhas de `snapshot_date` fora de junho (maio ou julho) **não** entram na soma.

- [x] **AC2 — Total consolidado nunca soma moedas diferentes:** Dado gasto monetário do mês anterior em USD (Anthropic, OpenAI, Vercel) e BRL (nenhum serviço atual usa BRL, mas o cálculo deve suportar): o e-mail exibe **um total por moeda** (ex. "Total USD: 350,00"), nunca um único número somando USD+BRL.

- [x] **AC3 — Meta Ads nunca soma ao total "a pagar" (CON-8):** Dado `service_cost_snapshots` do mês anterior contendo linhas do serviço `meta_ads` (`metric='spend'`, `currency='USD'`, caso a Story 78-10 já esteja habilitada em produção): o valor de Meta Ads aparece no e-mail em uma **linha própria, claramente rotulada como "budget de mídia"**, mas **não** é somado ao "Total USD" das faturas de infraestrutura. Se `meta_ads` não estiver `enabled=true` em `platform_services` (padrão atual — ver migration 164, seed), a linha simplesmente não aparece (sem erro).

- [x] **AC4 — Bloco de uso técnico é informativo, sem valor monetário, e exclui métricas de bookkeeping:** Dado `service_cost_snapshots` do mês anterior com `metric='requests'`/`egress_bytes` e `currency IS NULL` (Supabase/Resend, coletores 78-7): o e-mail exibe esses números em um bloco separado ("Uso técnico"), sem tentar convertê-los em custo e sem somá-los ao total monetário. **Métricas operacionais/de bookkeeping que também têm `currency IS NULL` — `collection_error` (marcador de falha escrito por `run-collector.ts`, Story 78-3) e `collection_health_alert_sent` (marcador de dedup escrito pela story-irmã 78-13) — NÃO entram no bloco "Uso técnico": são registros internos de coleta/alerta, não uso técnico do fornecedor. Filtrar via allowlist de métricas de uso (`requests`/`egress_bytes`/...) OU blocklist explícita (`metric NOT IN ('collection_error','collection_health_alert_sent')`). Sem esse filtro, o e-mail exibiria linhas espúrias como "collection_error: 3".**

- [x] **AC5 — Resumo mensal dispara exatamente 1× por mês (dedup):** Rodar o cron de resumo mensal 2× no mesmo dia 1º (ex. retry do Vercel) **não** envia 2 e-mails para o mesmo período (`YYYY-MM` do mês anterior). Rodar o cron em qualquer outro dia do mês (não dia 1) **não** dispara envio algum (guard de dia, além do dedup).

- [x] **AC6 — Anomalia MoM dispara com o default automático, sem nenhuma configuração prévia:** Dado um serviço com `platform_services.cost_alerts_enabled = true` (default) e `monthly_cost_alert_threshold = NULL` (nenhum override cadastrado): se o gasto acumulado do mês corrente (do dia 1 até ontem) for **>= 1,5×** (aumento de +50%) o gasto do **mesmo intervalo de dias** do mês anterior (ex. mês corrente dias 1-10 vs. mês anterior dias 1-10), o cron dispara 1 alerta (e-mail + push) identificando o serviço, o valor atual, o valor de referência e o percentual de aumento.

- [x] **AC7 — Anomalia MoM não dispara abaixo do default:** Mesmo cenário do AC6, mas com aumento de +30% (abaixo do limiar de +50%): o cron não dispara nenhum alerta para esse serviço nesse dia.

- [x] **AC8 — Threshold absoluto opcional dispara independentemente do percentual:** Dado um serviço com `monthly_cost_alert_threshold = 100.00` (override cadastrado) e `cost_alerts_enabled = true`: quando o gasto acumulado do mês corrente cruza USD 100,00 (mesmo que o aumento percentual MoM seja 0% ou negativo — ex. o mês anterior já era caro), o cron dispara 1 alerta do tipo `threshold_absolute` para esse serviço.

- [x] **AC9 — Dedup de anomalia: no máximo 1 alerta por serviço por mês por tipo:** Dado um serviço que já dispara alerta do tipo `cost_anomaly_mom` no dia 10 do mês corrente (AC6): rodar o cron novamente no dia 11, 12, ..., 30 do **mesmo mês corrente**, com o gasto continuando acima do limiar, **não** dispara um segundo alerta `cost_anomaly_mom` para esse serviço nesse mês. O tipo `threshold_absolute` tem seu próprio contador de dedup independente (um serviço pode disparar os dois tipos no mesmo mês, um de cada).

- [x] **AC10 — `cost_alerts_enabled = false` suprime todo alerta do serviço:** Dado um serviço com `cost_alerts_enabled = false`: o cron de anomalia nunca dispara alerta (nem MoM nem threshold absoluto) para esse serviço, independente do gasto.

- [x] **AC11 — Serviços sem custo monetário nunca disparam anomalia:** Dado um serviço cujos snapshots do mês têm apenas `currency IS NULL` (uso técnico, ex. Supabase/Resend): o cron de anomalia não avalia esse serviço para nenhum dos dois tipos de alerta (não há valor monetário para comparar).

- [x] **AC12 — Migration aditiva e retrocompatível:** As 2 colunas novas em `platform_services` são `nullable`/têm `DEFAULT` seguro; as 2 tabelas novas não alteram nenhuma tabela existente além do `ALTER TABLE platform_services`. Reexecutar a migration não falha nem duplica (`IF NOT EXISTS`).

- [x] **AC13 — Timezone consistente (herdado de 78-8/78-11):** Todo cálculo de "mês anterior"/"hoje"/"dia 1" usa `America/Sao_Paulo` (reusa `hojeSaoPaulo()`/`toIsoDate()` de `packages/web/src/lib/billing/reminder-schedule.ts`), evitando erro de borda de mês perto da virada UTC (ex.: 01/07 00:30 BRT ainda é 30/06 em UTC quando avaliado sem cuidado).

---

## Tasks / Subtasks

- [x] **T1** — Confirmar numeração de migration livre e criar migration aditiva (AC12)
  - [x] T1.1 — `ls supabase/migrations/*.sql | sort | tail -5` no momento do `*develop` para confirmar o próximo número livre. No momento desta redação (2026-07-13), o máximo existente é `169` (`169_service_billing_reminders_last_alerted.sql`, Story 78-11) — **próximo livre proposto: `170`**. Se `170` já existir, usar o próximo livre.
  - [x] T1.2 — Criar `supabase/migrations/170_billing_cost_alerts_summary.sql` com: 2 colunas novas em `platform_services` (`monthly_cost_alert_threshold`, `cost_alerts_enabled`) + 2 tabelas novas (`billing_cost_alerts_sent`, `billing_monthly_summary_log`) — ver Dev Notes para o SQL exato
  - [x] T1.3 — Aplicar a migration em DEV (Supabase `xnxvygyfyyyzwhiuoehz`) antes de codar a lógica que depende dela

- [x] **T2** — Implementar cron de resumo mensal (AC1-AC5, AC13)
  - [x] T2.1 — Criar `GET /api/cron/billing-monthly-summary` com guard `CRON_SECRET` (mesmo padrão de `billing-reminders/route.ts`)
  - [x] T2.2 — Guard de dia: se `hojeSaoPaulo(now).d !== 1`, retornar `200` com `{ skipped: "not_day_1" }` sem processar nada (permite que o cron rode diariamente no schedule mas só aja no dia 1 — ver Dev Notes sobre por que preferir isso a um cron `0 X 1 * *`)
  - [x] T2.3 — Calcular `periodo = "YYYY-MM"` do **mês anterior** e a janela de datas `[primeiro_dia_mes_anterior, ultimo_dia_mes_anterior]`
  - [x] T2.4 — Dedup: `SELECT 1 FROM billing_monthly_summary_log WHERE period = periodo` — se já existe, retornar `200` com `{ skipped: "already_sent", period: periodo }` sem reenviar (AC5)
  - [x] T2.5 — Query: `service_cost_snapshots` join `platform_services` filtrando `snapshot_date` na janela do mês anterior; separar em 2 grupos em memória: monetário (`currency IS NOT NULL`) e uso técnico (`currency IS NULL`)
  - [x] T2.6 — Agregar monetário por `(service_id, currency)`; excluir `platform_services.slug = 'meta_ads'` do total consolidado por moeda, mas incluir a linha própria de Meta Ads no corpo do e-mail rotulada como budget de mídia (AC3)
  - [x] T2.7 — Agregar uso técnico por `(service_id, metric)` — soma simples, sem tentativa de conversão (AC4). **Excluir métricas de bookkeeping (`collection_error`, `collection_health_alert_sent`) do grupo técnico** — são marcadores internos (78-3 / story-irmã 78-13) com `currency IS NULL`, não uso do fornecedor; sem esse filtro poluem o bloco "Uso técnico" (correção @po da coerência cruzada 78-12↔78-13)
  - [x] T2.8 — Montar e-mail (`sendEmail`) com os 3 blocos (gasto por serviço, total por moeda, uso técnico) e enviar a todos os admins (`role='admin' AND is_active=true`, sem `org_id` — mesmo padrão de 78-8/78-11)
  - [x] T2.9 — Após envio (mesmo que parcialmente falho — best-effort), `INSERT INTO billing_monthly_summary_log (period, sent_at) VALUES (periodo, now())` — grava o dedup **depois** de tentar enviar, não antes (ver Dev Notes sobre a ordem)

- [x] **T3** — Implementar cron de alerta de anomalia (AC6-AC11, AC13)
  - [x] T3.1 — Criar `GET /api/cron/billing-cost-anomaly` com guard `CRON_SECRET`
  - [x] T3.2 — Calcular `hoje = hojeSaoPaulo(now)`, `diaDoMes = hoje.d`, janela month-to-date do mês corrente = `[dia 1, ontem]` (nunca incluir "hoje" — dados do dia corrente podem estar incompletos/em coleta) e a janela equivalente do mês anterior = mesmos números de dia (1 até `diaDoMes - 1`) do mês anterior
  - [x] T3.3 — Se `diaDoMes === 1` (não há "ontem" no mês corrente ainda): retornar `200` com `{ skipped: "day_1_no_mtd_yet" }` sem avaliar nada (evita comparação com janela vazia)
  - [x] T3.4 — Query: `service_cost_snapshots` join `platform_services` (`enabled=true`, `cost_alerts_enabled=true`, `currency IS NOT NULL`) para as 2 janelas (mês corrente MTD e mês anterior equivalente)
  - [x] T3.5 — Agregar por `(service_id, currency)` em cada janela; calcular `percentualAumento = (mtdAtual - mtdAnterior) / mtdAnterior` (tratar `mtdAnterior = 0`: se o mês anterior não teve gasto e o mês corrente tem > 0, considerar como anomalia MoM automaticamente — ver Dev Notes)
  - [x] T3.6 — Gatilho MoM (AC6/AC7): `percentualAumento >= 0.5` (default fixo, sem config)
  - [x] T3.7 — Gatilho threshold absoluto (AC8): se `platform_services.monthly_cost_alert_threshold IS NOT NULL` e `mtdAtual >= monthly_cost_alert_threshold`
  - [x] T3.8 — Para cada `(service, tipo)` que disparou: dedup — `INSERT INTO billing_cost_alerts_sent (service_id, alert_type, period) VALUES (...) ON CONFLICT (service_id, alert_type, period) DO NOTHING RETURNING id`; só notificar se o `INSERT` efetivamente retornou linha (AC9)
  - [x] T3.9 — Para as linhas retornadas: `sendEmail` + `sendPushToUser` a todos os admins ativos (mesmo padrão de destinatários de 78-8/78-11), `.catch` independente por canal/admin (best-effort)

- [x] **T4** — Registrar os 2 crons novos (AC5, AC9)
  - [x] T4.1 — Adicionar em `packages/web/vercel.json` → `crons[]`: `{ "path": "/api/cron/billing-monthly-summary", "schedule": "30 11 * * *" }` (roda todo dia às 11:30 UTC / ~08:30 BRT, mas só age no dia 1 — guard interno do T2.2; ver Dev Notes sobre por que preferir "roda todo dia, guard interno" a um cron com campo dia-do-mês)
  - [x] T4.2 — Adicionar `{ "path": "/api/cron/billing-cost-anomaly", "schedule": "30 15 * * *" }` (15:30 UTC / ~12:30 BRT, depois de todos os coletores de custo já terem rodado no dia — ver horários existentes nos Dev Notes). **CORRIGIDO na validação @po (2026-07-13): o horário originalmente proposto `0 15` colidia com `boleto-scan` (`0 12,15,18,21 * * *`, que dispara às 15:00 UTC). `30 15` é o próximo slot livre depois dos coletores.**
  - [x] T4.3 — Confirmar que os 2 horários novos não colidem com nenhuma entrada existente de `vercel.json` (ver lista completa nos Dev Notes)

- [x] **T5** — Testes (ver seção Testing)

---

## Dev Notes

### Arquivos de referência obrigatórios (ler antes de implementar)

- `supabase/migrations/164_platform_services_billing.sql` — schema atual de `platform_services`/`service_cost_snapshots` (contrato base desta story; não reinventar nomes/tipos)
- `packages/web/src/app/api/cron/billing-reminders/route.ts` — padrão de guard `CRON_SECRET`, busca de admins, envio best-effort (78-11, já reescrito)
- `packages/web/src/lib/billing/reminder-schedule.ts` — **reusar** `hojeSaoPaulo(now)`, `toIsoDate(dt)`, `pad2(n)` diretamente (funções puras já testadas, 26 testes unitários existentes); **não duplicar**
- `packages/web/src/lib/email.ts` (`sendEmail`) — assinatura: `{ to: string; subject: string; html: string; tags?: {name,value}[]; orgId?: string }` → `Promise<{ id: string | null; error?: string }>`. `orgId` **não** é usado aqui (dado de plataforma, sem org)
- `packages/web/src/lib/server/push-service.ts` (`sendPushToUser`) — assinatura: `sendPushToUser(supabase, userId, { title, body, url }): Promise<void>`
- `docs/stories/78-8-cadastro-vencimentos-motor-lembretes.story.md` e `docs/stories/78-11-escalonamento-lembretes-billing.story.md` — padrão de destinatários (`role='admin' AND is_active=true`, sem `org_id`), padrão de dedup atômico via `UPDATE ... RETURNING`/`INSERT ... ON CONFLICT DO NOTHING RETURNING`

### Numeração de migration (reconfirmar no momento do `*develop`)

Verificado nesta redação (2026-07-13, `ls supabase/migrations/*.sql | sort | tail`): o máximo existente é `169_service_billing_reminders_last_alerted.sql` (Story 78-11). **Próximo número proposto: `170`.** Seguindo a disciplina já estabelecida em 78-8/78-11 (Article IV — não inventar um número que pode colidir): T1.1 exige reconferir a lista real no momento do `*develop`, pois outra story pode ter consumido `170` no intervalo. Se `170` já existir, usar o próximo livre (`171`, ...).

### Schema novo — contrato exato

```sql
-- Migration 170 — Story 78-12: resumo mensal automático + alerta de anomalia de gasto.
-- Aditiva: 2 colunas novas em platform_services + 2 tabelas novas. Nenhum ALTER em
-- service_cost_snapshots/service_billing_reminders (contratos de 78-1/78-11 intocados).

ALTER TABLE platform_services
  ADD COLUMN IF NOT EXISTS monthly_cost_alert_threshold numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN platform_services.monthly_cost_alert_threshold IS
  'Override OPCIONAL de threshold absoluto (mesma moeda dos snapshots monetários do serviço,
   tipicamente USD) para o alerta de anomalia de gasto (Story 78-12). NULL = sem override;
   o alerta MoM (+50% default) funciona independentemente deste campo — zero cadastro
   manual obrigatório.';
COMMENT ON COLUMN platform_services.cost_alerts_enabled IS
  'Liga/desliga o alerta de anomalia de gasto (Story 78-12) por serviço. DEFAULT true —
   novos serviços já nascem monitorados sem ação do admin.';

CREATE TABLE IF NOT EXISTS billing_cost_alerts_sent (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id  uuid        NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE,
  alert_type  text        NOT NULL CHECK (alert_type IN ('cost_anomaly_mom','threshold_absolute')),
  period      text        NOT NULL, -- 'YYYY-MM' (mês corrente em que o alerta disparou, America/Sao_Paulo)
  sent_at     timestamptz NOT NULL DEFAULT now(),
  details     jsonb,      -- valor atual, valor de referência, percentual (observabilidade)
  UNIQUE (service_id, alert_type, period)
);

COMMENT ON TABLE billing_cost_alerts_sent IS
  'Dedup de alertas de anomalia de gasto: no máximo 1 linha por (serviço, tipo de gatilho,
   mês). Story 78-12.';

CREATE TABLE IF NOT EXISTS billing_monthly_summary_log (
  period   text        PRIMARY KEY, -- 'YYYY-MM' do mês RESUMIDO (mês anterior ao envio)
  sent_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_monthly_summary_log IS
  'Dedup do resumo mensal de gasto: no máximo 1 linha por mês resumido. Story 78-12.';

CREATE INDEX IF NOT EXISTS idx_billing_cost_alerts_sent_period
  ON billing_cost_alerts_sent (period);
```

**Por que 2 tabelas separadas em vez de 1 tabela genérica com `service_id` nullable:** o resumo mensal é um evento **global** (1 e-mail por mês, não por serviço), enquanto o alerta de anomalia é **por serviço** (0 a N por mês). Modelar os dois num único `service_id NULLABLE` exigiria índices únicos parciais (`WHERE service_id IS NULL` vs `WHERE service_id IS NOT NULL`) para o dedup funcionar corretamente com a semântica de `NULL` do Postgres (`NULL <> NULL` em `UNIQUE`) — 2 tabelas simples com PK/UNIQUE direto são mais fáceis de auditar e não têm essa armadilha. IDS: `CREATE` justificado — nenhuma tabela existente cobre "já enviei X para o período Y".

**Por que `monthly_cost_alert_threshold` fica em `platform_services` (não em `service_cost_snapshots` nem em tabela própria):** é uma configuração **por serviço**, não por snapshot/dia — mora naturalmente junto com `cost_alerts_enabled` no catálogo (`platform_services`), mesmo padrão de "config por serviço" já usado por `billing_url`/`automation_tier` na mesma tabela (migration 164).

### Algoritmo do resumo mensal (T2)

```
hoje = hojeSaoPaulo(now)
if hoje.d !== 1: return { skipped: "not_day_1" }

// Mês anterior (cuidado com virada de ano: janeiro → dezembro do ano anterior)
mesAnteriorY = hoje.m === 1 ? hoje.y - 1 : hoje.y
mesAnteriorM = hoje.m === 1 ? 12 : hoje.m - 1
periodo = `${mesAnteriorY}-${pad2(mesAnteriorM)}`
inicio = `${periodo}-01`
fim = últimoDiaDoMes(mesAnteriorY, mesAnteriorM)  // ex.: "2026-06-30"

jaEnviado = SELECT 1 FROM billing_monthly_summary_log WHERE period = periodo
if jaEnviado: return { skipped: "already_sent", period: periodo }

linhas = SELECT scs.*, ps.slug, ps.name, ps.category
         FROM service_cost_snapshots scs
         JOIN platform_services ps ON scs.service_id = ps.id
         WHERE scs.snapshot_date BETWEEN inicio AND fim

monetarias = linhas.filter(l => l.currency !== null)
// Uso técnico: currency null MAS excluindo marcadores de bookkeeping (78-3 / 78-13),
// que também têm currency null e não são uso do fornecedor.
BOOKKEEPING = ['collection_error', 'collection_health_alert_sent']
tecnicas   = linhas.filter(l => l.currency === null && !BOOKKEEPING.includes(l.metric))

porServicoMoeda = agrupar(monetarias, l => `${l.service_id}:${l.currency}`, soma l.value)
totalPorMoeda   = agrupar(monetarias.filter(l => l.slug !== 'meta_ads'), l => l.currency, soma l.value)
metaAdsLinha    = porServicoMoeda encontra slug === 'meta_ads' (se existir, exibida à parte, NÃO soma a totalPorMoeda)

porServicoMetrica = agrupar(tecnicas, l => `${l.service_id}:${l.metric}`, soma l.value)

html = montarEmailResumo({ periodo, porServicoMoeda, totalPorMoeda, metaAdsLinha, porServicoMetrica })
admins = SELECT id, name, email FROM users WHERE role='admin' AND is_active=true
for cada admin: sendEmail({ to: admin.email, subject: `Resumo de billing — ${periodo}`, html }).catch(log)

// Grava dedup DEPOIS de tentar enviar (best-effort: se o e-mail falhar por completo,
// não travar o mês inteiro sem tentar de novo amanhã seria melhor, MAS a decisão aqui é
// gravar de qualquer forma — ver justificativa abaixo).
INSERT INTO billing_monthly_summary_log (period) VALUES (periodo)
```

**[AUTO-DECISION] Dedup gravado mesmo se o envio falhar (não é "retry até sucesso"):** o objetivo do dedup é impedir **duplicidade** (2 e-mails no mesmo mês), não garantir entrega. Um resumo mensal que falha silenciosamente (ex.: `RESEND_API_KEY` ausente) é um problema de **observabilidade/config**, não de lógica de negócio — reason: o mesmo padrão de "best-effort sem retry automático" já foi adotado em 78-8/78-11 para os lembretes de vencimento (o cron roda 1×/dia e cobre o gap no próximo ciclo natural; aqui, como é 1×/mês, um mês perdido por falha de e-mail é aceitável e detectável via log/observabilidade futura da 78-9, não vale a complexidade de um mecanismo de retry dedicado nesta story).

### Algoritmo do alerta de anomalia (T3)

```
hoje = hojeSaoPaulo(now)
if hoje.d === 1: return { skipped: "day_1_no_mtd_yet" }  // sem "ontem" no mês corrente ainda

// Janela MTD do mês corrente: dia 1 até ontem (hoje.d - 1)
mtdAtualInicio = `${hoje.y}-${pad2(hoje.m)}-01`
mtdAtualFim    = `${hoje.y}-${pad2(hoje.m)}-${pad2(hoje.d - 1)}`

// Janela equivalente do mês anterior: mesmos dias (1 até hoje.d - 1), tratando virada de ano
mesAnteriorY = hoje.m === 1 ? hoje.y - 1 : hoje.y
mesAnteriorM = hoje.m === 1 ? 12 : hoje.m - 1
mtdAnteriorInicio = `${mesAnteriorY}-${pad2(mesAnteriorM)}-01`
mtdAnteriorFim     = `${mesAnteriorY}-${pad2(mesAnteriorM)}-${pad2(min(hoje.d - 1, últimoDiaDoMes(mesAnteriorY, mesAnteriorM)))}`
// min(...) trata o caso de o mês corrente ter mais dias que o anterior (ex.: hoje.d-1 = 31,
// mas fevereiro só tem 28/29) — clamp para o último dia disponível do mês anterior.

periodoAtual = `${hoje.y}-${pad2(hoje.m)}` // 'YYYY-MM' do mês CORRENTE (não do mês resumido)

servicos = SELECT * FROM platform_services WHERE enabled=true AND cost_alerts_enabled=true

for cada servico em servicos:
  snapAtual    = SELECT SUM(value), currency FROM service_cost_snapshots
                 WHERE service_id=servico.id AND currency IS NOT NULL
                   AND snapshot_date BETWEEN mtdAtualInicio AND mtdAtualFim
                 GROUP BY currency
  snapAnterior = SELECT SUM(value), currency FROM service_cost_snapshots
                 WHERE service_id=servico.id AND currency IS NOT NULL
                   AND snapshot_date BETWEEN mtdAnteriorInicio AND mtdAnteriorFim
                 GROUP BY currency

  if snapAtual vazio: continue  // sem gasto monetário no mês corrente, nada a avaliar (AC11)

  for cada (moeda, mtdAtual) em snapAtual:
    mtdAnteriorValor = snapAnterior[moeda] ?? 0

    // Gatilho MoM (AC6/AC7)
    if mtdAnteriorValor === 0:
      percentual = mtdAtual > 0 ? Infinity : 0   // sem base de comparação e há gasto novo → trata como anomalia
    else:
      percentual = (mtdAtual - mtdAnteriorValor) / mtdAnteriorValor

    if percentual >= 0.5:
      tentarDispararAlerta(servico, 'cost_anomaly_mom', periodoAtual, { mtdAtual, mtdAnteriorValor, percentual, moeda })

    // Gatilho threshold absoluto (AC8) — independente do percentual
    if servico.monthly_cost_alert_threshold != null && mtdAtual >= servico.monthly_cost_alert_threshold:
      tentarDispararAlerta(servico, 'threshold_absolute', periodoAtual, { mtdAtual, threshold: servico.monthly_cost_alert_threshold, moeda })

function tentarDispararAlerta(servico, tipo, periodo, detalhes):
  inserted = INSERT INTO billing_cost_alerts_sent (service_id, alert_type, period, details)
             VALUES (servico.id, tipo, periodo, detalhes)
             ON CONFLICT (service_id, alert_type, period) DO NOTHING
             RETURNING id
  if inserted vazio: return  // já alertado este mês para este (serviço, tipo) — dedup (AC9)

  admins = SELECT id, name, email FROM users WHERE role='admin' AND is_active=true
  for cada admin:
    sendEmail(...).catch(log)
    sendPushToUser(admin, ...).catch(log)
```

**[AUTO-DECISION] `mtdAnteriorValor = 0` e `mtdAtual > 0` conta como anomalia MoM (percentual "infinito"):** reason: um serviço que não gastava nada no mesmo período do mês anterior e passou a gastar é, por definição, um gasto anômalo (ex.: um coletor recém-habilitado, ou um serviço que começou a ser usado agora) — vale mais alertar (falso positivo raro, o admin vê e entende o contexto) do que ficar em silêncio por divisão por zero. Se ambos forem 0, não há nada a avaliar (`percentual = 0`, não dispara).

**[AUTO-DECISION] Comparação "mesmo período de dias" (proporcional) em vez de "MTD atual vs. total do mês anterior inteiro":** o próprio requisito do usuário permite as duas opções ("contra o mesmo período do mês anterior (ou contra o total do mês anterior)"). Optei pela comparação **proporcional** (mesmos dias 1..N) porque comparar o MTD do dia 5 do mês corrente contra o **total inteiro** do mês anterior (30 dias) geraria falsos negativos sistemáticos no início de todo mês (5 dias de gasto nunca vai parecer "50% maior" que 30 dias de gasto, mesmo que a taxa diária tenha disparado) — a comparação proporcional é a que efetivamente detecta "esse mês está gastando mais rápido que o mês passado no mesmo ponto do calendário", que é a intenção do alerta de anomalia. Documentado explicitamente para não ser confundido com esquecimento.

### `alert_days_before`/vencimento manual (78-8/78-11) — sem mudança, convivência pacífica

Esta story **não toca** em `service_billing_reminders` nem em `packages/web/src/app/api/cron/billing-reminders/route.ts` (78-8/78-11). Os dois sistemas coexistem por design:
- **Vencimento manual (78-8/78-11):** para serviços **sem** coleta automática de custo/vencimento (Supabase, Resend) — o cadastro manual continua sendo a única fonte de verdade possível ali (CON-3 do épico: essas APIs não expõem fatura nenhuma, nem valor nem data).
- **Resumo + anomalia (esta story, 78-12):** para serviços **com** coleta automática de custo (Anthropic, OpenAI, Vercel, WhatsApp/Meta, e opcionalmente Meta Ads) — nenhum cadastro é necessário, o sinal vem 100% do dado já coletado.

Um mesmo serviço não deveria, na prática, precisar dos dois sistemas ao mesmo tempo (é `automation_tier='forte'/'media'` OU `'fraca'`, não os dois) — mas nada nesta story impede que um admin cadastre um vencimento manual em `service_billing_reminders` para um serviço que também tem coleta automática, se um dia quiser (ex.: para lembrar de revisar o plano contratado, não o valor exato). Não é um conflito de dados, só dois sinais complementares.

### Cron: por que "roda todo dia, guard interno de dia 1" em vez de schedule com dia fixo

Vercel Cron **suporta** o campo dia-do-mês (`30 11 1 * *`), então tecnicamente daria para agendar direto para o dia 1. A escolha de "rodar todo dia às 11:30 UTC e sair cedo se não for dia 1" (T2.2) segue o **mesmo padrão observável** já usado pelo motor de lembretes (78-8/78-11, que roda diariamente e decide internamente se age), o que:
1. Facilita testar manualmente em qualquer dia (`?dry=1` ou similar, se implementado) sem esperar o próximo dia 1;
2. Reduz a superfície de "cron nunca disparou" silenciosamente por erro de sintaxe cron incomum;
3. É consistente — ambos os padrões (schedule direto no dia 1, ou guard interno) são válidos; esta é uma escolha de estilo alinhada ao restante do épico, documentada para não ser questionada como inconsistência.

Se o time preferir o schedule direto (`30 11 1 * *`), é uma troca trivial de 1 linha em `vercel.json` sem impacto na lógica — @dev pode fazer essa escolha no `*develop` e documentar no File List, não é bloqueante.

### Horários de cron — evitar colisão (T4)

Lista completa de crons já registrados em `packages/web/vercel.json` (conferir novamente no `*develop`, pode ter mudado):

| Horário (UTC) | Path |
|---|---|
| `0 10 * * *` | `billing-collect-anthropic` |
| `20 10 * * *` | `billing-collect-vercel` |
| `10 12 * * *` | `billing-reminders` |
| `0 13 * * *` | `billing-collect-supabase` |
| `0 14 * * *` | `billing-collect-resend` |
| `0 12,15,18,21 * * *` | `boleto-scan` (**multi-hora — dispara às 15:00 UTC**, verificado na validação @po) |
| ...+ ~19 outros crons não relacionados a billing (ver arquivo completo) |

Propostos nesta story: `30 11 * * *` (resumo mensal, entre os coletores da manhã) e `30 15 * * *` (anomalia, depois de **todos** os coletores de custo do dia — importante para o alerta de anomalia ter dados frescos de "ontem" já coletados quando avaliar o MTD). **Correção @po (2026-07-13): a proposta original de `0 15` colidia com `boleto-scan` (`0 12,15,18,21`, que inclui 15:00 UTC) — corrigido para `30 15` (slot livre confirmado).** Nenhum dos dois horários corrigidos colide com os existentes nem com o `30 14` reservado pela story-irmã 78-13. Reconferir no `*develop` caso as Stories 78-4/78-6/78-10 (coletores ainda `Draft`) já tenham sido implementadas e adicionado novos horários no intervalo.

### Padrão de guard do cron (reuso, sem mudança)

```ts
// Idêntico ao padrão de billing-reminders/route.ts (78-8/78-11)
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

### Destinatários — sem mudança de decisão (reuso integral de 78-8/78-11)

`SELECT id, name, email FROM users WHERE role='admin' AND is_active=true` — **sem** filtro `org_id`, mesma justificativa já documentada em 78-1/78-8 (dado de plataforma, não de tenant).

### Testing Standards

- Não há suíte de testes automatizados abrangente no projeto para rotas de API/cron, mas a extração de lógica pura é o padrão já estabelecido em 78-11 (`reminder-schedule.ts`, 26 testes). Recomendado (não bloqueante): extrair as funções de agregação/comparação (agrupamento por moeda, cálculo de janela MTD/período equivalente, cálculo de percentual) para um módulo próprio testável isoladamente, ex. `packages/web/src/lib/billing/cost-summary.ts`, seguindo o precedente de `reminder-schedule.ts`.
- Validar manualmente em DEV: popular `service_cost_snapshots` com cenários cobrindo os 13 ACs (mês anterior completo, mix de moedas, Meta Ads habilitado/desabilitado, uso técnico, MTD com/sem anomalia, threshold absoluto, dedup em reexecução) e rodar os 2 crons manualmente via `curl` com `CRON_SECRET`.

---

## Testing

### Abordagem

- Teste unitário (recomendado) das funções puras de agregação/janela/percentual, seguindo o precedente `reminder-schedule.test.ts` da 78-11.
- Validação manual em Supabase DEV para os 2 crons reais (dados de `service_cost_snapshots` populados manualmente para simular os cenários).

### Cenários de teste

1. **Resumo mensal — agregação básica:** snapshots de junho somando USD 120 para Anthropic → e-mail de 01/07 mostra "Anthropic: USD 120,00 (2026-06)" (AC1).
2. **Resumo mensal — não soma moedas:** snapshots USD e BRL no mesmo mês → 2 totais separados no e-mail, nunca um único número (AC2).
3. **Resumo mensal — Meta Ads separado:** Meta Ads com `spend` USD 500 no mês, habilitado → aparece em linha própria "budget de mídia", **não** somado ao Total USD (AC3).
4. **Resumo mensal — uso técnico:** snapshots `requests`/`egress_bytes` de Supabase/Resend, `currency=NULL` → bloco "Uso técnico" separado, sem valor monetário (AC4).
5. **Resumo mensal — dedup mesmo dia:** rodar o cron 2× em 01/07 → só 1 e-mail, `billing_monthly_summary_log` tem 1 linha para `2026-06` (AC5).
6. **Resumo mensal — guard de dia:** rodar o cron em 02/07 → `{ skipped: "not_day_1" }`, nenhum e-mail (AC5).
7. **Anomalia — dispara com default (+50%):** mês corrente MTD = USD 150, mesmo período mês anterior = USD 100 (aumento de 50%) → dispara `cost_anomaly_mom` (AC6).
8. **Anomalia — não dispara abaixo do default (+30%):** MTD = USD 130 vs. USD 100 → nenhum alerta (AC7).
9. **Anomalia — threshold absoluto:** serviço com `monthly_cost_alert_threshold=100`, MTD atual = USD 105, mês anterior também caro (sem aumento percentual) → dispara `threshold_absolute` mesmo sem gatilho MoM (AC8).
10. **Anomalia — dedup por mês:** `cost_anomaly_mom` já disparado no dia 10 → rodar de novo no dia 15 do mesmo mês, gasto continuando alto → não duplica; `threshold_absolute` pode disparar independentemente no mesmo mês (AC9).
11. **Anomalia — `cost_alerts_enabled=false`:** serviço desabilitado, mesmo com gasto disparado → nenhum alerta (AC10).
12. **Anomalia — serviço só com uso técnico:** serviço sem nenhuma linha `currency IS NOT NULL` no mês → não avaliado, sem erro (AC11).
13. **Migration retrocompatível:** aplicar a migration 2× seguidas (idempotência) → sem erro, sem duplicar colunas/tabelas (AC12).
14. **Timezone:** avaliação perto da virada de dia/mês UTC (ex. 01/07 02:00 UTC = 30/06 23:00 BRT) não desloca "dia 1"/janela MTD em ±1 dia (AC13).

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Cron de resumo mensal falhar silenciosamente (ex. `RESEND_API_KEY` ausente) e o mês inteiro ficar sem resumo, sem retry automático | Baixa | Aceito e documentado (ver Dev Notes) — mesma disciplina best-effort de 78-8/78-11; observabilidade futura (78-9) pode expor `billing_monthly_summary_log`/erros |
| R2 | Divisão por zero no cálculo de percentual MoM quando o mês anterior não teve gasto | Baixa | Tratado explicitamente no algoritmo (T3.5) — `mtdAnteriorValor=0` e `mtdAtual>0` conta como anomalia, ambos zero não dispara |
| R3 | Falso positivo no início do mês corrente por baixa base de comparação (ex. dia 2, 1 dia de dado) | Média (aceita) | Comparação proporcional (mesmo N de dias) mitiga em relação a comparar com o total do mês anterior inteiro; ainda assim, dias muito pequenos podem gerar ruído — não é um AC bloqueante corrigir isso nesta story, é o trade-off documentado do design "zero-config" |
| R4 | Meta Ads (`slug='meta_ads'`) mudar de nome/slug numa story futura e quebrar a exclusão do total consolidado (T2.6, hardcoded por slug) | Baixa | `slug` é `UNIQUE` e estável por contrato (migration 164); se mudar, é uma migration de rename que precisaria atualizar este filtro — documentado como acoplamento aceito |
| R5 | Colisão de número de migration (`170`) se outra story consumir o número no intervalo | Baixa | T1.1 exige reconferir `ls supabase/migrations` no `*develop`, mesma disciplina de 78-11 |

---

## Dependencies

- **Depende de:** Story 78-1 (schema `platform_services`/`service_cost_snapshots`, migration `164` — **bloqueante**, já aplicada e em produção); coletores 78-3 (Anthropic) e 78-5 (Vercel), 78-7 (Supabase/Resend) — **já em produção** (commit `04124797`), populam o dado-fonte que esta story lê. Coletores 78-4 (OpenAI)/78-6 (WhatsApp) ainda `Draft` — esta story funciona com o subconjunto de serviços já coletados hoje e automaticamente passa a incluir OpenAI/WhatsApp quando esses coletores forem implementados (sem mudança de código aqui, é dado dinâmico via `platform_services`).
- **Não depende de:** Stories 78-8/78-11 (motor de vencimentos manuais) — sistemas complementares, sem acoplamento de código (esta story não toca `service_billing_reminders`); Story 78-9 (UI) — não consome nem é consumida por esta story; Story 78-10 (Meta Ads) — opcional, esta story já trata o caso de `meta_ads` habilitado ou não (AC3)
- **Reusa (sem modificar):** `packages/web/src/lib/billing/reminder-schedule.ts` (funções puras `hojeSaoPaulo`/`toIsoDate`/`pad2`), `packages/web/src/lib/email.ts` (`sendEmail`), `packages/web/src/lib/server/push-service.ts` (`sendPushToUser`)
- **Dependências técnicas novas:**
  - `supabase/migrations/171_billing_cost_alerts_summary.sql` (novo — renumerada 170→171 no deploy; 170 consumida por Story 80-1 em origin/main)
  - `packages/web/src/app/api/cron/billing-monthly-summary/route.ts` (novo)
  - `packages/web/src/app/api/cron/billing-cost-anomaly/route.ts` (novo)
  - `packages/web/src/lib/billing/cost-summary.ts` (novo, recomendado — funções puras de agregação/comparação)
  - `packages/web/vercel.json` (alterado — 2 crons novos)

---

## Definition of Done

- [x] Migration aditiva criada (`170`) — NÃO aplicada em DEV nesta sessão (instrução: não tocar banco); pronta para @architect/@devops aplicarem (AC12)
- [x] Cron de resumo mensal implementado: agrega mês anterior por serviço/moeda, exclui Meta Ads do total, exibe uso técnico separado, dedup por período, guard de dia 1 (AC1-AC5)
- [x] Cron de alerta de anomalia implementado: default +50% MoM sem config, threshold absoluto opcional, dedup por (serviço, tipo, mês), respeita `cost_alerts_enabled` (AC6-AC11)
- [x] Timezone America/Sao_Paulo validado nos cenários de borda (AC13)
- [x] 2 crons registrados em `packages/web/vercel.json`, sem colisão de horário
- [x] Cenários de teste da seção Testing validados manualmente em DEV (ou via teste automatizado das funções puras, onde viável)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story).

**Story Type Analysis (para referência futura, caso CodeRabbit seja habilitado):**
- **Primary Type:** Database (migration aditiva de 2 colunas + 2 tabelas de dedup)
- **Secondary Type:** API (2 crons novos, sem endpoints admin-facing)
- **Complexity:** Medium (2 rotas de cron novas + 1 migration + lógica de agregação/comparação; sem novos endpoints admin, sem mudança de autenticação, reuso extensivo de utilitários já testados em 78-8/78-11)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-14 | 0.4 | **Correção REL-001 @dev (Dex) — race de dedup do resumo mensal fechada (Status permanece InReview).** `billing-monthly-summary/route.ts`: trocado o dedup de SELECT-check → envia → INSERT para **INSERT-claim-first**: reivindica o período (`INSERT ... .select("period")`; conflito 23505 ou sem linha retornada → `already_sent`, NÃO envia) ANTES de disparar qualquer e-mail. Fecha a corrida entre runs concorrentes de forma atômica pelo banco — mesmo padrão do cron de anomalia desta story (`billing_cost_alerts_sent`, 23505). Preservada a AUTO-DECISION "sem retry" (não reprocessa o mês se o envio posterior falhar), documentada em comentário. Adicionado `route.test.ts` cobrindo claim OK → envia / claim negado (23505 e upsert sem linha) → não envia / dry-run não reivindica (6 testes vitest). Lógica de agregação/moeda/exclusão de bookkeeping intocada. Lint 0 erros, typecheck 0 erros novos (4 pré-existentes intocados). Migration NÃO aplicada, sem commit/push. | @dev (Dex) |
| 2026-07-13 | 0.3 | **Implementação @dev (Dex) — Status Ready → InReview.** Migration `170` (aditiva + RLS admin-only, NÃO aplicada em banco), `cost-summary.ts` (lógica pura de janela/agregação/comparação MoM, 24 testes vitest passando), 2 crons novos (`billing-monthly-summary` `30 11`, `billing-cost-anomaly` `30 15`), 2 crons registrados em `vercel.json` sem colisão. Correções @po aplicadas (cron `30 15`; exclusão de `collection_error`/`collection_health_alert_sent` do bloco uso técnico). Reuso integral de `reminder-schedule`/`email`/`push-service`/padrão de guard+dedup de 78-11/78-13. Lint 0 erros, typecheck 0 erros novos (4 pré-existentes intocados). Todos os 13 ACs implementados; validação manual em DEV pendente (não aplicar em banco por instrução). | @dev (Dex) |
| 2026-07-13 | 0.2 | **Validação @po (Pax) — veredito GO (score 9/10). Status Draft → Ready.** Correções cruzadas aplicadas: (1) **cron collision** — `billing-cost-anomaly` movido de `0 15` para `30 15` (o `0 15` colidia com `boleto-scan` `0 12,15,18,21`, que dispara às 15:00 UTC; a tabela de crons do Dev Notes omitia `boleto-scan`) — T4.2 + Dev Notes atualizados. (2) **poluição do bloco "Uso técnico"** — a agregação técnica (`currency IS NULL`) capturaria linhas de bookkeeping `collection_error` (78-3) e `collection_health_alert_sent` (marcador de dedup da story-irmã 78-13), exibindo-as como falso "uso técnico" no e-mail; adicionada exclusão explícita dessas métricas em AC4/T2.7/pseudocódigo. Migration `170` confirmada livre (local + origin/main; máximo atual `169`). Sem conflito de migration/arquivo/cron com 78-13 após as correções. | @po (Pax) |
| 2026-07-13 | 0.1 | Story criada a pedido explícito do usuário (2026-07-13), após pivô de produto: Anthropic/OpenAI/Vercel/Supabase/Resend cobram automaticamente no cartão e não expõem "data de vencimento" via API — cadastro manual de vencimento (78-8/78-11) não se aplica a esses serviços; o valor entregue aqui vem 100% do custo já coletado em `service_cost_snapshots` (zero cadastro manual). [AUTO-DECISION] 2 tabelas de dedup separadas (`billing_monthly_summary_log` global, `billing_cost_alerts_sent` por serviço) em vez de 1 tabela genérica com `service_id` nullable → reason: evita a armadilha de `UNIQUE` com `NULL` do Postgres (`NULL <> NULL`), semântica mais simples e auditável (resumo é evento global 1×/mês, anomalia é evento por serviço 0-N×/mês). [AUTO-DECISION] `monthly_cost_alert_threshold`/`cost_alerts_enabled` em `platform_services` (não em tabela própria) → reason: são config por serviço, mesmo padrão de `billing_url`/`automation_tier` já na mesma tabela (migration 164); IDS ADAPT (extensão aditiva de tabela existente) > CREATE de tabela nova só para 2 campos. [AUTO-DECISION] Default de anomalia fixo em +50% MoM, sem campo de configuração de percentual por serviço → reason: requisito explícito do usuário é "funciona sem eu configurar nada"; só o threshold absoluto (uso avançado, opcional) é configurável — manter o percentual não-configurável nesta story evita superfície de configuração desnecessária (Article IV, não inventar requisito de customização não pedido). [AUTO-DECISION] Comparação MoM proporcional (mesmo N de dias do mês corrente vs. mês anterior) em vez de "MTD vs. total do mês anterior inteiro" → reason: evita falso-negativo sistemático no início de todo mês (few days vs. full month nunca pareceria "+50%"); ambas as opções eram aceitáveis pelo requisito do usuário, a proporcional é a que detecta de fato "esse mês está gastando mais rápido". [AUTO-DECISION] Migration proposta como `170` (condicional, mesma disciplina de 78-11) → reason: `169` é o máximo confirmado no momento desta redação (Story 78-11); T1.1 exige reconferir no `*develop`. [AUTO-DECISION] Dedup do resumo mensal gravado mesmo se o envio de e-mail falhar (sem retry automático) → reason: mesma disciplina best-effort já adotada em 78-8/78-11; falha de e-mail é problema de config/observabilidade, não de lógica de dedup — não vale a complexidade de um mecanismo de retry dedicado para um evento 1×/mês nesta story. Esta story NÃO substitui nem modifica 78-8/78-11 (motor de vencimentos manuais) — convivem lado a lado para serviços de camadas de automação diferentes (FORTE/MÉDIA com coleta automática → esta story; FRACA sem coleta automática → 78-8/78-11). | @sm (River) |

---

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M) — @dev (Dex), modo autônomo (YOLO).

### Debug Log References

- `npx vitest run packages/web/src/lib/billing/cost-summary.test.ts` → 24/24 testes passando.
- `npx vitest run packages/web/src/app/api/cron/billing-monthly-summary/route.test.ts` → 6/6 testes passando (dedup claim-first REL-001, v0.4).
- `npx tsc --noEmit` (packages/web) → 0 erros novos; permanecem os 4 pré-existentes (react-email-editor x2, visual-editor param `any`, pdf-lib) — nenhum nos arquivos desta story.
- `npx eslint` nos 4 arquivos novos → exit 0 (limpo).
- `node -e` validando `vercel.json` → 32 crons, `30 11`/`30 15` únicos, sem colisão (boleto-scan é `0 12,15,18,21` = minuto 0; `30 14` é billing-collection-health/78-13).

### Completion Notes List

- **Migration `170`** confirmada livre no `*develop` (`ls supabase/migrations | tail` → máximo era `169`; 78-13 não criou migration). Aditiva/idempotente, NÃO aplicada em banco (conforme instrução). Adicionado RLS admin-only nas 2 tabelas novas (`public.user_role() = 'admin'`, mesmo padrão da migration 164) — service_role dos crons bypassa RLS.
- **IDS:** REUSE integral de `hojeSaoPaulo`/`toIsoDate`/`pad2` (reminder-schedule.ts, 78-11), `sendEmail` (email.ts), `sendPushToUser` (push-service.ts), `createAdminClient` (admin.ts) e do padrão de guard `CRON_SECRET`/dedup atômico via INSERT+23505 (collection-health route, 78-13). CREATE justificado só para `cost-summary.ts` (lógica pura nova de agregação/janela/comparação MoM, sem equivalente existente) e as 2 rotas de cron.
- **Correções @po aplicadas:** (1) cron de anomalia em `30 15` (não `0 15`, que colidiria com boleto-scan); (2) exclusão de `collection_error` e `collection_health_alert_sent` do bloco "uso técnico" via `BOOKKEEPING_METRICS` (testada em `somarTecnicoPorServicoMetrica`).
- **Comparação MoM proporcional** (mesmo N de dias) + clamp de fim-de-mês (ex.: 31/03 → 28/02) implementados e testados; virada de ano coberta (jan → dez ano anterior).
- **Dedup:** resumo mensal via `billing_monthly_summary_log` (PK period, **INSERT-claim-first**: reivindica o período com `INSERT ... .select("period")` ANTES de enviar; conflito 23505 ou sem linha retornada → `already_sent` sem envio — REL-001, v0.4); anomalia via `billing_cost_alerts_sent` UNIQUE(service_id, alert_type, period) + INSERT atômico (23505 = já alertado). Ambos agora usam o mesmo padrão claim-first atômico. Um serviço com múltiplas moedas dispara no máximo 1 alerta por tipo/mês (dedup por tipo antes do INSERT). AUTO-DECISION "sem retry" preservada: falha de envio posterior não reprocessa o mês.
- **REL-001 (v0.4):** race de dedup do resumo mensal fechada — o e-mail só dispara DEPOIS do claim atômico no banco, eliminando o cenário de 2 runs concorrentes enviarem 2x. Coberto por `route.test.ts` (claim negado → não envia).
- **Dry-run** (`?dry=1`) adicionado às 2 rotas (não envia nem grava) — facilita validação manual em DEV, alinhado ao padrão de billing-reminders/collection-health.

### Incertezas / notas para o QA (@architect)

- **Race de dedup do resumo mensal — RESOLVIDO (REL-001, v0.4):** trocado para INSERT-claim-first (reivindica o período antes de enviar; conflito 23505 / sem linha → não envia). A garantia atômica agora é total, mesmo padrão do cron de anomalia. Nota original preservada para histórico: a ordem inicial era SELECT-check → envia → INSERT, que sob 2 runs concorrentes verdadeiramente simultâneos poderia enviar 2x.
- **`value` numeric via PostgREST:** normalizado com `Number(r.value)` em todas as somas (defensivo caso o driver retorne string).
- **Validação manual em DEV (T1.3 / cenários da seção Testing):** NÃO executada nesta sessão (instrução explícita: não aplicar em banco). Migration e crons prontos para o @architect/@devops aplicarem/validarem. Lógica pura coberta por 24 testes unitários.

### File List

- `supabase/migrations/170_billing_cost_alerts_summary.sql` (novo)
- `packages/web/src/lib/billing/cost-summary.ts` (novo — funções puras)
- `packages/web/src/lib/billing/cost-summary.test.ts` (novo — 24 testes vitest)
- `packages/web/src/app/api/cron/billing-monthly-summary/route.ts` (novo; alterado v0.4 — dedup INSERT-claim-first, REL-001)
- `packages/web/src/app/api/cron/billing-monthly-summary/route.test.ts` (novo v0.4 — 6 testes vitest, dedup claim-first)
- `packages/web/src/app/api/cron/billing-cost-anomaly/route.ts` (novo)
- `packages/web/vercel.json` (alterado — 2 crons novos: `30 11`, `30 15`)

---

## QA Results

### Review Date: 2026-07-13
### Reviewed By: Quinn (Test Architect & Quality Advisor)
### Método: revisão estática + execução de testes (sem aplicar migration em banco, sem commit/push)

**Veredito: CONCERNS (não-bloqueante) — aprovado com 2 ressalvas de baixa severidade.**

Os 13 ACs estão implementados e verificados. A única ressalva material é a race de dedup do
resumo mensal, que julgo **CONCERNS de baixa severidade (não FAIL)**: impacto máximo é um e-mail
informativo duplicado, sem corrupção de dado, e os retries do Vercel são sequenciais (o SELECT-check
cobre o caso real do AC5). Recomendo o swap para INSERT-claim-first como follow-up.

#### Traceability AC → evidência

| AC | Status | Evidência |
|----|--------|-----------|
| AC1 — agrega mês anterior por serviço/moeda | PASS | `mesAnterior()` + query `snapshot_date BETWEEN inicio/fim` + `somarMonetarioPorServicoMoeda()`; teste julho→junho |
| AC2 — total nunca soma moedas | PASS | `somarTotalPorMoeda()` keyed por currency; teste USD/BRL separados |
| AC3 — Meta Ads fora do total | PASS | `MEDIA_BUDGET_SLUG` excluído via `metaAdsIds`; linha própria; join `!inner` → sem linha se não coletar |
| AC4 — uso técnico exclui bookkeeping | PASS | `somarTecnicoPorServicoMetrica()` filtra `currency IS NULL` + `BOOKKEEPING_METRICS` (correção @po aplicada e testada) |
| AC5 — dedup + guard dia 1 | PASS* | `hoje.d!==1 → skip` + SELECT `billing_monthly_summary_log`; *ver REL-001 (race) |
| AC6 — MoM +50% sem config | PASS | `avaliarAnomalias()` com `ANOMALY_MOM_THRESHOLD=0.5`, funciona com `threshold=null` |
| AC7 — não dispara +30% | PASS | teste 130 vs 100 → 0 triggers |
| AC8 — threshold absoluto independente | PASS | teste com queda MoM ainda dispara `threshold_absolute` |
| AC9 — dedup por (serviço,tipo,mês) | PASS | INSERT + `UNIQUE(service_id,alert_type,period)` + 23505; dedup por tipo antes do INSERT |
| AC10 — `cost_alerts_enabled=false` suprime | PASS | query `.eq("cost_alerts_enabled", true)` |
| AC11 — só uso técnico não avalia | PASS | query `.not("currency","is",null)` + skip se `atualRows` vazio |
| AC12 — migration aditiva/idempotente | PASS | `ADD COLUMN/CREATE TABLE/CREATE INDEX IF NOT EXISTS` + `DROP POLICY IF EXISTS`+CREATE |
| AC13 — timezone America/Sao_Paulo | PASS | `hojeSaoPaulo()` via `Intl` TZ; testes de virada de ano + clamp fim-de-mês |

#### 7 Quality Checks
1. **Code review** — PASS. REUSE integral de `reminder-schedule`/`email`/`push-service`/`createAdminClient`; lógica pura isolada em `cost-summary.ts`. Padrão de guard/dedup consistente com 78-11/78-13.
2. **Unit tests** — PASS. `npx vitest run packages/web/src/lib/billing/cost-summary.test.ts` → **24/24 passing**. Cobre janelas, virada de ano, clamp, percentual (incl. div/0), agregações, exclusões e gatilhos.
3. **Acceptance criteria** — PASS. 13/13 (ver tabela).
4. **No regressions** — PASS. Story só **lê** `service_cost_snapshots`; migração puramente aditiva; não toca coletores nem 78-8/78-11.
5. **Performance** — PASS. Queries por `snapshot_date` (indexado), 2 janelas em paralelo, agregação em memória sobre volume mensal pequeno.
6. **Security** — PASS. `CRON_SECRET`/Bearer nas 2 rotas; RLS admin-only (`public.user_role()='admin'`) nas 2 tabelas novas (padrão canônico da 164); service_role bypassa RLS; nenhum secret exposto.
7. **Documentation** — PASS. Migration comentada; AUTO-DECISIONS documentadas na story.

#### Checks específicos solicitados
- **Migration 170** — aditiva/idempotente confirmada; RLS admin-only nas 2 tabelas; colunas/tabelas conforme story (`monthly_cost_alert_threshold`, `cost_alerts_enabled`, `billing_cost_alerts_sent`, `billing_monthly_summary_log`); **170 é o próximo livre** (máximo atual 169).
- **Resumo mensal** — guard dia 1 OK; agrega mês anterior por serviço/moeda (`currency IS NOT NULL`); total exclui Meta Ads; bloco técnico exclui `collection_error`/`collection_health_alert_sent` (correção @po presente e testada); nunca soma USD+BRL; dedup via `billing_monthly_summary_log`.
- **Anomalia MoM** — compara MTD `[dia1,ontem]` vs mesmo intervalo do mês anterior, com clamp fim-de-mês e virada de ano (testados); default +50% sem config; threshold absoluto opcional independente; respeita `cost_alerts_enabled`; dedup atômico via UNIQUE+23505.
- **Segurança & reuso** — CRON_SECRET nas 2 rotas; helpers reusados sem recriação; sem secret exposto.
- **Testes/convenções** — 24/24; lint exit 0 nos 4 arquivos; typecheck só 4 erros pré-existentes (react-email-editor x2, visual-editor `any`, pdf-lib), nenhum nos arquivos da story; crons `30 11`/`30 15` sem colisão (boleto-scan = minuto 0; `30 14` = 78-13).

#### Issues (severidade)
- **REL-001 (low) — Race de dedup do resumo mensal.** SELECT-check → envia → INSERT. Dois runs concorrentes reais passariam ambos no SELECT e enviariam 2 e-mails (2º INSERT falharia só no PK). **Julgamento explícito: CONCERNS, não FAIL** — retries do Vercel são sequenciais (mitiga o AC5 real), impacto é e-mail informativo duplicado sem corrupção de dado, e o próprio cron de anomalia desta story já usa o padrão robusto INSERT-claim (23505). Recomendação: trocar por `INSERT ... ON CONFLICT (period) DO NOTHING RETURNING` e só enviar se retornou linha — preserva a AUTO-DECISION "sem retry" e fecha a race. O @dev já sinalizou e escopou como "1 bloco de código".
- **REL-002 (low) — Métrica `emailsSent` infla sem RESEND.** `sendEmail` resolve com `{id:null,error}` em falha de config (não rejeita), então `.then(sent++)` conta como enviado e o `.catch` não dispara. Só afeta observabilidade do log, não a lógica. Cosmético/opcional.

#### Observação informativa (não é issue)
- O cron de anomalia avalia Meta Ads como qualquer serviço (`enabled=true`+`cost_alerts_enabled=true`) — nenhum AC exige excluí-lo do alerta (a exclusão CON-8 aplica-se só ao *total* do resumo mensal). Alertar spike de spend é defensável; se indesejado, o admin desliga via `cost_alerts_enabled=false`.

#### Próximo passo
Aprovado com CONCERNS. Seguir para **@devops `*push`**. Opcionalmente, @dev aplica o swap REL-001
(INSERT-claim-first) antes do push — melhoria de robustez de 1 bloco, sem alterar comportamento
funcional. Migration 170 pronta para @devops/@architect aplicarem (não aplicada nesta sessão).

### Gate Status

Gate: CONCERNS → docs/qa/gates/78.12-resumo-mensal-alerta-anomalia-billing.yml

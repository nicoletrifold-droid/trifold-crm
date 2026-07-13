# Story 78-11 — Escalonamento de Lembretes: D-3, D-0 e E-mail Diário Até o Pagamento

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-11
- **Status:** Draft
- **Priority:** P1 — corrige o gap de risco (REL-001) identificado pelo QA da Story 78-8: hoje uma fatura vencida e não paga "recorre" silenciosamente e para de alertar
- **Complexity:** M (reescrita de lógica de decisão do cron + extração de função compartilhada + novo trecho no PATCH + 1 coluna de migration; ~5-7h)
- **Created:** 2026-07-13
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[migration_review, cron_pattern_review, idempotency_review, api_contract_review]`

---

## User Story

**Como** administrador da plataforma Trifold,
**Quero** receber um aviso 3 dias antes do vencimento, um aviso no dia do vencimento, e um e-mail diário enquanto a fatura estiver vencida e não paga (parando só quando eu marcar como paga),
**Para que** eu nunca perca de vista uma fatura vencida e não corra o risco de ter produção (`crm.trifold.eng.br`) cortada por atraso de pagamento — mesmo se eu ignorar o primeiro aviso.

---

## Context

Requisito verbatim do usuário (2026-07-13): *"também preciso verificar a data de vencimento se tiver e um aviso 3 dias antes de vencer e no dia de vencimento e email diário caso não foi pago, até de fato ser pago."*

A Story 78-8 (InReview, `docs/stories/78-8-cadastro-vencimentos-motor-lembretes.story.md`) já entregou o CRUD admin-only e o motor de lembretes (cron diário) sobre `service_billing_reminders` (schema fixado na Story 78-1, migration `164_platform_services_billing.sql`). O QA da 78-8 (Quinn) já sinalizou exatamente o gap que esta story resolve:

> **REL-001** — Recorrência avança `due_date` mesmo para linha `alerted`/vencida-não-paga, resetando para `pending` e perdendo o sinal de "vencido e não pago" (sem escalonamento).

Hoje (`packages/web/src/app/api/cron/billing-reminders/route.ts`), o motor:
1. **Passo 1 — Alertar:** dispara **um único** alerta quando `hoje` cai na janela contínua `[due_date - alert_days_before, due_date]` e `status='pending'`; marca `status='alerted'` de forma atômica (`UPDATE ... WHERE status='pending' RETURNING`). Isso é dedup **permanente** — uma vez alertado, a linha nunca mais dispara novamente enquanto continuar `alerted`.
2. **Passo 2 — Recorrência:** para qualquer linha com `due_date < hoje` (**independente do `status`, inclusive `alerted` — ou seja, vencida e nunca paga**) e `billing_cycle IN ('monthly','annual')`, avança `due_date` para o próximo ciclo e reseta `status='pending'`/`paid_at=NULL` — **silenciosamente**, sem qualquer sinal de que a fatura anterior nunca foi paga.

Isso é exatamente o oposto do que o usuário pediu agora: ele quer que o vencimento **continue alertando todo dia** enquanto não for pago, e que a recorrência para o próximo ciclo **só aconteça depois do pagamento** — nunca por decurso de tempo.

Esta story **reescreve** a lógica de decisão de alerta do cron (Passo 1) e **remove** o Passo 2 atual (recorrência por `due_date < hoje`), movendo a recorrência para o momento em que o admin marca a fatura como paga (`PATCH .../[id]` com `status: "paid"`).

---

## Scope

### IN (esta story entrega)

1. **Migration aditiva** (1 coluna nova em `service_billing_reminders`) — ver Dev Notes para o nome exato e número proposto.
2. **Reescrita do gatilho de alerta** (Passo 1 do cron) — 3 pontos de disparo discretos: D-N (configurável via `alert_days_before`, o usuário configura `3` para o comportamento pedido), D-0, e diário enquanto vencida e `status NOT IN ('paid','postponed','skipped')`. Dedup por dia (não mais por status permanente).
3. **Remoção do Passo 2 atual** (recorrência automática por `due_date < hoje`) do cron.
4. **Recorrência movida para o fluxo de pagamento**: `PATCH /api/admin/billing-reminders/[id]` com `{ status: "paid" }` passa a avançar `due_date` para o próximo ciclo automaticamente (para `billing_cycle IN ('monthly','annual')`), IMEDIATAMENTE, dentro da mesma requisição — nunca por decurso de tempo no cron.
5. **Extração de função compartilhada**: `avancarCiclo`/`hojeSaoPaulo`/`diffDias` (hoje embutidas só no cron) viram um módulo compartilhado, pois o PATCH também precisa de `avancarCiclo` agora.
6. Documentação explícita da decisão sobre `alert_days_before` (reusar o campo já configurável — sem novo campo/coluna fixa "3 dias").

### OUT (não entra nesta story)

- Qualquer mudança de canal de notificação (continua e-mail + push, reusados de 78-8 — ver Dev Notes para a decisão sobre quais canais em qual gatilho)
- Qualquer mudança no CRUD (`GET`/`POST` de `/api/admin/billing-reminders`) além da recorrência-ao-pagar no `PATCH`
- UI (Story 78-9) — fora de escopo; o contrato de API observável pela UI não muda de forma incompatível (mesmos campos existentes; `last_alerted_on` é só leitura adicional, opcional para a UI exibir)
- Escalonamento por severidade (ex.: "depois de 7 dias vencido, avisa também por WhatsApp") — não pedido pelo usuário nesta sessão, não inventar (Article IV)
- Qualquer alteração em `billing_cycle='usage'` além do que já existia (permanece sem recorrência automática — ver AC7)

---

## Acceptance Criteria

- [ ] **AC1 — Aviso D-N dispara exatamente uma vez:** Dado `service_billing_reminders` com `status='pending'`, `due_date = hoje + 3 dias` e `alert_days_before = 3`: o cron dispara 1 alerta (e-mail + push) e marca `last_alerted_on = hoje`. Rodar o cron novamente **no mesmo dia** sobre a mesma linha **não** dispara um segundo alerta (dedup por `last_alerted_on`).

- [ ] **AC2 — Nenhum alerta fora dos pontos de disparo:** Dado o mesmo cenário do AC1, no dia seguinte (`due_date = hoje + 2 dias` relativo a "hoje" daquele dia, ou seja, a distância até o vencimento não é mais igual a `alert_days_before` nem é `0`, nem está vencida) — o cron **não** dispara nenhum alerta (nem e-mail nem push) para essa linha.

- [ ] **AC3 — Aviso D-0 dispara mesmo após o aviso D-N já ter ocorrido:** Dado uma linha já alertada em D-3 (`last_alerted_on` = data de 3 dias atrás), ao chegar o dia do vencimento (`due_date = hoje`) o cron dispara **um novo** alerta (porque `last_alerted_on != hoje`) e atualiza `last_alerted_on = hoje`.

- [ ] **AC4 — E-mail diário enquanto vencida e não paga:** Dado `due_date = hoje - 1 dia` (vencida ontem) e `status != 'paid'`: o cron dispara e-mail (+ push, ver Dev Notes) e marca `last_alerted_on = hoje`. Rodar o cron de novo **no mesmo dia** não duplica o envio. No **dia seguinte** (`due_date = hoje - 2 dias`, ainda não paga), o cron dispara **novamente** — e assim por diante, todo dia, enquanto `status != 'paid'`.

- [ ] **AC5 — `status='paid'` interrompe todo alerta imediatamente:** Dado uma linha vencida há N dias com `status='paid'` (setado via PATCH antes da execução do cron do dia): o cron **não** dispara nenhum alerta para essa linha, independentemente de `due_date` ou `last_alerted_on`.

- [ ] **AC6 — `status IN ('postponed','skipped')` continua suprimindo alertas:** Comportamento preexistente preservado — linhas nesses status nunca disparam alerta, mesmo dentro da janela D-N/D-0/vencida.

- [ ] **AC7 — Recorrência só ocorre ao marcar como paga (nunca por decurso de tempo):** `PATCH /api/admin/billing-reminders/[id]` com `{ "status": "paid" }` numa linha com `billing_cycle IN ('monthly','annual')`: (a) seta `paid_at = now()`; (b) avança `due_date` automaticamente para o próximo ciclo (mesmo cálculo de `avancarCiclo` já usado na 78-8 — mensal +1 mês, anual +1 ano, com clamp de dia-do-mês); (c) reseta `status = 'pending'` e `last_alerted_on = NULL` — tudo na **mesma requisição** (a resposta do PATCH já reflete o próximo vencimento). Para `billing_cycle = 'usage'`: `status` permanece `'paid'`, `due_date` **não** é alterado (comportamento herdado de 78-8 — sem recorrência automática para ciclo variável).

- [ ] **AC8 — Cron nunca mais avança `due_date` de uma linha vencida-não-paga:** O antigo "Passo 2" (recorrência por `due_date < hoje`, independente de pagamento) é **removido** do cron. Uma linha vencida com `status='pending'` ou `'alerted'` permanece com o **mesmo** `due_date` indefinidamente até ser paga (só o alerta diário do AC4 acontece; `due_date` não muda).

- [ ] **AC9 — Migration aditiva e retrocompatível:** A coluna nova é `nullable`/tem `DEFAULT` seguro; linhas já existentes (criadas antes desta story, sem valor de `last_alerted_on`) são tratadas como "nunca alertadas" (`NULL`) e continuam funcionando normalmente no primeiro ciclo do novo algoritmo — sem necessidade de backfill manual.

- [ ] **AC10 — Timezone consistente (herdado da 78-8, reconfirmado):** Todo cálculo de "hoje" e de distância até `due_date` usa `America/Sao_Paulo` (reusa `hojeSaoPaulo()`), evitando disparo com ±1 dia de erro perto da virada UTC.

- [ ] **AC11 — `last_alerted_on` não é aceito cru do cliente:** `POST`/`PATCH` de `/api/admin/billing-reminders` **rejeitam** (ou simplesmente ignoram, documentar a escolha) qualquer valor de `last_alerted_on` enviado no corpo da requisição — o campo é **sempre** derivado internamente (pelo cron ou pelo fluxo de recorrência-ao-pagar do AC7), nunca aceito do admin diretamente. Mesmo padrão já usado para `paid_at`.

---

## Tasks / Subtasks

- [ ] **T1** — Confirmar numeração de migration livre (ver Dev Notes) e criar migration aditiva
  - [ ] T1.1 — `ls supabase/migrations/*.sql | sort | tail -5` para confirmar a última migration real no momento do `*develop` (na data desta story, a última é `164`; a Story 78-10, ainda Draft, já reservou textualmente `165` condicional — reconferir se `165` já existe fisicamente antes de nomear o arquivo desta story)
  - [ ] T1.2 — Criar `supabase/migrations/{N}_service_billing_reminders_last_alerted.sql`: `ALTER TABLE service_billing_reminders ADD COLUMN IF NOT EXISTS last_alerted_on date;` (nullable, sem `DEFAULT` — `NULL` = "nunca alertada", semanticamente correto e mais simples que um default de data)
  - [ ] T1.3 — Aplicar a migration em DEV (Supabase `xnxvygyfyyyzwhiuoehz`) antes de codar a lógica que depende da coluna

- [ ] **T2** — Extrair funções de data compartilhadas (AC1-AC4, AC7, AC10)
  - [ ] T2.1 — Criar `packages/web/src/lib/billing/reminder-schedule.ts` — mover `hojeSaoPaulo`, `pad2`, `toIsoDate`, `diffDias`, `avancarCiclo` de `packages/web/src/app/api/cron/billing-reminders/route.ts` para este módulo novo (funções puras, sem I/O), exportadas
  - [ ] T2.2 — Atualizar `packages/web/src/app/api/cron/billing-reminders/route.ts` para importar do novo módulo em vez de definir localmente
  - [ ] T2.3 — Escrever testes unitários para `avancarCiclo`/`diffDias` no novo módulo (`reminder-schedule.test.ts`) — cobrir overflow de dia-do-mês (31/01 → 28/02 ou 29/02 bissexto), já que a lógica agora é usada em 2 lugares (cron E rota de PATCH) e um teste unitário evita regressão dupla

- [ ] **T3** — Reescrever o gatilho de alerta do cron (AC1-AC6, AC10, AC11)
  - [ ] T3.1 — Trocar a query de candidatos: de `.eq("status","pending")` para `status NOT IN ('paid','postponed','skipped')` (Supabase: `.not("status", "in", '("paid","postponed","skipped")')` ou equivalente) — passa a incluir linhas `alerted` (que antes eram excluídas e nunca mais alertavam)
  - [ ] T3.2 — Implementar a função de decisão `deveAlertar(row, hoje): boolean`:
    ```
    distancia = diffDiasAteVencer(row.due_date, hoje)  // positivo = ainda não venceu; negativo = vencida
    gatilho = (distancia === row.alert_days_before)   // D-N exato
           || (distancia === 0)                        // D-0
           || (distancia < 0)                           // vencida (D+1, D+2, ...)
    jaAlertouHoje = row.last_alerted_on === hojeIso
    return gatilho && !jaAlertouHoje
    ```
  - [ ] T3.3 — Trocar o `UPDATE` de dedup: de `SET status='alerted' WHERE status='pending'` para `SET status='alerted', last_alerted_on=$hojeIso WHERE id = ANY($ids) AND (last_alerted_on IS DISTINCT FROM $hojeIso) RETURNING id` — dedup atômico **por dia**, não mais por status (2 execuções concorrentes no mesmo dia não duplicam; a próxima execução, em outro dia, volta a alertar se ainda aplicável)
  - [ ] T3.4 — Manter e-mail + push como canais (reuso integral de `sendEmail`/`sendPushToUser` já usados em 78-8) — ver Dev Notes sobre variar ou não a mensagem por tipo de gatilho (D-N vs D-0 vs vencida)
  - [ ] T3.5 — Manter processamento best-effort por linha/admin (`.catch` independente, `Promise.allSettled`) — herdado de 78-8, sem mudança de padrão

- [ ] **T4** — Remover o Passo 2 do cron (AC8)
  - [ ] T4.1 — Deletar o bloco "Passo 2 — RECORRÊNCIA" inteiro de `packages/web/src/app/api/cron/billing-reminders/route.ts` (query de `due_date < hoje`, loop de `avancarCiclo`, `precisaRevisaoManual`)
  - [ ] T4.2 — Atualizar o `summary` de resposta do cron: remover a chave `passo2`; manter só `passo1` (renomear se fizer sentido, ex. `alertas`) — documentar a mudança de shape no File List, pois é uma mudança observável (a UI/78-9 não consome este endpoint diretamente hoje, mas registrar para rastreabilidade)

- [ ] **T5** — Implementar recorrência-ao-pagar no PATCH (AC7, AC11)
  - [ ] T5.1 — Em `packages/web/src/app/api/admin/billing-reminders/[id]/route.ts`, quando `validation.value.status === "paid"`: **antes** do `UPDATE`, buscar a linha atual (`due_date`, `billing_cycle`) para calcular o próximo ciclo (necessário porque o novo `due_date` depende do valor atual, não do payload do cliente)
  - [ ] T5.2 — Se `billing_cycle IN ('monthly','annual')` (considerando o valor efetivo pós-patch, caso o próprio PATCH também esteja mudando `billing_cycle` no mesmo request — usar o valor final, não o anterior): `next_due_date = avancarCiclo(due_date_atual, billing_cycle)`; o `UPDATE` grava `due_date = next_due_date`, `status = 'pending'` (**não** `'paid'` — a linha já nasce "pronta para o próximo ciclo"), `paid_at = now()` (preserva o registro histórico do último pagamento, mesmo a linha já estando `pending` de novo), `last_alerted_on = NULL` (reseta para o novo ciclo poder alertar do zero)
  - [ ] T5.3 — Se `billing_cycle === 'usage'` (ou o payload não envolve status='paid'): manter o comportamento herdado de 78-8 (`status='paid'` persiste, sem avanço automático de `due_date`)
  - [ ] T5.4 — Garantir que `last_alerted_on` nunca é aceito cru de `validation.value` — adicionar ao `reminder-validation.ts` uma rejeição/ignorância explícita se o cliente enviar esse campo (mesma disciplina do `paid_at`)

- [ ] **T6** — Testes (ver seção Testing)

---

## Dev Notes

### Arquivos de referência obrigatórios (ler antes de implementar)
- `docs/stories/78-8-cadastro-vencimentos-motor-lembretes.story.md` — story original do motor de lembretes; **QA Results** (seção final) documenta REL-001, o gap exato que esta story resolve
- `packages/web/src/app/api/cron/billing-reminders/route.ts` — implementação atual completa (Passo 1 + Passo 2), a ser reescrita por esta story
- `packages/web/src/app/api/admin/billing-reminders/[id]/route.ts` — PATCH atual (recebe a lógica nova de recorrência-ao-pagar)
- `packages/web/src/lib/billing/reminder-validation.ts` — validação compartilhada POST/PATCH (78-8); ajustar para `last_alerted_on` (AC11)
- `supabase/migrations/164_platform_services_billing.sql` — schema atual de `service_billing_reminders` (contrato base, ver seção "Coluna nova" abaixo)

### Numeração de migration (confirmar no momento do `*develop`)
Na data de criação desta story (2026-07-13), a última migration real no repositório é `164_platform_services_billing.sql` (Story 78-1, já aplicada). A Story 78-10 (Draft, ainda **não implementada**) já reservou textualmente o número `165` para sua própria migration de ativação (`165_enable_meta_ads_billing_module.sql`), condicional a `164` já existir — e `164` já existe. Ou seja, `165` está **logicamente** reservado pela 78-10, mas ainda **não existe fisicamente** no repositório até que a 78-10 seja implementada.

Seguindo a mesma disciplina de numeração condicional já usada em 78-8/78-10 (Article IV — não inventar um número que pode colidir):
- Esta story **propõe** `166_service_billing_reminders_last_alerted.sql` como nome provisório, assumindo que a 78-10 será implementada primeiro e consumirá `165`.
- **No momento do `*develop`**, rodar `ls supabase/migrations/*.sql | sort | tail -5` e confirmar: se `165` **ainda não existir** fisicamente, esta story pode usar `165` diretamente (quem implementar primeiro consome o número mais baixo livre; a 78-10 desloca para `166` quando for a vez dela); se `165` **já existir** (78-10 implementada primeiro), esta story usa `166` como planejado.
- Migration é de 1 `ALTER TABLE ... ADD COLUMN` — puramente aditiva, sem risco de conflito de conteúdo com a migration da 78-10 (que só faz `UPDATE ... SET enabled=true`), apenas risco de colisão de **nome/número** de arquivo.

### Coluna nova — contrato exato
```sql
ALTER TABLE service_billing_reminders
  ADD COLUMN IF NOT EXISTS last_alerted_on date;
```
- **Nome:** `last_alerted_on` (tipo `date`, não `timestamptz` — só precisamos comparar "mesmo dia calendário em America/Sao_Paulo", já calculado como string `YYYY-MM-DD` pelo `hojeSaoPaulo()`/`toIsoDate()` existentes; usar `date` evita qualquer ambiguidade de fuso na comparação em SQL)
- **Nullable, sem `DEFAULT`.** `NULL` = "nunca alertada" (semântica limpa: linhas existentes antes desta migration começam automaticamente elegíveis para alertar no próximo gatilho aplicável — AC9).
- Não precisa de índice dedicado — o índice já existente `idx_service_billing_reminders_status_due (status, due_date)` (migration 164) continua cobrindo a query principal do cron; o filtro por `last_alerted_on` é feito em memória (mesmo padrão da 78-8, que já filtrava a janela de alerta em memória, não em SQL).

### Algoritmo do motor de lembretes (substitui o Passo 1 da 78-8; Passo 2 da 78-8 é REMOVIDO)

```
hoje = hojeSaoPaulo(now)          // { y, m, d } — America/Sao_Paulo
hojeIso = toIsoDate(hoje)         // "YYYY-MM-DD"

candidatos = SELECT * FROM service_billing_reminders
             JOIN platform_services ON service_id = platform_services.id
             WHERE service_billing_reminders.status NOT IN ('paid', 'postponed', 'skipped')
               AND platform_services.enabled = true
             -- MUDANÇA vs 78-8: antes era `status = 'pending'` (excluía 'alerted' para sempre).
             -- Agora inclui 'alerted' também, porque 'alerted' deixou de ser um estado terminal
             -- de dedup — o dedup passou a ser por DIA (last_alerted_on), não por status.

paraAlertar = candidatos.filter(r => {
  distancia = diffDiasAteVencer(r.due_date, hoje)   // positivo = dias até vencer; negativo = dias vencida
  gatilho = (distancia === r.alert_days_before)      // D-N exato (usuário configura N=3)
         || (distancia === 0)                         // D-0 exato
         || (distancia < 0)                            // vencida — TODO dia (D+1, D+2, ...)
  jaAlertouHoje = r.last_alerted_on === hojeIso
  return gatilho && !jaAlertouHoje
})

idsParaAlertar = paraAlertar.map(r => r.id)
alertadas = UPDATE service_billing_reminders
            SET status = 'alerted', last_alerted_on = hojeIso
            WHERE id = ANY(idsParaAlertar)
              AND (last_alerted_on IS DISTINCT FROM hojeIso)   -- dedup atômico POR DIA (não mais por status)
            RETURNING id, service_id, due_date, expected_amount, currency, billing_cycle

// só notificar as linhas em `alertadas` (RETURNING) — garante que 2 execuções concorrentes
// do cron no MESMO DIA não notificam 2x. No dia seguinte, o filtro `last_alerted_on IS DISTINCT
// FROM hojeIso` volta a ser satisfeito e a linha pode alertar de novo (se ainda aplicável).

admins = SELECT id, name, email FROM users WHERE role = 'admin' AND is_active = true
for cada linha em alertadas:
  for cada admin em admins:
    sendEmail(...).catch(log)
    sendPushToUser(admin, ...).catch(log)

// Passo 2 (recorrência por decurso de tempo) da 78-8 é REMOVIDO INTEIRO desta versão do cron.
// Recorrência agora só acontece no PATCH .../[id] quando status vira 'paid' — ver próxima seção.
```

**Por que `distancia === r.alert_days_before` (igualdade exata) e não `<=` (janela contínua):** a 78-8 usava uma janela contínua `[due-N, due]` porque o dedup era por status (uma vez alertado, nunca mais — então "alertar em qualquer dia da janela" bastava, dava no mesmo resultado prático de "alertar 1 vez"). Agora, com dedup por dia, se usássemos `<=` a linha alertaria **todo santo dia** entre D-N e D-0 (ex.: D-3, D-2, D-1, D-0 — 4 alertas), o que o usuário **não** pediu ("um aviso 3 dias antes" = um único aviso nesse ponto). Igualdade exata produz exatamente o comportamento pedido: 1 aviso em D-N, 1 aviso em D-0, e daí em diante 1 aviso por dia enquanto vencida. Risco aceito e documentado: se o cron ficar fora do ar exatamente no dia D-N, esse aviso específico é perdido (mas o aviso D-0 e a cadeia diária pós-vencimento continuam funcionando normalmente como rede de segurança — não é necessário compensar retroativamente).

### Recorrência movida para o PATCH (`status` → `'paid'`)

```
// Em PATCH /api/admin/billing-reminders/[id], quando validation.value.status === 'paid':

linhaAtual = SELECT due_date, billing_cycle FROM service_billing_reminders WHERE id = :id

update = { ...validation.value, paid_at: now() }

cicloEfetivo = validation.value.billing_cycle ?? linhaAtual.billing_cycle   // caso o PATCH também mude billing_cycle no mesmo request

if cicloEfetivo IN ('monthly', 'annual'):
  proximoVencimento = avancarCiclo(linhaAtual.due_date, cicloEfetivo)
  update.due_date = proximoVencimento
  update.status = 'pending'          // NÃO fica 'paid' — já nasce pronta pro próximo ciclo
  update.last_alerted_on = null      // reseta para o novo ciclo poder alertar do zero
// else (cicloEfetivo === 'usage'): update.status permanece 'paid' (validation.value.status),
// due_date NÃO muda, last_alerted_on NÃO é tocado — comportamento herdado de 78-8.

UPDATE service_billing_reminders SET ...update WHERE id = :id RETURNING ...
```

**Por que a linha "nasce pronta pro próximo ciclo" (status volta a `pending` na mesma requisição) em vez de ficar visivelmente `'paid'` até o próximo cron rodar:** o requisito do usuário é "recorrência só depois de pago" — o pagamento É o evento que dispara a recorrência, então não há razão para esperar o próximo cron para fazer a transição; fazer isso síncrono no PATCH é mais simples (sem depender de um cron rodar depois), mais correto (o admin vê o próximo vencimento imediatamente ao marcar como pago) e elimina uma classe inteira de bugs de timing entre "marcar como pago" e "a recorrência efetivamente acontecer". `paid_at` continua sendo gravado (registro histórico de quando o último pagamento ocorreu), mesmo que `status` já tenha voltado a `pending` na mesma resposta.

### Canais de notificação — sem mudança de decisão (reuso integral de 78-8)
Mantém **e-mail** (`sendEmail`) **+ push** (`sendPushToUser`) para **todos** os 3 tipos de gatilho (D-N, D-0, diário-vencida), para os mesmos destinatários (`role='admin' AND is_active=true`, sem `org_id`). O requisito do usuário enfatiza "e-mail diário" para o caso de atraso, mas não pede a **remoção** do push nos demais casos — manter push em todos os gatilhos é consistente com a decisão já validada em 78-8 e não é uma regressão. Se o time quiser reduzir push só ao estágio de atraso no futuro, é uma revisão de escopo separada (não inventar agora).

**Diferenciação de mensagem por gatilho (recomendado, não bloqueante):** o `subject`/`html` do e-mail pode variar ligeiramente conforme o tipo de gatilho (ex.: "Vencimento em 3 dias" vs "Vence hoje" vs "Fatura vencida há N dias — ainda não paga"), usando o mesmo `distancia` já calculado em `deveAlertar`. Isso melhora a clareza para o admin mas não é um AC formal desta story — @dev pode implementar como parte natural do T3.4 sem necessidade de aprovação adicional.

### `alert_days_before` — decisão sobre como o usuário configura "3 dias antes"
O schema já tem `alert_days_before` (integer, `DEFAULT 7`, `CHECK >= 0`) configurável **por linha** desde a Story 78-1. Esta story **não** adiciona um campo novo fixo para "D-3" — em vez disso, o admin configura `alert_days_before = 3` nas linhas em que quiser esse comportamento (via `POST`/`PATCH` já existentes de 78-8, sem mudança de contrato de API para isso). O `DEFAULT` da coluna (`7`) **não** é alterado por esta story (mudar o `DEFAULT` seria uma decisão de produto sobre linhas futuras sem vencimento explícito escolhido, fora do que foi pedido — Article IV). Se o usuário quiser `3` como padrão em vez de `7` para novas linhas, isso é uma mudança de 1 linha de migration trivial, mas deliberadamente **fora de escopo** desta story a menos que solicitado explicitamente.

### Padrão de guard admin-only / cron — sem mudança
Reusar integralmente os padrões já em produção (`requireAuth`/`requireRole` no PATCH, `CRON_SECRET` no cron) — nenhuma mudança de autenticação nesta story.

### Testing Standards
- Não há suíte de testes automatizados abrangente no projeto para rotas de API/cron (mesma constatação da 78-8) — mas a extração das funções puras (`avancarCiclo`/`diffDias`) para `packages/web/src/lib/billing/reminder-schedule.ts` (T2.1) torna essas funções **triviais de testar isoladamente**, sem mock de Supabase — seguir o precedente de `packages/web/src/app/api/cron/boleto-scan/route.test.ts` como referência de estilo, mas testar o módulo novo diretamente (não a rota).
- Validar manualmente em DEV: popular linhas cobrindo os 11 cenários de AC (D-N exato, D-0, vencida há 1/2/N dias, `paid`, `postponed`/`skipped`, migration aplicada em linha pré-existente com `last_alerted_on=NULL`) e rodar o cron + o PATCH manualmente.

---

## Testing

### Abordagem
- Teste unitário de `avancarCiclo`/`diffDias` no novo módulo `reminder-schedule.test.ts` (funções puras, sem I/O) — cobre overflow de dia-do-mês e cálculo de distância D-N/D-0/vencida.
- Teste unitário (ou revisão de código cuidadosa, se teste automatizado não for viável no tempo da story) da função `deveAlertar` isolada — cobre os 3 pontos de disparo + o caso de já ter alertado hoje.
- Validação manual em Supabase DEV para o fluxo completo (cron real + PATCH real).

### Cenários de teste

1. **D-N exato dispara 1x:** `due_date=hoje+3`, `alert_days_before=3`, `status='pending'`, `last_alerted_on=NULL` → cron dispara, `last_alerted_on` vira hoje. Rodar de novo no mesmo dia → não duplica (AC1).
2. **Fora dos pontos de disparo:** `due_date=hoje+5`, `alert_days_before=3` → cron não dispara (AC2).
3. **D-0 dispara mesmo após D-N já ter alertado:** linha com `last_alerted_on` = 3 dias atrás, `due_date=hoje` → dispara de novo hoje (AC3).
4. **Diário pós-vencimento, não duplica no mesmo dia:** `due_date=hoje-1`, `status='pending'` → dispara; rodar 2x no mesmo dia → só 1 envio; no dia seguinte (ainda `pending`) → dispara de novo (AC4).
5. **`status='paid'` bloqueia tudo:** `due_date=hoje-10`, `status='paid'` → cron não dispara nada para essa linha (AC5).
6. **`status='postponed'`/`'skipped'` bloqueiam:** mesmo cenário de vencida, mas com esses status → nenhum alerta (AC6).
7. **Recorrência só ao pagar (mensal):** `PATCH {status:'paid'}` numa linha `billing_cycle='monthly'`, `due_date=2026-01-31` → resposta já mostra `due_date=2026-02-28`, `status='pending'`, `last_alerted_on=null`, `paid_at` preenchido (AC7).
8. **Recorrência só ao pagar (anual + overflow):** idem com `billing_cycle='annual'`, `due_date=2026-02-29` (ano não-bissexto seguinte não existe 29/02) → `due_date` clampado corretamente (AC7).
9. **`usage` não recorre automaticamente:** `PATCH {status:'paid'}` numa linha `billing_cycle='usage'` → `status` permanece `'paid'`, `due_date` inalterado (AC7).
10. **Cron nunca mais avança `due_date` sozinho:** linha vencida há 30 dias, `status='alerted'`, nunca paga → rodar o cron várias vezes em dias diferentes → `due_date` permanece o mesmo em todas as execuções; só `last_alerted_on`/alertas mudam (AC8).
11. **Migration retrocompatível:** linha criada **antes** desta migration (portanto `last_alerted_on=NULL` por padrão de coluna nova) dentro da janela D-0 → cron trata `NULL` como "nunca alertada" e dispara normalmente (AC9).
12. **Timezone:** avaliação perto da virada de dia UTC (ex.: 02:00 UTC = 23:00 BRT do dia anterior) não desloca `distancia` em ±1 dia (AC10).
13. **`last_alerted_on` não aceito cru:** `PATCH`/`POST` enviando `last_alerted_on` no corpo → campo é ignorado/rejeitado, nunca gravado literalmente a partir do cliente (AC11).

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Aviso D-N (exato) é perdido se o cron não rodar naquele dia específico (outage) | Baixa | Documentado como aceito (ver Dev Notes) — o aviso D-0 e a cadeia diária pós-vencimento funcionam como rede de segurança; não é preciso compensar retroativamente |
| R2 | Mudar a query de `status='pending'` para `status NOT IN (...)` pode reativar alertas de linhas que já estavam `'alerted'` há muito tempo sob a regra antiga (nunca mais alertavam) | Média (esperada) | É exatamente o comportamento corrigido por esta story (REL-001) — linhas vencidas-não-pagas voltam a alertar diariamente, que é o requisito do usuário; comunicar essa mudança de comportamento explicitamente no Change Log/PR |
| R3 | Colisão de número de migration com a Story 78-10 (ainda Draft, também sem migration criada) | Baixa | Numeração condicional documentada nos Dev Notes; T1.1 exige reconferir `ls supabase/migrations` no momento do `*develop`, não assumir o número do texto da story |
| R4 | PATCH calculando recorrência incorretamente se o cliente também mandar `due_date` OU `billing_cycle` no mesmo payload que `status:'paid'` | Baixa | T5.2 usa explicitamente o `billing_cycle` **efetivo** pós-payload (não o anterior) para decidir se recorre; comportamento deve ser testado no cenário 7/8 com payload combinado, se o tempo permitir |
| R5 | Extração de `avancarCiclo`/`diffDias` para módulo compartilhado (T2) introduzir uma regressão sutil no cron por mudança de assinatura/import | Baixa | T2.3 exige teste unitário do módulo extraído antes de integrar nos 2 call sites (cron + PATCH) |

---

## Dependencies

- **Depende de:** Story 78-1 (schema `service_billing_reminders`, migration `164` — **bloqueante**, já aplicada), Story 78-8 (implementação atual do cron e do PATCH que esta story reescreve — **bloqueante direta**, esta story não pode ser implementada sem o código-base da 78-8 existir no repositório)
- **Não depende de:** Stories 78-2 a 78-7, 78-9, 78-10 (coletores de custo e UI são independentes da lógica de escalonamento de lembretes)
- **Cuidado de coordenação (não bloqueante):** Story 78-10 (Draft) também planeja uma migration própria (`165_enable_meta_ads_billing_module.sql`, condicional). Ver "Numeração de migration" nos Dev Notes — nenhuma das duas stories bloqueia a outra tecnicamente, só é preciso reconferir a numeração real no momento de cada `*develop`.
- **Dependências técnicas:**
  - `packages/web/src/app/api/cron/billing-reminders/route.ts` (reescrito)
  - `packages/web/src/app/api/admin/billing-reminders/[id]/route.ts` (estendido)
  - `packages/web/src/lib/billing/reminder-validation.ts` (ajustado — AC11)
  - `packages/web/src/lib/billing/reminder-schedule.ts` (novo — módulo extraído)
  - `supabase/migrations/{N}_service_billing_reminders_last_alerted.sql` (novo)

---

## Definition of Done

- [ ] Migration aditiva criada e aplicada em DEV (AC9)
- [ ] `reminder-schedule.ts` extraído e testado unitariamente (T2)
- [ ] Cron reescrito: gatilho D-N/D-0/diário-vencida com dedup por dia (AC1-AC4, AC6, AC10, AC11)
- [ ] Passo 2 antigo (recorrência por decurso de tempo) removido do cron (AC8)
- [ ] PATCH `.../[id]` implementando recorrência-ao-pagar para `monthly`/`annual` (AC7)
- [ ] `usage` continua sem recorrência automática (AC7)
- [ ] Todos os 13 cenários de teste da seção Testing validados manualmente (ou via teste automatizado, onde viável)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story).

**Story Type Analysis (para referência futura, caso CodeRabbit seja habilitado):**
- **Primary Type:** API (reescrita de cron endpoint + extensão de rota PATCH existente)
- **Secondary Type:** Database (migration aditiva de 1 coluna)
- **Complexity:** Medium (lógica de decisão reescrita em 2 arquivos + módulo novo extraído + 1 migration; sem novos endpoints, sem mudança de autenticação)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-13 | 0.1 | Story criada a pedido explícito do usuário (2026-07-13), como enhancement da Story 78-8 (InReview) — resolve diretamente o REL-001 sinalizado pelo QA da 78-8 (recorrência silenciosa de fatura vencida-não-paga, sem escalonamento). [AUTO-DECISION] Gatilho de alerta redesenhado para 3 pontos discretos (D-N exato, D-0 exato, diário enquanto vencida) em vez da janela contínua `[due-N, due]` da 78-8 → reason: com dedup por dia (`last_alerted_on`) em vez de dedup por status permanente, uma janela contínua produziria alertas repetidos todo dia entre D-N e D-0, o que o usuário não pediu ("um aviso 3 dias antes" = um único ponto, não um período). [AUTO-DECISION] Coluna nova `last_alerted_on date` nullable sem DEFAULT (em vez de reaproveitar `status='alerted'` como dedup) → reason: o requisito exige que o alerta continue disparando TODO dia após o vencimento até ser pago; `status='alerted'` permanente (como na 78-8) é incompatível com "diário" — precisa de um marcador que reseta naturalmente a cada novo dia calendário, não um estado terminal. [AUTO-DECISION] Recorrência movida do cron (decurso de tempo) para o PATCH (evento de pagamento), síncrona na mesma requisição → reason: requisito explícito do usuário ("recorrência só depois de pago"); fazer a transição no momento do pagamento é mais simples e elimina risco de timing entre "marcar pago" e "o cron rodar depois" para efetivar a recorrência. [AUTO-DECISION] `alert_days_before` reusado como o campo configurável para "N dias antes" (usuário configura `3` por linha) em vez de criar um campo fixo novo para "D-3" → reason: campo já existe desde 78-1 com exatamente essa semântica (`DEFAULT 7`, `CHECK >= 0`); criar um campo paralelo duplicaria o conceito sem necessidade (IDS REUSE > CREATE). DEFAULT da coluna não alterado (permanece 7) — mudar o padrão para novas linhas é decisão de produto fora do que foi pedido. [AUTO-DECISION] `hojeSaoPaulo`/`diffDias`/`avancarCiclo` extraídas para módulo compartilhado `packages/web/src/lib/billing/reminder-schedule.ts` → reason: essas funções, antes só embutidas no cron (78-8), agora são necessárias também no PATCH (recorrência-ao-pagar) — duplicar o código nos 2 arquivos violaria DRY e criaria risco de divergência entre cron e PATCH no cálculo de ciclo/data. [AUTO-DECISION] Numeração de migration proposta como `166` (condicional, mesma disciplina da 78-8/78-10) → reason: `165` já está logicamente reservado pela Story 78-10 (ainda Draft, migration ainda não criada fisicamente); Article IV — não inventar/assumir um número que pode colidir, T1.1 exige reconferir a lista real de migrations no momento do `*develop`. | @sm (River) |

---

## Dev Agent Record

*Esta seção será preenchida pelo @dev durante a implementação.*

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

---

## QA Results

*Esta seção será preenchida pelo @qa/@architect durante o quality gate.*

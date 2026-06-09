# Story 51-4 — Notificar Corretor quando Follow-ups Esgotam (Gatilho B)

## Metadata
- **Epic:** 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma
- **Story:** 51-4
- **Status:** Ready for Review
- **Validated:** 2026-06-09 by @po (Pax) — verdict GO (8/10); call-site notifyBroker corrigido
- **Priority:** P1 — leads esfriando sem aviso ao corretor
- **Complexity:** S/M (3-4h)
- **Created:** 2026-06-09
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[followup_notification_test, regression_cron_followup, regression_telegram]`
- **Autossuficiente:** sim — não depende de 51-1, 51-2 ou 51-3

---

## User Story

**Como** corretor responsável por um lead,
**Quero** ser notificado quando a Nicole esgotou seus follow-ups e o lead não respondeu,
**Para que** eu possa fazer contato humano (mensagem personalizada ou ligação) antes de perder o lead.

---

## Context

O cron `POST /api/cron/followup` (`packages/web/src/app/api/cron/followup/route.ts`) já implementa
a lógica de "alert_broker": quando `daysSinceLastMessage >= rule.alert_days` e o corretor ainda não
respondeu, o cron cria uma entrada em `follow_up_log` com `type='alert_broker'`.

**Linha 252 (follow_up_log insert para alert_broker):**
```ts
// linha ~246-261
await supabase.from("follow_up_log").insert({
  org_id: orgId,
  lead_id: lead.id,
  rule_id: rule.id,
  type: "alert_broker",           // ← criado
  status: "pending",
  scheduled_at: now,
  ...
})
// Nenhuma notificação real é disparada aqui — apenas o log
```

**O que está faltando:** após inserir o `alert_broker` no log, chamar `notifyBroker` para enviar
push/email/WhatsApp ao corretor. Hoje essa chamada simplesmente não existe.

### Lógica de `alert_broker` vs `nicole_takeover_days`

O cron tem dois thresholds por `follow_up_rules`:
1. `alert_days`: dias sem resposta → criar `alert_broker` no log (notificar corretor → esta story)
2. `nicole_takeover_days`: dias sem resposta do corretor → Nicole retoma automaticamente

Esta story toca o threshold `alert_days` (Gatilho B do produto).

### Dados disponíveis no cron no ponto de criação do alert_broker

No bloco do cron onde `type='alert_broker'` é criado, já estão em escopo:
- `lead` — objeto com `id`, `phone`, `name`, `assigned_broker_id`
- `orgId`
- `rule` — regra de follow-up com `alert_days`, `nicole_takeover_days`

O `assigned_broker_id` pode ser nulo se o lead não foi atribuído a nenhum corretor. Nesse caso,
a notificação deve ser enviada ao primeiro `gerente_comercial` da org (fallback).

[AUTO-DECISION] Fallback quando `assigned_broker_id` é nulo: buscar usuário com `role='gerente_comercial'`
ou `role='admin'` na org e notificá-lo. Razão: o lead não pode ficar sem ninguém responsável. Se
nem gerente/admin existe, logar warn e continuar sem notificação.

### Prevenção de spam de notificações

O `follow_up_log` já serve como mecanismo de deduplicação: o cron verifica `brokerSentRecently`
antes de criar o alert. Mas há risco de o mesmo `alert_broker` ser criado em múltiplas rodadas
do cron. Esta story deve verificar se já existe um `alert_broker` não-resolvido para o mesmo
`lead_id` antes de disparar notificação (AC5).

---

## Acceptance Criteria

- [x] **AC1:** Em `packages/web/src/app/api/cron/followup/route.ts`, após inserir entrada `type='alert_broker'` em `follow_up_log`, é disparada notificação real ao corretor responsável
- [x] **AC2:** A notificação contém:
  - Push: título "Lead parado — ação necessária", corpo "{nome_lead} não respondeu aos follow-ups da Nicole. Ligue ou envie mensagem."
  - Email: assunto "Lead sem resposta — {nome_lead}", corpo com dias sem resposta + link para o lead
  - WhatsApp ao corretor: "O lead {nome_lead} está sem resposta há {N} dias. Acesse: {leadUrl}"
- [x] **AC3:** A notificação reutiliza `notifyBroker` de `packages/web/src/lib/roleta/notify-broker.ts` com o parâmetro `context` adicionado na Story 51-3 (AC4 da 51-3). Se 51-3 ainda não foi deployada, adicionar o parâmetro `context` como parte desta story também
- [x] **AC4:** Se `lead.assigned_broker_id` é nulo, buscar usuário com `role='gerente_comercial'` ou `role='admin'` na org para notificação de fallback. Se nenhum encontrado, logar warn e não enviar
- [x] **AC5:** A notificação só é disparada se NÃO existe um `follow_up_log` com `type='alert_broker'` E `status != 'completed'` para o mesmo `lead_id` criado nas últimas 48h. Previne spam em rodadas consecutivas do cron
- [x] **AC6:** Falha na notificação (push/email/WhatsApp) não quebra o cron — try/catch em volta da chamada. O `follow_up_log` insert e as demais operações do cron continuam normalmente
- [x] **AC7:** A notificação NÃO é disparada quando `brokerSentRecently=true` (o corretor já está ativo) — essa verificação já existe no cron; garantir que a adição de notificação não cria chamada antes desse check
- [x] **AC8:** TypeScript compila sem erros; ESLint passa; testes unitários adicionados para os cenários de AC5, AC4 e AC6

---

## Tasks / Subtasks

- [x] **T0 — Pre-Flight: compatibilidade `notify-broker.ts` com cron**
  - O cron `followup/route.ts` roda no contexto Next.js (App Router API route) → pode importar `notify-broker.ts` diretamente (mesmo ambiente)
  - Verificar que `notify-broker.ts` com `"server-only"` é compatível (deve ser, cron é server-side)
  - Confirmar que `cron/followup/route.ts` já tem acesso a `createAdminClient()` ou equivalente

- [x] **T1 — Verificar/adicionar parâmetro `context` em `notifyBroker`**
  - Story 51-3 JÁ adicionou o parâmetro `context?: { title?: string; body?: string }` em `NotifyBrokerParams` (confirmado em `notify-broker.ts:25-31`). Esta story apenas CONSOME — `notify-broker.ts` NÃO foi modificado.

- [x] **T2 — Adicionar query de anti-spam (AC5)**
  - Antes de disparar notificação, consultar `follow_up_log`:
    ```ts
    const recentAlert = await supabase
      .from("follow_up_log")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("type", "alert_broker")
      .neq("status", "completed")
      .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .maybeSingle()   // .maybeSingle() nunca .single() — padrão do projeto
    if (recentAlert.data) continue // skip notificação
    ```

- [x] **T3 — Buscar corretor para notificação (com fallback)**
  - Se `lead.assigned_broker_id` presente: buscar `users` WHERE `id = assigned_broker_id`
  - Se nulo: buscar `users` WHERE `org_id = orgId` AND `role IN ('gerente_comercial', 'admin')` LIMIT 1
  - Se nenhum: logar warn, skip notificação

- [x] **T4 — Chamar `notifyBroker` no bloco `alert_broker`**
  - Localizar bloco em `followup/route.ts` onde `type: "alert_broker"` é inserido (linha ~246-261)
  - Após o insert, dentro de try/catch:
    ```ts
    await notifyBroker({
      orgId,
      broker: { userId: broker.id, name: broker.name, email: broker.email, phone: broker.phone },
      lead: { id: lead.id, name: lead.name, phone: lead.phone },
      config: { notify_push: true, notify_email: true, notify_whatsapp: true },
      context: {
        title: 'Lead parado — ação necessária',
        body: `${lead.name ?? 'Lead'} não respondeu aos follow-ups. Ligue ou envie mensagem.`
      }
    })
    ```

- [x] **T5 — Testes unitários**
  - Criar `packages/web/src/app/api/cron/followup/notify-alert.test.ts`
  - Cenário 1: `assigned_broker_id` presente + sem alert recente → notificação disparada
  - Cenário 2: `assigned_broker_id` nulo + gerente existe → notificação ao gerente
  - Cenário 3: `assigned_broker_id` nulo + sem gerente/admin → warn logado, sem throw
  - Cenário 4: alert recente (< 48h) → notificação NÃO disparada (AC5)
  - Cenário 5: `notifyBroker` falha → cron continua (AC6)

- [x] **T6 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros (passou)
  - `eslint` nos 3 arquivos da story → zero erros/warnings (passou)
  - `vitest run` → notify-alert.test.ts 9/9 + suite broker 27/27 (passou)

---

## Dev Notes

> **ADR-001 (fonte de verdade de `assigned_broker_id`):** ver `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md`. O alerta de follow-ups esgotados vai para o **dono estável do lead** (`assigned_broker_id`). Como a atribuição passa a ser first-write-wins (Nicole não sobrescreve), não há risco da notificação "pular" para outro corretor por reatribuição silenciosa.

### Paths-chave
```
packages/web/src/app/api/cron/followup/route.ts              ← EDITAR (T2, T3, T4) — bloco alert_broker
packages/web/src/lib/roleta/notify-broker.ts                  ← EDITAR (T1) se 51-3 não deployada
packages/web/src/app/api/cron/followup/notify-alert.test.ts  ← CRIAR (T5)
```

### Localização precisa no cron (linhas aproximadas)
```ts
// followup/route.ts
// Linha ~177: brokerSentRecently check
// Linha ~189: if (daysSinceLastMessage >= rule.nicole_takeover_days) { ... }
// Linha ~240+ (no bloco else de nicole_takeover): if (daysSinceLastMessage >= rule.alert_days)
//   linha ~246: await supabase.from("follow_up_log").insert({ type: "alert_broker", ... })
//   ← INSERIR notificação AQUI, após o insert
```

### Gotchas
- **`brokerSentRecently` check (AC7):** A lógica `if (brokerSentRecently) continue` está na linha ~181, ANTES do bloco de `alert_broker`. Portanto, se o corretor já está ativo, o código nem chega ao ponto de inserção do alert. O AC7 é satisfeito estruturalmente, mas verificar a estrutura do if/else antes de implementar
- **`.maybeSingle()` obrigatório:** O projeto tem regra de usar `.maybeSingle()` em vez de `.single()` — `.single()` throw em 0 rows. Aplicar no T2
- **`notify-broker.ts` importação:** O cron é um Next.js App Router route handler (server-side) — pode importar `notify-broker.ts` com `"server-only"` diretamente. Diferente do `pipeline.ts` (GAP da Story 51-3)
- **Configuração de notificações do corretor:** `notifyBroker` lê `config.notify_push`, `config.notify_email`, `config.notify_whatsapp`. O caller deve passar `{ notify_push: true, notify_email: true, notify_whatsapp: true }` — mas verificar se o projeto tem uma tabela de preferências de notificação por usuário. Se sim, buscar as preferências do corretor antes de chamar

---

## File List

### Criados
- `packages/web/src/lib/broker/notify-stalled-lead.ts` — helper best-effort: anti-spam (AC5) + resolução de destinatário com fallback (AC4) + chamada a `notifyBroker` com `context` (AC1-AC3). Espelha o padrão de `notify-appointment.ts` (Story 51-3). Nunca lança (AC6).
- `packages/web/src/app/api/cron/followup/notify-alert.test.ts` — 9 testes unitários (Vitest) cobrindo os 6 cenários obrigatórios + edge cases.

### Modificados
- `packages/web/src/app/api/cron/followup/route.ts` — (1) `assigned_broker_id` adicionado ao SELECT de leads; (2) import de `notifyBrokerOfStalledLead`; (3) chamada ao helper logo após o insert de `alert_broker` + `logEvent` `FOLLOWUP_ALERT_BROKER`.

### NÃO modificados (reuso)
- `packages/web/src/lib/roleta/notify-broker.ts` — o param `context` já foi adicionado pela Story 51-3; esta story apenas consome.

### Referência (não modificar)
- `packages/web/src/lib/broker/notify-appointment.ts` (Story 51-3 — padrão de wrapper best-effort que foi espelhado)
- `supabase/migrations/068_roleta_leads.sql` (colunas `notify_push/email/whatsapp` em `roleta_config`)
- `supabase/migrations/062-085_*` (role real `gerente-comercial` com hífen; `assigned_broker_id` = user_id RLS 085)

---

## Dev Agent Record

### Agent Model Used
Dex (Builder) — Opus 4.8 (1M context), YOLO mode.

### Completion Notes

**Decisão arquitetural (IDS REUSE > ADAPT > CREATE):** criado helper dedicado `notifyBrokerOfStalledLead`
em `packages/web/src/lib/broker/` — sibling de `notify-appointment.ts` (Story 51-3). Mantém o cron route
fino (uma chamada best-effort) e a lógica testável em isolamento, exatamente o padrão validado na 51-3.
CREATE justificado: não existia helper para o gatilho "follow-up esgotado"; a única peça reutilizável
(`notify-appointment.ts`) é específica de agendamento. `notifyBroker` em si foi REUSADO sem modificação.

**T1 — `context` param:** já existia (adicionado pela Story 51-3, `notify-broker.ts:25-31`). `notify-broker.ts`
NÃO foi tocado nesta story.

**[AUTO-DECISION 51-4] Role de fallback `gerente-comercial` (hífen, não underscore):** o AC4/T3 escreve
`gerente_comercial` (underscore), mas o valor REAL no banco é `gerente-comercial` (hífen) — confirmado em
migrations 062/063/079/084 e em ~20 call-sites do app web. Usar underscore casaria zero linhas. Seguindo a
orientação explícita do @po, usei `["gerente-comercial", "admin"]`. (reason: evitar fallback silenciosamente
inoperante).

**Anti-spam / dedup (AC5):** fonte de verdade = `follow_up_log` type `alert_broker` com `status != 'completed'`
nas últimas 48h. O helper é chamado APÓS o insert da linha desta rodada, então 1 linha = sem alerta prévio
(dispara); >1 linha = já havia alerta aberto (skip, sem duplicar). Rede de segurança redundante ao `cooldownSet`
de 48h do cron (linhas 124-134), que já impede reentrada por lead/48h — por isso não há risco de duplicação.

**Fallback sem broker (AC4):** `resolveRecipient()` busca `users` por `id = assigned_broker_id`; se nulo OU
sem email, cai para o primeiro `gerente-comercial`/`admin` da org (com email). Sem ninguém → `console.warn` e
skip sem throw.

**Best-effort (AC6):** todo o helper é `try/catch` e retorna `boolean` em vez de lançar. O cron continua o loop
e processa os demais leads normalmente. `is_ai_active` NÃO é tocado — Nicole permanece ativa (regra de negócio).

**AC7 (brokerSentRecently):** confirmado estruturalmente — `if (brokerSentRecently) continue` está na linha 181,
ANTES do bloco `else if (daysSinceLastMessage >= rule.alert_days)`. Se o corretor está ativo, o código nunca
chega ao ponto de notificação. Nenhuma chamada foi adicionada antes desse check.

### Debug Log References
- `vitest run notify-alert.test.ts` → 9/9 passed
- `vitest run packages/web/src/lib/broker/` (regressão) → 27/27 passed (3 suites)
- `pnpm --filter @trifold/web type-check` → 0 erros
- `eslint` nos 3 arquivos da story → 0 erros/warnings

---

## Testing

### Framework
Vitest

### Cenários obrigatórios (T5)
1. `assigned_broker_id` presente + sem alert < 48h → notificação disparada com texto de follow-up esgotado ("Lead parado — ação necessária")
2. `assigned_broker_id` nulo + `gerente_comercial` existe → notificação ao gerente
3. `assigned_broker_id` nulo + sem gerente → warn, sem throw, cron continua
4. Alert já existe (< 48h, status != 'completed') → sem notificação (anti-spam AC5)
5. `brokerSentRecently=true` → cron nem entra no bloco alert_broker → sem notificação (verificar estrutura)
6. `notifyBroker` lança exceção → cron continua sem propagação de erro

### Smoke pós-deploy
- Aguardar `alert_days` para um lead de teste (ou ajustar temporariamente a regra no banco)
- Verificar que corretor recebe push/email/WhatsApp após rodada do cron
- Verificar que rodadas subsequentes do cron NÃO reenviaram notificação (anti-spam)
- Verificar que Nicole continua ativa no lead (`is_ai_active=true` não tocado)
- Query: `SELECT * FROM follow_up_log WHERE type='alert_broker' ORDER BY created_at DESC LIMIT 5`

---

## Out of Scope

- `nicole_takeover_days` (Nicole retoma automaticamente) — não é gatilho de notificação desta story, apenas do threshold de nicole_sent
- Envio automático de follow-up WhatsApp pela Nicole → Story 51-5 (paridade WhatsApp)
- Dashboard visual de "alertas pendentes ao corretor" → backlog futuro

---

## Definition of Done

- [ ] AC1–AC8 marcados como completos
- [ ] T0–T6 marcados como done
- [ ] Decisão de 51-3 vs 51-4 para `context` param documentada
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-09 | 0.1 | Story drafted — Epic 51, GAP-5b (Gatilho B) | @sm (River) |
| 2026-06-09 | 0.2 | Validação PO (GO 8/10): call-site real de notifyBroker corrigido; texto do cenário de teste corrigido (follow-up, não agendamento); AC7 estrutural confirmado contra código (brokerSentRecently linha 181); Status → Ready | @po (Pax) |
| 2026-06-09 | 1.0 | Implementação (YOLO): helper `notify-stalled-lead.ts` (reuso do padrão 51-3) + wiring no cron + 9 testes. AC1-AC8 done. Fallback usa role real `gerente-comercial` (hífen). Lint/typecheck/testes verdes. Status → Ready for Review | @dev (Dex) |
| 2026-06-09 | 1.1 | Quality gate @qa: verdict PASS. 8/8 ACs com evidência path:linha; 9/9 + 27/27 (broker) testes verdes; type-check + ESLint exit 0. AC7 (ordem do continue), is_ai_active intocado e role com hífen verificados no código. 1 MEDIUM (TEST-001, infra vitest herdada) + 2 LOW não-bloqueantes. Gate: `docs/qa/gates/51.4-notificar-corretor-followups-esgotados.yml` | @qa (Quinn) |

---

## QA Results

### Review Date: 2026-06-09

### Reviewed By: Quinn (@qa) — Test Architect

### Gate Decision: ✅ PASS

**Resumo:** Os 7 quality checks passam. Os 8 ACs estão atendidos por código com evidência
`path:linha` e cobertos por 9 testes verdes. Os invariantes críticos do epic foram verificados
diretamente no código, não apenas na documentação:

- **AC7 (ordem do `continue`):** `if (brokerSentRecently) continue` (`route.ts:182`) está ANTES
  do bloco `else if (daysSinceLastMessage >= rule.alert_days)` (`route.ts:247`), e a chamada
  `notifyBrokerOfStalledLead` (`route.ts:270`) está DEPOIS do insert de `alert_broker`
  (`route.ts:249`). Corretor ativo nunca dispara notificação. ✔
- **`is_ai_active` intocado:** `grep` confirma que a única ocorrência nos 3 arquivos da story é
  um comentário (`notify-stalled-lead.ts:17`). Nenhuma escrita. A Nicole permanece ativa. ✔
- **Role de fallback com hífen:** `FALLBACK_ROLES = ["gerente-comercial", "admin"]`
  (`notify-stalled-lead.ts:42`) — valor real do banco; underscore casaria zero linhas. ✔
- **Best-effort (AC6):** helper inteiro em `try/catch` retornando `boolean`, nunca lança
  (`notify-stalled-lead.ts:59-137`); o cron faz `await` e segue o loop. ✔

#### Mapa AC → Status

| AC | Status | Evidência |
|----|--------|-----------|
| AC1 — notificação após insert alert_broker | ✅ Met | `route.ts:249` (insert) + `270` (helper) + `280-287` (logEvent) |
| AC2 — copy push/email/whatsapp | ✅ Met | `notify-stalled-lead.ts:126-129`; aplicado via `notify-broker.ts:50-52,105-110,237-239` |
| AC3 — reuso de notifyBroker com context | ✅ Met | `notify-stalled-lead.ts:108-130`; `notify-broker.ts` não modificado |
| AC4 — fallback gerente-comercial/admin | ✅ Met | `resolveRecipient` `notify-stalled-lead.ts:153-197` |
| AC5 — anti-spam (>1 alert aberto em 48h) | ✅ Met | `notify-stalled-lead.ts:66-82` (redundante ao cooldownSet `route.ts:128-135`) |
| AC6 — falha não quebra o cron | ✅ Met | try/catch total `notify-stalled-lead.ts:59-137`; `route.ts:270` await + loop continua |
| AC7 — não dispara com brokerSentRecently | ✅ Met | `route.ts:182` continue ANTES de `247`/`270` |
| AC8 — type-check + lint + testes | ✅ Met | type-check 0 erros; ESLint exit 0; 9/9 testes |

#### Verificação independente (executada)

| Check | Comando | Resultado |
|-------|---------|-----------|
| Testes da story | `vitest run notify-alert.test.ts` | **9/9 passed** |
| Regressão broker | `vitest run packages/web/src/lib/broker/` | **27/27 passed** (3 suites) |
| Type-check web | `pnpm --filter @trifold/web type-check` | **0 erros** |
| ESLint (3 arquivos) | `eslint` nos arquivos da story | **exit 0** (zero hits) |
| Suite full web | `vitest run packages/web` | 59 passed / **6 failed** (as 6 falhas pré-existentes do webhook 21.1, alias `@web/*` — NÃO introduzidas aqui) |

#### Findings por severidade

- **MEDIUM — TEST-001:** wiring do cron route (GET handler) sem teste de integração — alias
  `@web/*` não resolve no vitest. Herdado de 50-3/51-x. Não-bloqueante (helper testado em isolamento).
- **LOW — REL-001:** a guarda anti-spam do helper é, na prática, inalcançável pelo caminho normal
  porque o `cooldownSet` (`route.ts:128-135`) já exclui o lead antes. É dupla proteção, não bug.
- **LOW — OBS-001:** CodeRabbit CLI não executado (config WSL; host é macOS). Análise manual cobriu
  todos os 7 checks.

#### Recomendação final

**PASS → liberar para `@devops *push`.** Smoke pós-deploy: ajustar `alert_days` de uma regra de
teste, rodar o cron, confirmar que o destinatário recebe a notificação UMA vez, que rodadas
subsequentes não reenviam (anti-spam) e que a Nicole continua ativa no lead.

Gate: PASS → `docs/qa/gates/51.4-notificar-corretor-followups-esgotados.yml`

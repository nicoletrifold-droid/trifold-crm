# Story 51-5 — Paridade WhatsApp no Envio Automático de Follow-up (Nicole)

## Metadata
- **Epic:** 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma
- **Story:** 51-5
- **Status:** Ready for Review
- **Validated:** 2026-06-09 by @po (Pax) — verdict GO (8/10); credenciais WhatsApp corrigidas (whatsapp_config, não env vars)
- **Priority:** P2 — melhoria de alcance, WhatsApp é o canal principal de produção
- **Complexity:** M (4-5h)
- **Created:** 2026-06-09
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[followup_whatsapp_test, regression_telegram, regression_cron, wa_template_validation]`
- **Autossuficiente:** sim — pode ser executada independentemente de 51-1 a 51-4

---

## User Story

**Como** operador do sistema,
**Quero** que a Nicole envie follow-ups automáticos também para leads via WhatsApp,
**Para que** a retenção de leads em produção (WhatsApp) seja equivalente ao canal de staging (Telegram).

---

## Context

A função `sendFollowUpMessage` em `packages/web/src/app/api/cron/followup/route.ts:13-16` é
responsável por enviar mensagens automáticas da Nicole no follow-up:

```ts
// linha 13-30 — atual
async function sendFollowUpMessage(phone: string, message: string): Promise<boolean> {
  if (!phone.startsWith("tg:")) {
    // Not a Telegram user — skip
    return false  // ← WhatsApp silenciosamente ignorado
  }
  // ... envia via Telegram Bot API
}
```

Em produção, os leads chegam via **WhatsApp** (não Telegram). O Telegram é usado em staging/teste.
Portanto, o motor de follow-up está **silenciosamente inoperante em produção** para o envio de
mensagens da Nicole.

### Restrição crítica: Janela de 24h do WhatsApp Business API

O WhatsApp Business API permite mensagens **freeform** apenas dentro de uma janela de 24h após
o último contato do usuário. Fora dessa janela, é obrigatório usar **templates aprovados** (HSM —
Highly Structured Messages) pelo Meta.

Para o follow-up da Nicole, os leads frequentemente estão **fora da janela** (o follow-up é acionado
justamente porque o lead não respondeu há vários dias). Portanto:

1. **Dentro da janela (< 24h):** enviar freeform diretamente via Graph API
2. **Fora da janela (>= 24h):** enviar via template aprovado OU pular/logar

[AUTO-DECISION] Para leads fora da janela de 24h: registrar no `follow_up_log` como `status='skipped'`
com `metadata: { reason: 'WHATSAPP_WINDOW_CLOSED' }`, e NÃO enviar. Razão: envio com template
requer templates pré-aprovados no Meta que não existem hoje e envolvem processo de aprovação
burocrático (~7 dias). Criar um template genérico ("Olá! Você tem interesse no apartamento?") como
AC opcional/futuro. A prioridade é não falhar silenciosamente — logar o skip.

### Dados da conversa disponíveis no cron

O cron já busca `conversations` linkadas ao lead. O campo `conversations.last_message_at` indica
quando foi o último contato do usuário. Este campo já é usado pelo cron para calcular `daysSinceLastMessage`.

---

## Acceptance Criteria

- [x] **AC1:** A função `sendFollowUpMessage` (ou seu substituto) em `followup/route.ts` distingue leads WhatsApp de Telegram pelo prefixo `tg:` no campo `phone`
- [x] **AC2:** Para leads **Telegram** (`tg:` prefix): comportamento atual PRESERVADO — envio via Bot API sem alterações
- [x] **AC3:** Para leads **WhatsApp** (sem `tg:` prefix) dentro da janela de 24h (`conversations.last_message_at < 24h atrás`): mensagem enviada via WhatsApp Cloud API (`POST https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`, `type: "text"`, `Authorization: Bearer ${waConfig.access_token}`). As credenciais vêm da tabela `whatsapp_config` (`org_id` + `status='active'`), NÃO de env vars — mesmo padrão de `appointment-whatsapp-reminders/route.ts:51-56`
- [x] **AC4:** Para leads **WhatsApp** fora da janela de 24h: função retorna `{ sent: false, reason: 'WHATSAPP_WINDOW_CLOSED' }`. O `follow_up_log` é atualizado com `status='skipped'` e `metadata: { reason: 'WHATSAPP_WINDOW_CLOSED' }`. Nenhuma mensagem é tentada
- [x] **AC5:** Falha na API do WhatsApp (4xx, 5xx, timeout) não quebra o cron — catch com log, retornar `{ sent: false, reason: 'API_ERROR', error: string }`
- [x] **AC6:** A `conversations.last_message_at` é usada como fonte de verdade para verificar a janela de 24h. Se `last_message_at` é nulo (conversa sem mensagens do usuário), tratar como fora da janela
- [x] **AC7:** As credenciais WhatsApp (`phone_number_id`, `access_token`) são lidas da tabela `whatsapp_config` por `org_id` + `status='active'` — mesmo padrão de `appointment-whatsapp-reminders` e `notify-broker.ts`. NÃO usar env vars `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TOKEN` (elas não existem no contexto de envio; verificado em código). Como o cron já itera por `org_id` (`rule.org_id`), buscar a config da org de cada lead
- [x] **AC8:** TypeScript compila sem erros; ESLint passa; testes unitários cobrem os 4 cenários: Telegram, WhatsApp dentro da janela, WhatsApp fora da janela, WhatsApp erro de API

---

## Tasks / Subtasks

- [x] **T0 — Pre-Flight: confirmar padrão de envio WhatsApp existente**
  - Ler `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (função `sendWhatsApp`, linhas 110-135) para extrair o padrão exato (headers, body shape)
  - **JÁ VERIFICADO:** credenciais vêm da tabela `whatsapp_config` (`org_id` + `status='active'` → `phone_number_id`, `access_token`), NÃO de env vars. Reusar esse padrão
  - Confirmar que o cron consegue buscar `whatsapp_config` por `org_id` (já usa `createAdminClient()` — sim)
  - Documentar no Completion Notes

- [x] **T1 — Extrair helper `sendWhatsAppFollowUp` (para testabilidade)**
  - Criar `packages/web/src/lib/whatsapp/send-whatsapp-message.ts` (ou verificar se já existe helper reutilizável)
  - Função: `sendWhatsAppMessage(phone: string, message: string): Promise<{ sent: boolean; error?: string }>`
  - Implementar POST ao Graph API com pattern de `appointment-whatsapp-reminders/route.ts`
  - Extrair para arquivo separado (padrão IDS — reusar em 51-1 também se necessário)

- [x] **T2 — Refatorar `sendFollowUpMessage` no cron**
  - Renomear/expandir para aceitar `conversationLastMessageAt?: Date` como parâmetro
  - Branch Telegram: preservar exatamente como está
  - Branch WhatsApp: verificar janela (AC3/AC4), chamar `sendWhatsAppMessage` (T1)
  - Atualizar chamadas do `sendFollowUpMessage` no cron para passar `last_message_at`

- [x] **T3 — Atualizar `follow_up_log` insert para status 'skipped'**
  - No bloco onde `sent = false` por janela fechada, após o insert do log, fazer update com `status='skipped'` e `metadata`
  - Ou: passar `status` no insert inicial com base no resultado do envio

- [x] **T4 — Testes unitários**
  - Criar `packages/web/src/lib/whatsapp/send-whatsapp-message.test.ts`
  - Cenário 1: lead Telegram → chamada Telegram, sem WhatsApp
  - Cenário 2: lead WhatsApp + `last_message_at` 2h → WhatsApp API chamada, `{ sent: true }`
  - Cenário 3: lead WhatsApp + `last_message_at` 30h → `{ sent: false, reason: 'WHATSAPP_WINDOW_CLOSED' }`; WhatsApp NÃO chamado
  - Cenário 4: lead WhatsApp + API retorna 500 → `{ sent: false, reason: 'API_ERROR' }`

- [x] **T5 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros
  - `pnpm --filter @trifold/web lint` → zero erros
  - `pnpm test` → suite vitest passando, incluindo T4

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/api/cron/followup/route.ts                       ← EDITAR (T2, T3)
packages/web/src/lib/whatsapp/send-whatsapp-message.ts                ← CRIAR (T1)
packages/web/src/lib/whatsapp/send-whatsapp-message.test.ts           ← CRIAR (T4)
packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts ← REFERÊNCIA (T0)
```

### Padrão de envio WhatsApp (verbatim de appointment-whatsapp-reminders/route.ts:51-135)
```ts
// 1. Buscar credenciais da tabela whatsapp_config (NUNCA env vars)
const { data: waConfig } = await supabase
  .from("whatsapp_config")
  .select("phone_number_id, access_token")
  .eq("org_id", rule.org_id)        // org do lead/rule em escopo
  .eq("status", "active")
  .maybeSingle()
if (!waConfig) { /* skip — sem config WhatsApp para a org */ }

// 2. POST ao Graph API usando as credenciais da tabela
const response = await fetch(
  `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${waConfig.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,  // formato E.164 sem +: "5544999999999"
      type: 'text',
      text: { body: message }
    }),
    signal: AbortSignal.timeout(15000),
  }
)
```

### Gotchas críticos
- **Janela de 24h:** É verificada por `last_message_at` da conversa — representa quando o **lead** enviou sua última mensagem. Se o lead não respondeu há 3 dias, estamos fora da janela. O follow-up da Nicole é ativado justamente quando o lead para de responder → a maioria dos casos estará fora da janela
- **Formato do phone WhatsApp:** E.164 sem `+` (ex: `5544999999999`). O banco guarda normalizado (migration 085 de phone normalization). Verificar que o phone está no formato correto antes de enviar
- **Não confundir com `agent_chat_messages`:** A migration 078 criou `agent_chat_sessions` e `agent_chat_messages` — essas são para o chat de IA interna, não para mensagens ao lead. Esta story usa a tabela `messages` (conversations + messages do schema base)
- **Template WhatsApp:** Esta story deliberadamente NÃO implementa templates (AC4 = skip fora da janela). Templates são AC opcional documentado como futuro. Não inventar sem a decision de produto

---

## File List

### Criados
- `packages/web/src/lib/whatsapp/send-whatsapp-message.ts` — helper PURO de envio WhatsApp Cloud API (Graph v21.0), never-throws (T1, AC3/AC5)
- `packages/web/src/lib/whatsapp/send-whatsapp-message.test.ts` — testes vitest (11 testes, 5 cenários obrigatórios) (T4)

### Modificados
- `packages/web/src/app/api/cron/followup/route.ts` — `sendFollowUpMessage` agora é channel-aware (Telegram + WhatsApp), com checagem da janela de 24h e status `skipped` no `follow_up_log`; ambos os call-sites (nicole_takeover e post-visit) atualizados (T2, T3, AC1-AC7)

### Referência (não modificados)
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (padrão de envio WhatsApp — T0)
- `packages/web/src/lib/broker/dispatch-broker-message.ts` (REUSADO: `isWithinWhatsAppWindow`, `WHATSAPP_WINDOW_MS` — Story 51-1)
- `packages/web/src/lib/roleta/notify-broker.ts` (padrão `whatsapp_config` por org)

---

## Dev Agent Record

### Agent Model Used
Dex (Builder) — Claude Opus 4.8 (1M context)

### Completion Notes

**T0 — Padrão de envio WhatsApp confirmado:**
- Verificado `appointment-whatsapp-reminders/route.ts` (`sendWhatsApp`, linhas 110-135) e `notify-broker.ts` (`sendBrokerWhatsApp`). Ambos: credenciais de `whatsapp_config` (`org_id` + `status='active'` → `phone_number_id`, `access_token`), POST a `graph.facebook.com/v21.0/{id}/messages`, body `type: "text"`, `AbortSignal.timeout(15000)`. NENHUMA env var (`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TOKEN` não existem). Confirmado.
- O cron já usa `createAdminClient()` e itera por `org_id` (via `rule.org_id` no follow-up e `appt.org_id` no post-visit), então consegue resolver `whatsapp_config` por org.

**IDS (Reuse > Adapt > Create):**
- **REUSE:** A Story 51-1 já criou `lib/broker/dispatch-broker-message.ts` com `isWithinWhatsAppWindow()` e `WHATSAPP_WINDOW_MS` (janela de 24h, trata `null` como fora — exatamente AC4/AC6). Reusado diretamente no cron em vez de reimplementar a lógica de janela.
- **CREATE (justificado):** Helper `send-whatsapp-message.ts` criado conforme T1/AC. O `dispatchBrokerMessage` (51-1) embute a checagem de janela e tem assinatura voltada ao chat do corretor (`DispatchBrokerMessageParams`); o cron precisa de um envio simples por credenciais já resolvidas e com a janela checada externamente (status do log depende do reason). O helper é PURO (sem `@web/*` — o alias não resolve no vitest, mesma decisão da 51-1) e injeta `fetch` para testes.

**Como a janela de 24h foi determinada (AC6):**
- Fonte de verdade: `conversations.last_message_at` (já existente; a query do cron passou a selecioná-lo). Dentro de 24h → envia texto livre; fora de 24h OU `last_message_at` nulo → NÃO envia.

**Comportamento fora da janela (AC4 / skip + log):**
- `sendFollowUpMessage` retorna `{ sent: false, channel: 'whatsapp', reason: 'WHATSAPP_WINDOW_CLOSED' }` SEM nenhuma chamada de rede.
- `follow_up_log` é inserido com `status='skipped'` e `metadata: { reason: 'WHATSAPP_WINDOW_CLOSED', channel }`.
- A mensagem NÃO é persistida em `messages` nem atualiza `conversations.last_message_at` (o lead não recebeu nada). Atividade registrada como "NAO enviou (WhatsApp fora da janela de 24h)".

**Best-effort / cron-safe (AC5):**
- O helper nunca lança: 4xx/5xx → `HTTP_{status}`, timeout/abort → `TIMEOUT`, exceção → mensagem do erro. No cron, falha de transporte vira `reason: 'API_ERROR'` e o loop continua (a mensagem ainda é gravada em `messages` para retry pelo corretor).

**Telegram preservado (AC2):**
- Branch `tg:` idêntico: mesmo Bot API, mesmo `TELEGRAM_BOT_TOKEN`, mesmo `AbortSignal.timeout(30000)`.

**Backlog explícito (fora de escopo, conforme story):**
- Templates aprovados WhatsApp (HSM) para enviar fora da janela de 24h → continua como backlog (seção "Backlog para Templates WhatsApp"). NÃO implementado.

**Validações (T5):**
- `pnpm --filter @trifold/web type-check` → 0 erros.
- `eslint` nos 3 arquivos da story → 0 erros / 0 warnings (exit 0). Os 8 erros de lint do pacote são pré-existentes em arquivos não relacionados (weather-widget, informe-pdf, lead-detail-drawer, etc.).
- `vitest run` da story → 11 testes passando. Suites broker+whatsapp+cron → 47 passando.
- Regressão: as 6 falhas em `webhook/whatsapp/__tests__/route.test.ts` são PRÉ-EXISTENTES (alias `@web/*` não resolve no vitest; confirmado via `git stash` na árvore limpa). Não introduzidas por esta story.

### Change Log (Dev)
| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-09 | 1.0 | Implementação: helper `send-whatsapp-message.ts` + `sendFollowUpMessage` channel-aware (Telegram+WhatsApp) com janela de 24h e skip/log. AC1-AC8 e T0-T5 completos. Status → Ready for Review | @dev (Dex) |

---

## Testing

### Framework
Vitest

### Cenários obrigatórios (T4)
1. phone `tg:123` → Telegram API chamada; WhatsApp Graph API NÃO chamada; retorna `true`
2. phone `5544999...`, `last_message_at=2h` → WhatsApp Graph API chamada com body correto; retorna `{ sent: true }`
3. phone `5544999...`, `last_message_at=30h` → sem chamada API; retorna `{ sent: false, reason: 'WHATSAPP_WINDOW_CLOSED' }`
4. phone `5544999...`, `last_message_at=2h`, API retorna 500 → `{ sent: false, reason: 'API_ERROR' }`
5. phone `5544999...`, `last_message_at=null` → tratado como fora da janela (AC6)

### Smoke pós-deploy (apenas staging/Telegram — não ativar WhatsApp em prod sem template)
- Confirmar que Telegram leads continuam recebendo follow-ups (regressão)
- Para WhatsApp: verificar `follow_up_log` em prod — entries `status='skipped'` com `reason='WHATSAPP_WINDOW_CLOSED'` esperadas (maioria dos casos)
- Se houver lead WhatsApp dentro da janela de 24h: verificar se recebe a mensagem

---

## Opcional — Backlog para Templates WhatsApp (fora de scope desta story)

Para atender leads fora da janela de 24h via WhatsApp, o próximo passo seria:
1. Criar template aprovado pelo Meta: ex. `nicole_followup_v1` com texto fixo
2. Processo de aprovação (~7 dias úteis no Meta Business)
3. Implementar envio via template (`type: "template"` no body da Graph API)
4. Criar Story 51-5b ou extensão desta

---

## Out of Scope

- Templates aprovados WhatsApp para fora da janela → backlog explícito
- Opt-out de leads (STOP) → funcionalidade separada
- Rate limiting de follow-up por canal → já coberto pela lógica de 48h do cron

---

## Definition of Done

- [x] AC1–AC8 marcados como completos
- [x] T0–T5 marcados como done
- [x] T0 env vars documentadas no Completion Notes
- [x] @qa executou quality gate com verdict ≥ PASS (PASS — 2026-06-09)
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-09 | 0.1 | Story drafted — Epic 51, GAP-6 | @sm (River) |
| 2026-06-09 | 0.2 | Validação PO (GO 8/10): credenciais WhatsApp corrigidas em AC3/AC7/T0/Dev Notes (whatsapp_config por org_id, não env vars `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TOKEN` inexistentes); janela 24h e skip out-of-window bem definidos; Status → Ready | @po (Pax) |
| 2026-06-09 | 1.1 | QA gate executado — verdict PASS (0 high/critical). 8 ACs atendidos com evidência, 11 testes verdes, type-check/lint 0 erros. 2 findings LOW (telemetria messages_sent, gap teste integração @web/*). | @qa (Quinn) |

---

## QA Results

### Review Date: 2026-06-09

### Reviewed By: Quinn (@qa — Test Architect)

### Gate Status

Gate: **PASS** → `docs/qa/gates/51.5-paridade-whatsapp-followup.yml`

### Resumo

PASS sem issues high/critical. Os 8 ACs estão atendidos por código com evidência `path:linha`
e cobertos por 11 testes verdes. O comportamento crítico de produção foi verificado e está correto.

### 7 Quality Checks

| # | Check | Status |
|---|-------|--------|
| 1 | Requirements Traceability (AC1-AC8) | PASS |
| 2 | Code Quality & Standards (REUSE 51-1 + CREATE justificado) | PASS |
| 3 | Security (credenciais de `whatsapp_config`, sem leak de token) | PASS |
| 4 | Reliability & Error Handling (never-throws, ambos call-sites) | PASS |
| 5 | Test Architecture (11 testes, 5 cenários + extras) | PASS |
| 6 | NFR (janela via `last_message_at`, select aditivo, sem N+1 novo) | PASS |
| 7 | Regression & Documentation (Telegram idêntico, HSM backlog, `is_ai_active` intocado) | PASS |

### Pontos de atenção verificados

1. **Skip fora da janela 24h (route.ts:91-93, 281-292, 316/514):** confirmado — NÃO há chamada
   de rede, grava `follow_up_log` `status='skipped'` + `metadata.reason='WHATSAPP_WINDOW_CLOSED'`,
   e a mensagem NÃO é persistida em `messages` (guard `if (!skipped)`). Consistência correta: no
   caso `API_ERROR` (transporte falhou) a mensagem É gravada em `messages` para retry pelo corretor —
   distinção deliberada e documentada.
2. **Métrica `messages_sent` (REL-001, LOW):** incrementa mesmo em skip por janela/erro (route.ts:346).
   Avaliado: é imprecisão de **telemetria**, não defeito funcional — o ground-truth correto está em
   `follow_up_log.status` e no evento `FOLLOWUP_MESSAGE_SKIPPED`. A semântica de "contar tentativas no
   branch" já existia (o `messagesSent++` anterior também contava envios Telegram falhos/pendentes). Não
   apliquei fix isolado `if(result.sent)` por criar inconsistência com a semântica histórica; recomendação:
   separar contadores (sent/skipped/failed) em follow-up. Não bloqueia.
3. **Templates WhatsApp HSM fora da janela:** confirmado como backlog explícito e documentado (seção
   "Backlog para Templates" + Out of Scope) — NÃO implementado, alinhado à realidade de produção.
4. **`is_ai_active`:** confirmado intocado (grep zero ocorrências nos arquivos da story).

### Resultados reais (executados)

- `pnpm --filter @trifold/web type-check` → **0 erros**.
- `npx eslint` (3 arquivos da story) → **exit 0** (0 erros / 0 warnings). Os erros de lint do pacote
  são pré-existentes em arquivos não relacionados.
- `npx vitest run` whatsapp + broker → **38/38** (inclui os 11 de 51-5).
- Suite web (`packages/web/src`) → **70 passed / 6 failed**. As 6 falhas são as pré-existentes do
  webhook 21.1 (alias `@web/*` não resolve no vitest) — confirmado inalterado via `git stash` do route.ts.

### Findings

| ID | Sev | Categoria | Descrição | Ação |
|----|-----|-----------|-----------|------|
| REL-001 | low | reliability | `messages_sent` conta skips/erros (telemetria) | Follow-up: separar contadores sent/skipped/failed |
| TEST-001 | low | tests | Sem teste de integração do route (alias `@web/*` no vitest) | Backlog do epic: configurar `resolve.alias` |

### Recomendação de status

**Done** (após `@devops *push`). PASS sem bloqueios; as 2 observações LOW ficam como backlog.

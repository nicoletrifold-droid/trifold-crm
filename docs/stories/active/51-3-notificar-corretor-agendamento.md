# Story 51-3 — Notificar Corretor no Agendamento da Visita (Gatilho A)

## Metadata
- **Epic:** 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma
- **Story:** 51-3
- **Status:** Ready for Review
- **Validated:** 2026-06-09 by @po (Pax) — verdict GO (8/10); refs de linha/call-site e assinatura notifyBroker corrigidas
- **Priority:** P1 — maior intenção do lead; corretor precisa saber imediatamente
- **Complexity:** S (2-3h)
- **Created:** 2026-06-09
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[appointment_notification_test, regression_pipeline, regression_scheduling]`
- **Autossuficiente:** sim — não depende de 51-1 ou 51-2

---

## User Story

**Como** corretor atribuído a um imóvel,
**Quero** ser notificado imediatamente quando a Nicole agenda uma visita com um lead,
**Para que** eu possa me preparar, confirmar os detalhes e estar pronto para a visita.

---

## Context

Hoje, quando a Nicole detecta intenção de agendamento e cria um `appointment`, ela (bloco linhas 582-633):
1. Cria o registro em `appointments` (`packages/ai/src/chat/pipeline.ts:606`)
2. Move o lead para stage `visita_agendada` (pipeline.ts:618)
3. Atribui `assigned_broker_id` ao lead (pipeline.ts:619) — o `user_id` do broker primário da property via `broker_assignments` (`is_primary=true`)
4. Emite log `APPOINTMENT_CREATED` (pipeline.ts:628)
5. Emite warn `APPOINTMENT_NO_BROKER` se não há corretor primário (pipeline.ts:630-632)
6. **NÃO dispara nenhuma notificação ao corretor** — o corretor não sabe que o lead agendou

A função `notifyBroker` já existe em `packages/web/src/lib/roleta/notify-broker.ts` com suporte a
push, email e WhatsApp. Hoje é chamada APENAS pela roleta de entrada de novos leads — o call-site real
é `packages/web/src/lib/roleta/distributor.ts:137` e `:231` (o webhook WhatsApp invoca `distributeLeadToNextBroker`,
que por sua vez chama `notifyBroker`). Esta story adiciona uma segunda chamada, no ponto de criação do appointment.

### Localização exata no código

```
packages/ai/src/chat/pipeline.ts
  linhas 582–633 — bloco de agendamento (if visit_availability ...):
    linha 606 — insert em appointments
    linha 618 — leadPatch.stage_id = STAGE_IDS.visita_agendada
    linha 619 — if (assignedBrokerId) leadPatch.assigned_broker_id = assignedBrokerId
    linha 628 — emit APPOINTMENT_CREATED (com broker_assigned)
    linha 630-632 — if (!assignedBrokerId) emit APPOINTMENT_NO_BROKER (warn)
  linhas 635–674 — bloco de HANDOFF (separado; NÃO é o ponto de inserção desta story)
```
> Nota: o ponto de inserção da notificação é DENTRO do bloco 582-633, após linha 628, no escopo onde `assignedBrokerId` é truthy. NÃO confundir com o bloco de handoff (635+), que é outro caminho.

O ponto de inserção da notificação é **após o insert do appointment e o emit APPOINTMENT_CREATED**,
dentro do bloco `if (assignedBrokerId)` — garantindo que só notificamos quando há corretor atribuído.

### Contexto adicional da notificação
A `notifyBroker` recebe um objeto `lead: { id, name, phone }` e `broker: { userId, name, email, phone }`.
A mensagem de WhatsApp/email deve ser customizada para o contexto de agendamento:

```
Novo agendamento via Nicole! 🗓️
Lead: {nome_lead}
Visita agendada para amanhã.
Ver lead: {leadUrl}
```

A `notifyBroker` atual usa mensagens genéricas de "novo lead". Esta story precisa permitir
mensagem customizada — ou uma segunda chamada com `notifyBroker` adaptada.

[AUTO-DECISION] Adicionar parâmetro opcional `context?: { title?: string; body?: string }` à interface
`NotifyBrokerParams` em `notify-broker.ts`, com fallback para o texto padrão de novo lead quando ausente.
Isso evita criar nova função e mantém o padrão de reutilização exigido pelo epic (CON-3).

### Restrição importante (CON-1 do Epic)
`packages/ai/src/flows/handoff.ts:48-50` confirma que **agendamento NÃO desliga `is_ai_active`**.
Esta story não toca nem altera esse comportamento — apenas NOTIFICA o corretor. A Nicole continua ativa.

---

## Acceptance Criteria

- [x] **AC1:** Notificação ao corretor disparada no momento da criação do appointment quando `assignedBrokerId` é truthy. Implementada via `onEvent`/`emit` (ver T0 — boundary ai↔web): `pipeline.ts` enriquece o evento `APPOINTMENT_CREATED` com `broker_user_id`/`lead_name`/`lead_phone`, e o handler `onEvent` em `@trifold/web` (webhook WhatsApp + Telegram) chama `notifyBrokerOfAppointment`
- [x] **AC2:** A notificação contém:
  - Push notification: título "Visita Agendada!", corpo "{nome_lead} agendou uma visita com a Nicole."
  - Email: assunto "Visita Agendada!", corpo com a mensagem de agendamento + card com nome/telefone do lead + link para o lead no CRM (layout TRIFOLD reutilizado)
  - WhatsApp ao corretor: "Olá {corretor}! {nome_lead} agendou uma visita com a Nicole.\n🔗 Ver lead: {leadUrl}"
- [x] **AC3:** Se `assignedBrokerId` é nulo, o evento sai sem `broker_user_id` → handler não dispara notificação. O warn `APPOINTMENT_NO_BROKER` permanece intacto (nenhuma alteração na lógica)
- [x] **AC4:** `NotifyBrokerParams` agora aceita `context?: { title?: string; body?: string }`. Aplicado a push (title+body), email (subject+intro+footer) e WhatsApp (body). Sem `context`, copy de roleta preservada (backward compatible — coberto por teste)
- [x] **AC5:** T0 = **incompatível** (`notify-broker.ts` usa `import "server-only"` + `createAdminClient` e `@trifold/ai` não depende de `@trifold/web`). Em vez do POST interno sugerido, usou-se a infra existente de `onEvent` (sem novo endpoint/secret). Wrapper criado em `packages/web/src/lib/broker/notify-appointment.ts`
- [x] **AC6:** `notifyBrokerOfAppointment` é best-effort (try/catch interno + `.catch` no dispatch fire-and-forget). Falha na notificação nunca propaga; appointment já está persistido antes do dispatch
- [x] **AC7:** `pnpm --filter @trifold/ai type-check` e `--filter @trifold/web type-check` passam (0 erros). ESLint 0 erros / 0 warnings nos arquivos da story
- [x] **AC8:** Cobertura: (a) broker presente → `notifyBroker` chamado com context; (b) broker ausente → não chamado; (c) `notifyBroker` lança → não propaga (resolve undefined)

---

## Tasks / Subtasks

- [x] **T0 — Pre-Flight: compatibilidade `notify-broker.ts` com `@trifold/ai`**
  - Verificado: `notify-broker.ts` tem `import "server-only"` (linha 1) + `createAdminClient` de `@web/lib/supabase/admin`. `@trifold/ai/package.json` NÃO depende de `@trifold/web`. → **incompatível** (import direto criaria dependência invertida)
  - Decisão final (autorizada pelo lead, documentada nos Completion Notes): em vez de criar um endpoint HTTP interno + secret, reutilizou-se a infra `emit`/`onEvent` já existente. O `pipeline.ts` (ai) só emite metadados; o handler `onEvent` roda em `@trifold/web` e chama `notifyBrokerOfAppointment`. Boundary respeitado, sem novo hop HTTP/secret (Reuse > Create)

- [x] **T1 — Estender `NotifyBrokerParams` com `context` opcional**
  - Editar `packages/web/src/lib/roleta/notify-broker.ts`
  - Adicionar `context?: { title?: string; body?: string }` à interface `NotifyBrokerParams`
  - Usar `params.context?.title ?? 'Novo Lead'` e `params.context?.body ?? 'Novo lead atribuído...'` nas mensagens
  - Garantir que chamadas existentes (roleta) continuam funcionando sem `context` (backward compatible)
  - Feito: `context` aplicado em push/email/whatsapp com fallback; `sendBrokerWhatsApp` e `buildBrokerEmailHtml` receberam param opcional `context` (também compatível com `notifyImobiliaria`, que chama `sendBrokerWhatsApp` sem context)

- [x] **T2 — Notificação após criação do appointment (via `onEvent`, não import direto)**
  - Editar `packages/ai/src/chat/pipeline.ts`, bloco de agendamento (linhas ~606-653)
  - Após `emit({ ..., event_type: "APPOINTMENT_CREATED", ... })` e no escopo onde `assignedBrokerId` é truthy:
    - Buscar dados do corretor: `users` WHERE `id = assignedBrokerId` → `{ name, email, phone }` (`assignedBrokerId` já é o `user_id`)
    - Chamar `notifyBroker` (direto ou via POST interno, conforme T0). A assinatura EXIGE `orgId`, `broker: { userId, name, email, phone }`, `lead: { id, name, phone }` e `config` (sem default):
      ```ts
      await notifyBroker({
        orgId: conversation.org_id,
        broker: { userId: assignedBrokerId, name, email, phone },
        lead: { id: leadId, name: lead.name, phone: lead.phone },
        config: { notify_push: true, notify_email: true, notify_whatsapp: true },
        context: {
          title: 'Visita Agendada!',
          body: `${lead.name ?? 'Lead'} agendou uma visita com a Nicole.`
        }
      })
      ```
    - Envolver em try/catch — falha não propaga (AC6)
  - Implementação real:
    - `pipeline.ts` carrega `lead.phone` junto com `lead.name` (na query existente da etapa 6.5, sem query extra) e enriquece o emit `APPOINTMENT_CREATED` com `broker_user_id`, `lead_name`, `lead_phone`
    - `notifyBrokerOfAppointment` (em `@trifold/web`) busca o corretor em `users` por `id = brokerUserId` (= user_id, RLS migration 085), resolve prefs em `roleta_config` (default todos canais habilitados se ausente) e chama `notifyBroker` com `context` de agendamento
    - Handlers `onEvent` do webhook WhatsApp e do Telegram disparam `notifyBrokerOfAppointment` (fire-and-forget, `.catch`)

- [x] **T3 — Testes unitários**
  - Testes em `packages/web/src/lib/broker/notify-appointment.test.ts` (AC8 a/b/c + email/phone/config) e `packages/web/src/lib/roleta/notify-broker.test.ts` (AC4 backward-compat + context override)
  - 9 testes, todos passando

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/ai type-check` → 0 erros
  - `pnpm --filter @trifold/web type-check` → 0 erros (após limpar artefatos stale `.next/types` de páginas `corretores` removidas — não relacionados à story)
  - ESLint nos arquivos da story → 0 erros / 0 warnings

---

## Dev Notes

> **ADR-001 (fonte de verdade de `assigned_broker_id`):** ver `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md`. A notificação de agendamento deve ser endereçada ao **dono atual do lead** (`assigned_broker_id`) e, opcionalmente, ao corretor primário do imóvel como "corretor da visita". O pipeline **não deve reatribuir** o lead ao primário do imóvel (Opção 3 = híbrido/first-write-wins); a sobrescrita automática em `pipeline.ts:621/659` é um defeito a corrigir em story futura (guard `if NULL`). Notificar ≠ trocar o dono.

### Paths-chave
```
packages/ai/src/chat/pipeline.ts                              ← EDITAR (T2) — linhas 606-653
packages/web/src/lib/roleta/notify-broker.ts                  ← EDITAR (T1) — interface + context param
packages/web/src/lib/broker/notify-appointment.ts             ← CRIAR apenas se T0=incompatível
packages/web/src/app/api/internal/notify-appointment/route.ts ← CRIAR apenas se T0=incompatível
```

### Dados disponíveis no pipeline.ts no momento do agendamento
No ponto de inserção (linhas ~606-653 de `pipeline.ts`), os seguintes dados já estão em memória:
- `leadId` — UUID do lead
- `lead.name` — nome do lead (pode ser null)
- `assignedBrokerId` — UUID do corretor (atribuído via `broker_assignments`)
- `orgId` — UUID da org
- `propertyId` — UUID do imóvel
- Não estão disponíveis: `broker.email`, `broker.phone`, `broker.name` — precisam ser buscados via query

### Gotchas
- **`pipeline.ts` roda no contexto do `@trifold/ai` package** (não no Next.js app). Imports de módulos marcados como `"server-only"` do `@trifold/web` podem causar erro em testes e builds. Checar T0 antes de implementar
- **`notify-broker.ts` usa `createAdminClient()`** (linha 35) que importa de `@web/lib/supabase/admin` — definitivamente incompatível com `@trifold/ai` diretamente. Resultado esperado do T0: **incompatível** → usar API route interna
- **`NEXT_PUBLIC_APP_URL`**: disponível no `@trifold/ai` via `process.env.NEXT_PUBLIC_APP_URL` se a Vercel injetar a env var. Verificar que é acessível no contexto do pipeline (provável: sim, pois o pipeline roda no mesmo processo Next.js)
- **Não desligar `is_ai_active`**: AC1 deixa claro que apenas notificamos. Ver `handoff.ts:48-50` para confirmar que agendamento não é trigger de handoff

---

## File List

### Criados
- `packages/web/src/lib/broker/notify-appointment.ts` — wrapper helper `notifyBrokerOfAppointment` (resolve broker em `users`, prefs em `roleta_config`, chama `notifyBroker` com context; best-effort)
- `packages/web/src/lib/broker/notify-appointment.test.ts` — testes AC8 (a/b/c) + email/config/fallbacks
- `packages/web/src/lib/roleta/notify-broker.test.ts` — testes AC4 (backward-compat + context override)

> Endpoint interno `POST /api/internal/notify-appointment` NÃO foi criado: a decisão final usou a infra `onEvent` existente (ver T0), eliminando a necessidade de um novo endpoint/secret.

### Modificados
- `packages/ai/src/chat/pipeline.ts` — carrega `lead.phone` na query 6.5; enriquece emit `APPOINTMENT_CREATED` com `broker_user_id`/`lead_name`/`lead_phone` (sem import de `@trifold/web`)
- `packages/web/src/lib/roleta/notify-broker.ts` — `context?` opcional em `NotifyBrokerParams`, aplicado a push/email/whatsapp (backward compatible)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — handler `onEvent` dispara `notifyBrokerOfAppointment` em `APPOINTMENT_CREATED` com broker
- `packages/web/src/app/api/telegram/webhook/route.ts` — idem para o canal Telegram

### Referência (não modificar)
- `packages/ai/src/flows/handoff.ts:48-50` (confirma que agendamento NÃO desliga is_ai_active)
- `packages/web/src/lib/roleta/distributor.ts:137,231` (call-site real de notifyBroker — padrão de uso, com `config` obrigatório)

---

## Testing

### Framework
Vitest

### Cenários obrigatórios
1. `assignedBrokerId` presente + notificação OK → appointment criado + notificação disparada
2. `assignedBrokerId` nulo → appointment criado + notificação NÃO disparada (APPOINTMENT_NO_BROKER warn preservado)
3. Notificação falha (mock de `notifyBroker` throwing) → appointment criado normalmente, erro logado
4. `NotifyBrokerParams` sem `context` → texto padrão de roleta (backward compat)
5. `NotifyBrokerParams` com `context` → texto customizado de agendamento

### Smoke pós-deploy
- Simular agendamento via Nicole em ambiente staging
- Verificar que corretor atribuído recebe: (1) push notification, (2) email, (3) WhatsApp
- Verificar que Nicole continua respondendo ao lead após o agendamento (`is_ai_active` mantido)
- Verificar `appointments` table: insert correto
- Verificar `follow_up_log` e `messages`: sem entradas espúrias geradas por esta story

---

## Out of Scope

- Desligar `is_ai_active` no agendamento → explicitamente out of scope (CON-1 do epic)
- Reagendar/cancelar appointment via notificação → futuro
- Notificação ao imobiliária (admin) sobre agendamento → pode ser extensão futura de `notifyImobiliaria`

---

## Definition of Done

- [x] AC1–AC8 marcados como completos
- [x] T0–T4 marcados como done
- [x] T0 decisão documentada nos Completion Notes
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

### Agent Model Used
Dex (Builder) — Claude Opus 4.8 (1M context)

### Completion Notes

**Decisão de boundary ai↔web (T0 — a parte mais importante desta story):**
A story sugeria, para o caso `incompatível`, criar um endpoint HTTP interno (`POST /api/internal/notify-appointment`) e fazer o `pipeline.ts` chamar via fetch. Confirmei que T0 = incompatível (`notify-broker.ts` tem `import "server-only"` + `createAdminClient`; `@trifold/ai` não depende de `@trifold/web`). Em vez do endpoint HTTP, optei por reutilizar a infraestrutura `emit`/`onEvent` que já existe no pipeline e cujos handlers rodam dentro de `@trifold/web` (webhook WhatsApp linha ~569 e Telegram linha ~467):
- `pipeline.ts` (ai) apenas **emite** metadados (`broker_user_id`, `lead_name`, `lead_phone`) no evento `APPOINTMENT_CREATED` — nenhum import de web, zero dependência invertida.
- Os handlers `onEvent` (web) reagem e chamam `notifyBrokerOfAppointment`.

Vantagens sobre o endpoint interno: sem novo hop HTTP no mesmo processo, sem novo secret a gerenciar, lógica de notificação concentrada em uma função reutilizável e testada (Reuse > Create). Honra todos os ACs: AC1 (notifica na criação do appointment), AC3 (sem `broker_user_id` → sem notificação), AC6 (best-effort `.catch`).

**Config das notificações:** `notifyBrokerOfAppointment` resolve `notify_push/email/whatsapp` de `roleta_config` (mesma fonte da roleta) por `org_id`. Quando não há config, default = todos os canais habilitados (decisão: agendamento é o sinal de maior intenção; o corretor deve sempre ser avisado).

**Broker lookup:** `assigned_broker_id` é `user_id` (RLS migration 085) → busca em `users` por `id`, igual ao padrão de `notifyImobiliaria`.

**CON-1 respeitado:** nenhum write em `is_ai_active`; agendamento não vira handoff. A Nicole continua ativa.

### Regressão / Notas
- Suíte completa vitest: 310/316 passando. As 6 falhas são **pré-existentes** em `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` (`Cannot find package '@web/lib/supabase/admin'` — o vitest root não tem alias `@web`; falha idêntica com minhas mudanças revertidas via `git stash`). Não relacionadas à Story 51-3.
- `@trifold/web type-check`: após limpar artefatos stale em `.next/types` (referências a páginas `corretores` removidas no commit `d77ba84`), passa com 0 erros.

### Débitos / Fora de escopo
- Reagendar/cancelar via notificação, notificação ao admin/imobiliária e desligar `is_ai_active` permanecem out of scope (conforme story).
- Pré-existente (debt sugerido, não bloqueante): adicionar alias `@web` ao vitest root para o `route.test.ts` de Story 21.1 voltar a rodar.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-09 | 0.1 | Story drafted — Epic 51, GAP-5a (Gatilho A) | @sm (River) |
| 2026-06-09 | 0.2 | Validação PO (GO 8/10): call-site real de notifyBroker corrigido (distributor.ts); assinatura completa de notifyBroker (config obrigatório) documentada no T2; linhas do bloco de agendamento corrigidas (582-633); CON-1 (não desligar IA) confirmado; Status → Ready | @po (Pax) |
| 2026-06-09 | 0.3 | Implementação: `context` opcional em `notifyBroker`; helper `notifyBrokerOfAppointment`; notificação via `onEvent` (WhatsApp + Telegram) respeitando boundary ai↔web; 9 testes; type-check/lint limpos. Status → Ready for Review | @dev (Dex) |
| 2026-06-09 | 0.4 | QA gate PASS (Quinn): 8/8 ACs atendidos, 9/9 testes verdes, boundary ai↔web e CON-1 (is_ai_active intocado) verificados, type-check ai+web e ESLint exit 0; 6 falhas pré-existentes (alias @web/*) confirmadas inalteradas | @qa (Quinn) |

---

## QA Results

### Review Date: 2026-06-09

### Reviewed By: Quinn (Test Architect / @qa)

### Code Quality Assessment

Implementação de alta qualidade. A decisão arquitetural central (boundary ai↔web via `emit`/`onEvent`
em vez de POST interno + secret) é exemplar: o `pipeline.ts` (em `@trifold/ai`) apenas EMITE o evento
`APPOINTMENT_CREATED` enriquecido com `broker_user_id`/`lead_name`/`lead_phone`, e os handlers `onEvent`
nos webhooks WhatsApp e Telegram (em `@trifold/web`) chamam `notifyBrokerOfAppointment`. `grep` confirma
ZERO import de `@web`/`@trifold/web` em `packages/ai/src` (a única ocorrência é um comentário). REUSE
fiel de `notifyBroker` com extensão `context?` opcional e backward-compatible. Sem código morto.

### Compliance Check

- Coding Standards: ✓ (imports absolutos `@web/*`, JSDoc abrangente, fallbacks isolados)
- Project Structure: ✓ (wrapper em `lib/broker/`, testes co-localizados)
- Testing Strategy: ✓ Vitest, 9 testes verdes nos caminhos testáveis
- All ACs Met: ✓ AC1-AC8 mapeados para código com evidência path:linha

### Regra de Negócio Crítica (CON-1) — VERIFICADA

A única escrita de `is_ai_active` em `pipeline.ts` está na **linha 678, dentro do bloco de HANDOFF
(642+)**, totalmente separada do bloco de agendamento (584-639). O `git diff` de 51-3 não altera
`is_ai_active` em nenhum arquivo de código (só MEMORY.md de documentação). `handoff.ts:48-50` confirma
que visita agendada NÃO é trigger de handoff. A Nicole continua ativa — o agendamento apenas notifica.

### Pontos Arquiteturais Validados

1. **Boundary ai↔web:** respeitado. Nenhum import invertido (`grep` em `packages/ai/src` → só comentário).
2. **Param `context`:** backward compatible. Sem `context`, copy de roleta ("Novo Lead Recebido") preservada
   (provado por `notify-broker.test.ts`).
3. **Duplicação de notificação:** risco teórico NÃO se materializa — um lead chega por UM canal, logo o
   evento é emitido uma vez por agendamento (REL-001, low, não-bloqueante).

### Security Review

Admin client usado apenas para ler dados do corretor (`users`) e prefs (`roleta_config`) e, dentro de
`notifyBroker`, `whatsapp_config` (token server-side). Sem leak de credenciais; notificação vai
exclusivamente ao corretor atribuído. Sem novo endpoint/superfície de ataque.

### Performance Considerations

Notificação assíncrona (fire-and-forget) fora do caminho de resposta ao lead; emit após persistência do
appointment. Sem N+1 (1 query `users` + 1 `roleta_config`); canais em paralelo via `Promise.allSettled`.
`leadPhone` reaproveitado da query 6.5 existente — sem query extra.

### Resultado dos Checks Executados

- `pnpm --filter @trifold/ai type-check` → **0 erros**
- `pnpm --filter @trifold/web type-check` → **0 erros**
- ESLint (6 arquivos web da story) → **exit 0, zero hits**
- `npx vitest run notify-appointment.test.ts notify-broker.test.ts` → **9/9 passed**
- `npx vitest run packages/web` (regressão) → **50 passed / 6 failed** — as 6 falhas são EXCLUSIVAS de
  `webhook/whatsapp/__tests__/route.test.ts` (Story 21.1, alias `@web/*` pré-existente, gate 50.3 TEST-001),
  idênticas com/sem esta story.

### Files Modified During Review

Nenhum arquivo de código modificado pelo QA (review advisory). Apenas QA Results + Change Log atualizados.

### Gate Status

Gate: PASS → docs/qa/gates/51.3-notificar-corretor-agendamento.yml

### Recommended Status

✓ Ready for Done — aprovada para `@devops *push`. Issues remanescentes (1 MEDIUM de infra de teste herdada
TEST-001 + 2 LOW) são não-bloqueantes. (Story owner decide o status final.)

— Quinn, guardião da qualidade 🛡️

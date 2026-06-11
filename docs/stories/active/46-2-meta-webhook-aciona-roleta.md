# Story 46-2 — Webhook do Meta Aciona a Roleta de Distribuição

## Metadata
- **Epic:** 46 — Roleta de Leads
- **Story:** 46-2
- **Status:** Done (QA PASS — aguardando @devops push)
- **Validated:** 2026-06-10 by @po (Pax) — GO (10/10)
- **Priority:** P0 — leads do Meta chegam sem corretor (bug em produção)
- **Complexity:** S (2-3h)
- **Created:** 2026-06-10
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[type-check, lint, smoke_meta_lead_distribution]`
- **Autossuficiente:** sim — depende de 46-1 estar Done (ja esta)

---

## User Story

**Como** administrador da construtora,
**Quero** que leads novos que chegam via Meta Lead Ads sejam automaticamente distribuídos para um corretor,
**Para que** nenhum lead do Meta fique represado sem atendimento por falta de atribuição automática.

---

## Context

A Story 46-1 criou a roleta round-robin e a conectou ao webhook do WhatsApp. No entanto, o webhook do
Meta Lead Ads (`packages/web/src/app/api/webhooks/meta-ads/route.ts`) cria leads mas **nunca chama**
`distributeLeadToNextBroker`. Resultado: 100% dos leads com `channel = 'meta_ads'` entram no CRM
sem corretor atribuído.

Diagnóstico confirmado em produção em 2026-06-10: 3 leads reais (Karina, Thais, Adrielso) chegaram via
Meta e ficaram sem corretor. Foram redistribuídos manualmente via script pontual. O furo persiste para
todo lead Meta subsequente.

### Caminho atual do Meta webhook (fluxo de lead NOVO)

`packages/web/src/app/api/webhooks/meta-ads/route.ts` — função `processLeadAsync` (linhas 117–274):

1. Busca dados via Graph API (`fetchLeadData`)
2. Resolve `orgId`, `defaultStageId`
3. Verifica lead existente pelo phone (linha 167)
4. **Caminho de lead novo** (linha 211): `supabase.from("leads").insert(...)` → captura `newLead.id`
5. Linha 229: chama `triggerAutomations("lead.created", ...)` — fire-and-forget
6. **FURO:** linha 237 define `leadId = newLead?.id ?? null` e segue sem chamar a roleta

O padrão correto está no webhook do WhatsApp (`packages/web/src/app/api/webhook/whatsapp/route.ts`,
linhas 536–546): chama `distributeLeadToNextBroker` apenas quando `lead._brand_new === true` usando
`void ... .catch(...)` (fire-and-forget, best-effort).

### Idempotência

O RPC `roleta_pick_and_advance` faz `UPDATE leads.assigned_broker_id`. Se o lead **já tem corretor**
(ex.: lead que veio antes pelo WhatsApp com mesmo phone), o resultado seria uma sobrescrita indesejada.
A Story 51-7 adicionou o guard `if assigned_broker_id IS NULL` no pipeline de IA; aqui o mesmo
princípio deve ser aplicado: só chamar a roleta se o lead NÃO tem corretor atribuído no momento da
inserção.

Na prática, para leads recém-inseridos no webhook do Meta (`newLead?.id` acabou de ser criado),
`assigned_broker_id` é sempre NULL — mas a verificação é obrigatória para garantir que uma futura
re-execução ou race condition não redistribua leads já atendidos.

### Proteção contra dupla distribuição

O webhook do Meta NÃO usa `_brand_new` como flag (ao contrário do WhatsApp). A heurística correta
aqui é mais simples: se acabamos de executar `INSERT` com sucesso e `newLead?.id` está preenchido,
é um lead brand-new. Não há caminho de "update existente que desencadearia a roleta" — no caminho
de lead existente (linha 201–209), apenas `metadata` e `utm_*` são atualizados, não a roleta.

Portanto, a chamada à roleta deve ficar **dentro do bloco `if (newLead?.id)`** (linhas 228–237),
logo após `triggerAutomations`, com o mesmo padrão `void ... .catch(...)` do WhatsApp.

### Comportamento fora do horário

Se o lead Meta chega fora do horário comercial, `distributeLeadToNextBroker` registra
`status = 'fora_horario'` em `lead_distribution_log` e retorna sem atribuir corretor. Esse lead
ficará represado até o cron da Story 46-3 redistribuir na abertura do expediente. Esse
comportamento é CORRETO — não criar workaround aqui.

---

## Acceptance Criteria

- [x] **AC1:** Lead NOVO criado pelo webhook do Meta (caminho `insert` bem-sucedido, `newLead?.id` preenchido) dentro do horário comercial → `distributeLeadToNextBroker(leadId, orgId)` é chamado de forma fire-and-forget (`void ... .catch`). A chamada ocorre EXCLUSIVAMENTE dentro do bloco `if (newLead?.id)` (lead recém-inserido, portanto `assigned_broker_id IS NULL` por construção) — garantindo precedência ADR-001 (Ação humana > Roleta > Pipeline): a roleta nunca é chamada sobre um lead que já tenha corretor. Após chamada, `leads.assigned_broker_id` está preenchido e `lead_distribution_log` tem um registro `status = 'distributed'`. _(teste AC1)_
- [x] **AC2:** Lead existente atualizado pelo webhook do Meta (caminho `update`, linha 201–209) → `distributeLeadToNextBroker` NÃO é chamado. Sem efeito colateral para leads com corretor já atribuído. _(teste AC2)_
- [x] **AC3:** Lead Meta brand-new que chega fora do horário comercial → `distributeLeadToNextBroker` é chamado (fire-and-forget), registra `status = 'fora_horario'` em `lead_distribution_log`, lead fica com `assigned_broker_id = NULL`. Sem erro no webhook; o 200 é retornado normalmente. _(teste AC3)_
- [x] **AC4:** Falha em `distributeLeadToNextBroker` (ex.: RPC error, rede) → erro é capturado pelo `.catch`, logado via `console.error("[roleta] meta distribution error:", err)`, e o webhook **não falha** (o 200 já foi retornado via `after()`). A lógica de criação do lead e `triggerAutomations` não são afetadas. _(teste AC4)_
- [x] **AC5:** `pnpm --filter @trifold/web type-check` passa com 0 erros. ESLint nos arquivos modificados passa com 0 erros/warnings.
- [x] **AC6:** Import de `distributeLeadToNextBroker` adicionado no topo do arquivo usando o padrão de importação absoluta `@web/lib/roleta/distributor` — consistente com o import em `whatsapp/route.ts:8`.

---

## Tasks / Subtasks

- [x] **T1 — Pre-Flight: revisar o bloco de criação de lead novo**
  - Ler `packages/web/src/app/api/webhooks/meta-ads/route.ts`, função `processLeadAsync` (linhas 117–274)
  - Confirmar que o bloco `if (newLead?.id)` (linhas 228–237) é o ponto de inserção correto
  - Confirmar que o import de `distributeLeadToNextBroker` ainda não existe no arquivo
  - Confirmar que `orgId` está disponível no escopo do bloco (já está — linha 155)

- [x] **T2 — Adicionar import de `distributeLeadToNextBroker`**
  - Editar `packages/web/src/app/api/webhooks/meta-ads/route.ts`
  - Adicionar no bloco de imports (top do arquivo, junto aos outros imports de `@web/*`):
    ```ts
    import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
    ```

- [x] **T3 — Chamar a roleta após criação de lead novo**
  - Dentro do bloco `if (newLead?.id)` (após `triggerAutomations`), adicionar:
    ```ts
    void distributeLeadToNextBroker(newLead.id, orgId).catch((err) =>
      console.error("[roleta] meta distribution error:", err)
    )
    ```
  - O bloco completo deve ficar:
    ```ts
    if (newLead?.id) {
      void triggerAutomations("lead.created", {
        id: newLead.id,
        email: email ?? null,
        name: name ?? null,
        phone: phone ?? null,
        org_id: orgId,
      })
      void distributeLeadToNextBroker(newLead.id, orgId).catch((err) =>
        console.error("[roleta] meta distribution error:", err)
      )
    }
    leadId = newLead?.id ?? null
    ```
  - Manter `leadId = newLead?.id ?? null` fora do bloco `if` (comportamento atual)

- [x] **T4 — Verificar que o caminho de "lead existente" NÃO chama a roleta**
  - Confirmar que o bloco `if (leadId)` (linha 201, caminho de lead existente/update) não tem e
    não deve ter chamada à roleta — verificação de regressão, sem código a adicionar

- [x] **T5 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → 0 erros
  - ESLint no arquivo modificado → 0 erros / 0 warnings
  - Smoke manual: criar lead via simulação do webhook Meta (payload com `field_data` inline) e
    verificar `leads.assigned_broker_id` preenchido + `lead_distribution_log` com `status = 'distributed'`

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/api/webhooks/meta-ads/route.ts  ← EDITAR (T2, T3)
packages/web/src/lib/roleta/distributor.ts            ← REUSE (não modificar)
packages/web/src/app/api/webhook/whatsapp/route.ts    ← REFERÊNCIA (padrão de chamada, linha 544-546)
```

### Padrão de referência (WhatsApp webhook, linha 544-546)
```ts
void distributeLeadToNextBroker(lead.id, orgId).catch((err) =>
  console.error("[roleta] distribution error:", err)
)
```
O mesmo padrão deve ser replicado exatamente — sem `await`, sem try/catch adicional. O `void` é
intencional: o processamento async já retornou 200 via `after()`.

### Import correto
```ts
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
```
O arquivo `distributor.ts` começa com `import "server-only"` (linha 1) — este import é válido porque
`meta-ads/route.ts` roda no contexto Next.js server-side (API Route), igual ao `whatsapp/route.ts`.

### Idempotência e guard de corretor existente
O `distributor.ts` já tem lógica interna de `priorizar_lead_ativo` (linha 103): se o mesmo phone
já tem corretor em outro lead ativo, roteia para o mesmo corretor. Essa lógica já garante
consistência. Para leads brand-new do Meta (recém inseridos), `assigned_broker_id` é sempre NULL —
não há risco de sobrescrita dupla no caminho novo.

O único cuidado: a chamada deve ficar DENTRO do bloco `if (newLead?.id)`, nunca no bloco de
lead existente (linha 201–209). O bloco de lead existente atualiza apenas metadata, não distribui.

### Contexto de execução: `after()`
O webhook do Meta usa `after(async () => { await processLeadAsync(...) })` (linha 106–108). Todo o
código de `processLeadAsync` (incluindo a nova chamada à roleta) roda dentro desse contexto
fire-and-forget. O `void ... .catch(...)` é correto: a roleta pode falhar sem afetar o lead criado.

### Horário comercial
`roleta_config` atual: 08:00–20:00, todos os dias (`business_days: [0,1,2,3,4,5,6]`),
timezone `America/Sao_Paulo`. Leads que chegam fora desse horário → `fora_horario`. Serão cobertos
pela Story 46-3.

### Sem migration necessária
Esta story é puro TypeScript — sem DDL, sem migration, sem nova env var.

---

## File List

### Modificados
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — import de `distributeLeadToNextBroker` + chamada fire-and-forget dentro do bloco `if (newLead?.id)` (T2, T3)

### Criados
- `packages/web/src/app/api/webhooks/meta-ads/__tests__/route.roleta.test.ts` — testes Vitest (AC1–AC4): lead novo distribui, lead existente não, fora_horario, falha capturada

### Referência (não modificar)
- `packages/web/src/lib/roleta/distributor.ts` — engine da roleta (REUSE)
- `packages/web/src/app/api/webhook/whatsapp/route.ts:8,544-546` — padrão de import e chamada

---

## Dev Agent Record

### Agent Model Used
Dex (Builder) — @dev / Claude Opus 4.8 (1M context)

### Implementation Notes (IDS: REUSE > ADAPT > CREATE)
- **REUSE** `distributeLeadToNextBroker` de `@web/lib/roleta/distributor` — toda a lógica de horário, round-robin, limites, notificação e log já existe. Nenhuma modificação no `distributor.ts`.
- **REUSE** do padrão exato do webhook WhatsApp (`whatsapp/route.ts:544-546`): `void ... .catch(...)`, sem `await`, sem try/catch adicional.
- **CREATE** apenas o arquivo de teste co-localizado (segue o padrão de `whatsapp/__tests__/route.test.ts`: mock de `next/server.after`, mocks de `@web/*`, `import("../route")` dinâmico).

### Invariante ADR-001 confirmado
A chamada `distributeLeadToNextBroker(newLead.id, orgId)` está EXCLUSIVAMENTE dentro do bloco `if (newLead?.id)` do branch `else` (caminho de lead recém-inserido via `insert`). NÃO está no branch `if (leadId)` (caminho de update de lead existente, que toca apenas `metadata`/`utm_*`). Como o lead foi recém-criado, `assigned_broker_id IS NULL` por construção — a roleta nunca sobrescreve um lead já atribuído. AC2 (teste) prova que lead existente com `assigned_broker_id = "broker-7"` mantém o corretor e a roleta não é chamada.

### Validation Output
- `pnpm --filter @trifold/web type-check` → 0 erros
- ESLint nos arquivos modificados/criados → 0 erros, 0 warnings
- Vitest (route.roleta.test.ts) → 4/4 passed (AC1–AC4)

### Completion Notes
- Furo de produção (leads Meta sem corretor) corrigido com 2 linhas efetivas + comentário ADR-001.
- Comportamento fora-de-horário (`status = 'fora_horario'`, sem atribuição) deixado intencionalmente como está — coberto pela Story 46-3 (cron de redistribuição).
- Pré-existente, fora do escopo: `whatsapp/__tests__/route.test.ts` falha em isolamento por não haver resolução do alias `@web` no `vitest.config.ts` (esse teste importa a rota real). Não introduzido por esta story; nenhum arquivo dessa rota nem do config foi tocado.

---

## Testing

### Framework
Vitest (unit) + smoke manual (E2E)

### Cenários obrigatórios
1. **Lead novo Meta dentro do horário** → roleta chamada → `assigned_broker_id` preenchido → `lead_distribution_log` com `status = 'distributed'`
2. **Lead novo Meta fora do horário** → roleta chamada → `lead_distribution_log` com `status = 'fora_horario'` → `assigned_broker_id = NULL` → sem erro no webhook
3. **Lead existente Meta (update de metadata)** → roleta NÃO chamada → `assigned_broker_id` não alterado
4. **Roleta falha (mock)** → erro capturado pelo `.catch` → webhook não falha → lead criado normalmente
5. **Tipo-check + lint** → 0 erros, 0 warnings

### Smoke pós-deploy
- Enviar payload de teste via `POST /api/webhooks/meta-ads` com `field_data` inline (sandbox)
- Confirmar `leads` com `channel = 'meta_ads'`: `assigned_broker_id` preenchido
- Confirmar `lead_distribution_log`: registro com `status = 'distributed'` e `lead_id` correto
- Confirmar que webhook retorna 200 mesmo se roleta lança exceção (mock de `distributeLeadToNextBroker`)

---

## Out of Scope

- Leads fora do horário que ficaram represados (FURO 2) → Story 46-3
- Redistribuição manual via `/api/roleta/distribute` → já existe (Story 46-1)
- Modificações na lógica da roleta (`distributor.ts`) → não tocado

---

## Definition of Done

- [ ] AC1–AC6 implementados e verificados
- [ ] T1–T5 marcados como done
- [ ] @qa executou quality gate com verdict >= PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-10 | 0.1 | Story drafted — furo de cobertura Meta webhook sem roleta | @sm (River) |
| 2026-06-10 | 0.2 | Validada (GO 10/10). AC1 reforçado com invariante `assigned_broker_id IS NULL` + traçabilidade ADR-001 (precedência Ação humana > Roleta > Pipeline). Status Draft→Ready. | @po (Pax) |
| 2026-06-10 | 0.3 | Implementada. Import + chamada `distributeLeadToNextBroker` no bloco de lead novo. Testes AC1–AC4 (4/4). type-check 0 erros, lint 0/0. Status Ready→Ready for Review. | @dev (Dex) |

---

## QA Results

### Gate Decision: PASS — Quinn (@qa), 2026-06-11

**Gate file:** `docs/qa/gates/46.2-meta-webhook-aciona-roleta.yml` | **Quality score:** 100/100 | **Iteration:** 1

Os 7 quality checks passam. 6/6 ACs atendidos por código com evidência path:linha; 4/4 testes verdes.

**Invariante P0 ADR-001 verificado diretamente no código:** a chamada `distributeLeadToNextBroker` está EXCLUSIVAMENTE dentro do bloco `if (newLead?.id)` (caminho de lead novo, `meta-ads/route.ts:241-243`) e NUNCA no branch de update de lead existente (`202-210`, que só toca metadata/utm). Isso é crítico porque o RPC `roleta_pick_and_advance` faz `UPDATE leads SET assigned_broker_id` incondicional (migration `071:94`) — chamar a roleta sobre um lead já atribuído roubaria o corretor. O posicionamento previne isso por construção. Best-effort (`void ... .catch`) idêntico ao padrão validado do webhook WhatsApp (`whatsapp/route.ts:544-546`).

| AC | Status | Evidência |
|----|--------|-----------|
| AC1 | Met | `meta-ads/route.ts:241-243` (chamada no `if (newLead?.id)`); teste `route.roleta.test.ts:210-223` (1 chamada com leadId,orgId) |
| AC2 | Met | branch `if (leadId)` `:202-210` NÃO chama roleta; teste `:225-245` (not.called + broker preservado) |
| AC3 | Met | `distributor.ts:179-195` (fora_horario); teste `:247-257` (mock fora_horario + 200) |
| AC4 | Met | `.catch(console.error)` `:242-243`; teste `:259-272` (mockRejectedValue, sem throw, lead criado) |
| AC5 | Met | type-check 0 erros + ESLint exit 0 (verificação independente) |
| AC6 | Met | import absoluto `@web/lib/roleta/distributor` `:6` (consistente com whatsapp `:8`) |

**Validação independente:** `pnpm --filter @trifold/web type-check` → 0 erros. ESLint (route.ts + test) → exit 0. `npx vitest run .../route.roleta.test.ts` → 4/4 passed. git diff: route.ts +8 linhas (import + comentário + chamada); nenhum outro arquivo de produção tocado; `distributor.ts` intocado.

**Findings (não-bloqueantes):** TEST-001 (LOW, testes via mock in-memory; integração real depende do alias `@web/*` herdado), OBS-001 (LOW, CodeRabbit não rodou — host darwin/config WSL).

**Regressão:** As 6 falhas pré-existentes de `webhook/whatsapp/__tests__/route.test.ts` (alias `@web/*` não resolve no vitest, Story 21.1) permanecem IDÊNTICAS — `vitest.config.ts` e a rota whatsapp ausentes do diff. NÃO introduzido por esta story.

**Recomendação de status:** PASS → aprovado para @devops *push. Smoke pós-deploy: POST sandbox com field_data inline → confirmar `leads.assigned_broker_id` + `lead_distribution_log status='distributed'`.

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation will use manual review process only.

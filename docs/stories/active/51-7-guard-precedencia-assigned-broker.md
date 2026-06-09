# Story 51-7 — Guard de Precedência em `assigned_broker_id` (Opção 3 do ADR-001)

## Metadata
- **Epic:** 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma
- **Story:** 51-7
- **Status:** Ready for Review
- **Validated:** 2026-06-09 by @po (Pax) — verdict GO (9/10)
- **Priority:** P0 — corrige bug silencioso que troca o dono do lead e quebra RLS + chat do corretor
- **Complexity:** S (2-3h)
- **Created:** 2026-06-09
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[pipeline_guard_test, regression_pipeline, regression_whatsapp_webhook]`
- **Autossuficiente:** sim — não depende de nenhuma story do epic (corrige comportamento retroativo)

---

## User Story

**Como** corretor atribuído a um lead pela roleta ou por ação humana de um admin,
**Quero** que minha atribuição nunca seja sobrescrita silenciosamente pelo pipeline da Nicole,
**Para que** eu não perca a visibilidade do lead no CRM, nem o direito de responder ao lead no chat.

---

## Context

### O bug (confirmado no spike da Story 51-6)

`packages/ai/src/chat/pipeline.ts` contém dois pontos (B1 e B2 no ADR-001) que escrevem
`leadPatch.assigned_broker_id` de forma **cega** — sem verificar se o lead já tem um corretor:

**B1 — Bloco de agendamento (`linha 621`):**
```ts
// pipeline.ts:584–639 — bloco de visit_availability
if (assignedBrokerId) leadPatch.assigned_broker_id = assignedBrokerId
```

**B2 — Bloco de handoff (`linha 659`):**
```ts
// pipeline.ts:641–680 — bloco de handoff
if (brokerId) leadPatch.assigned_broker_id = brokerId
```

Ambos sobrescrevem o `assigned_broker_id` atual do lead (da roleta ou de atribuição humana) toda
vez que a Nicole identifica um imóvel com corretor primário (`broker_assignments.is_primary=true`).
Como a RLS de leads (policies `leads_select`/`leads_update`, fix "085" aplicado em produção via MCP
no commit `ef63cf5` — **não há arquivo `supabase/migrations/085_*.sql`; a mudança é unversioned/remota**)
usa esse campo como filtro, **o corretor anterior PERDE visibilidade imediata do lead** — ele some do
pipeline, dos alertas e do chat — sem nenhum aviso. (A RLS removeu o fallback `assigned_broker_id IS NULL`:
corretor vê APENAS leads onde `assigned_broker_id = seu user_id`.)

### Por que é grave

1. **RLS de leads (fix "085", aplicado via MCP — sem arquivo de migration):** corretor vê APENAS
   leads onde `assigned_broker_id = seu user_id`. Trocar o valor é como excluir o lead do corretor
   sem desfazer a conversa que ele estava tendo.
2. **Chat do corretor (Story 51-1):** `send-message/route.ts:86` valida
   `lead.assigned_broker_id !== appUser.id` para autorizar o envio. Se o valor mudar durante a
   conversa, o corretor perde o direito de responder ao próprio lead.
3. **Notificações 51-3/51-4:** ficam endereçadas ao novo `assigned_broker_id`, não ao corretor que
   já estava acompanhando o lead.

### Cenários de conflito confirmados (ADR-001, Seção "Cenários de conflito mapeados")

| # | Cenário | Impacto |
|---|---------|---------|
| 1 | Roleta → Corretor A; Nicole agenda imóvel (primário = Corretor B) | B1 sobrescreve A→B. A perde o lead silenciosamente |
| 7 | Admin atribui manualmente Corretor A; Nicole agenda imóvel de B | B1 sobrescreve decisão humana — bug grave |
| 8 | Corretor assumiu o chat (51-1, `is_ai_active=false`); IA reativada e agenda | B1 pode reatribuir e tirar o lead do corretor que interagiu |

Cenário 6 (lead NULL no Telegram — apenas o B atribuiu) continua funcionando com o guard: como
`currentLead.assigned_broker_id` é NULL, o guard deixa a atribuição ocorrer normalmente.

### Decisão de produto (sign-off Gabriel, 2026-06-09)

**Opção (a) — Manter o corretor original.** Regra de precedência:
1. Atribuição humana explícita (admin/supervisor/bulk/manual) — SEMPRE vence, SEMPRE sobrescreve.
2. Roleta de entrada (round-robin / priorizar lead ativo) — define a atribuição inicial.
3. Corretor primário do imóvel (pipeline Nicole — B1/B2) — só atribui quando `assigned_broker_id IS NULL`.

Referência completa: `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` (Accepted).

### Estado atual do fetch de `currentLead`

Em `pipeline.ts:526–530`, o fetch de estado atual do lead é:
```ts
const { data: currentLead } = await supabase
  .from("leads")
  .select("stage_id, property_interest_id")
  .eq("id", leadId)
  .single()
```
`assigned_broker_id` **NÃO está no select** — o guard precisa adicionar esse campo.
Não é necessária uma query extra: basta incluir `assigned_broker_id` no select existente.

---

## Acceptance Criteria

- [x] **AC1:** Em `pipeline.ts:528`, o select de `currentLead` inclui `assigned_broker_id`. O campo está tipado corretamente (string | null). Sem query adicional.
- [x] **AC2 (B1 — guard de agendamento):** No bloco de agendamento (~`pipeline.ts:621`), `leadPatch.assigned_broker_id` é setado APENAS quando `currentLead?.assigned_broker_id` é `null` ou `undefined`. Se o lead já tem corretor, a linha de atribuição é ignorada; o `assignedBrokerId` encontrado ainda é usado em `appointments.broker_id` e no emit `APPOINTMENT_CREATED` (sem alteração nesses campos).
- [x] **AC3 (B2 — guard de handoff):** No bloco de handoff (~`pipeline.ts:659`), `leadPatch.assigned_broker_id` é setado APENAS quando `currentLead?.assigned_broker_id` é `null` ou `undefined`. Se o lead já tem corretor, a atribuição ao primário do imóvel é ignorada.
- [x] **AC4 (cenário Telegram — NULL → B):** Quando `currentLead.assigned_broker_id` é `null` (leads de Telegram sem roleta), o guard permite a atribuição normal pelo pipeline (comportamento do cenário 6 do ADR-001 preservado).
- [x] **AC5 (notificação 51-3 desacoplada de atribuição):** A notificação de agendamento (evento `APPOINTMENT_CREATED` + handler `notifyBrokerOfAppointment`) continua sendo disparada independente de o guard ter bloqueado ou não a atribuição. Quando o guard bloqueia (lead já tem corretor), o emit `APPOINTMENT_CREATED` usa o `broker_user_id` do **dono atual do lead** (`currentLead.assigned_broker_id`) para notificação — não o `assignedBrokerId` do imóvel (que ficará apenas em `appointments.broker_id` e nos logs).
- [x] **AC6 (sem efeito nas atribuições humanas):** Os call-sites humanos (C1–C4: `assign/route.ts`, `handoff/route.ts`, `bulk/route.ts`, `leads/route.ts`) não são tocados por esta story. Atribuições humanas continuam sobrescrevendo normalmente.
- [x] **AC7 (atividade de auditoria — opcional/nice-to-have):** Quando o guard é acionado (lead já tem corretor e o pipeline tentaria sobrescrever), um registro é inserido em `activities` com `type='broker_assignment_skipped'` e `metadata` contendo `{ existing_broker_id, attempted_broker_id, trigger: 'pipeline_b1' | 'pipeline_b2' }`. Este AC é marcável como WAIVED se gerar complexidade excessiva; documentar decisão nas Completion Notes. **IMPLEMENTADO** (try/catch best-effort em ambos B1 e B2).
- [x] **AC8:** TypeScript compila sem erros (`pnpm --filter @trifold/ai type-check`). ESLint passa nos arquivos modificados. Testes unitários adicionados para os cenários de AC2, AC3, AC4 e AC5.

---

## Tasks / Subtasks

- [x] **T0 — Pre-Flight: confirmar campos disponíveis no ponto de guarda**
  - Verificar que `currentLead` (linha 526-530 de `pipeline.ts`) está em escopo no bloco B1 (linha 584-639) e no bloco B2 (linha 641-680). Deve estar — ambos os blocos são posteriores ao fetch em linha 526. Confirmar via leitura do arquivo.
  - Verificar que `currentLead` captura o valor **antes** de `leadPatch` ser aplicado (o UPDATE único ocorre em linha 683-685, após ambos os blocos). Confirmar: sim, `currentLead` reflete o estado persistido antes da execução do pipeline desta mensagem — o que é o comportamento correto para o guard.

- [x] **T1 — Adicionar `assigned_broker_id` ao select de `currentLead` (AC1)**
  - Editar `packages/ai/src/chat/pipeline.ts:528`
  - Alterar:
    ```ts
    .select("stage_id, property_interest_id")
    ```
  - Para:
    ```ts
    .select("stage_id, property_interest_id, assigned_broker_id")
    ```
  - Verificar que o TypeScript infere corretamente `string | null` para o novo campo (sem cast necessário; Supabase client infere do schema).

- [x] **T2 — Guard no bloco de agendamento B1 (AC2, AC4)**
  - Editar `packages/ai/src/chat/pipeline.ts:621`
  - Alterar:
    ```ts
    if (assignedBrokerId) leadPatch.assigned_broker_id = assignedBrokerId
    ```
  - Para:
    ```ts
    if (assignedBrokerId && !currentLead?.assigned_broker_id) {
      leadPatch.assigned_broker_id = assignedBrokerId
    }
    ```
  - `appointments.broker_id` (linha 611) e o emit `APPOINTMENT_CREATED` (linha 634) NÃO são alterados — continuam usando `assignedBrokerId` do imóvel normalmente.

- [x] **T3 — Ajuste do `broker_user_id` no emit `APPOINTMENT_CREATED` para AC5**
  - Quando o guard bloqueia (lead já tem corretor), o emit deve usar o **dono atual** como destinatário da notificação, não o primário do imóvel.
  - Editar o emit `APPOINTMENT_CREATED` (linha 634):
    - Adicionar ao `metadata`: `notification_broker_user_id: currentLead?.assigned_broker_id ?? assignedBrokerId`
  - Os **dois call-sites** do handler `APPOINTMENT_CREATED` (`packages/web/src/app/api/webhook/whatsapp/route.ts:585-598` e `packages/web/src/app/api/telegram/webhook/route.ts:480+`) devem passar `event.metadata.notification_broker_user_id ?? event.metadata.broker_user_id` como `brokerUserId` para `notifyBrokerOfAppointment`. Se `notification_broker_user_id` não estiver no evento, manter comportamento atual (backward compatible). O helper `notify-appointment.ts` em si recebe `brokerUserId` já resolvido — pode não precisar de alteração; a decisão do destinatário fica nos call-sites dos webhooks.
  - [AUTO-DECISION] Nomear o novo campo `notification_broker_user_id` (separado de `broker_user_id` que registra o especialista do imóvel). Razão: mantém backward compatibility com logs e observabilidade; o `broker_user_id` continua sendo o primário do imóvel para fins de contexto; `notification_broker_user_id` é quem recebe a notificação.

- [x] **T4 — Guard no bloco de handoff B2 (AC3, AC4)**
  - Editar `packages/ai/src/chat/pipeline.ts:659`
  - Alterar:
    ```ts
    if (brokerId) leadPatch.assigned_broker_id = brokerId
    ```
  - Para:
    ```ts
    if (brokerId && !currentLead?.assigned_broker_id) {
      leadPatch.assigned_broker_id = brokerId
    }
    ```

- [x] **T5 — (Opcional) Atividade de auditoria quando guard bloqueia (AC7)** — IMPLEMENTADO (try/catch best-effort em B1 e B2)
  - No bloco B1, se `assignedBrokerId` truthy E `currentLead?.assigned_broker_id` truthy (guard ativo), inserir em `activities`:
    ```ts
    await supabase.from("activities").insert({
      org_id: conversation.org_id,
      lead_id: leadId,
      type: "broker_assignment_skipped",
      description: "Pipeline tentou atribuir corretor do imóvel, mas lead já tem corretor (guard ADR-001).",
      metadata: {
        existing_broker_id: currentLead.assigned_broker_id,
        attempted_broker_id: assignedBrokerId,
        trigger: "pipeline_b1",
      },
    })
    ```
  - Idem para B2 com `trigger: "pipeline_b2"` e `attempted_broker_id: brokerId`.
  - Envolver em try/catch (não bloquear fluxo). Marcar como WAIVED se adicionar complexidade excessiva — documentar nas Completion Notes.

- [x] **T6 — Testes unitários (AC8)**
  - Convenção do projeto: testes **co-localizados** (`*.test.ts` ao lado do arquivo), NÃO em `__tests__/`. Já existe `packages/ai/src/chat/pipeline.test.ts`.
  - Estender `packages/ai/src/chat/pipeline.test.ts` OU criar `packages/ai/src/chat/pipeline-broker-guard.test.ts` (co-localizado em `chat/`)
  - Cenário 1: lead sem corretor (`assigned_broker_id=null`) + pipeline acha primário → `leadPatch.assigned_broker_id` setado (guard NÃO bloqueia — cenário 6 Telegram)
  - Cenário 2: lead COM corretor (`assigned_broker_id='user-A'`) + pipeline acha primário → `leadPatch.assigned_broker_id` NÃO setado (guard bloqueia — cenário 1 roleta)
  - Cenário 3: bloco B1 — `notification_broker_user_id` no emit APPOINTMENT_CREATED usa `currentLead.assigned_broker_id` quando guard bloqueia
  - Cenário 4: bloco B1 — `notification_broker_user_id` usa `assignedBrokerId` quando lead não tem corretor (AC5 backward compat)
  - Cenário 5: bloco B2 — mesmo comportamento do cenário 1 e 2 (handoff path)

- [x] **T7 — QA pré-commit**
  - `pnpm --filter @trifold/ai type-check` → 0 erros ✅
  - `pnpm --filter @trifold/web type-check` → 0 erros ✅
  - ESLint nos arquivos modificados (web routes) → exit 0, 0 erros / 0 warnings ✅
  - `vitest run` na suite do pipeline → 34/34 passando (22 novos + 12 existentes) ✅

---

## Dev Notes

### Referência obrigatória

> **ADR-001 (fonte de verdade de `assigned_broker_id`):** `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` — Accepted. Esta story implementa a Opção 3 (Híbrido / First-write-wins com guard). O guard está nos pontos B1 (linha 621) e B2 (linha 659) de `pipeline.ts`. Leia o ADR completo antes de implementar — especialmente a seção "Cenários de conflito mapeados" e a seção "Decisão".

### Separação de papéis (conceito central do ADR)

- **Dono do lead** = `leads.assigned_broker_id` (fonte de verdade única de ownership; RLS 085; chat 51-1)
- **Especialista do imóvel** = `broker_assignments.is_primary` (fonte de verdade de quem conhece o produto)

Esses dois papéis PODEM ser corretores diferentes. O pipeline historicamente os confundia ao sobrescrever o dono com o especialista. Esta story separa os dois: o especialista é registrado em `appointments.broker_id` e pode receber notificação informativa, mas NÃO vira automaticamente o dono do lead.

### Paths-chave
```
packages/ai/src/chat/pipeline.ts                              ← EDITAR (T1, T2, T3, T4, T5)
packages/web/src/app/api/webhook/whatsapp/route.ts            ← EDITAR (T3 — call-site handler: notification_broker_user_id ?? broker_user_id)
packages/web/src/app/api/telegram/webhook/route.ts            ← EDITAR (T3 — SEGUNDO call-site do mesmo handler)
packages/web/src/lib/broker/notify-appointment.ts             ← provável SEM alteração (recebe brokerUserId já resolvido)
packages/ai/src/chat/pipeline-broker-guard.test.ts            ← CRIAR (T6) — co-localizado (convenção do projeto), ou estender chat/pipeline.test.ts
```

### Localização exata dos dois pontos de guarda
```
pipeline.ts
  linha 526-530 — fetch de currentLead (adicionar assigned_broker_id — T1)
  linha 584-639 — bloco B1 (visit_availability / agendamento)
    linha 591   — let assignedBrokerId: string | null = null
    linha 593-606 — busca broker_assignments para o propertyId
    linha 621   — if (assignedBrokerId) leadPatch.assigned_broker_id = assignedBrokerId  ← GUARD T2
    linha 634   — emit APPOINTMENT_CREATED  ← AJUSTAR notification_broker_user_id T3
  linha 641-680 — bloco B2 (handoff)
    linha 648-661 — busca broker_assignments para identifiedPropertyId
    linha 659   — if (brokerId) leadPatch.assigned_broker_id = brokerId  ← GUARD T4
  linha 683-685 — ONE single UPDATE (leadPatch aplicado aqui — currentLead é anterior, correto para o guard)
```

### Gotchas

- **`currentLead` em escopo:** o fetch de `currentLead` (linha 526) está ANTES dos blocos B1 (linha 584) e B2 (linha 641). O guard pode usar `currentLead` diretamente sem query adicional — apenas adicionar o campo ao select (T1).
- **`currentLead` usa `.single()`:** o projeto tem regra de usar `.maybeSingle()` em vez de `.single()` (`.single()` lança em 0 rows). Porém o fetch de `currentLead` em `pipeline.ts:530` já usa `.single()` — **não alterar esse detalhe nesta story**, pois mudaria um comportamento pré-existente que está fora do escopo. Registrar como observação para o QA.
- **`assignments.broker_id` vs `user_id`:** o join em `broker_assignments` retorna `brokers(user_id)` — o `assignedBrokerId` já é o `user_id` do usuário (não o `brokers.id`). Coerente com RLS 085 que usa `leads.assigned_broker_id = users.id`.
- **Boundary ai↔web para T3:** `pipeline.ts` (em `@trifold/ai`) NÃO pode importar de `@trifold/web`. A modificação em `notify-appointment.ts` (que está em `@trifold/web`) é independente — o pipeline apenas enriquece o emit; o handler `onEvent` consome. Seguir o padrão estabelecido pela Story 51-3.
- **`is_ai_active` intocado:** esta story não toca `is_ai_active`. O CON-1 do epic (Nicole continua ativa) não é afetado.
- **RLS "085" é unversioned (gotcha de anti-hallucination):** o ADR e versões anteriores desta story citavam `supabase/migrations/085_fix_broker_rls_leads_only_own.sql`. **Esse arquivo NÃO existe** — a política foi aplicada direto no banco remoto via MCP (commit `ef63cf5`, mensagem "SELECT aplicado via MCP; UPDATE aplicado após estabilização do banco"). A última migration versionada é `073`. O comportamento RLS (corretor vê só `assigned_broker_id = user_id`, sem fallback NULL) está LIVE em produção e é exatamente o que torna esta story P0 — mas o @dev/@qa não deve procurar o arquivo de migration. Considerar follow-up para versionar a policy.
- **AC5 viável com a estrutura atual (51-3):** confirmado em `webhook/whatsapp/route.ts:585-598` e `telegram/webhook/route.ts:480+` — o handler lê `event.metadata.broker_user_id` e chama `notifyBrokerOfAppointment`. O acréscimo de `notification_broker_user_id` no metadata do emit (T3) é compatível: o handler deve preferir `notification_broker_user_id` quando presente e cair para `broker_user_id` caso contrário. **ATENÇÃO: há DOIS handlers** (whatsapp e telegram) — T3 precisa atualizar ambos os call-sites do handler, não só o whatsapp. O helper `notify-appointment.ts` recebe `brokerUserId` já resolvido, então a escolha do destinatário acontece no call-site do handler.
- **Regressão no cenário 6 (Telegram):** validar ESPECIALMENTE que o guard não bloqueia quando `currentLead.assigned_broker_id` é `null` — a condição `!currentLead?.assigned_broker_id` deve ser `true` nesse caso, permitindo a atribuição. Cobrir com Cenário 1 do T6.

---

## File List

### Criados
- `packages/ai/src/chat/pipeline-broker-guard.test.ts` — testes unitários (T6), 5 cenários (co-localizado; alternativa: estender `chat/pipeline.test.ts`)

### Modificados
- `packages/ai/src/chat/pipeline.ts` — (T1) `assigned_broker_id` adicionado ao select de `currentLead`; (T2) guard B1 com `!currentLead?.assigned_broker_id`; (T3) `notification_broker_user_id` no emit `APPOINTMENT_CREATED`; (T4) guard B2; (T5, opcional) atividade de auditoria
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — (T3) call-site do handler `APPOINTMENT_CREATED`: usar `notification_broker_user_id ?? broker_user_id`
- `packages/web/src/app/api/telegram/webhook/route.ts` — (T3) MESMO ajuste do handler (segundo call-site — não esquecer)
- `packages/web/src/lib/broker/notify-appointment.ts` — (T3) provavelmente SEM alteração (recebe `brokerUserId` resolvido); confirmar durante implementação

### Referência (não modificar)
- `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` (Accepted — decisão que esta story implementa)
- `packages/web/src/app/api/leads/[id]/assign/route.ts` (C1 — atribuição humana, NÃO tocar)
- `packages/web/src/app/api/leads/[id]/handoff/route.ts` (C2 — handoff manual, NÃO tocar)
- `packages/web/src/app/api/leads/bulk/route.ts` (C3 — bulk assign, NÃO tocar)
- RLS de leads — fix "085" (`leads_select`/`leads_update` sem fallback NULL). **ATENÇÃO: não existe arquivo `supabase/migrations/085_*.sql`** — a mudança foi aplicada em produção via MCP (commit `ef63cf5`, 2026-06-08). Contexto RLS confirma `assigned_broker_id` = `user_id`. Última migration versionada é `073`.

---

## Testing

### Framework
Vitest

### Cenários obrigatórios (T6)

1. **Lead NULL → atribuição permitida (cenário Telegram):** `currentLead.assigned_broker_id = null` + pipeline acha corretor primário → `leadPatch.assigned_broker_id` setado com o valor encontrado
2. **Lead COM corretor → guard bloqueia (cenário roleta):** `currentLead.assigned_broker_id = 'user-A'` + pipeline acha primário diferente (`'user-B'`) → `leadPatch.assigned_broker_id` NÃO setado; `leadPatch` não contém a chave `assigned_broker_id`
3. **Emit `APPOINTMENT_CREATED` quando guard bloqueia:** `currentLead.assigned_broker_id = 'user-A'`, `assignedBrokerId = 'user-B'` → `notification_broker_user_id = 'user-A'` (dono) e `broker_user_id = 'user-B'` (especialista do imóvel) no metadata do evento
4. **Emit `APPOINTMENT_CREATED` quando guard não bloqueia:** `currentLead.assigned_broker_id = null`, `assignedBrokerId = 'user-B'` → `notification_broker_user_id = 'user-B'` (mesmos)
5. **Guard B2 (handoff):** comportamento idêntico ao guard B1 — cenários 1 e 2 repetidos para o bloco de handoff

### Smoke pós-deploy

- Criar lead de teste via WhatsApp → verificar que roleta atribui Corretor A
- Simular agendamento pela Nicole (imóvel com primário = Corretor B) → verificar que `assigned_broker_id` **permanece** Corretor A (não B)
- Verificar `appointments.broker_id` = user_id de Corretor B (esperado — o especialista vai para o appointment)
- Verificar que Corretor A recebe notificação de agendamento (não Corretor B) — via `notification_broker_user_id` no evento
- Verificar que Corretor A ainda enxerga o lead no CRM (RLS 085 intacto)
- Query de auditoria (opcional, se AC7 implementado):
  ```sql
  SELECT * FROM activities
  WHERE type = 'broker_assignment_skipped'
  ORDER BY created_at DESC LIMIT 5;
  ```
- Cenário Telegram: criar lead sem roleta → pipeline agenda → verificar que `assigned_broker_id` é preenchido pelo pipeline (guard não bloqueou — lead estava NULL)

---

## Out of Scope

- Atribuições humanas (call-sites C1–C4) — NÃO alterar; já têm precedência máxima por design
- Checar status do corretor primário antes de atribuir a lead NULL (cenário 5 do ADR) — follow-up futuro
- Auditoria retrospectiva de leads já reatribuídos silenciosamente — follow-up futuro (query sugerida no ADR-001 seção "Follow-ups")
- Roleta de entrada (`distributor.ts`) — NÃO tocar; já funciona corretamente
- `is_ai_active` — NÃO tocar (CON-1 do epic)

---

## Definition of Done

- [x] AC1–AC6 marcados como completos (AC7 marcado como DONE — implementado)
- [x] T0–T6 marcados como done (T5 marcado como DONE — implementado)
- [x] Decisão sobre AC7/T5 documentada nas Completion Notes
- [x] Regressão no cenário Telegram (AC4) explicitamente verificada (Cenário 1 + 4 do test file)
- [ ] @qa executou quality gate com verdict >= PASS
- [ ] @devops fez push

---

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — @dev (Dex), modo YOLO

### Completion Notes

**Implementação dos guards (T1–T4):** os pontos B1 (agendamento) e B2 (handoff) do `pipeline.ts` agora respeitam a precedência do ADR-001. Em vez de inlining a condição `if (x && !currentLead?.assigned_broker_id)` em dois lugares, extraí duas funções puras exportadas em `pipeline.ts` (logo após `hasConfirmedDay`):
- `shouldAssignPipelineBroker(propertyBrokerId, currentOwnerId)` — encapsula a regra "só atribui quando lead não tem dono". Usada por B1 e B2.
- `resolveNotificationBrokerUserId(propertyBrokerId, currentOwnerId)` — encapsula o AC5 (`currentOwnerId ?? propertyBrokerId ?? null`).

[AUTO-DECISION] Extrair helpers puros em vez de inline → razão: a convenção do projeto é testes co-localizados de lógica pura (`hasConfirmedDay` já segue esse padrão e é testada isoladamente em `pipeline.test.ts`). `processMessage` é uma função de integração grande que exigiria mock pesado de Supabase/Anthropic; testar a *decisão* do guard via helpers puros é mais determinístico, cobre exatamente os 5 cenários do T6, e mantém B1/B2 com comportamento idêntico (DRY). Sem alteração de comportamento — os helpers retornam o mesmo que a condição inline.

**AC5 — como o destinatário da notificação foi resolvido nos dois handlers:**
- No `pipeline.ts` (boundary @trifold/ai), o emit `APPOINTMENT_CREATED` agora carrega DOIS campos: `broker_user_id` (inalterado = especialista do imóvel, para contexto/observabilidade) e o novo `notification_broker_user_id` (= dono atual do lead quando o guard bloqueia, senão o corretor do imóvel). O pipeline NÃO importa nada de @trifold/web — apenas enriquece o metadata do evento (padrão da Story 51-3).
- Nos DOIS call-sites web (`webhook/whatsapp/route.ts` e `telegram/webhook/route.ts`), o handler `onEvent` agora resolve `notifyBrokerUserId = metadata.notification_broker_user_id ?? metadata.broker_user_id` e passa esse valor já resolvido para `notifyBrokerOfAppointment`. Backward-compatible: se um evento antigo não tiver `notification_broker_user_id`, cai para `broker_user_id` (comportamento 51-3). A condição mudou de `if (event_type === ... && broker_user_id)` para `if (event_type === ...)` + check do `notifyBrokerUserId` resolvido — garante que a notificação dispara mesmo quando só `notification_broker_user_id` existir.
- `notify-appointment.ts` NÃO foi alterado (confirmado): recebe `brokerUserId` já resolvido; a escolha do destinatário acontece no call-site, como previsto pela story.

**AC7/T5 — DONE (não waived):** a auditoria `broker_assignment_skipped` foi trivial de adicionar (a story já tinha o snippet pronto). Implementada em B1 (`trigger: 'pipeline_b1'`) e B2 (`trigger: 'pipeline_b2'`), cada uma em `try/catch` com `console.error` no catch — best-effort, nunca bloqueia o fluxo. Inserida no branch `else if (propertyBroker && currentOwner)` (guard ativo).

**Regressão Telegram (AC4):** coberta explicitamente pelos testes — `shouldAssignPipelineBroker("user-B", null) === true` e `resolveNotificationBrokerUserId("user-B", null) === "user-B"` (Cenário 1 + 4). O guard NÃO bloqueia quando o lead está sem dono.

**Observações para o @qa:**
- O fetch de `currentLead` em `pipeline.ts:530` usa `.single()` (não `.maybeSingle()`). Conforme gotcha da story, NÃO foi alterado — é comportamento pré-existente fora do escopo desta story.
- RLS "085" continua unversioned (aplicada via MCP, commit ef63cf5). Versionar a policy é follow-up de @data-engineer, fora do escopo desta story.

### File List

**Criados:**
- `packages/ai/src/chat/pipeline-broker-guard.test.ts` — 22 testes (5 cenários obrigatórios + edges) para `shouldAssignPipelineBroker` e `resolveNotificationBrokerUserId`

**Modificados:**
- `packages/ai/src/chat/pipeline.ts` — (helpers) `shouldAssignPipelineBroker` + `resolveNotificationBrokerUserId` exportados; (T1) `assigned_broker_id` no select de `currentLead`; (T2) guard B1; (T3) `notification_broker_user_id` no emit `APPOINTMENT_CREATED`; (T4) guard B2; (T5) auditoria `broker_assignment_skipped` em B1 e B2
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — (T3) handler usa `notification_broker_user_id ?? broker_user_id`
- `packages/web/src/app/api/telegram/webhook/route.ts` — (T3) mesmo ajuste (segundo call-site)

**Não modificados (confirmado):**
- `packages/web/src/lib/broker/notify-appointment.ts` — recebe `brokerUserId` já resolvido; sem alteração

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-09 | 0.1 | Story drafted — implementação do ADR-001 (Opção 3: guard de precedência em B1/B2 do pipeline) | @sm (River) |
| 2026-06-09 | 0.2 | **Validação PO — verdict GO (9/10). Status Draft → Ready.** Fixes aplicados: (1) corrigida referência inexistente `085_fix_broker_rls_leads_only_own.sql` → RLS aplicada via MCP (commit ef63cf5, sem arquivo de migration; última versionada é 073); (2) corrigida convenção de teste `__tests__/` → co-localizado `chat/pipeline-broker-guard.test.ts`; (3) T3/File List/Paths atualizados para refletir os DOIS call-sites do handler APPOINTMENT_CREATED (whatsapp + telegram), antes só o whatsapp era mencionado; (4) adicionados gotchas de RLS unversioned e viabilidade do AC5. Line numbers do pipeline (528/621/634/659) e send-message:86 confirmados corretos no código real. | @po (Pax) |
| 2026-06-09 | 0.3 | **Implementação @dev — Status Ready → Ready for Review.** Guards B1/B2 implementados via helpers puros `shouldAssignPipelineBroker` + `resolveNotificationBrokerUserId`. AC1–AC8 completos; AC7/T5 (auditoria) IMPLEMENTADO (não waived). AC5 resolvido nos dois handlers (whatsapp + telegram) com `notification_broker_user_id ?? broker_user_id`; `notify-appointment.ts` inalterado. Type-check @trifold/ai + @trifold/web: 0 erros. ESLint web routes: limpo. Testes: 34/34 passando. | @dev (Dex) |
| 2026-06-09 | 0.4 | **QA Gate @qa — verdict PASS (100/100).** 7 quality checks aprovados; 8/8 ACs com evidência path:linha; 34/34 testes verdes (verificados independentemente). Guard P0 confirmado em código (B1:662, B2:728). Separação dono/especialista validada. is_ai_active e notify-appointment.ts confirmados intocados. 6 falhas @web/* pré-existentes inalteradas. Issues não-bloqueantes: TEST-001 (med, infra de teste herdada), MNT-001 (low, .single() pré-existente), OBS-001 (low, CodeRabbit WSL). Recomendação: Ready for Done → @devops push. Gate: docs/qa/gates/51.7-guard-precedencia-assigned-broker.yml | @qa (Quinn) |

---

## QA Results

### Review Date: 2026-06-09

### Reviewed By: Quinn (Test Architect — @qa)

### Code Quality Assessment

Implementação de alta qualidade. A extração de dois helpers puros
(`shouldAssignPipelineBroker`, `resolveNotificationBrokerUserId`) logo após
`hasConfirmedDay` é a decisão de design correta: encapsula a regra do ADR-001 num único
lugar, garante que B1 e B2 sejam idênticos por construção (DRY), e torna a decisão do
guard testável de forma determinística sem mockar a integração inteira. O boundary ai↔web
é respeitado (pipeline.ts apenas enriquece o metadata do evento; os handlers web resolvem
o destinatário). Diff mínimo, cirúrgico e bem comentado.

### Verificação do invariante P0 (CRÍTICO)

O guard de fato impede a sobrescrita. `shouldAssignPipelineBroker = Boolean(propertyBrokerId) && !currentOwnerId`
(pipeline.ts:74) retorna `false` sempre que o lead já tem dono. Aplicado em:
- **B1 (agendamento):** pipeline.ts:662 — `leadPatch.assigned_broker_id` só é setado quando o helper retorna true.
- **B2 (handoff):** pipeline.ts:728 — mesmo helper, mesma garantia.

Separação dono/especialista preservada: `appointments.broker_id` (645) e `broker_user_id`
no emit (701) seguem o corretor do **imóvel**; `notification_broker_user_id` (700) resolve
o destinatário da notificação — dono atual quando o guard bloqueia, corretor do imóvel
quando o lead era NULL. Consumidor crítico 51-1 (`send-message/route.ts:86`) protegido por design.

### Compliance Check

- Coding Standards: ✓ (helpers puros, imports absolutos, JSDoc, sem código morto)
- Project Structure: ✓ (teste co-localizado em `chat/`, convenção do projeto)
- Testing Strategy: ✓ (Vitest, 22 testes novos cobrindo os 5 cenários obrigatórios + edges)
- All ACs Met: ✓ (8/8 com evidência path:linha)

### Resultados de verificação independente

- `pnpm --filter @trifold/ai type-check` → **0 erros**
- `pnpm --filter @trifold/web type-check` → **0 erros**
- `npx vitest run packages/ai/` → **241/241 passed** (14 files)
- Suite do pipeline (guard + existente) → **34/34 passed** (22 guard + 12 pipeline)
- ESLint (web routes modificados) → **exit 0** (@trifold/ai lint = `tsc --noEmit`, verde)
- `git diff` pipeline.ts: **is_ai_active ausente** (CON-1 preservado); **notify-appointment.ts ausente** (confirmado intocado)
- Suite web full → **62 passed / 6 failed** — as 6 falhas são EXCLUSIVAS de
  `webhook/whatsapp/__tests__/route.test.ts` (alias `@web/lib/supabase/admin` não resolve,
  Story 21.1), idênticas com/sem esta story. **Não introduzidas aqui.**

### Improvements Checklist

- [ ] (TEST-001, med) Resolver `resolve.alias @web/*` no vitest para destravar testes de route/handler e corrigir as 6 falhas pré-existentes do webhook 21.1 — story de QA infra
- [ ] (MNT-001, low) Considerar `.single()` → `.maybeSingle()` em pipeline.ts:564 (pré-existente, fora do escopo) numa story de hardening
- [ ] (follow-up) Versionar a RLS "085" (aplicada via MCP, unversioned) — @data-engineer

### Security Review

Sem concerns. O guard só PODE deixar de atribuir (nunca atribui errado) e usa optional
chaining defensivo. RLS 085 preservada; nenhuma nova superfície de endpoint/secret. A
auditoria `broker_assignment_skipped` é best-effort (try/catch). Nenhum token/credencial
exposto.

### Files Modified During Review

Nenhum arquivo de aplicação modificado pelo QA (review-only). Atualizados apenas: esta
seção QA Results, Change Log e o gate file.

### Gate Status

Gate: PASS → docs/qa/gates/51.7-guard-precedencia-assigned-broker.yml

### Recommended Status

✓ Ready for Done — aprovado para @devops *push. (Story owner decide o status final.)

— Quinn, guardião da qualidade 🛡️

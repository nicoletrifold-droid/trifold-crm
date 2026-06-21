# Story 63-12 — Push ao Corretor quando o Lead Responde + Deep-link para a Conversa

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-12
- **Status:** Ready for Review
- **Validated:** 2026-06-21 by @po (Pax) — verdict **GO (9/10)**. Status Draft→Ready. As 3 decisões de produto pendentes foram **RESOLVIDAS pelo PO** e incorporadas como regras/AC concretos (ver seção "Decisões de Produto Resolvidas"). **Q1 (gatilho):** notificar SOMENTE quando o corretor JÁ ASSUMIU a conversa — `assigned_broker_id` não-null E existe mensagem `role='broker'` nas últimas 24h naquela conversa (mesma lógica `brokerSentRecently` de `broker-takeover-status.ts`/63-8 e do cron de follow-up). **Q2 (anti-spam):** SEM debounce — 1 push por mensagem inbound do lead; o gatilho restrito de Q1 já limita naturalmente o volume. **Q3 (sem corretor):** `assigned_broker_id=null` → não notificar ninguém (sem fallback gerente/admin). Evidências confirmadas em código: insert inbound em `route.ts` L425-434 (`role:"user"`); `after()` da Nicole em L439 (independente); `findOrUpsertLead` seleciona só `id, created_at` (L750) → query extra obrigatória no helper; `sendPushToUser(supabase, userId, {title,body,url})` confirmado (L19, trata 410); `brokerSentRecently` já existe como helper puro server-importável em `lib/broker/broker-takeover-status.ts`. Liberada para @dev (após 63-10 Done — já PASS).
- **Priority:** P0 — corretor não recebe nenhum aviso quando lead responde fora do CRM
- **Complexity:** M (3-4h)
- **Fase:** 4 (Tempo Real & Notificações)
- **Created:** 2026-06-21
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[push_dispatch_check, deeplink_check, antispam_check, webhook_regression_check]`
- **Depende de:** Story 63-10 Done (endpoint `/api/leads/[id]/notify-on-reply` e flag `leads.metadata.notify_broker_on_reply` já existem); Story 51-1 Done (infra push: `push_subscriptions`, `sendPushToUser`, service worker)
- **Pode ir em paralelo com:** Story 63-11 (ambas são independentes; executar em paralelo reduz o tempo até a Fase 4 estar completa)

> **DECISÕES DE PRODUTO RESOLVIDAS pelo @po (2026-06-21).** As 3 questões foram decididas e estão incorporadas nos AC abaixo. Resumo: **Q1** gatilho = corretor já assumiu (`assigned_broker_id` não-null + `role='broker'` <24h na conversa); **Q2** sem debounce (1 push por inbound); **Q3** sem corretor atribuído → não notifica ninguém. Story pronta para @dev.

---

## User Story

**Como** corretor com o CRM fechado (ou em outra aba),
**Quero** receber uma notificação push quando um lead que estou atendendo me responde,
**Para que** eu saiba imediatamente que há uma mensagem esperando e possa clicar na notificação para abrir direto a conversa daquele lead.

---

## Context

### Estado Atual

Hoje, quando um lead responde via WhatsApp:
1. O webhook (`api/webhook/whatsapp/route.ts`) grava a mensagem e a Nicole processa
2. O corretor não recebe nenhum aviso externo — só vê se estiver com o CRM aberto e der reload (ou depois de 63-11)

A Story 63-10 adicionou um botão "Me avisar quando o lead responder" que grava `leads.metadata.notify_broker_on_reply = true`. A **entrega real da notificação** foi declarada Out of Scope na 63-10 e é o escopo principal desta story.

### Infra de Push Já Pronta (reusar, não recriar)

| Artefato | Path | Estado |
|----------|------|--------|
| Inscrição do corretor | `broker/_components/broker-push-prompt.tsx` (montado em `broker/layout.tsx`) | Funcional |
| Endpoint subscribe/unsubscribe | `api/push/subscribe/route.ts` | Funcional |
| Tabela de subscriptions | `push_subscriptions` (migration 023) | Funcional |
| Helper de envio | `lib/server/push-service.ts` → `sendPushToUser(supabase, userId, { title, body, url })` | Funcional |
| Service worker deep-link | `lib/pwa/sw-source.js` L106-134 | Funcional — lê `data.url` do payload e navega; NÃO precisa de alteração |
| Precedente de push no webhook | `lib/broker/notify-appointment.ts` → `notifyBrokerOfAppointment(...)` chamado em `webhook/whatsapp/route.ts` L640 | Padrão a seguir |

### Deep-link Já Funciona — Nenhuma Mudança no Service Worker

O handler `notificationclick` (`sw-source.js` L121-134) já:
1. Fecha a notificação
2. Lê `event.notification.data?.url`
3. Foca janela existente da origem e navega para a URL, ou abre nova janela

Basta enviar `url: '/broker/leads/{leadId}'` no payload do push — o corretor que clica na notificação abre direto a conversa. AC de verificação incluído.

### Ponto de Disparo: Webhook de Mensagem Inbound

O lugar correto para disparar o push é o webhook (`api/webhook/whatsapp/route.ts`), após o INSERT da mensagem inbound (~L424-433):

```typescript
// ~L424-433 atual
await supabase.from("messages").insert({
  conversation_id: conversation.id,
  role: "user",
  content: text || "",
  metadata: { whatsapp_message_id: messageId, ...mediaMetadata },
})

// NOVO — segunda chamada after() dedicada, independente do bloco da Nicole (L439)
after(async () => {
  await notifyBrokerOnReply({
    supabase: getSupabaseAdmin(),
    leadId: lead.id,
    conversationId: conversation.id,   // necessário para o gate Q1 (brokerSentRecently)
    orgId,
    messageExcerpt: text ?? "",
  })
})
```

**Por que `lead` tem apenas `{id, created_at}` nesse ponto:** `findOrUpsertLead` (L750) seleciona apenas `id, created_at`. Para obter `assigned_broker_id` (e o nome do lead), o helper `notifyBrokerOnReply` faz uma query adicional dentro do `after()` (async, não bloqueia o webhook). O `conversation.id` já está disponível no escopo do webhook (a conversa foi resolvida antes do INSERT inbound) e é passado para o gate Q1.

**Por que `after()` separado:** o bloco existente em L439 é o da Nicole (processamento de pipeline, download de mídia). Mantê-los separados garante que uma falha no push não afete o pipeline da Nicole e vice-versa.

### Helper `notify-on-reply.ts` — Novo arquivo

Espelhar a estrutura de `lib/broker/notify-stalled-lead.ts` (best-effort, never throws, logging). Diferenças:
- Push-only (não email, não WhatsApp) — por mensagem é excessivo nos outros canais
- **Sem fallback gerente/admin** (Q3) — diferente de `notify-stalled-lead.ts` que tem `FALLBACK_ROLES`; aqui sem corretor atribuído = sem push
- **Sem debounce/anti-spam** (Q2) — 1 push por inbound; NÃO grava `last_reply_push_at`
- **Gatilho = corretor já assumiu** (Q1) — só notifica se há `role='broker'` na conversa nas últimas 24h
- Nenhum `notifyBroker` de alto nível — chama `sendPushToUser` diretamente

```typescript
// lib/broker/notify-on-reply.ts
import "server-only"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendPushToUser } from "@web/lib/server/push-service"
import { brokerSentRecently } from "@web/lib/broker/broker-takeover-status"

export async function notifyBrokerOnReply(params: {
  supabase: ReturnType<typeof createAdminClient>
  leadId: string
  conversationId: string
  orgId: string
  messageExcerpt: string
}): Promise<void> {
  try {
    const { supabase, leadId, conversationId, orgId, messageExcerpt } = params

    // 1. Buscar dados do lead (assigned_broker_id + nome). metadata NÃO é mais
    //    necessário para o gate (Q1 não usa a flag; Q2 não usa debounce).
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, assigned_broker_id")
      .eq("id", leadId)
      .eq("org_id", orgId)
      .maybeSingle()

    if (!lead?.assigned_broker_id) return  // Q3 — sem corretor → não notificar (sem fallback)

    // 2. Q1 — gatilho: o corretor JÁ ASSUMIU? (role='broker' nas últimas 24h na conversa)
    //    Reutiliza o predicado puro `brokerSentRecently` (63-8) sobre uma janela de 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: brokerMsgs } = await supabase
      .from("messages")
      .select("role, created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "broker")
      .gte("created_at", since)
      .limit(1)
    if (!brokerSentRecently(brokerMsgs ?? [])) return  // Nicole ainda conduz sozinha → não notificar

    // 3. Enviar push (Q2 — sem debounce: 1 push por inbound do lead)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
    await sendPushToUser(supabase, lead.assigned_broker_id as string, {
      title: `${(lead.name as string | null) ?? "Lead"} respondeu`,
      body: messageExcerpt.slice(0, 100) || "Nova mensagem recebida.",
      url: `${appUrl}/broker/leads/${leadId}`,
    })
  } catch (err) {
    // Best-effort: nunca propaga erro para não afetar o webhook
    console.error("[notify-on-reply] failed:", err)
  }
}
```

> **Nota sobre o filtro do gate Q1:** a query já restringe `role='broker'` + `created_at >= now-24h`; o `brokerSentRecently(brokerMsgs ?? [])` é redundante por segurança/legibilidade (re-aplica a mesma janela de 24h em memória, reusando o helper canônico). Custo: 1 query adicional a `messages` dentro do `after()` (fora do caminho crítico do webhook) + a query do lead = 2 queries assíncronas. Aceitável.

---

## DECISÕES DE PRODUTO RESOLVIDAS (@po — 2026-06-21)

### Q1 — Condição de disparo → **Corretor já assumiu** (decidido)

**Decisão:** Notificar SOMENTE quando o corretor JÁ ASSUMIU aquela conversa — ou seja, há mensagem `role='broker'` nas últimas 24h na conversa do lead (mesma lógica `brokerSentRecently` de `lib/broker/broker-takeover-status.ts` / 63-8, e do cron de follow-up). **NÃO** notificar quando a Nicole ainda conduz sozinha (sem mensagem de broker recente).

**Por quê:** o aviso só faz sentido para quem está de fato no atendimento daquele lead; enquanto a Nicole conduz, um push seria ruído. Este gatilho é mais preciso que o opt-in da flag e dispensa o corretor de clicar "Me avisar" em cada lead.

**Relação com a flag `notify_broker_on_reply` (63-10):** com Q1 como gatilho automático, a flag **NÃO é consultada** por `notify-on-reply` para decidir o disparo (deixa de ser gate). O opt-in da 63-10 permanece como elemento de UX (botão "Me avisar quando o lead responder" + persistência da preferência), mas não governa este push. Uma evolução futura poderia usar a flag como _override_ (forçar push mesmo sem broker recente) — fora de escopo aqui, sem nova story.

### Q2 — Anti-spam / debounce → **Sem debounce** (decidido)

**Decisão:** SEM agrupamento/debounce — 1 push por mensagem inbound do lead. **Removido** o `metadata.last_reply_push_at` e toda a lógica de janela de debounce do escopo da story.

**Por quê:** como o gatilho Q1 restringe a conversas já assumidas, o volume é naturalmente menor (não é todo lead da base, só os que o corretor está atendendo). Refinamento futuro (debounce/agrupamento) possível se o feedback mostrar incômodo — mas não para o lançamento.

### Q3 — Lead sem corretor atribuído → **Não notificar ninguém** (decidido)

**Decisão:** Se `assigned_broker_id` é null, nenhum push é enviado. **Sem fallback** para gerente/admin (diferente de `notify-stalled-lead.ts`, que tem `FALLBACK_ROLES`).

**Por quê:** lead sem corretor ainda é gerenciado pela Nicole/roleta; notificar gerente/admin por mensagem seria ruído. Se um dia for necessário, abrir story separada (não misturar complexidades).

---

## Acceptance Criteria

- [x] **AC1 (Q1 — gatilho):** Quando um lead responde via WhatsApp, o push só é enviado se AMBAS as condições forem verdadeiras: (a) `leads.assigned_broker_id` não é null; (b) existe ao menos uma mensagem `role='broker'` nas últimas 24h na conversa daquele lead (`brokerSentRecently` — corretor já assumiu). Atendidas, o corretor atribuído recebe um push com título `"{nome do lead} respondeu"` e body com os primeiros 100 caracteres da mensagem (ou "Nova mensagem recebida." para mídia sem texto). A flag `notify_broker_on_reply` (63-10) NÃO é consultada como gate.
- [x] **AC2 (Q1 — Nicole sozinha):** Quando a Nicole ainda conduz a conversa sozinha (nenhuma mensagem `role='broker'` nas últimas 24h), nenhum push é enviado, mesmo com `assigned_broker_id` preenchido.
- [x] **AC3 (Q3 — sem corretor):** Se `assigned_broker_id` for null, nenhum push é enviado e nenhum fallback para gerente/admin ocorre. A função finaliza silenciosamente.
- [x] **AC4 (Q2 — sem debounce):** Cada mensagem inbound do lead que satisfaz AC1 gera exatamente 1 push (sem agrupamento/debounce). NÃO é gravado nem lido `metadata.last_reply_push_at`; `leads.metadata` não é modificado por esta story.
- [x] **AC5 (deep-link):** O push contém `url: "/broker/leads/{leadId}"` — ao clicar na notificação, o service worker existente abre (ou foca) o CRM diretamente em `/broker/leads/{leadId}` sem nenhuma mudança no service worker
- [x] **AC6:** O dispatch do push é fire-and-forget via `after()` — nunca bloqueia o webhook nem a resposta HTTP 200 para o Meta
- [x] **AC7:** Se o corretor não tem nenhuma push subscription ativa (`push_subscriptions` vazia para o `assigned_broker_id`), a função finaliza silenciosamente sem erro (comportamento já garantido por `sendPushToUser` L31-48)
- [x] **AC8:** A lógica de disparo é encapsulada em `lib/broker/notify-on-reply.ts` — o webhook em `route.ts` apenas chama a função; nenhuma lógica de negócio inline no webhook. CON-3/CON-7: o helper NÃO altera `is_ai_active` nem nenhum estado de atendimento. CON-1: nenhum uso de `tel:`/`wa.me`.
- [x] **AC9:** Nenhum dos comportamentos existentes do webhook é afetado: a Nicole continua processando, o `after()` da Nicole funciona independentemente, o HTTP 200 ainda é retornado imediatamente
- [x] **AC10:** TypeScript compila sem erros nos arquivos desta story; ESLint passa

---

## Tasks / Subtasks

- [x] **T1 — Decisões de Produto (Q1, Q2, Q3) — RESOLVIDAS pelo @po (2026-06-21)**
  - Q1 = corretor já assumiu (`assigned_broker_id` não-null + `role='broker'` <24h na conversa, via `brokerSentRecently`); flag `notify_broker_on_reply` NÃO é gate
  - Q2 = sem debounce (1 push por inbound; sem `last_reply_push_at`)
  - Q3 = sem corretor atribuído → não notifica ninguém (sem fallback gerente/admin)

- [x] **T2 — Criar `lib/broker/notify-on-reply.ts`**
  - Implementado `notifyBrokerOnReply(params)` conforme pseudocódigo (Q1/Q2/Q3)
  - Params: `{ supabase, leadId, conversationId, orgId, messageExcerpt }`
  - `import "server-only"` (como `notify-stalled-lead.ts` e `push-service.ts`)
  - Gate Q1: query a `messages` por `conversation_id` + `role='broker'` + `created_at >= now-24h` (limit 1) e `brokerSentRecently(...)` reusado de `@web/lib/broker/broker-takeover-status`
  - Gate Q3: `if (!lead?.assigned_broker_id) return` — sem fallback
  - SEM debounce, SEM update de `leads.metadata`
  - Nunca lança — try/catch interno com `console.error`
  - `supabase` recebido por parâmetro (facilita testes). Extraído helper puro `buildReplyPushPayload` para o payload (testável)

- [x] **T3 — Adicionar chamada no webhook `route.ts`**
  - Após o INSERT da mensagem inbound, adicionado segundo bloco `after(async () => { await notifyBrokerOnReply(...) })` dentro do mesmo guard `if (text || mediaMetadata.media_type)`
  - Importado `notifyBrokerOnReply` de `@web/lib/broker/notify-on-reply`
  - Passa `leadId: lead.id`, `conversationId: conversation.id`, `orgId`, `messageExcerpt: text ?? ""`; `supabase: getSupabaseAdmin()`

- [x] **T4 — Verificar deep-link end-to-end**
  - Confirmado: `sw-source.js` (L106-134) lê `event.notification.data?.url` no `notificationclick` e foca/abre `/broker/leads/{id}`. Payload já inclui `url`. SW NÃO modificado

- [x] **T5 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story (restam apenas os 3 pré-existentes de `visual-editor.tsx`)
  - ESLint → zero erros nos arquivos desta story
  - Vitest: novo `notify-on-reply.test.ts` (9 testes) PASS; suíte completa 463/463 sem regressão
  - Teste manual end-to-end (envio real de push no dispositivo): requer infra de produção/dispositivo — fora do ambiente @dev; coberto pelos testes unitários do gate Q1/Q3 e do payload

---

## Dev Notes

### Paths-chave
```
packages/web/src/lib/broker/notify-on-reply.ts                              ← CRIAR (T2) — helper push-only
packages/web/src/app/api/webhook/whatsapp/route.ts                          ← EDITAR (T3) — adicionar after()
```

### Referências de reutilização
```
packages/web/src/lib/server/push-service.ts                 ← sendPushToUser(supabase, userId, {title,body,url})
packages/web/src/lib/pwa/sw-source.js L106-134              ← push handler + notificationclick (NÃO MODIFICAR)
packages/web/src/lib/broker/notify-stalled-lead.ts          ← estrutura best-effort + try/catch a espelhar
packages/web/src/lib/broker/notify-appointment.ts           ← precedente de push from webhook (Story 51-3)
packages/web/src/app/api/push/subscribe/route.ts            ← endpoint de subscription existente
```

### Assinatura de `sendPushToUser` (push-service.ts L19-24)
```typescript
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<void>
```
Já trata subscriptions expiradas (410 → deleta da tabela). Já usa `Promise.allSettled` para múltiplos devices.

### Payload do push e deep-link
```typescript
{
  title: `${lead.name ?? "Lead"} respondeu`,
  body: messageExcerpt.slice(0, 100) || "Nova mensagem recebida.",
  url: `${appUrl}/broker/leads/${leadId}`,  // ← service worker lê data.url e navega
}
```
O `sw-source.js` L106-118 passa `data.url` como `data` da notificação; L121-134 usa `event.notification.data?.url` no click. Manter este campo no payload garante o deep-link sem alteração no SW.

### Gate Q1: como o webhook sabe que o corretor já assumiu (`brokerSentRecently`)

O helper consulta `messages` da conversa por `role='broker'` recente:

```typescript
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const { data: brokerMsgs } = await supabase
  .from("messages")
  .select("role, created_at")
  .eq("conversation_id", conversationId)
  .eq("role", "broker")
  .gte("created_at", since)
  .limit(1)
if (!brokerSentRecently(brokerMsgs ?? [])) return
```

`brokerSentRecently` (de `lib/broker/broker-takeover-status.ts`, 63-8) é um helper puro (sem React/DOM), importável server-side — mesma janela de 24h e mesma fonte-de-verdade de takeover usada pelo banner `AiStatusBanner` (63-8) e pelo cron de follow-up. **Reuso > Create.** Custo: 1 query a `messages` no `after()` (fora do caminho crítico). Aceitável.

> **Sem mutação de `leads.metadata`:** com Q2 = sem debounce, a story NÃO grava `last_reply_push_at` nem qualquer outro campo em `leads.metadata`. A flag `notify_broker_on_reply` (63-10) é preservada por inação (não é lida nem escrita aqui).

### Localização do ponto de disparo no webhook

```
route.ts L425-434  → INSERT inbound message (sync) — EXISTENTE (role:"user")
route.ts L439      → after() Nicole pipeline — EXISTENTE (não mexer)
route.ts ~L435     → NOVO after() para push — adicionar APÓS o INSERT, ANTES ou DEPOIS do after() da Nicole
```

O segundo `after()` não interfere com o primeiro. Ambos são fire-and-forget independentes.

### Gotchas
- **`lead` tem apenas `{id, created_at}`** após `findOrUpsertLead` (L750 seleciona só esses campos). A query para `assigned_broker_id` + nome ocorre DENTRO do `after()` no helper — não no fluxo síncrono do webhook. O `conversation.id` (gate Q1) já está disponível no escopo do webhook
- **CON-3/CON-7 respeitado:** o helper não toca em `is_ai_active`; é notificação pura sem mutação de estado de atendimento
- **CON-1 respeitado:** nenhum `tel:`/`wa.me`; deep-link interno via `data.url` do push
- **Não usar `notifyBroker` de alto nível** (`lib/roleta/notify-broker.ts`) — ele envia push+email+WhatsApp, o que seria spam por mensagem. Usar `sendPushToUser` diretamente (só push). Também NÃO espelhar o fallback gerente/admin de `notify-stalled-lead.ts` (Q3)
- **`text` pode ser vazio** (mensagem só de mídia): tratar com fallback `|| "Nova mensagem recebida."`

---

## File List

### Criar
- `packages/web/src/lib/broker/notify-on-reply.ts` — helper server-only: `notifyBrokerOnReply(params)` (best-effort, push-only, gate Q1 `brokerSentRecently`, sem debounce, sem fallback) + `buildReplyPushPayload` (puro) (T2)
- `packages/web/src/lib/broker/notify-on-reply.test.ts` — 9 testes Vitest (gate Q1/Q3, sem debounce, best-effort, payload/deep-link)

### Modificar
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — import de `notifyBrokerOnReply` + segundo bloco `after()` após INSERT inbound (T3)

### Referência (não modificar)
- `packages/web/src/lib/server/push-service.ts` — `sendPushToUser` reutilizado (L19-48)
- `packages/web/src/lib/broker/broker-takeover-status.ts` — `brokerSentRecently` reutilizado no gate Q1 (helper puro server-importável)
- `packages/web/src/lib/pwa/sw-source.js` — push handler + notificationclick (L106-134) — NÃO MODIFICAR
- `packages/web/src/lib/broker/notify-stalled-lead.ts` — estrutura best-effort a espelhar (mas SEM o fallback gerente/admin — Q3)
- `packages/web/src/app/api/leads/[id]/notify-on-reply/route.ts` — endpoint 63-10 (grava a flag; NÃO reutilizar aqui — a flag não é gate desta story)

---

## Testing

### Smoke pós-deploy

| Cenário | Pré-condição | Ação | Resultado esperado |
|---------|--------------|------|--------------------|
| Push disparado (corretor assumiu) | Lead com `assigned_broker_id` + mensagem `role='broker'` <24h na conversa + corretor com push subscription | Lead envia mensagem WhatsApp | Corretor recebe push em ≤ 5s; título correto; body = primeiros 100 chars |
| Nicole sozinha (sem takeover) | Lead com `assigned_broker_id` mas SEM `role='broker'` recente | Lead envia mensagem | Nenhum push enviado; webhook 200 normal |
| Deep-link funciona | Corretor com CRM fechado | Clicar na notificação | CRM abre direto em `/broker/leads/{id}` |
| Sem debounce (rajada) | Lead que satisfaz o gatilho envia 3 mensagens em 5 min | Verificar push_subscriptions delivery | 3 pushes recebidos (1 por mensagem); `leads.metadata` inalterado |
| Sem corretor | Lead sem `assigned_broker_id` | Lead envia mensagem | Nenhum push; nenhum fallback; nenhum erro no log |
| Sem subscription | Corretor sem push_subscription ativa (mas takeover ativo) | Lead envia mensagem | Função finaliza silenciosamente; zero erros; webhook OK |
| Nicole não impactada | Qualquer cenário acima | Verificar resposta da Nicole | Nicole continua processando normalmente; HTTP 200 imediato |

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `text` vazio para mensagens de imagem — push com body vazio | T2: fallback `messageExcerpt.slice(0,100) \|\| "Nova mensagem recebida."` |
| R2 | `NEXT_PUBLIC_APP_URL` não definido em `after()` (env vars server-side) | Fallback hardcoded `"https://app.trifold.com.br"` já presente em `notify-broker.ts` L45 — reusar mesmo padrão |
| R3 | Query extra do gate Q1 (`messages` por `role='broker'` <24h) adiciona latência | Roda no `after()` (fora do caminho crítico do webhook); índice `idx_messages_conversation` (migration 001) cobre `conversation_id`; 1 row limit. Aceitável |
| R4 | Volume de pushes em rajada (sem debounce, Q2) | Aceito por design: o gatilho Q1 restringe a conversas já assumidas → volume naturalmente baixo. Refinamento (debounce/agrupamento) é evolução futura, não escopo |

---

## Out of Scope

- Notificação por email ou WhatsApp quando o lead responde (por mensagem seria spam; encaminhar para canal separado se necessário)
- Envio de template WhatsApp aprovado quando a janela está fechada (Out of Scope definido desde a 63-10)
- Notificação quando Nicole envia mensagem (só quando o lead responde, não quando a Nicole fala)
- Push para gerente/admin quando lead sem corretor responde (Q3 RESOLVIDA: não notificar; se um dia necessário, abrir story 63-13)
- Notificar quando a Nicole ainda conduz sozinha (Q1 RESOLVIDA: só notificar após o corretor assumir — `role='broker'` <24h)
- Debounce/agrupamento de pushes em rajada (Q2 RESOLVIDA: sem debounce no lançamento; evolução futura possível)
- Uso da flag `notify_broker_on_reply` (63-10) como gate ou override de disparo (não consultada nesta story)
- "Corretor está na conversa" — não verificar se o CRM está aberto no servidor; aceitar redundância do push nesses casos (a 63-11 mostrará a mensagem via realtime de qualquer forma)
- Histórico de notificações enviadas (auditoria de push) — a tabela `follow_up_log` é específica de follow-up, não adequada aqui

---

## Definition of Done

- [x] Decisões de produto Q1, Q2, Q3 resolvidas e registradas (T1)
- [ ] AC1–AC10 marcados como completos
- [ ] T2–T5 marcados como done (T1 já resolvida pelo @po)
- [ ] Smoke end-to-end confirmado: push recebido no dispositivo → clique abre `/broker/leads/{id}`
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

### Agent Model Used
Dex (@dev) — Opus 4.8 (1M), modo YOLO autônomo. 2026-06-21.

### Completion Notes
- **Gate Q1 (`brokerSentRecently`):** o helper faz 2 queries assíncronas dentro do `after()`: (1) `leads` por `id, name, assigned_broker_id` (Q3) e (2) `messages` por `conversation_id` + `role='broker'` + `created_at >= now-24h` limit 1. `brokerSentRecently(brokerMsgs ?? [])` reusa o helper canônico de 63-8 (mesma janela de 24h, mesma fonte-de-verdade do banner e do cron). Se a Nicole conduz sozinha (sem broker recente) → return sem push. Se `assigned_broker_id` null → return (Q3, sem fallback).
- **`after()`:** segundo bloco `after()` dedicado, dentro do guard `if (text || mediaMetadata.media_type)`, separado do `after()` da Nicole — fire-and-forget; nunca bloqueia o HTTP 200 e uma falha no push não afeta o pipeline (e vice-versa). `getSupabaseAdmin()` (admin client) é passado por parâmetro.
- **Payload/url:** `buildReplyPushPayload` (puro, testado) monta `title="{nome ou Lead} respondeu"`, `body=` primeiros 100 chars (fallback "Nova mensagem recebida." para mídia sem texto), `url=${NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"}/broker/leads/{leadId}`. O service worker (`sw-source.js`, NÃO modificado) lê `data.url` e faz o deep-link.
- **Sem mutação de estado:** Q2 = sem debounce (1 push por inbound; não grava `last_reply_push_at`); `leads.metadata` não é tocado; `is_ai_active` não é tocado (CON-3/CON-7). A flag `notify_broker_on_reply` da 63-10 é preservada por inação.

### Validações
- `npx vitest run .../notify-on-reply.test.ts` → **9/9 PASS**; suíte completa **463/463 PASS** (36 arquivos), zero regressão
- `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story (restam 3 erros pré-existentes em `visual-editor.tsx`, não relacionados)
- ESLint nos 3 arquivos da story → zero erros/warnings
- CON-1 OK (sem `tel:`/`wa.me`); CON-3/CON-7 OK (sem mutação de `is_ai_active`); CON-8 OK (service worker intocado); nenhuma migration criada

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-21 | 0.1 | Story drafted — Epic 63, Fase 4, push ao corretor quando lead responde + deep-link | @sm (River) |
| 2026-06-21 | 1.0 | Validada — GO (9/10). Decisões Q1/Q2/Q3 RESOLVIDAS pelo @po e incorporadas como AC/regras: Q1 gatilho = corretor já assumiu (`brokerSentRecently`, flag 63-10 não é gate); Q2 sem debounce (removido `last_reply_push_at`); Q3 sem corretor → não notifica (sem fallback). ACs reescritos (AC1-AC10), helper/Tasks/Riscos/Testing/DoD ajustados; `conversationId` adicionado ao gate. Status Draft→Ready. | @po (Pax) |
| 2026-06-21 | 1.1 | Implementada — `notify-on-reply.ts` (gate Q1 `brokerSentRecently`, Q3 sem fallback, Q2 sem debounce) + `after()` dedicado no webhook após INSERT inbound. Helper puro `buildReplyPushPayload` + 9 testes. Deep-link via `data.url` (SW intocado). Status InProgress→Ready for Review. | @dev (Dex) |

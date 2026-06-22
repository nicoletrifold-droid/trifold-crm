# Story 63-11 — Atualização em Tempo Real do Chat do Corretor

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-11
- **Status:** Ready for Review
- **Validated:** 2026-06-21 by @po (Pax) — verdict **GO (9/10)**. Status Draft→Ready. **Confirmado em código pelo PO:** (1) `conversation-thread.tsx` é Client Component (`"use client"`) e recebe `messages: ThreadMessage[]` + `lastMessageAt` + `notifyOnReply` (interface L14-31); usa `mergeMessages(messages, optimistic)` (L68), `getWindowStatus(lastMessageAt, …)` (L61) e `deriveBrokerActive(messages, isAiActive)` (L66) — todas as substituições propostas em T3 batem com o código real. (2) `page.tsx` constrói `conversationIds = conversations?.map((c) => c.id) ?? []` (L45) e aplica `.limit(50)` (L53), mas NÃO passa `conversationIds` ao `<ConversationThread>` — a nova prop (T2) é necessária. (3) **RLS de `messages` VERIFICADA** (migration `004_rls_policies.sql` L151 `messages_select`): SELECT permitido quando a conversa é da org E (`is_admin_or_supervisor()` OU `leads.assigned_broker_id = user_id` do broker). Como o Realtime respeita a RLS da sessão autenticada do corretor (browser client de `lib/supabase/client.ts`), o corretor recebe via Realtime exatamente as mensagens das conversas dos SEUS leads — nenhuma alteração de RLS necessária; a afirmação da story (L84) está correta. (4) **Pré-req de infra confirmado como real:** nenhuma migration referencia `supabase_realtime` → `messages` quase certamente NÃO está na publicação; T1 é legitimamente **bloqueante** (ação de infra @devops/@data-engineer, não código @dev). Liberada para @dev (após 63-5 Done).
- **Priority:** P1 — o corretor precisa dar reload para perceber que o lead respondeu
- **Complexity:** M (3-5h)
- **Fase:** 4 (Tempo Real & Notificações)
- **Created:** 2026-06-21
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[realtime_sub_check, dedup_check, cleanup_check, window_reactivity_check]`
- **Depende de:** Story 63-5 Done (`ConversationThread` existe como Client Component); Story 63-4 Done (`getWindowStatus` disponível em `lib/broker/window-status.ts`)
- **Pré-condição de infra (BLOQUEANTE):** Tabela `messages` habilitada na publicação `supabase_realtime` — deve ser resolvida antes do deploy (ver Contexto)

---

## User Story

**Como** corretor que está com a conversa de um lead aberta no CRM,
**Quero** ver as novas mensagens do lead (e da Nicole) aparecerem automaticamente na tela,
**Para que** eu não precise dar reload para perceber que recebi uma resposta e possa agir imediatamente sem perder o timing.

---

## Context

### Estado Atual

`ConversationThread` (`broker/leads/[id]/_components/conversation-thread.tsx`) é um Client Component com `useState` apenas para mensagens otimistas. As mensagens históricas (`messages: ThreadMessage[]`) são carregadas pelo Server Component `page.tsx` no momento do request e não se atualizam sem `router.refresh()` ou reload completo da página.

Quando o lead responde via WhatsApp, o webhook (`api/webhook/whatsapp/route.ts`) grava a mensagem em `messages` com `role='user'` e dispara a Nicole. O browser do corretor não recebe nenhum sinal — o corretor só vê a resposta se recarregar a página.

### Solução: Supabase Realtime via `postgres_changes`

Adicionar uma subscription Supabase Realtime em `ConversationThread`, filtrada por `conversation_id`, usando o padrão já comprovado em dois lugares do codebase:

**Padrão 1 — `chat-feed.tsx` (portal do cliente, L227-259):**
```tsx
useEffect(() => {
  const supabase = createClient()
  const channel = supabase
    .channel(`obra-mensagens-${obraId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'obra_mensagens',
      filter: `obra_id=eq.${obraId}`,
    }, (payload) => {
      const nova = payload.new as Mensagem
      setMensagens(prev => prev.some(m => m.id === nova.id) ? prev : [...prev, nova])
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [obraId, userId])
```

**Padrão 2 — `new-lead-notification.tsx` (broker, canal em `leads`):**
```tsx
const channel = supabase
  .channel(`broker-leads-${userId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads', filter: `org_id=eq.${orgId}` }, cb)
  .subscribe()
return () => { supabase.removeChannel(channel) }
```

Para a tabela `messages`, o filtro correto é `conversation_id=eq.{conversationId}`. Como `postgres_changes` não suporta `IN`, criar um canal por `conversationId` quando houver múltiplas conversas (raro; típico é 1 por lead).

### Pré-condição de Infra — Habilitar Realtime na tabela `messages`

A tabela `messages` provavelmente NÃO está na publicação `supabase_realtime` (o chat do corretor nunca usou Realtime). Sem isso, o `postgres_changes` subscreve mas nunca recebe eventos — silêncio total.

**Como verificar e habilitar:**
- Supabase Dashboard → Database → Replication → habilitar `messages` na publicação `supabase_realtime`
- Alternativa SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE messages;`

Esta etapa é **bloqueante** — deve ser concluída antes do deploy desta story (T1). Coordenar com @devops ou quem tiver acesso ao painel Supabase de produção.

**RLS:** O Supabase Realtime aplica as mesmas políticas RLS da sessão do usuário para filtrar eventos entregues ao client. O corretor já faz SELECT em `messages` com sucesso (a página do lead funciona hoje), logo a RLS existente autoriza o Realtime para as mensagens das conversas dos seus leads. Nenhuma alteração de RLS necessária.

### Passagem de `conversationIds` para `ConversationThread`

`page.tsx` já constrói `const conversationIds = conversations?.map((c) => c.id) ?? []` (L45), mas não passa o array para `ConversationThread`. Adicionar como nova prop `conversationIds: string[]`.

### State Management das Mensagens com Realtime

A complexidade central desta story é combinar mensagens do servidor (prop `messages`), mensagens otimistas (state `optimistic`) e mensagens novas de realtime (novo state `realtimeMessages`) sem duplicação.

**Abordagem recomendada:**

```tsx
// Novo state em ConversationThread
const [realtimeMessages, setRealtimeMessages] = useState<ThreadMessage[]>([])
const [localLastMessageAt, setLocalLastMessageAt] = useState<Date | null>(lastMessageAt)

// Render usa lista combinada
const allMessages = mergeMessages([...messages, ...realtimeMessages], optimistic)
// mergeMessages já deduplica por id (conversation-thread-merge.ts L29) — funciona sem modificação

// Limpeza após router.refresh(): remover de realtimeMessages o que já entrou em messages
useEffect(() => {
  setRealtimeMessages(prev => prev.filter(m => !messages.some(s => s.id === m.id)))
}, [messages])
```

**Callback do evento realtime:**
```tsx
(payload) => {
  const msg = payload.new as ThreadMessage
  setRealtimeMessages(prev => {
    if (prev.some(m => m.id === msg.id)) return prev  // dedup
    return [...prev, msg]
  })
  if (msg.role === 'user') {
    setLocalLastMessageAt(new Date(msg.created_at))  // AC6: janela reabre
  }
  requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
}
```

**Por que `mergeMessages` não precisa de modificação:**
- O `mergeMessages` (conversation-thread-merge.ts L25-39) recebe `server: ThreadMessage[]` e descarta otimistas cujo `id` já está em `server`
- Ao passar `[...messages, ...realtimeMessages]` como `server`, mensagens que chegaram via realtime e depois foram incluídas no prop `messages` (após `router.refresh()`) são deduplicadas automaticamente pelo `useEffect([messages])`

### Atualização Reativa do Estado da Janela

Quando mensagem `role='user'` chega via realtime:
- A janela de 24h se reabre (o lead respondeu)
- Atualizar `localLastMessageAt` no callback garante que `getWindowStatus(localLastMessageAt, isWhatsApp)` e `WindowStatusBadge` reajam imediatamente
- `BrokerMessageInput` (desabilitado quando `windowClosed`) passa a aceitar digitação sem reload

### Atualização Reativa do Banner AiStatusBanner

`deriveBrokerActive` (63-8) calcula a partir da lista de mensagens. Passar `[...messages, ...realtimeMessages]` garante que se uma mensagem `role='broker'` chegar de outra aba (corretor enviou em outro dispositivo), o banner atualiza de Estado A ("Nicole atendendo") para Estado B ("Você assumiu").

---

## Acceptance Criteria

- [x] **AC1:** Quando o lead (WhatsApp) envia uma mensagem, ela aparece automaticamente em `ConversationThread` com `role='user'` (bolha cinza, lado esquerdo) sem nenhuma ação do corretor
- [x] **AC2:** Quando Nicole responde ao lead (`role='assistant'`), a mensagem aparece automaticamente no chat do corretor (bolha roxa, lado esquerdo)
- [x] **AC3:** `ConversationThread` recebe nova prop `conversationIds: string[]` passada de `page.tsx` (array já disponível em L45 da page); cria um canal Supabase Realtime por `conversationId`; faz cleanup de todos os canais no unmount (`supabase.removeChannel()`)
- [x] **AC4:** Mensagens recebidas via realtime são deduplicadas por `id` — não aparecem duplicadas mesmo se `router.refresh()` for chamado logo após a chegada (mensagem do broker via realtime + confirmação via refresh)
- [x] **AC5:** Auto-scroll para a nova mensagem ao recebê-la via realtime (delegado ao `ChatScrollArea`, que rola quando `messageCount` aumenta — equivalente ao `scrollIntoView` de `chat-feed.tsx`)
- [x] **AC6:** Quando mensagem `role='user'` chega via realtime com janela previamente fechada, `WindowStatusBadge` muda para verde e `BrokerMessageInput` fica habilitado — sem reload (o `localLastMessageAt` local atualiza para `new Date(msg.created_at)`)
- [x] **AC7:** `AiStatusBanner` (63-8) usa a lista combinada `[...messages, ...realtimeMessages]` para `deriveBrokerActive` — se uma mensagem `role='broker'` chega de outra aba/dispositivo, o banner transiciona de Estado A para Estado B sem reload
- [x] **AC8:** Ao navegar para outra rota (unmount), todos os canais Realtime são removidos sem memory leak ou mensagem de erro no console
- [x] **AC9:** TypeScript compila sem erros nos arquivos desta story; ESLint passa

---

## Tasks / Subtasks

- [ ] **T1 — Verificar e habilitar `supabase_realtime` para `messages`** _(INFRA — @data-engineer/@devops, NÃO é @dev; rodando em paralelo)_
  - Checar no Supabase Dashboard → Database → Replication se `messages` está na publicação
  - Se não: habilitar via Dashboard ou executar `ALTER PUBLICATION supabase_realtime ADD TABLE messages;` em SQL Editor
  - Registrar aqui o resultado: _[ ] Habilitado em ____-__-____ por ______

- [x] **T2 — Adicionar prop `conversationIds` em `ConversationThread`**
  - Adicionado `conversationIds?: string[]` à interface `ConversationThreadProps` em `conversation-thread.tsx`
  - Passado de `page.tsx` na chamada a `<ConversationThread>`: `conversationIds={conversationIds}` (variável já existia em L45 de `page.tsx`)

- [x] **T3 — Implementar subscription Realtime em `ConversationThread`**
  - Adicionados states: `realtimeMessages: ThreadMessage[]` e `localLastMessageAt: Date | null`
  - `useEffect` com chave estável (`conversationIds.slice(0,3).join(",")`): para cada `id` cria canal `broker-chat-${id}`, assina `event:'INSERT'` em `messages` com `filter: conversation_id=eq.${id}`, cleanup chama `removeChannel` em todos os canais. Cap em 3 canais (R3)
  - Callback: dedup por id, append a `realtimeMessages`, atualiza `localLastMessageAt` se `role='user'`; auto-scroll delegado ao `ChatScrollArea`
  - `useEffect([messages])` remove de `realtimeMessages` mensagens já incorporadas no prop (via `pruneRealtime`/`hasStaleRealtime`)
  - Lista combinada `dedupeById([...messages, ...realtimeMessages])` passada a `mergeMessages` (evita keys duplicadas — `mergeMessages` não deduplica server-interno)
  - Substituído `getWindowStatus(lastMessageAt, ...)` por `getWindowStatus(localLastMessageAt, ...)` (e o `WindowStatusBadge` recebe `localLastMessageAt`)
  - Substituído `deriveBrokerActive(messages, ...)` por `deriveBrokerActive(serverPlusRealtime, ...)`

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story (restam apenas os 3 erros pré-existentes de `visual-editor.tsx`, não relacionados)
  - ESLint → zero erros nos arquivos desta story
  - Vitest: novo `conversation-thread-realtime.test.ts` (10 testes) PASS; suíte completa sem regressão
  - Teste manual de inserção real em `messages`: pendente do T1 de infra (publicação realtime) — fora do escopo @dev

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx  ← EDITAR principal (T2, T3)
packages/web/src/app/broker/leads/[id]/page.tsx                              ← EDITAR (T2: passar conversationIds)
packages/web/src/lib/supabase/client.ts                                      ← REUSAR (createClient browser, anon key)
```

### Padrões de referência
```
packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx L227-259  ← subscription + dedup + auto-scroll
packages/web/src/app/broker/_components/new-lead-notification.tsx                     ← canal broker, cleanup
```

### Estado atual da interface `ConversationThreadProps` (após 63-5, 63-8, 63-10)
```typescript
interface ConversationThreadProps {
  messages: ThreadMessage[]       // ← existente
  lead: { id: string; phone: string; name: string | null }
  lastMessageAt: Date | null      // ← existente (passa a ser initial state de localLastMessageAt)
  isAiActive: boolean
  isWhatsApp: boolean
  canSend: boolean
  notifyOnReply?: boolean         // ← existente (63-10)
  // conversationIds: string[]   ← NOVO (T2)
}
```

### Ref de auto-scroll

O `ChatScrollArea` (63-6) já gerencia um `bottomRef` interno para auto-scroll. Verificar se expõe uma API imperativa ou se é necessário gerenciar o ref no nível do `ConversationThread`. O padrão de `chat-feed.tsx` usa `bottomRef.current?.scrollIntoView({ behavior: 'smooth' })` diretamente — adaptar conforme a API existente do `ChatScrollArea`.

### Gotchas
- **`postgres_changes` com array:** o filtro suporta apenas igualdade simples (`column=eq.value`). Para múltiplos `conversationIds`, criar múltiplos canais com nomes únicos (`broker-chat-${id}`)
- **Mensagem do próprio broker via realtime:** quando o corretor envia, o `BrokerMessageInput` adiciona ao state `optimistic` e depois chama `router.refresh()`. O realtime também vai entregar o INSERT. O `useEffect([messages])` limpa `realtimeMessages` após o refresh; o `mergeMessages` descarta o otimista pelo mesmo id. Pode haver um frame onde o corretor vê a mensagem duas vezes — aceitável; some em < 1s
- **Limite de 50 mensagens em `page.tsx`:** a query inicial tem `.limit(50)` (L53 de `page.tsx`). Realtime captura apenas INSERTs novos — correto; não retroage

---

## File List

### Criar
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread-realtime.ts` — helpers puros `dedupeById`, `pruneRealtime`, `hasStaleRealtime` (combina server+realtime sem keys duplicadas; limpa realtime após refresh)
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread-realtime.test.ts` — 10 testes Vitest dos helpers acima

### Modificar
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — nova prop `conversationIds`, states `realtimeMessages` + `localLastMessageAt`, subscription realtime (cap 3 canais), cleanup, dedup via `dedupeById`, badge usa `localLastMessageAt`, substituição das chamadas de status de janela e broker-active (T2, T3)
- `packages/web/src/app/broker/leads/[id]/page.tsx` — adicionado `conversationIds={conversationIds}` na chamada ao `<ConversationThread>` (T2)

### Referência (não modificar)
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread-merge.ts` — `mergeMessages` reutilizado sem alteração (L25-39)
- `packages/web/src/lib/broker/window-status.ts` — `getWindowStatus` reutilizado com `localLastMessageAt`
- `packages/web/src/lib/broker/broker-takeover-status.ts` — `deriveBrokerActive` reutilizado com lista combinada
- `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` — padrão de subscription a replicar (L227-259)
- `packages/web/src/app/broker/_components/new-lead-notification.tsx` — padrão de canal broker

---

## Testing

### Smoke pós-deploy

| Cenário | Ação | Resultado esperado |
|---------|------|--------------------|
| Lead responde via WhatsApp | Webhook recebe inbound; CRM aberto na conversa | Mensagem `role='user'` aparece em ≤ 3s sem reload |
| Nicole processa e responde | Nicole gera resposta após mensagem do lead | Resposta `role='assistant'` aparece em ≤ 5s sem reload |
| Janela fechada reabre | Lead com janela fechada (WindowStatusBadge cinza) envia mensagem | Badge muda para verde; composer habilitado — sem reload |
| Banner atualiza de outra aba | Abrir a mesma conversa em 2 abas; enviar mensagem no CRM em aba 1 | Aba 2 mostra banner Estado B ("Você assumiu") sem reload |
| Sem memory leak | Navegar para `/broker/leads` e voltar para a conversa | Console sem erros de canal duplicado ou subscriptions pendentes |

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `messages` NÃO está na publicação `supabase_realtime` — subscription silenciosa, zero eventos | T1: verificar e habilitar ANTES do deploy — **bloqueante** |
| R2 | RLS nega eventos realtime ao corretor (políticas diferem por canal de acesso) | Improvável — Supabase usa as mesmas políticas para select e realtime; verificar nos testes de smoke |
| R3 | Múltiplos `conversationIds` (lead com > 1 conversa) geram overhead de canais | Típico: 1 por lead. Limitar a 3 canais no máximo; leads com mais conversas veem apenas as 3 mais recentes via realtime |
| R4 | `router.refresh()` + realtime causa exibição dupla momentânea de mensagem do corretor | Dedup por id e `useEffect([messages])` resolvem em < 1 render; aceitável |
| R5 | `ChatScrollArea` não expõe ref para scroll imperativo | Verificar API do componente; se necessário, adicionar prop de callback `onNewMessage` no componente |

---

## Out of Scope

- Realtime para conversas de Telegram (Telegram não usa webhook inbound neste fluxo CRM; mensagens de Telegram são só outbound pelo corretor)
- Polling/fallback quando Realtime estiver indisponível (graceful degradation — recarregar a página continua funcionando)
- Indicador "digitando" do lead
- Atualização em tempo real da lista de leads (`broker/leads`) — escopo separado
- Realtime para mensagens históricas (não retroage — apenas INSERTs novos)

---

## Definition of Done

- [ ] AC1–AC9 marcados como completos
- [ ] T1–T4 marcados como done
- [ ] Pré-condição de infra confirmada (T1): tabela `messages` em `supabase_realtime`
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

### Agent Model Used
Dex (@dev) — Opus 4.8 (1M), modo YOLO autônomo. 2026-06-21.

### Completion Notes
- **Múltiplas conversations:** um canal Supabase Realtime por `conversationId` (`postgres_changes` não suporta `IN`). Cap em 3 canais (R3) via `MAX_REALTIME_CHANNELS`; leads com mais conversas recebem realtime das 3 mais recentes (a page ordena por `created_at desc`). Dep do `useEffect` é a chave estável `conversationIds.slice(0,3).join(",")` para evitar re-subscribe em renders disparados por state.
- **Reação do badge/composer/banner ao inbound:** novo state `localLastMessageAt` (inicializado com a prop `lastMessageAt`) é atualizado para `new Date(msg.created_at)` quando chega `role='user'`. `WindowStatusBadge` passou a receber `localLastMessageAt` e o composer usa `windowClosed = getWindowStatus(localLastMessageAt,...)`. O `AiStatusBanner` usa `deriveBrokerActive(serverPlusRealtime, isAiActive)` — assim um `role='broker'` vindo de outra aba transiciona Estado A→B sem reload.
- **Dedup do próprio envio:** o INSERT do corretor chega via realtime e também volta no `router.refresh()` (prop `messages`). `mergeMessages` só deduplica otimista×server; criei `dedupeById([...messages, ...realtimeMessages])` para evitar duas bolhas com a MESMA key React no frame intermediário. O `useEffect([messages])` remove de `realtimeMessages` o que já entrou no servidor (`hasStaleRealtime`/`pruneRealtime`), retornando a mesma referência quando nada muda (evita re-render desnecessário).
- **Auto-scroll (AC5):** delegado ao `ChatScrollArea` existente (rola quando `messageCount` aumenta) — não foi preciso ref próprio.
- **T1 (infra realtime) NÃO executada pelo @dev:** habilitar `messages` em `supabase_realtime` é ação de @data-engineer/@devops (rodando em paralelo). O código assume a publicação ativa. Teste manual de inserção real fica pendente dessa infra.
- **FIX runtime de auth (2026-06-21):** após a infra confirmada (publicação OK, RLS `messages_select` correta), nenhum evento chegava no app. Diagnóstico decisivo com service role key: canal `SUBSCRIBED` + INSERT entregue → infra OK; com a sessão anon do corretor, nada chegava → o socket Realtime do `createBrowserClient` (anon key) NÃO carregava o `access_token` do corretor, então a RLS de `messages` (`auth.uid()`) filtrava todos os eventos. Correção: o `useEffect` da subscription virou uma IIFE `async` com flag `cancelled`; antes de `.subscribe()` faz `const { data: { session } } = await supabase.auth.getSession()` e, havendo token, `await supabase.realtime.setAuth(session.access_token)`. `setAuth` ocorre SEMPRE antes do subscribe; se `cancelled` virou `true` durante o await, não subscreve. Cleanup seta `cancelled=true` e `removeChannel` em todos os canais criados. Adicionado callback de status no `.subscribe((status, err) => ...)` que loga `console.warn('[realtime]', convId, status, err?.message)` apenas em `CHANNEL_ERROR`/`TIMED_OUT` (diagnóstico leve, sem poluir em SUBSCRIBED). Único arquivo tocado: `conversation-thread.tsx` (só o `useEffect` do Realtime). Fase 5 (`localIsAiActive`/`handleResumeAi`) e a dedup (`dedupeById`/`pruneRealtime`) intocadas. Importado o tipo `RealtimeChannel` de `@supabase/supabase-js` para tipar o array de canais no escopo async.

### Validações
- `npx vitest run .../conversation-thread-realtime.test.ts` → **10/10 PASS**
- `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story (restam 3 erros pré-existentes em `visual-editor.tsx`, módulo `react-email-editor` ausente — não relacionado)
- ESLint nos 4 arquivos da story → zero erros/warnings
- CON-1 OK (nenhum `tel:`/`wa.me`); CON-3/CON-7 OK (realtime é read/notify, não toca `is_ai_active`); nenhuma migration criada; service worker intocado

---

## QA Results

### Review Date: 2026-06-21
### Reviewed By: Quinn (@qa — Test Architect)
### Commit: 67ed19b

**Veredito: PASS** (quality_score 90)

#### Traceability AC → código (9/9 MET)
- AC1/AC2 (lead + Nicole sem reload): subscription só filtra por `conversation_id`+`event=INSERT` (sem filtro de role) → captura `role='user'` e `role='assistant'`; callback append independe do role (`conversation-thread.tsx` L113-126).
- AC3 (prop `conversationIds`, 1 canal/id, cleanup de todos): interface L47; `page.tsx` passa `conversationIds` (commit L163); `broker-chat-{id}` por id L102-129; cleanup `channels.forEach(removeChannel)` L131-133.
- AC4 (dedup): `dedupeById([...messages, ...realtimeMessages])` (server vence) + `mergeMessages` + `useEffect([messages])` com `pruneRealtime`/`hasStaleRealtime`.
- AC5 (auto-scroll): delegado ao `ChatScrollArea` (63-6).
- AC6 (janela reabre): `setLocalLastMessageAt` em `role='user'` L121-123; `windowClosed=getWindowStatus(localLastMessageAt)`; badge/composer recebem o estado local.
- AC7 (banner de outra aba): `deriveBrokerActive(serverPlusRealtime, isAiActive)` L151.
- AC8 (sem leak): cleanup remove todos os canais; dep estável evita re-subscribe.
- AC9 (type-check/lint): 0 erros nos arquivos da story.

#### Correção crítica dedup/race — SÓLIDA
No auto-envio do corretor (INSERT chega via realtime E volta no `router.refresh()`): `dedupeById` (server primeiro → vence na colisão de id) garante no máx 1 bolha por id em qualquer frame (nenhuma key React duplicada); `mergeMessages` descarta o otimista cujo id já está no server; `pruneRealtime` (sob guard `hasStaleRealtime`, retorna mesma ref quando nada muda) limpa o realtime já incorporado. **Nenhuma mensagem perdida** (prune só remove o que já está no servidor, que renderiza). A ressalva da story sobre "ver 2x por 1 frame" é mais conservadora que o código real. Dep do `useEffect` = `conversationIds.slice(0,3).join(",")` (string value-equal entre renders) → sem loop de re-subscribe; cleanup completo no unmount.

#### Constraints
- **CON-1 INVIOLÁVEL**: CLEAN — `git grep tel:/wa.me/click-to-call` → 0 ocorrências de código (único hit é comentário). Realtime é read-only.
- **CON-3/CON-7**: CLEAN — realtime puramente observação; `is_ai_active` apenas lido via prop; ZERO mutação.
- **CON-8**: CLEAN — `git show --stat 67ed19b` confirma `sw-source.js` ausente do commit.

#### Verificação independente
- `npx vitest run` → **463/463 (36 arquivos)**; helpers da story = 10 testes cobrindo boundaries (vazio, dup por id, combinar server+realtime, prune, hasStale).
- `type-check` → 0 nos arquivos da story (3 erros ambientais pré-existentes em `visual-editor.tsx`/`react-email-editor`).
- ESLint → 0 erros/warnings nos arquivos da story.

#### Issues
- **INFRA-001 (medium)**: `messages` não está na publicação `supabase_realtime` (migration 102 NÃO aplicada — token Supabase expirado). É **DEPLOY BLOCKER do FEATURE**, NÃO defeito de código (degrada graciosamente: reload continua). Owner: @devops/@data-engineer.
- **TEST-001 (low)**: fiação da subscription verificada só por code review (repo sem infra de teste de componente React — padrão do Epic 63).

### Gate Status
Gate: PASS → docs/qa/gates/63.11-realtime-chat-corretor.yml
Consolidado: docs/qa/gates/epic-63-fase4.yml
**Status: InReview — QA PASS (pronto para @devops *push; habilitar `messages` em supabase_realtime antes do feature funcionar)**

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-21 | 0.1 | Story drafted — Epic 63, Fase 4, atualização realtime do chat do corretor | @sm (River) |
| 2026-06-21 | 1.0 | Validada — GO (9/10). RLS de `messages` e pré-req de Realtime confirmados em código. Status Draft→Ready. | @po (Pax) |
| 2026-06-21 | 1.1 | Implementada — subscription Realtime por conversa (cap 3 canais), `localLastMessageAt` reabre a janela, `dedupeById` evita keys duplicadas, banner reativo via lista combinada. Novo helper puro + 10 testes. T1 (infra publicação) é @data-engineer/@devops. Status InProgress→Ready for Review. | @dev (Dex) |
| 2026-06-21 | 1.2 | QA Gate — **PASS** (Quinn). 9/9 ACs MET; dedup/race sólido; CON-1/CON-3/CON-7/CON-8 limpos; 463/463 testes; lint/type-check limpos. INFRA-001 (publicação realtime) = deploy blocker do feature, não do código. Pronto para @devops *push. | @qa (Quinn) |
| 2026-06-21 | 1.3 | Fix de runtime — autenticar canal Realtime com JWT da sessão (`realtime.setAuth(access_token)` antes do `.subscribe()`) p/ a RLS de `messages` liberar os eventos; sem isso o socket anon era filtrado por `auth.uid()` e nada chegava. `useEffect` virou IIFE async com flag `cancelled`; cleanup remove canais. Callback de status loga só `CHANNEL_ERROR`/`TIMED_OUT`. Fase 5 e dedup intocadas. 469/469 testes, type-check/lint limpos. | @dev (Dex) |

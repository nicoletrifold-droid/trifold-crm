# Story 63-20 — Realtime da Lista: Inbox Atualiza ao Vivo

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-20
- **Status:** Draft
- **Priority:** P2 — melhoria de UX; inbox funciona sem realtime (com reload manual)
- **Complexity:** M (3-5h @dev) + S (@data-engineer migration)
- **Fase:** 6 (Caixa de Entrada de Conversas)
- **Leva:** Segunda (pode esperar Primeira Leva estar em produção)
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @qa.

### Executor Assignment
- **Executor Principal (migration SQL):** @data-engineer (Dara)
- **Executor Secundário (código TS no inbox):** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[realtime_events_check, dedup_check, badge_increment_check, ts_typecheck]`
- **Depende de:** 63-17 Done (inbox `/broker/chat` existe); 63-16 Done (`broker_last_read_at` e `countUnreadForLead`); 63-19 Done (badge já existe na nav)
- **Pré-condição de infra (BLOQUEANTE):** `conversations` adicionada à publicação `supabase_realtime` — migration 105

---

## User Story

**Como** corretor com a inbox de conversas aberta no celular,
**Quero** que a lista se atualize automaticamente quando um lead me responde,
**Para que** o lead que respondeu suba ao topo e o badge mostre o número correto sem eu precisar puxar para recarregar.

---

## Context

### Estado Atual

A inbox `/broker/chat` é um Server Component: carrega os dados no request e não atualiza sem reload. Quando o lead responde, o trigger `trg_messages_update_conv` (mig 038) atualiza `conversations.last_message_at`, `last_message_preview` e `last_message_role` — mas o browser não recebe essa atualização.

### Pré-condição de Infra — Migration 105

A publicação `supabase_realtime` atualmente contém `public.messages` (adicionado na mig 102). A tabela `conversations` NÃO está na publicação — adicionar é pré-requisito. Sem isso, o `postgres_changes` subscribes mas nunca recebe eventos.

Migration `105_realtime_conversations.sql`:
```sql
-- 105_realtime_conversations
-- Adiciona conversations à publicação supabase_realtime (idempotente).
-- Sem isso, updates de last_message_at/preview nunca chegam ao browser.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
```

Aplicar manualmente via Supabase Management API (drift 074→104 conhecido).

### Solução: Tornar a Inbox Reativa

Converter `/broker/chat/page.tsx` num layout híbrido: o Server Component carrega dados iniciais e passa para um Client Component `InboxClient` que:
1. Mantém a lista de conversas em `useState`
2. Subscreve via `supabase.channel` a UPDATE em `conversations` filtrado por `org_id` (todos os corretores da org recebem; o filtro de "é meu lead" é feito no cliente após receber o evento)
3. Ao receber UPDATE: se `lead_id` é de um dos leads do corretor — re-sort por `last_message_at` (item sobe ao topo) + incrementa badge da conversa via `countUnreadForLead`
4. Dedup por `id` (evitar flicker)
5. Cleanup `supabase.removeChannel` no unmount

### Padrão Realtime do Projeto

Dois padrões existentes com `postgres_changes`:

**Padrão 1** — `broker/leads/[id]/_components/conversation-thread.tsx` L125-143: usa `supabase.realtime.setAuth(session.access_token)` (fix obrigatório para RLS no browser). Filtro: `conversation_id=eq.{id}`. Table: `messages`. Event: `INSERT`.

**Padrão 2** — `broker/_components/new-lead-notification.tsx` L~15-35: filtro por `org_id=eq.{orgId}`. Table: `leads`. Event: `INSERT`.

Para a inbox, o filtro em `conversations` será por `org_id` (não há filtro direto por `assigned_broker_id` em `postgres_changes` sem uma coluna desnormalizada). O client-side filtra se o lead pertence ao corretor antes de aplicar o update à lista.

### Limitação: `postgres_changes` não suporta JOIN

O evento de UPDATE em `conversations` entrega apenas as colunas de `conversations`, não o `lead.name` do join. Para atualizar o card, o cliente precisa fazer uma refetch do lead ou já ter os dados em memória. Solução: o state `conversations` na `InboxClient` já tem `lead` embutido (carregado inicialmente). Ao receber o UPDATE de uma conversa existente, atualizar apenas os campos de `conversations` (`last_message_at`, `last_message_preview`, `last_message_role`, `broker_last_read_at`) mantendo o `lead` do state anterior.

### Badge de Não-Lidas Reativo

Quando chegar um UPDATE com `last_message_role='user'` para uma conversa, incrementar o count de não-lidas localmente (sem re-fetch) se a conversa não estiver atualmente aberta. A lógica: `new created_at > broker_last_read_at` — mas o UPDATE de `conversations` não traz `created_at` das messages. Alternativa simples: ao receber UPDATE com `last_message_role='user'`, considerar que há pelo menos 1 nova msg não-lida (incrementar state local `unreadPerConv[convId] += 1`). Não precisa ser perfeito — o próximo reload sincroniza.

---

## Acceptance Criteria

- [ ] **AC1 (Migration 105 idempotente):** `supabase/migrations/105_realtime_conversations.sql` existe com o bloco `DO $$ ... IF NOT EXISTS ... ALTER PUBLICATION ... END $$` conforme Context. Aplicação manual via Management API — NÃO `supabase db push`.

- [ ] **AC2 (InboxClient recebe eventos):** A página `/broker/chat` usa um `<InboxClient>` (Client Component) que subscreve a `postgres_changes` de `UPDATE` na tabela `conversations`. Ao receber UPDATE, verifica se `lead_id` pertence a um dos leads do corretor (filtra contra o state inicial).

- [ ] **AC3 (Re-sort ao topo):** Quando uma conversa recebe UPDATE com novo `last_message_at`, ela sobe ao topo da lista (re-sort por `last_message_at desc` no state do cliente). Animação: sem transição animada (simples resort — manter performance).

- [ ] **AC4 (Badge de não-lidas incrementa):** Quando o UPDATE tem `last_message_role='user'`, o badge de não-lidas da conversa afetada incrementa em +1 no state local do cliente. O badge total da aba Chat no nav NÃO atualiza em realtime nesta story — somente na próxima navegação (SSR do layout). Isso é aceitável — realtime do badge da aba é escopo da Fase 7 ou melhoria futura.

- [ ] **AC5 (Dedup):** Múltiplos eventos de UPDATE para o mesmo `conv.id` dentro de 500ms não causam render extra (usar uma ref de throttle por `convId`).

- [ ] **AC6 (setAuth obrigatório):** `supabase.realtime.setAuth(session.access_token)` é chamado antes de `.subscribe()`, seguindo o padrão de `conversation-thread.tsx` L141-142. Sem isso, RLS bloqueia eventos no browser.

- [ ] **AC7 (Cleanup no unmount):** `useEffect` retorna `() => { supabase.removeChannel(channel) }` — sem leaks de subscription.

- [ ] **AC8 (TypeScript + ESLint):** Zero erros de type-check e lint.

---

## Tasks / Subtasks

### @data-engineer (Dara)

- [ ] **T1 — Migration 105 (AC1)**
  - [ ] Criar `supabase/migrations/105_realtime_conversations.sql`
  - [ ] Bloco `DO $$` idempotente conforme Context
  - [ ] Comunicar ao @devops para aplicação via Management API

### @dev (Dex)

- [ ] **T2 — Refatorar `/broker/chat/page.tsx` para híbrido SC+CC (AC2)**
  - [ ] Criar `packages/web/src/app/broker/chat/_components/inbox-client.tsx` (Client Component)
  - [ ] `page.tsx` passa `initialConversations`, `userId`, `orgId`, `session.access_token` para `InboxClient`
  - [ ] Obter `session.access_token`: `const { data: { session } } = await supabase.auth.getSession()` — atenção: não vazar token para o client sem ser via prop explícita (não usar variáveis globais)

- [ ] **T3 — Subscription Realtime (AC2, AC3, AC4, AC6, AC7)**
  - [ ] `useEffect` com `createClient()` (browser client de `lib/supabase/client.ts`)
  - [ ] `supabase.realtime.setAuth(accessToken)` (AC6)
  - [ ] Canal: `supabase.channel('broker-inbox-{orgId}')` (único por org; múltiplos corretores da org filtram client-side)
  - [ ] `.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `org_id=eq.${orgId}` }, handler)`
  - [ ] Handler: verificar se `payload.new.lead_id` está em `convLeadIds` (set de lead_ids do state); se sim, atualizar o estado
  - [ ] Cleanup no unmount (AC7)

- [ ] **T4 — Handler de UPDATE (AC3, AC4, AC5)**
  - [ ] Re-sort por `last_message_at desc` após update
  - [ ] Incrementar contador de não-lidas se `last_message_role='user'` (state local `unreadCounts`)
  - [ ] Throttle por `convId` para dedup (AC5)

- [ ] **T5 — Type-check + lint (AC8)**

---

## Dev Notes

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/105_realtime_conversations.sql` | CRIAR |
| `packages/web/src/app/broker/chat/_components/inbox-client.tsx` | CRIAR |
| `packages/web/src/app/broker/chat/page.tsx` | MODIFICAR (passar props para InboxClient) |

### Padrão Realtime de Referência

`broker/leads/[id]/_components/conversation-thread.tsx` L125-143 (`realtime.setAuth`):
```ts
useEffect(() => {
  const supabase = createClient()
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token)
    }
  })
  // ... subscribe
}, [])
```

Para `InboxClient`, o `accessToken` pode ser passado como prop (evitar `getSession()` dentro do client component — simplifica e evita race condition).

### Tipo do Payload de UPDATE

O evento de UPDATE entrega `payload.new` e `payload.old` — ambos do tipo `conversations` row (sem joins). As colunas disponíveis: `id, org_id, lead_id, channel, status, is_ai_active, handoff_at, handoff_reason, last_message_at, last_message_preview, last_message_role, broker_last_read_at, created_at, updated_at`.

Para o handler:
```ts
type ConvUpdate = {
  id: string
  lead_id: string
  last_message_at: string | null
  last_message_preview: string | null
  last_message_role: string | null
}

const handler = (payload: { new: ConvUpdate }) => {
  const updated = payload.new
  setConversations(prev => {
    const idx = prev.findIndex(c => c.id === updated.id)
    if (idx === -1) return prev // não é um lead deste corretor — ignorar
    const next = [...prev]
    next[idx] = { ...next[idx], ...updated }
    // Re-sort por last_message_at desc
    return next.sort((a, b) =>
      new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    )
  })
  if (payload.new.last_message_role === 'user') {
    setUnreadCounts(prev => ({
      ...prev,
      [updated.id]: (prev[updated.id] ?? 0) + 1,
    }))
  }
}
```

### Limitação Conhecida do AC4

O badge da aba Chat no nav (`broker/layout.tsx`) NÃO atualiza em realtime nesta story — ele é SSR e só é recalculado no próximo request de navegação. Para realtime do badge da nav seria necessário um Client Component no layout que subscreve ao canal — considerado escopo futuro. Documentar este trade-off nos comentários do código.

### Testing

- Simular em dev: abrir `/broker/chat` em uma aba; em outra aba/Supabase UI, inserir msg `role='user'` em `messages`; trigger `trg_messages_update_conv` atualiza `conversations.last_message_at` → evento chega ao browser → conversa sobe ao topo
- Verificar `setAuth` está sendo chamado (via Supabase Realtime logs no dashboard)
- Verificar cleanup: navegar para outro route e confirmar no Supabase dashboard que o canal não está mais ativo

---

## Out of Scope

- Realtime do badge da aba Chat no nav (SSR — atualiza na próxima navegação)
- Realtime de INSERT de conversas novas (só UPDATE de existentes)
- Notificação sonora ao receber mensagem (PWA — escopo futuro)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Fase 6 segunda leva, realtime da lista | @sm (River) |

# Story 63-16 — Infra de Não-Lidas: `broker_last_read_at` + Action "Marcar Lido"

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-16
- **Status:** Ready for Review
- **Priority:** P0 — fundação da Fase 6: sem esta coluna não há como calcular badge nem inbox de não-lidas
- **Complexity:** S (2-3h @data-engineer) + S (1-2h @dev)
- **Fase:** 6 (Caixa de Entrada de Conversas)
- **Leva:** Primeira (caminho crítico)
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @qa.

### Executor Assignment
- **Executor Principal (migration + RPC):** @data-engineer (Dara)
- **Executor Secundário (server action + helper TS):** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[migration_idempotency_check, unread_unit_tests, action_authz_check]`
- **Depende de:** nenhuma story do Epic 63 — é a fundação da Fase 6
- **Bloqueia:** 63-17 (inbox usa `broker_last_read_at` e `countUnreadForLead`); 63-19 (badge usa `getBrokerUnreadTotal`)

---

## User Story

**Como** corretor usando o inbox de conversas do CRM,
**Quero** que o sistema saiba quais mensagens de leads ainda não li,
**Para que** os badges de não-lidas sejam precisos e eu não perca respostas de leads sem perceber.

---

## Context

### O Problema Atual

Não existe o conceito de "não-lida" no sistema. A tabela `conversations` não tem como saber quando o corretor visualizou as mensagens pela última vez. Toda a Fase 6 (inbox, badge de chat na nav, realtime) depende desta coluna.

### Definição de "Não-Lida"

Uma mensagem é **não-lida** quando:
- `messages.role = 'user'` (mensagem do lead — nunca do corretor nem da Nicole)
- `messages.created_at > conversations.broker_last_read_at`
- OU `conversations.broker_last_read_at IS NULL` (nunca foi lida — todas contam)

Mensagens com `role='broker'` ou `role='assistant'` **nunca** contam como não-lidas (o corretor as enviou ou foram enviadas pela Nicole a mando do sistema).

### Quando Marcar Lido

Ao abrir `/broker/leads/[id]`, disparar a server action `markLeadConversationsRead(leadId)` — ela atualiza `broker_last_read_at = now()` em todas as conversas do lead. O array `conversationIds` já é computado em `page.tsx` L45: `conversations?.map((c) => c.id) ?? []`.

### Migration — Drift Crítico Conhecido

Existe drift entre migrations locais e remotas (range 074→103 está fora de sincronia). A migration `104_*` **DEVE** ser aplicada manualmente via Supabase Management API — o comando `supabase db push` **NÃO DEVE** ser usado. Ver instrução no Dev Notes abaixo.

### RLS de UPDATE — Análise

`conversations_update` (mig `004_rls_policies.sql` L145-146): `USING (org_id = public.user_org_id())` — qualquer membro da org pode fazer UPDATE em qualquer conversa da org. Para o server action de marcar lido, a validação de autorização é feita **na camada de aplicação** (antes do UPDATE, verificar que `leads.assigned_broker_id = user.id`). Não é necessário criar nova policy de RLS.

---

## Acceptance Criteria

- [x] **AC1 (Migration idempotente):** A migration `104_conversations_broker_last_read_at.sql` existe em `supabase/migrations/` e contém `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS broker_last_read_at TIMESTAMPTZ NULL;`. O comando `IF NOT EXISTS` garante idempotência — pode ser re-executada sem erro.

- [x] **AC2 (Índice eficiente):** A migration inclui `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_broker_read ON conversations(lead_id, broker_last_read_at) WHERE broker_last_read_at IS NOT NULL;`. Índice parcial (só linhas já lidas) minimiza o tamanho.

- [x] **AC3 (RPC de contagem total):** A migration inclui a função `public.get_broker_unread_total(p_org_id uuid, p_broker_user_id uuid) RETURNS bigint LANGUAGE sql SECURITY INVOKER STABLE` que conta conversas com pelo menos 1 mensagem `role='user'` não-lida do corretor (via `EXISTS` com `LIMIT 1` para eficiência). Retorna 0 se nenhuma.

- [x] **AC4 (Helper puro TS — countUnreadForLead):** Existe `packages/web/src/lib/broker/unread-count.ts` exportando `countUnreadForLead(convs, msgs)` onde `convs` é lista de `{id: string; broker_last_read_at: string | null}` e `msgs` é lista de `{conversation_id: string; role: string; created_at: string}`. Retorna o número de mensagens `role='user'` com `created_at > broker_last_read_at` da respectiva conversa (ou todas se `null`). Função pura — zero dependências externas.

- [x] **AC5 (Helper TS — getBrokerUnreadTotal):** Mesmo arquivo exporta `getBrokerUnreadTotal(supabase, orgId, brokerId): Promise<number>` que chama `supabase.rpc('get_broker_unread_total', { p_org_id: orgId, p_broker_user_id: brokerId })` e retorna o count (0 em caso de erro).

- [x] **AC6 (Server action — markLeadConversationsRead):** Existe `packages/web/src/app/broker/leads/[id]/_actions/mark-read.ts` com `'use server'` exportando `markLeadConversationsRead(leadId: string): Promise<void>` que: (1) chama `getServerUser()`, (2) verifica via `supabase.from('leads').select('id').eq('id', leadId).eq('assigned_broker_id', user.id).maybeSingle()` — se null, retorna silenciosamente, (3) faz `supabase.from('conversations').update({ broker_last_read_at: new Date().toISOString() }).eq('lead_id', leadId)`. Usa `createClient()` (não admin — a RLS de UPDATE permite por org_id).

- [x] **AC7 (Testes Vitest):** Existe `packages/web/src/lib/broker/__tests__/unread-count.test.ts` com testes para `countUnreadForLead` cobrindo: (a) `broker_last_read_at=null` → todas as msgs `role='user'` contam; (b) `broker_last_read_at` anterior a msgs → contam; (c) `broker_last_read_at` posterior a msgs → zero; (d) mensagens `role='broker'`/`role='assistant'` nunca contam independente do timestamp. Todos passam com `pnpm --filter @trifold/web test`.

- [x] **AC8 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story. ESLint → zero erros.

---

## Tasks / Subtasks

### @data-engineer (Dara)

- [x] **T1 — Migration SQL (AC1, AC2, AC3)** — migration `104` criada e aplicada em produção (pré-requisito)
  - [x] Criar `supabase/migrations/104_conversations_broker_last_read_at.sql`
  - [x] ADD COLUMN `broker_last_read_at TIMESTAMPTZ NULL` com `IF NOT EXISTS`
  - [x] CREATE INDEX `idx_conversations_broker_read` (parcial `WHERE broker_last_read_at IS NOT NULL`) — NÃO concurrent (should-fix do PO aplicado: coluna nova 100% NULL, build instantâneo, compatível com aplicação multi-statement via Management API)
  - [x] Criar função `public.get_broker_unread_total(p_org_id, p_broker_user_id)` com `SECURITY INVOKER`, `STABLE`
  - [x] Aplicada via Management API (não `supabase db push`)

### @dev (Dex)

- [x] **T2 — Helper puro TS (AC4, AC5)**
  - [x] Criar `packages/web/src/lib/broker/unread-count.ts`
  - [x] Exportar `countUnreadForLead(convs, msgs)` — função pura, sem imports externos
  - [x] Exportar `getBrokerUnreadTotal(supabase, orgId, brokerId)` chamando `supabase.rpc('get_broker_unread_total', ...)`

- [x] **T3 — Server action (AC6)**
  - [x] Criar pasta `packages/web/src/app/broker/leads/[id]/_actions/`
  - [x] Criar `mark-read.ts` com `'use server'`, `getServerUser()`, verificação de ownership, UPDATE
  - [x] Path `_actions/` (prefixo `_`) não é exposto como rota no App Router

- [x] **T4 — Testes Vitest (AC7)**
  - [x] Criar `packages/web/src/lib/broker/__tests__/unread-count.test.ts`
  - [x] 10 cenários (cobrindo os 4 obrigatórios + data inválida, multi-conv, fora-da-lista, vazios) → verde

- [x] **T5 — Type-check + lint (AC8)**
  - [x] `tsc --noEmit` → zero erros nos arquivos da story (apenas 3 erros pré-existentes em `visual-editor.tsx`)
  - [x] `eslint` → zero erros

---

## Dev Notes

### Arquivos Chave

| Arquivo | Ação | Referência |
|---------|------|-----------|
| `supabase/migrations/104_conversations_broker_last_read_at.sql` | CRIAR | — |
| `packages/web/src/lib/broker/unread-count.ts` | CRIAR | Padrão: `lib/broker/window-status.ts` (exporta funções puras) |
| `packages/web/src/lib/broker/__tests__/unread-count.test.ts` | CRIAR | Padrão: `packages/shared/src/utils/__tests__/phone.test.ts` |
| `packages/web/src/app/broker/leads/[id]/_actions/mark-read.ts` | CRIAR | — |

### Schema Atual de `conversations` (antes desta story)

Colunas existentes (confirmadas em `001_base_schema.sql` L152-164 + migrações posteriores):
- `id, org_id, lead_id, channel, status, is_ai_active, handoff_at, handoff_reason, last_message_at, created_at, updated_at` (001)
- `last_enriched_at` (010)
- `last_message_preview, last_message_role` (038)

**NOVO** (esta story): `broker_last_read_at TIMESTAMPTZ NULL`

### Padrão de Função Server-Side (referência)

Ver `lib/broker/broker-takeover-status.ts` para padrão de funções puras exportadas do diretório `lib/broker/`. As funções devem usar ESM, sem side effects no nível do módulo.

### Padrão de Server Action (referência)

Ver `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — o POST ao `/api/leads/[id]/send-message` usa `fetch`. Para esta story, usamos server action (`'use server'`) ao invés de route handler, pois a operação é disparada pelo componente de servidor em `page.tsx` (pode ser chamada no `useEffect` do client component que abre a conversa).

### Aplicação da Migration em Produção

**OBRIGATÓRIO:** Aplicar via Supabase Management API (não `supabase db push`). Razão: drift 074→103 entre local e remote. Instrução para @devops:
```
POST https://api.supabase.com/v1/projects/{project_ref}/database/query
Authorization: Bearer {SUPABASE_MANAGEMENT_KEY}
Body: { "query": "<conteúdo do SQL>" }
```
Verificar com: `SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name='broker_last_read_at'` — deve retornar 1 linha.

### RPC — Estrutura SQL Recomendada

```sql
CREATE OR REPLACE FUNCTION public.get_broker_unread_total(
  p_org_id uuid,
  p_broker_user_id uuid
) RETURNS bigint
LANGUAGE sql SECURITY INVOKER STABLE AS $$
  SELECT COUNT(*)
  FROM conversations c
  JOIN leads l ON l.id = c.lead_id
  WHERE l.org_id = p_org_id
    AND l.assigned_broker_id = p_broker_user_id
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'user'
        AND (c.broker_last_read_at IS NULL
             OR m.created_at > c.broker_last_read_at)
      LIMIT 1
    )
$$;
```

Índices usados: `idx_conversations_lead` (001), `idx_leads_assigned_broker` (001), `idx_messages_conversation` (001), `idx_messages_conv_created` (032). Custo estimado baixo.

### Testing

- Framework: **Vitest** (não Jest)
- Localização: `packages/web/src/lib/broker/__tests__/unread-count.test.ts`
- Padrão: importar funções puras e testar com arrays em memória — sem mocks de Supabase
- Comando: `pnpm --filter @trifold/web test src/lib/broker/__tests__/unread-count.test.ts`

---

## Dev Agent Record (Dex) — 2026-06-22

### File List
- `supabase/migrations/104_conversations_broker_last_read_at.sql` (incluída no commit — criada pelo @data-engineer)
- `packages/web/src/lib/broker/unread-count.ts` (CRIADO)
- `packages/web/src/lib/broker/__tests__/unread-count.test.ts` (CRIADO)
- `packages/web/src/app/broker/leads/[id]/_actions/mark-read.ts` (CRIADO)

### Decisões
- `countUnreadForLead(convs, msgs)` segue a assinatura da STORY (lista de conversas + lista de mensagens), não a variante `(messages, brokerLastReadAt)` citada informalmente. Isso permite reuso direto na 63-17 tanto por card (passar `[conv]`) quanto agregado.
- Data inválida em `broker_last_read_at` → tratada como nunca-lida (tudo conta); `created_at` inválido → mensagem ignorada.
- Server action usa `createClient()` (sessão do corretor) + checagem de ownership na aplicação, conforme análise de RLS do PO. Tudo envolto em `try/catch` best-effort.

### Resultados
- Vitest (`unread-count.test.ts`): 10/10 passed.
- ESLint: 0 erros nos 3 arquivos da story.
- type-check: 0 erros nos arquivos da story (3 erros pré-existentes em `visual-editor.tsx`/`react-email-editor`).

## Validação (PO — Pax) — 2026-06-22

**Veredito: GO — Score 9/10. Status Draft → Ready.**

Pontos críticos confirmados com evidência no código:
- **Numeração da migration (104):** a migration mais alta existente é `103_messages_wamid_unique.sql`. **NÃO há `104_*` — sem colisão.** (Existem duplicidades históricas em 075 e 102, o que confirma o drift; por isso `supabase db push` está corretamente proibido — aplicar via Management API.)
- **Idempotência:** AC1 usa `ADD COLUMN IF NOT EXISTS` — re-executável. ✓
- **RLS de UPDATE para o broker:** `conversations_update` em `004_rls_policies.sql` L145-146 = `FOR UPDATE USING (org_id = public.user_org_id())`. **O broker (sessão `createClient()`) CONSEGUE atualizar `broker_last_read_at`** — não precisa de admin nem de nova policy. A decisão do @sm de usar `createClient()` (diferente do handoff 63-13 que usou admin) é VÁLIDA. A restrição ao próprio lead vem da checagem de ownership na camada de aplicação (AC6: `assigned_broker_id = user.id` antes do UPDATE) + a query de lead em `page.tsx` L19-30 já filtra por `assigned_broker_id`.
- **RPC `get_broker_unread_total` (`SECURITY INVOKER STABLE`):** roda como o broker; RLS de `leads`/`conversations`/`messages` aplica naturalmente. Filtro explícito por `p_broker_user_id` é consistente. ✓
- **Helpers puros/testáveis:** padrão real existe em `lib/broker/window-status.ts` + `__tests__/window-status.test.ts`. AC4/AC7 alinhados. ✓

**Should-fix (NÃO bloqueia GO — instrução obrigatória ao @data-engineer):**
- **AC2 — `CREATE INDEX CONCURRENTLY`:** `CONCURRENTLY` **não pode** rodar dentro de bloco de transação. Se a migration for aplicada como uma única query multi-statement (ADD COLUMN + CREATE INDEX CONCURRENTLY + CREATE FUNCTION) via Management API, o índice pode falhar. Resolução: aplicar o índice como **statement separado**, OU usar `CREATE INDEX` simples (não-concurrent) — como a coluna é nova e está toda NULL, o build é instantâneo e sem contenção de lock. Registrar no handoff ao @data-engineer.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Fase 6, fundação de não-lidas | @sm (River) |
| 2026-06-22 | v1.1 | Validada (GO 9/10). RLS de UPDATE do broker confirmada (`org_id`-based, sem admin); migration 104 sem colisão; idempotência OK. Should-fix: índice CONCURRENTLY fora de transação. Status Draft → Ready. | @po (Pax) |

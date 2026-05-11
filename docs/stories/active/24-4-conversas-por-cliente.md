---
epic: 24
story: 24.4
title: Conversas por Cliente — cliente_id em obra_mensagens
status: InReview
priority: P0
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [migration_check, api_response_shape, type_check, rls_validation, ui_review]
complexity: G
estimated_hours: 6
depends_on: ["24.1", "24.2", "24.3"]
blocks: []
---

# Story 24.4 — Conversas por Cliente: cliente_id em obra_mensagens

## Contexto

**Epic 24 — Central de Mensagens: Admin ↔ Cliente**

Stories 24.1–24.3 estão concluídas. O sistema tem inbox centralizado, identidade de remetente e acesso broker.

**Problema crítico identificado em produção:**

`obra_mensagens` não tem conceito de "conversa por cliente". Uma obra pode ter múltiplos clientes vinculados (via `cliente_obras`). Hoje:

- Cliente A envia uma mensagem → fica na obra sem vínculo direto com o cliente
- Admin responde → a resposta vai para a obra inteira, sem destinatário
- Cliente B (também da obra) **vê a resposta destinada ao Cliente A**
- No painel admin, todas as mensagens aparecem misturadas em um único chat

Isso compromete privacidade e clareza operacional.

**Solução:** adicionar coluna `cliente_id` em `obra_mensagens` para identificar a qual conversa cada mensagem pertence. Cada par `(obra_id, cliente_id)` forma uma conversa isolada.

## Story Statement

**Como** administrador Trifold,
**Quero** ver conversas separadas por cliente dentro de cada obra,
**Para que** eu possa responder a cada cliente individualmente sem misturar suas mensagens.

**Como** cliente do portal,
**Quero** ver apenas minhas mensagens e as respostas da Trifold a mim,
**Para que** minha conversa seja privada em relação a outros clientes da mesma obra.

## Acceptance Criteria

### AC1 — Migration: coluna cliente_id

- Arquivo: `supabase/migrations/029_cliente_id_obra_mensagens.sql`
- `ALTER TABLE obra_mensagens ADD COLUMN cliente_id UUID REFERENCES public.users(id) ON DELETE SET NULL`
- Backfill: `UPDATE obra_mensagens SET cliente_id = sender_id WHERE sender_type = 'cliente'`
- Para mensagens de equipe existentes: `cliente_id` permanece NULL (mensagens antigas sem contexto de cliente)
- Index: `CREATE INDEX ON obra_mensagens(obra_id, cliente_id)` para performance de filtragem
- RLS cliente (`obra_mensagens_select_cliente`): atualizar para `cliente_id = public_user_id() OR sender_id = public_user_id()`

### AC2 — POST /api/cliente/obras/[obra_id]/mensagens

- Arquivo: `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/route.ts` (ATUALIZAR)
- No INSERT, gravar automaticamente `cliente_id: appUser.id` (não exposto ao cliente)
- Sem mudança na interface externa — cliente não passa `cliente_id`, é derivado do auth

### AC3 — POST /api/admin/obras/[obra_id]/mensagens

- Arquivo: `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` (ATUALIZAR)
- Body aceita `cliente_id: string` (obrigatório quando `sender_type = 'equipe'`)
- Validar: `cliente_id` deve existir em `cliente_obras` para aquela `obra_id`
- Gravar `cliente_id` no INSERT
- Retornar erro 400 se `cliente_id` ausente ou inválido

### AC4 — GET /api/admin/obras/[obra_id]/mensagens

- Arquivo: `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` (ATUALIZAR)
- Aceita query param `?cliente_id=UUID`
- Se `cliente_id` fornecido: filtra `.eq("cliente_id", cliente_id)`
- Se não fornecido: retorna todas (compatibilidade com código existente que pode chamar sem filtro)
- Retorna campo `cliente_id` em cada mensagem

### AC5 — Admin obra tab "Mensagens": seletor de cliente

- Arquivo: `packages/web/src/app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` (ATUALIZAR)
- Arquivo: `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (ATUALIZAR)
- Quando a tab "Mensagens" é aberta:
  - Se obra tem 1 cliente → abre diretamente a conversa desse cliente
  - Se obra tem 2+ clientes → mostra seletor de clientes (lista com nome + badge de não lidas por cliente)
- `AdminChatFeed` recebe prop `clienteId: string` e `clienteNome: string`
- Ao carregar mensagens: `GET /api/admin/obras/[obra_id]/mensagens?cliente_id={selectedClienteId}`
- Composer: ao enviar, inclui `cliente_id` no body do POST
- Badge de não lidas: contagem por cliente, não global da obra

### AC6 — GET /api/admin/obras/[obra_id]/mensagens (SSR na página da obra)

- Arquivo: `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` (ATUALIZAR)
- SSR não pré-carrega mensagens (ficam `[]`) — o componente client-side carrega via fetch após selecionar cliente
- Tabs mostra `Mensagens (?)` ou `Mensagens` sem count no SSR (count é dinâmico por cliente)

### AC7 — Portal do cliente: isolar por cliente_id

- Arquivo: `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` (ATUALIZAR)
- Query SSR: adicionar `.eq("cliente_id", user.id)` ao select de `obra_mensagens`
  - Garante que cliente vê apenas sua conversa, mesmo que RLS ainda não esteja fully restritivo
- Realtime subscription no chat-feed: adicionar `filter: \`cliente_id=eq.${userId}\`` ao channel

### AC8 — Admin inbox (/dashboard/mensagens): não regressão

- `GET /api/admin/mensagens` não muda — continua agregando por obra
- `unread_count` por obra = soma de todas as não lidas de todos os clientes (comportamento atual mantido)
- Nenhuma mudança nos componentes de inbox

## Dev Notes

### Schema change

```sql
-- 029_cliente_id_obra_mensagens.sql
ALTER TABLE obra_mensagens
  ADD COLUMN cliente_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Backfill: mensagens de clientes vinculam a si mesmas
UPDATE obra_mensagens
  SET cliente_id = sender_id
  WHERE sender_type = 'cliente';

-- Index para filtragem eficiente
CREATE INDEX ON obra_mensagens(obra_id, cliente_id);

-- Atualizar RLS select do cliente
DROP POLICY IF EXISTS obra_mensagens_select_cliente ON obra_mensagens;
CREATE POLICY obra_mensagens_select_cliente ON obra_mensagens
  FOR SELECT TO authenticated
  USING (
    obra_id IN (SELECT obra_id FROM cliente_obras WHERE user_id = public_user_id())
    AND (cliente_id = public_user_id() OR sender_id = public_user_id())
  );
```

> **Verificar** a política RLS atual antes de escrever a nova — pode ter nome diferente. Usar:
> `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'obra_mensagens';`

### Admin chat-feed: seletor de clientes

O `ObraDetailTabs` já recebe `clientes: Cliente[]`. Passar para `AdminChatFeed`:

```typescript
// obras/[obra_id]/_components/admin-chat-feed.tsx
interface AdminChatFeedProps {
  obraId: string
  adminName: string
  clientes: { id: string; name: string }[]  // NOVO
  initialMensagens: Mensagem[]              // continua para compat. (pode ser [])
}
```

Lógica de seletor:
- 1 cliente → `selectedClienteId` inicializado automaticamente
- N clientes → mostrar lista antes do chat; ao selecionar, fetch mensagens

### Tipos TypeScript

Adicionar `cliente_id?: string | null` na interface `Mensagem` de todos os componentes que a usam.

### Validation no POST admin

```typescript
// Validar que cliente_id pertence à obra
const { data: vinculo } = await supabase
  .from("cliente_obras")
  .select("obra_id")
  .eq("obra_id", obra_id)
  .eq("user_id", cliente_id)
  .single()

if (!vinculo) {
  return NextResponse.json({ error: "Cliente não vinculado a esta obra" }, { status: 400 })
}
```

## Tasks

- [x] **T1** — Criar `supabase/migrations/029_cliente_id_obra_mensagens.sql` com ALTER TABLE, backfill e índice
- [x] **T2** — Verificar e atualizar RLS policy `obra_mensagens_select_cliente` com filtro de `cliente_id`
- [x] **T3** — Atualizar `POST /api/cliente/obras/[obra_id]/mensagens` para gravar `cliente_id: appUser.id`
- [x] **T4** — Atualizar `GET /api/admin/obras/[obra_id]/mensagens` para aceitar `?cliente_id=` e retornar campo
- [x] **T5** — Atualizar `POST /api/admin/obras/[obra_id]/mensagens` para receber, validar e gravar `cliente_id`
- [x] **T6** — Atualizar `AdminChatFeed` para receber `clientes[]`, mostrar seletor e filtrar por `clienteId`
- [x] **T7** — Atualizar `ObraDetailTabs` para passar `clientes` ao `AdminChatFeed`
- [x] **T8** — Atualizar `page.tsx` da obra para não pré-carregar mensagens no SSR (ou carregar do primeiro cliente)
- [x] **T9** — Atualizar portal do cliente (SSR + Realtime) para filtrar por `cliente_id`
- [x] **T10** — Aplicar migration no Supabase remoto via Management API (coluna + backfill + index + RLS)
- [x] **T11** — Verificar: inbox `/dashboard/mensagens` não regrediu (`/api/admin/mensagens` sem alteração)

## File List

- `supabase/migrations/029_cliente_id_obra_mensagens.sql` (CRIADO)
- `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/route.ts` (ATUALIZADO)
- `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` (ATUALIZADO)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` (ATUALIZADO)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (ATUALIZADO)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` (ATUALIZADO)
- `packages/web/src/app/dashboard/mensagens/_components/conversation-panel.tsx` (ATUALIZADO — Mensagem interface +cliente_id)
- `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` (ATUALIZADO)
- `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` (ATUALIZADO)
- `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/upload/route.ts` (ATUALIZADO — QA fix: cliente_id no INSERT)

## Dev Agent Record

### Debug Log
> Preencher pelo @dev se necessário

### Completion Notes

- Migration 029 aplicada remotamente via Management API (supabase db push tem issue de duplicate key pré-existente no projeto)
- `AdminChatFeed` suporta `legacyMode` (sem prop `clientes`) para retrocompatibilidade com `ConversationPanel` do inbox
- Realtime no portal do cliente filtra por `cliente_id` client-side (inbox de obra usa `obra_id` como antes)
- Backfill: 3 mensagens de cliente já tinham `sender_id = cliente_id` ✅; mensagens de equipe ficam com `cliente_id = NULL` (mensagens antigas sem contexto, conforme AC1)
- `ObraDetailTabs`: tab "Mensagens" sem contador no SSR (count é dinâmico por cliente)

### Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-11 | @po (Pax) | Validação GO (8.5/10) — status Draft → Ready. Obs: usar Management API para migration 029; verificar nome RLS policy antes de DROP; AC3 deve retornar 400 se obra sem clientes vinculados. |
| 2026-05-11 | @dev (Dex) | Implementação completa T1–T11. Migration 029 aplicada remotamente. TypeScript limpo, zero erros novos no lint. Status → Ready for Review. |
| 2026-05-11 | @qa (Quinn) | Review completo — 8 ACs verificados. Gap identificado e corrigido: upload/route.ts omitia cliente_id (mensagens de mídia do cliente ficavam NULL). Fix aplicado direto pelo QA. Veredicto: CONCERNS → PASS após fix. Status → InReview. |

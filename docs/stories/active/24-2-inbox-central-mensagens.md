---
epic: 24
story: 24.2
title: Inbox Unificado — Central de Mensagens Admin
status: Ready for Review
priority: P1
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [api_response_shape, type_check, ui_review]
complexity: G
estimated_hours: 4
depends_on: ["24.1"]
blocks: []
---

# Story 24.2 — Inbox Unificado: Central de Mensagens Admin

## Contexto

**Epic 24 — Central de Mensagens: Admin ↔ Cliente**

Story 24.1 está concluída: `obra_mensagens` tem `sender_display_name`, a view
`v_mensagens_admin` existe, e o chat embarcado em `/dashboard/obras/[obra_id]` já
exibe o nome real do remetente.

**Problema atual:** Para responder mensagens de clientes, o admin precisa navegar
para cada obra individualmente — não há um hub central. Se há 20 obras ativas, o
admin não sabe qual tem mensagens não lidas sem abrir uma por uma.

**Esta story:** Cria a página `/dashboard/mensagens` com layout de inbox de dois
painéis (sidebar + conversation panel), link no sidebar do dashboard com badge de
não lidas, e os dois endpoints de API necessários.

## Story Statement

**Como** administrador da Trifold,
**Quero** uma central unificada de mensagens que liste todas as obras com conversas
ativas e me permita responder sem sair da página,
**Para que** eu possa atender clientes rapidamente sem navegar obra a obra.

## Acceptance Criteria

- [ ] **AC1 — GET /api/admin/mensagens:**
  - Arquivo: `packages/web/src/app/api/admin/mensagens/route.ts` (CRIAR)
  - Auth: `requireAuth()` + `ALLOWED_ROLES = ["admin", "supervisor"]`
  - Verifica `org_id` do `appUser` — retorna apenas obras da org
  - Query em `v_mensagens_admin` (view da Story 24.1) para o org_id, ordenado por `created_at DESC`
  - Agrega em JS: por `obra_id`, captura `last_message` (primeiro do array = mais recente) e conta `unread_count` (onde `sender_type = 'cliente'` AND `read_at IS NULL`)
  - Query secundária em `cliente_obras` + `users` para nomes dos clientes por obra
  - Response shape:
    ```typescript
    interface ObraInbox {
      obra_id: string
      obra_name: string
      unread_count: number
      last_message: {
        content: string | null
        message_type: string
        sender_type: string
        created_at: string
      } | null
      clientes: { name: string }[]
    }
    ```
  - Retorna `{ obras: ObraInbox[] }` ordenado por `last_message.created_at DESC`
  - Obras sem nenhuma mensagem **não** aparecem no inbox

- [ ] **AC2 — GET /api/admin/obras/[obra_id]/mensagens (handler novo):**
  - Adiciona handler `GET` ao arquivo existente:
    `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts`
  - Auth: `requireAuth()` + `["admin", "supervisor"]`
  - Verifica obra pertence ao `org_id` do `appUser`
  - Retorna mensagens ordenadas por `created_at ASC`:
    `.select("id, content, message_type, storage_path, sender_type, created_at, sender_display_name")`
  - Response: `{ mensagens: Mensagem[] }`

- [ ] **AC3 — PATCH /api/admin/obras/[obra_id]/mensagens/read:**
  - Arquivo: `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/read/route.ts` (CRIAR)
  - Auth: `requireAuth()` + `["admin", "supervisor"]`
  - Verifica obra pertence ao `org_id`
  - `UPDATE obra_mensagens SET read_at = now() WHERE obra_id = ? AND sender_type = 'cliente' AND read_at IS NULL`
    Via Supabase: `.update({ read_at: new Date().toISOString() }).eq('obra_id', obra_id).eq('sender_type', 'cliente').is('read_at', null)`
  - Response: `{ updated: number }` (count de linhas atualizadas)
  - Idempotente: se não há mensagens não lidas, retorna `{ updated: 0 }` com status 200

- [ ] **AC4 — Página /dashboard/mensagens:**
  - Arquivo: `packages/web/src/app/dashboard/mensagens/page.tsx` (CRIAR)
  - Server component
  - Proteção: apenas `admin` ou `supervisor` (redirect para `/dashboard` caso contrário)
  - Busca diretamente via Supabase server client (não via fetch do endpoint) para SSR
  - Extrai a mesma lógica de agregação do AC1 em uma função utilitária local
  - Passa `initialObras`, `adminName` para `<MensagensInbox />`

- [ ] **AC5 — MensagensInbox (componente client raiz):**
  - Arquivo: `packages/web/src/app/dashboard/mensagens/_components/mensagens-inbox.tsx` (CRIAR)
  - Gerencia `selectedObraId: string | null` em estado local
  - Layout dois painéis em desktop (`flex` com sidebar fixo e painel principal)
  - **Mobile:** mostra sidebar OU painel (um por vez); quando obra selecionada, troca para painel; botão "← Voltar" no topo do painel retorna para sidebar
  - Props: `initialObras: ObraInbox[]`, `adminName: string`
  - Estado local de `obras` começa com `initialObras` (lista do SSR)

- [ ] **AC6 — InboxSidebar:**
  - Arquivo: `packages/web/src/app/dashboard/mensagens/_components/inbox-sidebar.tsx` (CRIAR)
  - Lista obras filtráveis: input de busca pelo nome da obra
  - Cada item da lista exibe:
    - Nome da obra (bold)
    - Nome do(s) cliente(s) (text-sm text-gray-500)
    - Preview da última mensagem (truncado em 60 chars; prefixado com "Você: " se `sender_type = 'equipe'`)
    - Timestamp relativo (ex: "há 5 min", "ontem")
    - Badge laranja com `unread_count` (visível apenas quando > 0)
  - Item ativo com fundo `bg-orange-50`
  - Ordem: obras com mensagem mais recente primeiro (ordem do `initialObras`)
  - Props: `obras: ObraInbox[]`, `selectedObraId: string | null`, `onSelect: (obraId: string) => void`

- [ ] **AC7 — ConversationPanel:**
  - Arquivo: `packages/web/src/app/dashboard/mensagens/_components/conversation-panel.tsx` (CRIAR)
  - Estado vazio (nenhuma obra selecionada): placeholder centralizado com ícone e texto "Selecione uma conversa"
  - Quando obra selecionada:
    - Chama `GET /api/admin/obras/[obra_id]/mensagens` para buscar mensagens iniciais
    - Chama `PATCH /api/admin/obras/[obra_id]/mensagens/read` para marcar como lidas
    - Renderiza `<AdminChatFeed obraId={...} adminName={adminName} initialMensagens={...} />`
    - Header com nome da obra + link (`<Link>`) para `/dashboard/obras/[obra_id]`
  - Loading state durante fetch: skeleton ou spinner centralizado
  - Props: `obraId: string | null`, `obraName: string | undefined`, `adminName: string`, `onBack?: () => void`

- [ ] **AC8 — Navegação no layout do dashboard:**
  - Arquivo: `packages/web/src/app/dashboard/layout.tsx` (EDITAR)
  - Importar ícone `Inbox` do lucide-react
  - Adicionar `NAV_ITEM_MENSAGENS = { href: "/dashboard/mensagens", label: "Mensagens", icon: <Inbox />, badge: unreadCount }`
  - Visibilidade: admin + supervisor (mesmo critério de `NAV_ITEM_OBRAS`)
  - Query para `unreadCount`: conta linhas em `obra_mensagens` onde `org_id = user.orgId`, `sender_type = 'cliente'`, `read_at IS NULL`
  - Passar `unreadCount` para `SidebarNav` como `mensagensCount`

- [ ] **AC9 — SidebarNav com badge genérico:**
  - Arquivo: `packages/web/src/components/layout/sidebar-nav.tsx` (EDITAR)
  - Adicionar `badge?: number` à interface `NavItem`
  - Renderizar badge laranja quando `item.badge != null && item.badge > 0` (igual ao padrão do Alertas)
  - Adicionar `mensagensCount?: number` a `SidebarNavProps`
  - No `layout.tsx`, passar `mensagensCount` e injetar no nav item de Mensagens via `{ ...NAV_ITEM_MENSAGENS, badge: mensagensCount }`
  - Manter lógica do `alertCount` existente para não quebrar regressão

- [ ] **AC10 — TypeScript compila sem erros:**
  - `npm run type-check` passa sem erros em todos os novos arquivos e editados

## Out of Scope (MVP)

- **Role `broker`:** não acessa `/dashboard/mensagens` — página protegida para `admin` e `supervisor` apenas (ALLOWED_ROLES definidos nos ACs). Broker continua usando a aba de Mensagens em `/dashboard/obras/[obra_id]`.
- **Realtime no InboxSidebar:** badge de unread e ordem das obras **não** atualizam em tempo real — require refresh da página ou navegação. Realtime está ativo apenas no `ConversationPanel` (via `AdminChatFeed` existente). Realtime no sidebar é work-item futuro.
- **Paginação:** o inbox carrega todas as obras com mensagens em uma única query. Paginação não é necessária para o volume esperado no MVP (dezenas de obras, não milhares).
- **Filtros avançados:** sem filtro por período, por cliente, ou por status de leitura — apenas busca textual por nome da obra no sidebar.
- **Notificação sonora/visual push:** não implementado nesta story (coberto pelo Epic de Push Notifications).

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- **Primary Type:** Frontend + API
- **Secondary Type:** Navigation / UX
- **Complexity:** Medium — múltiplos componentes novos, reutilização de `AdminChatFeed`, nenhuma migration

**Specialized Agent Assignment:**
- **Primary Agents:** `@dev`, `@qa`
- **Supporting:** Nenhum — sem mudanças de schema

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run type-check && npm run lint`
- [ ] Pre-PR (@devops): `coderabbit --prompt-only --base main`

**CodeRabbit Focus Areas:**
- `ConversationPanel`: fetch de mensagens ao selecionar obra — evitar race condition se usuário trocar de obra rapidamente (cancelar fetch anterior)
- `InboxSidebar`: truncamento correto do preview (não cortar no meio de um emoji)
- Badge de unread em `layout.tsx`: query server-side não bloquear SSR (Promise.all junto com outras queries)
- `SidebarNav`: badge injetado via prop, sem quebrar `alertCount` existente
- AC9 (badge): garantir que `item.badge` não causa re-render desnecessário

**Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15 min | Severity Filter: CRITICAL

## Tasks / Subtasks

- [x] **Task 1 — API: GET /api/admin/mensagens** (AC1)
  - [x] Criar `packages/web/src/app/api/admin/mensagens/route.ts`
  - [x] Implementar lógica de agregação: query `v_mensagens_admin` + group em JS + join clientes
  - [x] Validar response shape com TypeScript interface `ObraInbox`

- [x] **Task 2 — API: GET /api/admin/obras/[obra_id]/mensagens** (AC2)
  - [x] Adicionar handler `export async function GET(...)` ao `route.ts` existente
  - [x] Auth + verificação de ownership da obra
  - [x] Select com `sender_display_name` incluído

- [x] **Task 3 — API: PATCH /api/admin/obras/[obra_id]/mensagens/read** (AC3)
  - [x] Criar diretório e arquivo `read/route.ts`
  - [x] Implementar update condicional (sender_type='cliente', read_at IS NULL)
  - [x] Retornar count de rows atualizadas

- [x] **Task 4 — Página server component** (AC4)
  - [x] Criar `packages/web/src/app/dashboard/mensagens/page.tsx`
  - [x] Implementar lógica de proteção de role
  - [x] Busca SSR: query `v_mensagens_admin` + `cliente_obras` + agregação em JS (reutiliza lógica da Task 1 em helper local)
  - [x] Render `<MensagensInbox />`

- [x] **Task 5 — Componentes client** (AC5, AC6, AC7)
  - [x] Criar `_components/mensagens-inbox.tsx` com estado de seleção + layout dois painéis
  - [x] Criar `_components/inbox-sidebar.tsx` com lista, busca, badge, preview, timestamp relativo
  - [x] Criar `_components/conversation-panel.tsx` com fetch, loading, mark-as-read e `AdminChatFeed`

- [x] **Task 6 — Navegação** (AC8, AC9)
  - [x] Editar `layout.tsx`: query unread count + adicionar NAV_ITEM_MENSAGENS
  - [x] Editar `sidebar-nav.tsx`: adicionar `badge` à `NavItem` + render condicional

- [x] **Task 7 — TypeCheck + Lint** (AC10)
  - [x] `npm run type-check` — 0 erros
  - [x] `npm run lint` nos arquivos novos/modificados — 0 erros

## Dev Notes

### Arquivos envolvidos

| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/api/admin/mensagens/route.ts` | CRIAR |
| `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` | EDITAR — adicionar GET |
| `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/read/route.ts` | CRIAR |
| `packages/web/src/app/dashboard/mensagens/page.tsx` | CRIAR |
| `packages/web/src/app/dashboard/mensagens/_components/mensagens-inbox.tsx` | CRIAR |
| `packages/web/src/app/dashboard/mensagens/_components/inbox-sidebar.tsx` | CRIAR |
| `packages/web/src/app/dashboard/mensagens/_components/conversation-panel.tsx` | CRIAR |
| `packages/web/src/app/dashboard/layout.tsx` | EDITAR — nav item + unread count |
| `packages/web/src/components/layout/sidebar-nav.tsx` | EDITAR — badge genérico |

### Padrões de Auth (da codebase)

```typescript
// Padrão estabelecido em api-auth.ts — reutilizar exatamente assim
const auth = await requireAuth()
if (auth.error) return auth.error
const { supabase, appUser } = auth

const ALLOWED_ROLES = ["admin", "supervisor"]
if (!ALLOWED_ROLES.includes(appUser.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

### View v_mensagens_admin (do schema existente)

```sql
-- Criada na migration 024 (Story 24.1)
-- Disponível para queries server-side
CREATE OR REPLACE VIEW v_mensagens_admin AS
SELECT
  m.id, m.obra_id, m.org_id,
  o.name AS obra_name,
  m.sender_id, m.sender_type, m.sender_display_name,
  m.content, m.message_type, m.storage_path, m.read_at, m.created_at
FROM obra_mensagens m
JOIN obras o ON o.id = m.obra_id;
```

### Lógica de agregação do inbox (pseudo-código para Tasks 1 e 4)

```typescript
// 1. Buscar todas mensagens da org (view inclui obra_name)
const { data: msgs } = await supabase
  .from("v_mensagens_admin")
  .select("obra_id, obra_name, content, message_type, sender_type, read_at, created_at")
  .eq("org_id", appUser.org_id)
  .order("created_at", { ascending: false })

// 2. Agregar por obra_id
const obraMap = new Map<string, ObraInbox>()
for (const msg of msgs ?? []) {
  if (!obraMap.has(msg.obra_id)) {
    obraMap.set(msg.obra_id, {
      obra_id: msg.obra_id,
      obra_name: msg.obra_name,
      unread_count: 0,
      last_message: {
        content: msg.content,
        message_type: msg.message_type,
        sender_type: msg.sender_type,
        created_at: msg.created_at,
      },
      clientes: [],
    })
  }
  if (msg.sender_type === "cliente" && !msg.read_at) {
    obraMap.get(msg.obra_id)!.unread_count++
  }
}

// 3. Buscar clientes por obra
const obraIds = [...obraMap.keys()]
const { data: clientesRaw } = await supabase
  .from("cliente_obras")
  .select("obra_id, is_primary, users(id, name)")
  .in("obra_id", obraIds)

for (const row of clientesRaw ?? []) {
  const u = Array.isArray(row.users) ? row.users[0] : row.users
  if (u) obraMap.get(row.obra_id)?.clientes.push({ name: u.name })
}

// 4. Retornar como array ordenado
const obras = [...obraMap.values()]
```

### ConversationPanel — evitar race condition

```typescript
// Quando obra muda rapidamente, cancelar fetch anterior:
useEffect(() => {
  if (!obraId) return
  let cancelled = false

  async function load() {
    const res = await fetch(`/api/admin/obras/${obraId}/mensagens`)
    if (cancelled) return
    const { mensagens } = await res.json()
    setMensagens(mensagens)
    // mark as read (fire-and-forget)
    fetch(`/api/admin/obras/${obraId}/mensagens/read`, { method: "PATCH" })
  }

  setLoading(true)
  load().finally(() => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }
}, [obraId])
```

### Layout do inbox — dois painéis

```tsx
// MensagensInbox — estrutura de alto nível
<div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border border-gray-200 bg-white">
  {/* Sidebar — ocultar em mobile quando obra selecionada */}
  <div className={`w-80 flex-shrink-0 border-r border-gray-200 ${selectedObraId ? "hidden lg:flex" : "flex"} flex-col`}>
    <InboxSidebar ... />
  </div>
  {/* Painel principal — ocultar em mobile quando nenhuma selecionada */}
  <div className={`flex-1 flex flex-col ${!selectedObraId ? "hidden lg:flex" : "flex"}`}>
    <ConversationPanel ... />
  </div>
</div>
```

### Timestamp relativo (helper local)

```typescript
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "ontem"
  return `${days}d`
}
```

### Unread count no layout.tsx

```typescript
// Adicionar ao Promise.all do layout (junto com alertCount):
supabase
  .from("obra_mensagens")
  .select("id", { count: "exact", head: true })
  .eq("org_id", user.orgId)
  .eq("sender_type", "cliente")
  .is("read_at", null)
```

### SidebarNav — badge por NavItem

```typescript
// Extensão da interface NavItem em sidebar-nav.tsx
interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number  // ADICIONAR
}

// No render de cada item (substituir o bloco hardcoded de "Alertas"):
{item.badge != null && item.badge > 0 && (
  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
    {item.badge > 99 ? "99+" : item.badge}
  </span>
)}
```

> **Nota:** A prop `alertCount` existente no `SidebarNavProps` deve ser mantida e injetada
> no nav item de Alertas via `{ ...NAV_ITEM_ALERTAS, badge: alertCount }` para manter
> compatibilidade. O item "Alertas" ainda funciona, mas agora usa o mecanismo genérico.

### Preview de mensagem no InboxSidebar

```typescript
function formatPreview(msg: ObraInbox["last_message"]): string {
  if (!msg) return "Sem mensagens"
  if (msg.message_type === "image") return "📷 Foto"
  if (msg.message_type === "audio") return "🎵 Áudio"
  const prefix = msg.sender_type === "equipe" ? "Você: " : ""
  const text = msg.content ?? ""
  return prefix + (text.length > 60 ? text.slice(0, 60) + "…" : text)
}
```

### Reutilização de AdminChatFeed

`AdminChatFeed` (em `dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx`) deve ser
**importado diretamente** pelo `ConversationPanel` — sem duplicar código. O componente já
suporta `initialMensagens`, Realtime e envio de mensagens.

```typescript
// Em conversation-panel.tsx
import { AdminChatFeed } from "@web/app/dashboard/obras/[obra_id]/_components/admin-chat-feed"
```

> **Atenção ao path:** o import usa path relativo ou alias `@web/app/...`. Verificar
> se o alias `@web` está configurado no tsconfig para apontar para `packages/web/src/`.

### Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|-------------|---------|-----------|
| Agregação JS lenta com muitas mensagens | Baixa (MVP: dezenas de obras) | Médio | Aceitável para MVP. Se org tiver >500 mensagens, migrar para RPC Supabase em story futura |
| Race condition ao trocar obras rapidamente | Média | Baixo | Padrão `cancelled = true` no `useEffect` — detalhado nos Dev Notes |
| Import path `AdminChatFeed` inválido | Baixa | Médio | Verificar alias `@web` em `tsconfig.json`; usar path relativo como fallback |
| View `v_mensagens_admin` sem RLS retorna dados de outras orgs | Muito baixa | Alto | Query SEMPRE filtra por `eq("org_id", appUser.org_id)` — server-side enforced |

### Migrations necessárias

**Nenhuma.** Todos os recursos de DB necessários existem:
- `obra_mensagens.read_at` — coluna existente (Epic 20)
- `v_mensagens_admin` — view criada na migration 024 (Story 24.1)

### Testing

- Verificar `npm run type-check` após criação de todos os arquivos
- Verificar `npm run lint` nos arquivos novos
- Testar manualmente (golden path):
  1. Cliente envia mensagem no portal → badge de não-lida aparece no sidebar do admin
  2. Admin abre inbox → obra aparece com badge e preview corretos
  3. Admin seleciona obra → conversa carrega, badge some (read_at preenchido)
  4. Admin responde → mensagem aparece em tempo real para o cliente
- Testar mobile: sidebar → selecionar → painel → botão voltar → sidebar
- Verificar que `/api/admin/mensagens` retorna 403 para role `broker`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-11 | 1.0 | Draft inicial | River (@sm) |
| 2026-05-11 | 1.1 | GO (9/10) — S1 OUT scope adicionado, S2 tabela de riscos adicionada; status → Ready | Pax (@po) |
| 2026-05-11 | 1.2 | Implementação completa — Ready for Review | Dex (@dev) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6 (Dex @dev)

### Completion Notes
- `mensagensCount` prop removida de `SidebarNavProps` — badge injetado diretamente no nav item via `{ ...NAV_ITEM_MENSAGENS, badge: mensagensCount }`, evitando prop redundante e unused variable lint error
- `ConversationPanel` importa `AdminChatFeed` via alias `@web/app/dashboard/obras/[obra_id]/_components/admin-chat-feed` — alias `@web/*` confirado no tsconfig como `./src/*`
- `getInboxObras()` definida como helper no server component `page.tsx` para reutilizar lógica de agregação sem duplicar no endpoint
- TypeScript 0 erros, lint 0 erros nos 9 arquivos criados/editados

### File List
| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/api/admin/mensagens/route.ts` | CRIADO |
| `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` | EDITADO — GET handler adicionado |
| `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/read/route.ts` | CRIADO |
| `packages/web/src/app/dashboard/mensagens/page.tsx` | CRIADO |
| `packages/web/src/app/dashboard/mensagens/_components/mensagens-inbox.tsx` | CRIADO |
| `packages/web/src/app/dashboard/mensagens/_components/inbox-sidebar.tsx` | CRIADO |
| `packages/web/src/app/dashboard/mensagens/_components/conversation-panel.tsx` | CRIADO |
| `packages/web/src/app/dashboard/layout.tsx` | EDITADO — Inbox icon, NAV_ITEM_MENSAGENS, unread count query |
| `packages/web/src/components/layout/sidebar-nav.tsx` | EDITADO — badge genérico em NavItem |

## QA Results

**Gate Decision:** PASS WITH CONCERNS
**Revisor:** Quinn (@qa) | **Data:** 2026-05-11

### Checks

| Check | Resultado |
|-------|-----------|
| Code Review | ✅ PASS |
| Acceptance Criteria (10/10) | ✅ PASS |
| Regressões | ✅ PASS |
| Segurança | ✅ PASS |
| Performance | ✅ PASS |
| Documentação | ✅ PASS |
| Testes | ⚠️ CONCERN — sem arquivo de teste automatizado (padrão do projeto) |

### Concerns (não bloqueantes)

- **C1:** Interface `ObraInbox` duplicada em 3 arquivos — consolidar em `@web/types/mensagens.ts` em story futura (tech debt)
- **C2:** Query `mensagensCount` executada no `layout.tsx` para todos os roles, incluindo brokers que não veem o item de nav — overhead leve mas desnecessário
- **C3:** Mark-as-read (`fetch` PATCH) é fire-and-forget sem guard `cancelled` — em edge case de troca de obra muito rápida, PATCH pode ser enviado para obra anterior; sem impacto de segurança

### Aprovação

Story aprovada para push via `@devops *push`.

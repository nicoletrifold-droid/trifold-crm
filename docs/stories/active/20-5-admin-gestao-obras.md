---
epic: 20
story: 20.5
title: Painel Admin — Gestão Completa de Obras
status: Done
priority: P1
created_at: 2026-05-05
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [crud_correctness, realtime_chat_equipe, rls_validation, user_creation, type_check]
complexity: XG
estimated_hours: 9
depends_on: ["20.1a", "20.1b", "20.4"]
blocks: ["20.6"]
---

# Story 20.5 — Painel Admin: Gestão Completa de Obras

## Contexto

**Epic 20 — Portal do Cliente**

Stories 20.1a–20.4 estão em produção. O portal do cliente tem login, visão geral, fases, galeria,
documentos e chat em tempo real. O admin já consegue criar obras (modal "Nova Obra"), fazer upload
de fotos e documentos, e deletá-los.

O que falta para fechar o ciclo de uso:

1. **Editar obra** — o admin não consegue atualizar `status`, `progress_pct` ou `expected_delivery_date`
   após criar a obra. Sem isso o portal do cliente mostra progresso estático.

2. **Gestão de fases** — o cliente vê o cronograma de fases no portal (`/cliente/[obra_id]/fases`),
   mas o admin não tem UI para criar/editar/excluir fases. Elas precisam ser gerenciadas pelo admin
   para aparecer no portal.

3. **Chat da equipe** — o cliente já envia mensagens (Story 20.4). A equipe Trifold ainda não pode
   responder pelo painel admin. Esta story completa o lado equipe do chat.

4. **Gestão de clientes** — não existe UI para vincular um usuário com role `cliente` a uma obra.
   Sem isso nenhum cliente real consegue fazer login no portal. Esta story adiciona a aba "Clientes"
   no detalhe da obra com criação e desvinculação de usuários.

**Resultado esperado:** Admin consegue criar uma obra, configurar fases, vincular o cliente, e
responder mensagens — fechando o loop completo do portal.

## Story Statement

**Como** administrador da Trifold,
**Quero** gerir completamente uma obra pelo painel — editar dados, criar fases, responder clientes
e vincular usuários —
**Para que** o portal do cliente mostre informações atualizadas e o cliente tenha com quem se comunicar.

## Acceptance Criteria

### Edição de Obra

- [ ] **AC1:** `PATCH /api/admin/obras/[obra_id]` atualiza obra:
  - Campos aceitos: `name` (string), `description` (string|null), `status`
    (`'em_andamento'` | `'concluida'` | `'pausada'`), `progress_pct` (0–100),
    `expected_delivery_date` (date string ou null)
  - Verifica `org_id` (404 se não pertencer à org)
  - Retorna `{ obra: { id, name, status, progress_pct, expected_delivery_date } }` 200
  - Validação: `progress_pct` deve ser 0–100; `status` deve ser um dos 3 valores aceitos

- [ ] **AC2:** Botão "Editar" no cabeçalho de `/dashboard/obras/[obra_id]`:
  - Abre `ObraEditModal` (Client Component) pré-preenchido com dados atuais
  - Campos: Nome, Descrição, Status (select), Progresso % (input number 0-100), Data de entrega
  - PATCH para a API + `router.refresh()` ao sucesso
  - Fecha modal ao sucesso; exibe erro inline em caso de falha

### Gestão de Fases

- [ ] **AC3:** `GET /api/admin/obras/[obra_id]/fases` lista fases:
  - Filtrado por `org_id`
  - Ordenado por `order_index ASC`
  - Retorna `{ fases: [...] }` com todos os campos de `obra_fases`

- [ ] **AC4:** `POST /api/admin/obras/[obra_id]/fases` cria fase:
  - Body: `{ name: string, description?: string }`
  - `order_index` calculado automaticamente: `MAX(order_index) + 1` (ou 1 se não houver fases)
  - `status` padrão: `'pendente'`, `progress_pct` padrão: `0`
  - Retorna `{ fase: { id, name, description, order_index, status, progress_pct } }` 201

- [ ] **AC5:** `PATCH /api/admin/obras/[obra_id]/fases/[fase_id]` edita fase:
  - Campos aceitos: `name`, `description`, `status` (`'pendente'`|`'em_andamento'`|`'concluida'`),
    `progress_pct` (0–100), `start_date`, `end_date`, `expected_start_date`, `expected_end_date`
  - Verifica `org_id` via `obra_id`
  - Retorna fase atualizada 200

- [ ] **AC6:** `DELETE /api/admin/obras/[obra_id]/fases/[fase_id]` exclui fase:
  - Verifica `org_id` (404 se não pertencer à org)
  - Retorna 204

- [ ] **AC7:** Tab "Fases" em `ObraDetailTabs`:
  - Lista fases em ordem com status (badge: PENDENTE / EM ANDAMENTO / CONCLUÍDA)
  - `FaseCreateForm` (Client Component): campo nome + descrição opcional + botão "Adicionar Fase"
  - Cada fase tem botão "Editar" que abre `FaseEditModal` (nome, status, progress_pct, datas)
  - Botão excluir com `window.confirm` + DELETE + `router.refresh()`
  - Estado vazio: "Nenhuma fase criada."

### Chat da Equipe (Admin)

- [ ] **AC8:** Migration ou verificação — RLS `obra_mensagens_insert_equipe`:
  - Verificar em `supabase/migrations/020_portal_cliente.sql` se existe policy de INSERT para
    `sender_type = 'equipe'` com role admin/supervisor
  - Se não existir: criar `supabase/migrations/023_obra_mensagens_equipe_rls.sql` com a policy:
    ```sql
    CREATE POLICY "obra_mensagens_insert_equipe"
    ON obra_mensagens FOR INSERT TO authenticated
    WITH CHECK (
      obra_id IN (SELECT id FROM obras WHERE org_id = (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
      ))
      AND sender_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND sender_type = 'equipe'
      AND (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('admin', 'supervisor')
    );
    ```

- [ ] **AC9:** `POST /api/admin/obras/[obra_id]/mensagens` envia mensagem como equipe:
  - Body: `{ content: string }` — max 2000 chars
  - `requireAuth()` + role check (admin/supervisor)
  - INSERT com `sender_type: 'equipe'`, `sender_id: appUser.id`, `message_type: 'text'`
  - Retorna `{ mensagem: { id, content, created_at, sender_type, message_type } }` 201

- [ ] **AC10:** Tab "Mensagens" em `ObraDetailTabs` com `AdminChatFeed` (Client Component):
  - `AdminChatFeed` recebe prop `adminName: string` — a página server (`page.tsx`) passa `getServerUser().name`
  - Exibe feed de mensagens com alinhamento: `equipe` → direita, `cliente` → esquerda
  - Label "Equipe Trifold" acima das mensagens do cliente; nome do admin (`adminName`) nas próprias mensagens
  - Suporte a imagens (thumbnail) e áudio (player) via signed URL — mesmo padrão de `SignedImage`/`SignedAudio`
  - Realtime subscription `obra-mensagens-{obra_id}` (mesmo canal que o cliente usa) — dedup por id
  - Input textarea + botão enviar (apenas texto — sem upload de mídia nesta story)
  - Enter envia, Shift+Enter nova linha; estado de loading e erro inline
  - Auto-scroll para última mensagem no mount e ao receber nova

- [ ] **AC11:** Mensagem enviada pelo admin aparece no portal do cliente via Realtime (sem refresh)

### Gestão de Clientes Vinculados

- [ ] **AC12:** `GET /api/admin/obras/[obra_id]/clientes` lista clientes vinculados:
  - JOIN `cliente_obras` → `users` (name, email, id)
  - Filtrado por `org_id`
  - Retorna `{ clientes: [{ id, name, email, is_primary }] }`

- [ ] **AC13:** `POST /api/admin/obras/[obra_id]/clientes` — dois modos no mesmo endpoint:

  **Modo A — criar novo usuário cliente** (body tem `nome` e `email`):
  ```ts
  // Body: { nome: string, email: string, senha_temporaria: string }
  ```
  - Usa `createAdminClient()` de `@web/lib/supabase/admin` para criar auth user:
    ```ts
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha_temporaria,
      email_confirm: true,
      app_metadata: { role: 'cliente' },
      user_metadata: { full_name: nome },
    })
    ```
  - INSERT em `users`: `{ auth_id, org_id: appUser.org_id, name: nome, email, role: 'cliente' }`
  - INSERT em `cliente_obras`: `{ user_id: users.id, obra_id, is_primary: true }`
  - Retorna `{ cliente: { id, nome, email } }` 201
  - Em caso de conflito de email: retornar 409 `{ error: 'Email já cadastrado' }`

  **Modo B — vincular cliente existente** (body tem `email`):
  ```ts
  // Body: { email: string }
  ```
  - Busca `users` por `email` + `org_id = appUser.org_id` + `role = 'cliente'`
  - Se não encontrar: retornar 404 `{ error: 'Cliente não encontrado nesta organização' }`
  - INSERT em `cliente_obras` (ignora se já vinculado via `ON CONFLICT DO NOTHING`)
  - Retorna `{ cliente: { id, name, email } }` 200

- [ ] **AC14:** `DELETE /api/admin/obras/[obra_id]/clientes/[user_id]` desvincula cliente:
  - DELETE em `cliente_obras` onde `user_id` e `obra_id`
  - Verifica `org_id` do usuário
  - Retorna 204

- [ ] **AC15:** Tab "Clientes" em `ObraDetailTabs`:
  - Lista clientes vinculados (nome, email, badge "Principal" se `is_primary`) + botão desvincular
  - Formulário "Adicionar cliente novo": campos Nome, Email, Senha temporária + botão "Criar e Vincular"
  - Formulário "Vincular cliente existente": input Email → botão "Vincular" → POST Modo B diretamente com `{ email }`
  - Estados de erro inline em cada formulário

### Qualidade

- [ ] **AC16:** `pnpm run type-check` passa sem erros nos arquivos novos
- [ ] **AC17:** `pnpm run lint` passa sem erros nos arquivos novos

## Escopo

**IN SCOPE:**
- PATCH `/api/admin/obras/[obra_id]` — atualizar obra
- CRUD completo de fases (4 APIs + UI tab)
- Chat admin: POST mensagem equipe + AdminChatFeed com Realtime
- Gestão de clientes: GET/POST/DELETE APIs + ClientesTab UI
- Criação de usuário `cliente` via `createAdminClient()` Supabase Admin
- Migration 023 (somente se RLS equipe não existir em 020)
- ObraDetailTabs expandido para 5 tabs: **Fases | Fotos | Documentos | Mensagens | Clientes**

**OUT OF SCOPE:**
- Reordenação por drag-and-drop de fases (usar `order_index` manual)
- Upload de mídia no chat admin (texto apenas)
- Notificações por email/WhatsApp ao enviar mensagem → Story 20.6
- Paginação de mensagens antigas
- Edição inline de fases sem modal
- Deletar usuário cliente do sistema (apenas desvincula da obra)

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| RLS `obra_mensagens` não cobre INSERT com `sender_type = 'equipe'` | Alta | AC8: verificar em 020; criar migration 023 se necessário |
| `createAdminClient()` exposto sem proteção de role | Alta | AC13: role check obrigatório (`admin`/`supervisor`) antes de chamar Admin API |
| Conflito de email ao criar usuário cliente | Média | AC13: tratar erro Supabase `User already registered` → 409 |
| ObraDetailTabs com 5 tabs — overflow em mobile | Baixa | Usar scroll horizontal na barra de tabs |
| `ObraDetailTabs` refatoração quebra Fotos/Documentos | Média | Garantir que `tab` default seja `"fases"` e Fotos/Documentos continuem funcionando |

## Dev Notes

### Stack e Padrões

- **Auth admin:** `requireAuth()` de `@web/lib/api-auth` (retorna `appUser: { id, role, org_id }`)
- **Supabase Admin (service role):** `createAdminClient()` de `@web/lib/supabase/admin`
  ```ts
  import { createAdminClient } from "@web/lib/supabase/admin"
  const supabaseAdmin = createAdminClient()
  // Usar APENAS para Auth Admin API (criar usuários)
  // Para queries com RLS: usar supabase (de requireAuth), não supabaseAdmin
  ```
- **Params:** sempre `await params` — é `Promise<{}>` no App Router
- **Estilo painel admin:** Tailwind light theme (gray-*, orange-500 accent) — manter consistente com tabs Fotos/Documentos existentes

### PATCH obra — Exemplo

```ts
// PATCH /api/admin/obras/[obra_id]/route.ts — adicionar ao arquivo existente
export async function PATCH(req: NextRequest, { params }: ...) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { obra_id } = await params
  // Verificar org antes de atualizar
  const { data: obra } = await supabase.from('obras').select('id').eq('id', obra_id).eq('org_id', appUser.org_id).single()
  if (!obra) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  // Sanitizar apenas campos permitidos
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if ('description' in body) updates.description = body.description ?? null
  if (['em_andamento', 'concluida', 'pausada'].includes(body.status)) updates.status = body.status
  if (typeof body.progress_pct === 'number' && body.progress_pct >= 0 && body.progress_pct <= 100) updates.progress_pct = body.progress_pct
  if ('expected_delivery_date' in body) updates.expected_delivery_date = body.expected_delivery_date ?? null

  const { data: updated } = await supabase.from('obras').update(updates).eq('id', obra_id).select('id, name, status, progress_pct, expected_delivery_date').single()
  return NextResponse.json({ obra: updated })
}
```

### Fases — Cálculo de order_index

```ts
// POST /api/admin/obras/[obra_id]/fases/route.ts
const { data: maxFase } = await supabase
  .from('obra_fases')
  .select('order_index')
  .eq('obra_id', obra_id)
  .order('order_index', { ascending: false })
  .limit(1)
  .single()

const order_index = maxFase ? maxFase.order_index + 1 : 1
```

### AdminChatFeed — Diferenças do ChatFeed do Cliente

```tsx
// Mesma estrutura do ChatFeed (20.4), mas:
// 1. Envia para /api/admin/obras/[obra_id]/mensagens (não /api/cliente/...)
// 2. sender_type de referência para alinhamento:
const isEquipe = mensagem.sender_type === "equipe"  // equipe = direita (próprio admin)
// 3. Label em mensagens do cliente:
{!isEquipe && <p className="mb-1 text-xs font-medium text-[#E8856A]">Cliente</p>}
// 4. Signed URLs para imagem/áudio: mesmo padrão SignedImage/SignedAudio
```

### Criar Usuário Cliente — Fluxo Completo

```ts
// POST /api/admin/obras/[obra_id]/clientes/route.ts
const supabaseAdmin = createAdminClient()

// Criar auth user
const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
  email,
  password: senha_temporaria,
  email_confirm: true,                    // não exige confirmação por email
  app_metadata: { role: 'cliente' },
  user_metadata: { full_name: nome },
})

if (authError) {
  if (authError.message.includes('already')) {
    return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
  }
  return NextResponse.json({ error: authError.message }, { status: 500 })
}

// INSERT em users (usar supabaseAdmin para bypass de RLS se necessário)
const { data: newUser } = await supabaseAdmin
  .from('users')
  .insert({
    auth_id: authData.user.id,
    org_id: appUser.org_id,
    name: nome,
    email,
    role: 'cliente',
  })
  .select('id, name, email')
  .single()

// INSERT em cliente_obras
await supabaseAdmin
  .from('cliente_obras')
  .insert({ user_id: newUser.id, obra_id, is_primary: true })
```

### Vincular Cliente Existente (Modo B)

```ts
// Body: { email: string }
// Buscar por email + org_id + role cliente
const { data: existingUser } = await supabase
  .from('users')
  .select('id, name, email')
  .eq('email', body.email)
  .eq('org_id', appUser.org_id)
  .eq('role', 'cliente')
  .single()

if (!existingUser) {
  return NextResponse.json({ error: 'Cliente não encontrado nesta organização' }, { status: 404 })
}

// Vincular (ignora se já vinculado via ON CONFLICT DO NOTHING)
await supabase
  .from('cliente_obras')
  .insert({ user_id: existingUser.id, obra_id })
  .onConflict('user_id,obra_id')
  .ignore()

return NextResponse.json({ cliente: existingUser })
```

### ObraDetailTabs — Expandir

O arquivo `obra-detail-tabs.tsx` atualmente tem 2 tabs (`fotos` | `documentos`).
Expandir para 5 tabs: `fases` | `fotos` | `documentos` | `mensagens` | `clientes`.

```tsx
type Tab = "fases" | "fotos" | "documentos" | "mensagens" | "clientes"
const [tab, setTab] = useState<Tab>("fases")  // default para fases
```

A barra de tabs pode precisar de scroll horizontal em mobile — usar `overflow-x-auto` no wrapper.

### Dados adicionais para o page.tsx

A página `dashboard/obras/[obra_id]/page.tsx` precisa buscar mais dados para alimentar as novas tabs:

```ts
const [fasesRes, fotosRes, documentosRes, mensagensRes, clientesRes] = await Promise.all([
  supabase.from('obra_fases').select('*').eq('obra_id', obra_id).order('order_index'),
  supabase.from('obra_fotos').select('...').eq('obra_id', obra_id).order('created_at', { ascending: false }),
  supabase.from('obra_documentos').select('...').eq('obra_id', obra_id).order('created_at', { ascending: false }),
  supabase.from('obra_mensagens').select('id, content, message_type, storage_path, sender_type, created_at').eq('obra_id', obra_id).order('created_at', { ascending: true }),
  supabase.from('cliente_obras').select('is_primary, users(id, name, email)').eq('obra_id', obra_id),
])
```

### Estrutura de Arquivos

**Criar:**
```
supabase/migrations/
└── 023_obra_mensagens_equipe_rls.sql  ← apenas se policy ausente em 020

packages/web/src/app/
├── api/admin/obras/[obra_id]/
│   ├── fases/
│   │   ├── route.ts                   ← GET lista + POST criar fase
│   │   └── [fase_id]/
│   │       └── route.ts               ← PATCH editar + DELETE excluir
│   ├── mensagens/
│   │   └── route.ts                   ← POST enviar mensagem como equipe
│   └── clientes/
│       ├── route.ts                   ← GET listar + POST criar/vincular
│       └── [user_id]/
│           └── route.ts               ← DELETE desvincular
└── dashboard/obras/[obra_id]/_components/
    ├── obra-edit-modal.tsx             ← editar obra (status, progresso, datas)
    ├── fase-create-form.tsx            ← formulário criar fase
    ├── fase-edit-modal.tsx             ← modal editar fase
    ├── admin-chat-feed.tsx             ← chat equipe com Realtime
    └── clientes-tab.tsx                ← tab gestão de clientes
```

**Modificar:**
```
packages/web/src/app/api/admin/obras/[obra_id]/route.ts
  ← Adicionar PATCH (atualizar obra)

packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx
  ← Expandir para 5 tabs (Fases | Fotos | Documentos | Mensagens | Clientes)

packages/web/src/app/dashboard/obras/[obra_id]/page.tsx
  ← Buscar fases, mensagens e clientes adicionais; passar para ObraDetailTabs; botão "Editar" no header
```

## Tasks / Subtasks

- [x] **Task 1 — PATCH API obra + Modal de edição** (AC: 1, 2)
  - [x] Adicionar `PATCH` em `packages/web/src/app/api/admin/obras/[obra_id]/route.ts`
  - [x] Sanitizar apenas campos permitidos (name, description, status, progress_pct, expected_delivery_date)
  - [x] Criar `obra-edit-modal.tsx` (Client Component) com formulário pré-preenchido
  - [x] Botão "Editar" no cabeçalho de `dashboard/obras/[obra_id]/page.tsx`
  - [x] PATCH para API + `router.refresh()` + fechar modal ao sucesso

- [x] **Task 2 — API CRUD de Fases** (AC: 3, 4, 5, 6)
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/fases/route.ts`
  - [x] `GET`: listar fases por obra_id + org_id, `order_index ASC`
  - [x] `POST`: criar fase, `order_index = MAX + 1`, status padrão `'pendente'`
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/fases/[fase_id]/route.ts`
  - [x] `PATCH`: atualizar campos permitidos, verificar org via obra_id
  - [x] `DELETE`: verificar org, excluir, retornar 204

- [x] **Task 3 — Tab Fases na UI admin** (AC: 7)
  - [x] Criar `fase-create-form.tsx` (Client Component): nome + descrição opcional
  - [x] Criar `fase-edit-modal.tsx` (Client Component): nome, status, progress_pct, datas
  - [x] Integrar na tab "Fases" de `ObraDetailTabs`
  - [x] Lista de fases com badge de status + editar + excluir (com confirm)
  - [x] Estado vazio

- [x] **Task 4 — RLS equipe + API mensagens admin** (AC: 8, 9)
  - [x] Verificar `supabase/migrations/020_portal_cliente.sql` — `obra_mensagens_manage_admin` (FOR ALL) já cobre INSERT equipe; migration 023 não necessária
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts`
  - [x] `POST`: requireAuth + role check + validar content + INSERT com `sender_type: 'equipe'`

- [x] **Task 5 — AdminChatFeed (Tab Mensagens)** (AC: 10, 11)
  - [x] Criar `admin-chat-feed.tsx` (Client Component)
  - [x] Realtime subscription `obra-mensagens-{obra_id}` com dedup por id
  - [x] Alinhamento: equipe → direita, cliente → esquerda
  - [x] SignedImage/SignedAudio para mensagens de mídia (bucket `obra-mensagens`)
  - [x] Input textarea + Enter send + Shift+Enter nova linha + estado de loading/erro
  - [x] Auto-scroll no mount e ao receber mensagem
  - [x] Integrar como tab "Mensagens" em `ObraDetailTabs`

- [x] **Task 6 — API Clientes** (AC: 12, 13, 14)
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/clientes/route.ts`
  - [x] `GET`: listar clientes via `cliente_obras` JOIN `users`
  - [x] `POST` Modo A (body com `nome` e `email`): createAdminClient + auth.admin.createUser + INSERT users + INSERT cliente_obras
  - [x] `POST` Modo B (body com `email` existente): buscar por email + verificar role/org + INSERT cliente_obras
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/clientes/[user_id]/route.ts`
  - [x] `DELETE`: desvincular (DELETE cliente_obras)

- [x] **Task 7 — Tab Clientes na UI admin** (AC: 15)
  - [x] Criar `clientes-tab.tsx` (Client Component)
  - [x] Lista de clientes vinculados com badge "Principal" e botão desvincular
  - [x] Formulário "Criar novo cliente": nome, email, senha temporária → POST Modo A
  - [x] Formulário "Vincular existente": email → POST Modo B
  - [x] Estados de erro inline em cada formulário

- [x] **Task 8 — Expandir ObraDetailTabs + page.tsx** (AC: todos)
  - [x] Atualizar `obra-detail-tabs.tsx`: `Tab = 'fases'|'fotos'|'documentos'|'mensagens'|'clientes'`
  - [x] Adicionar props: `mensagens`, `clientes`, `adminName`; manter props existentes `fases`, `fotos`, `documentos`
  - [x] Barra de tabs com overflow-x-auto para mobile
  - [x] Atualizar `dashboard/obras/[obra_id]/page.tsx`: buscar mensagens e clientes adicionais
  - [x] Adicionar botão "Editar" no cabeçalho via `ObraEditButton` (Client Component separado)

- [x] **Task 9 — Type-check e lint** (AC: 16, 17)
  - [x] `pnpm run type-check` → 0 erros
  - [x] `pnpm run lint` → 0 erros/avisos nos arquivos novos

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml`.
> Validação de qualidade via processo manual (`@qa` executa QA gate).

## Definition of Done

- [ ] Admin consegue editar status e progresso de uma obra
- [ ] Admin consegue criar, editar e excluir fases pelo painel
- [ ] Admin consegue responder mensagens do cliente pelo painel (aparece no portal via Realtime)
- [ ] Admin consegue criar usuário `cliente` e vinculá-lo a uma obra
- [ ] Cliente recém-criado consegue fazer login no portal (`/cliente/[obra_id]`)
- [ ] RLS verificada: admin só acessa dados da sua org
- [ ] `pnpm run type-check` passa sem erros
- [ ] `pnpm run lint` passa sem erros

## File List

### Criar
- `packages/web/src/app/api/admin/obras/[obra_id]/fases/route.ts` — GET + POST fases
- `packages/web/src/app/api/admin/obras/[obra_id]/fases/[fase_id]/route.ts` — PATCH + DELETE fase
- `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` — POST mensagem equipe
- `packages/web/src/app/api/admin/obras/[obra_id]/clientes/route.ts` — GET + POST clientes (Modo A + B)
- `packages/web/src/app/api/admin/obras/[obra_id]/clientes/[user_id]/route.ts` — DELETE desvincular
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-edit-modal.tsx` — modal editar obra
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-edit-button.tsx` — client wrapper botão Editar
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/fase-create-form.tsx` — form criar fase
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/fase-edit-modal.tsx` — modal editar fase
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` — chat admin Realtime
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx` — tab gestão clientes

### Modificar
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` — adicionar PATCH obra
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` — 5 tabs (fases|fotos|docs|mensagens|clientes)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` — buscar mensagens + clientes + botão Editar + adminName

### Não criado (decisão de implementação)
- `supabase/migrations/023_obra_mensagens_equipe_rls.sql` — desnecessário: `obra_mensagens_manage_admin` (FOR ALL) já cobre INSERT equipe em 020

## QA Results

**Veredicto:** PASS
**Revisor:** Quinn (@qa) — 2026-05-05
**Gate file:** `docs/qa/gates/20.5-admin-gestao-obras.yml`

**Checks:**
- Revisão de código: PASS
- Critérios de aceitação (AC1–AC17): PASS ✅ todos
- Sem regressões (Fotos/Documentos tabs preservadas): PASS
- Performance (Promise.all paralelo, Realtime canal correto): PASS
- Segurança (org_id isolation, role checks, sender_id de auth): PASS
- Documentação (File List completo, decisão migration registrada): PASS

**Issues encontradas (não bloqueantes):**
- LOW: PATCH obra não valida `updates` vazio — inócuo, opcional corrigir
- INFO: Modo B usa string matching `'duplicate'` — correto, considerar `error.code === '23505'` no futuro
- INFO: `page.tsx` busca mensagens sem `org_id` explícito — seguro (UUID + RLS)

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-05 | River (@sm) | Story criada — Draft |
| 2026-05-05 | Pax (@po) | Validação GO 10/10 — C-001 (AC13 Modo B body `{ email }`), C-002 (AC15 UI simplificado), C-003 (AC10 adminName prop); Dev Notes Modo B atualizado; status Draft → Ready |
| 2026-05-05 | Dex (@dev) | Implementação completa — 9 tasks ✅, type-check ✅, lint ✅; migration 023 dispensada (RLS já coberta por obra_mensagens_manage_admin FOR ALL em 020); status → Ready for Review |
| 2026-05-05 | Quinn (@qa) | QA Gate PASS — AC1–AC17 verificados, segurança auditada, 3 issues LOW/INFO não bloqueantes |
| 2026-05-08 | @po | Story closed — QA PASS, moved to Done | — |

---
epic: 20
story: 20.4
title: Portal Cliente — Documentos e Chat em Tempo Real
status: Done
priority: P1
created_at: 2026-05-05
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [signed_url_download, realtime_chat, file_upload, rls_validation, type_check]
complexity: G
estimated_hours: 8
depends_on: ["20.1a", "20.2", "20.3"]
blocks: ["20.6"]
---

# Story 20.4 — Portal Cliente: Documentos e Chat em Tempo Real

## Contexto

**Epic 20 — Portal do Cliente**

Stories 20.1a (schema + RLS), 20.2 (portal visão geral) e 20.3 (admin upload de fotos) estão
em produção. O cliente consegue ver fotos e fases, mas ainda não tem acesso a documentos nem
pode se comunicar com a equipe.

Esta story adiciona as duas funcionalidades restantes do portal do cliente:

1. **Documentos** — O admin faz upload de documentos (ART/RRT, contratos, memoriais) e o
   cliente baixa via signed URL. Requer: tab de documentos no painel admin, APIs de upload/delete,
   página do portal do cliente.

2. **Chat em Tempo Real** — Canal de mensagens entre cliente e equipe Trifold. O cliente envia
   texto, imagens e áudio; a equipe responde pelo painel admin (Story 20.5 completa o lado admin).
   Supabase Realtime garante que novas mensagens aparecem sem refresh.

**Ponto de atenção:** A navegação atual do portal do cliente é um scroll único em
`/cliente/[obra_id]/page.tsx`. Esta story introduz rotas independentes `/documentos` e
`/mensagens` e adiciona bottom tab navigation ao layout.

## Story Statement

**Como** cliente da Trifold,
**Quero** acessar documentos da minha obra para download e trocar mensagens com a equipe em
tempo real,
**Para que** eu tenha todas as informações e comunicação centralizada no portal, sem depender
de WhatsApp ou email avulso.

## Acceptance Criteria

### Documentos — Lado Admin

- [ ] **AC1:** `POST /api/admin/obras/[obra_id]/documentos` faz upload de um documento:
  - Recebe `multipart/form-data` com: `file` (File), `name` (string), `category` (string
    — `'ART/RRT'` | `'Contratos'` | `'Memoriais'` | `'Outros'`), `category` default `'Outros'`
  - Valida: arquivo qualquer tipo, tamanho máximo 50 MB
  - Salva no Storage em `obra-docs/{obra_id}/{uuid}-{filename}`
  - Insere em `obra_documentos`: `org_id`, `uploaded_by`, `storage_path`, `name`,
    `filename`, `category`, `file_size_bytes`
  - Retorna `{ documento: { id, name, category, filename, file_size_bytes, created_at } }` 201

- [ ] **AC2:** `DELETE /api/admin/obras/[obra_id]/documentos/[doc_id]`:
  - Remove do Storage `obra-docs` (ignora erro se arquivo não existir)
  - Remove registro de `obra_documentos`
  - Verifica `org_id` (retorna 404 se não pertencer à org)
  - Retorna 204

- [ ] **AC3:** Tab "Documentos" adicionada em `/dashboard/obras/[obra_id]/page.tsx`:
  - Lista documentos existentes da obra (nome, categoria, tamanho, data)
  - Componente `DocUploadForm` (Client Component): input de arquivo + campo `name` + select
    `category` + botão "Enviar" — POST para a API + `router.refresh()` ao sucesso
  - Botão de exclusão com confirmação em cada documento

### Documentos — Lado Cliente

- [ ] **AC4:** `GET /api/cliente/obras/[obra_id]/documentos/[doc_id]/download` gera signed URL:
  - Usa `supabase.storage.from('obra-docs').createSignedUrl(path, 60)` (expira em 60 s)
  - Verifica RLS: documento pertence à obra do cliente autenticado
  - Retorna `{ url: string }` — cliente redireciona para a URL no browser

- [ ] **AC5:** Página `/cliente/[obra_id]/documentos/page.tsx`:
  - Server Component — busca documentos via Supabase direto (RLS garante isolamento)
  - Filtros por categoria: tabs "Todos" + uma tab por categoria existente
  - Lista: ícone + nome + categoria + tamanho legível (`15 KB`, `2.3 MB`) + botão "↓ Baixar"
  - Botão Baixar: `fetch GET /api/cliente/.../download` → redireciona para signed URL em nova aba
  - Estado vazio: "Nenhum documento disponível ainda."
  - Redireciona para `/cliente/sem-obra` se obra não pertencer ao cliente (RLS retorna null)

### Chat — Lado Cliente

- [ ] **AC6:** `POST /api/cliente/obras/[obra_id]/mensagens` envia mensagem de texto:
  - Body: `{ content: string }` — max 2000 chars
  - `sender_type: 'cliente'`, `sender_id` = user autenticado (via RLS)
  - `message_type: 'text'`
  - Retorna `{ mensagem: { id, content, created_at, sender_type, message_type } }` 201

- [ ] **AC7:** `POST /api/cliente/obras/[obra_id]/mensagens/upload` faz upload de mídia:
  - Recebe `multipart/form-data`: `file` (File), `type` (`'image'` | `'audio'`)
  - Valida: imagem → `image/*` ≤ 10 MB; áudio → `audio/*` ≤ 20 MB
  - Salva em `obra-mensagens/{obra_id}/{uuid}.{ext}`
  - Insere em `obra_mensagens` com `message_type = type`, `storage_path`, `content: null`
  - Retorna `{ mensagem: { id, storage_path, message_type, created_at } }` 201

- [ ] **AC8:** Página `/cliente/[obra_id]/mensagens/page.tsx` — chat completo:
  - **Server Component** que busca mensagens iniciais via Supabase e passa como prop `initialMensagens` para `<ChatFeed>` (Client Component)
  - `<ChatFeed>` é o Client Component responsável por Realtime, estado de input e envio
  - Feed: mensagens da equipe à esquerda, mensagens do cliente à direita
  - Timestamp em cada mensagem: `DD/Mmm HH:mm`
  - Suporte a imagens: `<Image>` clicável (abre em nova aba)
  - Suporte a áudio: `<audio controls>` com `src` gerado via `getPublicUrl` (bucket privado = signed URL carregado ao montar)
  - Auto-scroll para a última mensagem ao carregar e ao receber nova

- [ ] **AC9:** Realtime — novas mensagens aparecem sem refresh:
  - Supabase Realtime subscription em `obra_mensagens` filtrada por `obra_id`
  - Canal: `obra-mensagens-{obra_id}`
  - Ao receber `INSERT` event: append à lista + auto-scroll
  - Cleanup do canal no `useEffect` return

- [ ] **AC10:** Input de mensagem funcional:
  - `<textarea>` que expande automaticamente (até 4 linhas)
  - Enter envia, Shift+Enter nova linha
  - Botão 📎 abre file picker `accept="image/*,audio/*"`:
    - Detecta tipo pelo `file.type` (`audio/*` → type=`'audio'`, demais → type=`'image'`)
    - Upload via `POST /api/cliente/obras/[obra_id]/mensagens/upload`
  - Botão enviar envia o texto via `POST /api/cliente/obras/[obra_id]/mensagens`
  - Estado de loading durante envio; limpa input ao sucesso

### Navegação do Portal

- [ ] **AC11:** Bottom tab navigation adicionada em `/cliente/[obra_id]/layout.tsx`:
  - Tabs: `Obra` (/) | `Documentos` (/documentos) | `Mensagens` (/mensagens)
  - Tab ativa destacada com acento `#E8856A`
  - Layout: sticky bottom bar (mobile-first); em desktop funciona como nav horizontal no header
  - Cria `/cliente/[obra_id]/layout.tsx` se não existir (atualmente é um `[obra_id]/page.tsx`
    direto, sem layout de grupo)

- [ ] **AC12:** `npm run type-check` passa sem erros nos arquivos novos

- [ ] **AC13:** `npm run lint` passa sem erros nos arquivos novos

## Escopo

**IN SCOPE:**
- Storage policies para `obra-docs` e `obra-mensagens` (migration SQL)
- APIs admin: upload/delete de documentos
- APIs cliente: download via signed URL, envio de mensagens (texto + mídia)
- UI admin: tab "Documentos" no detalhe da obra
- UI cliente: `/documentos` e `/mensagens` pages
- Bottom tab navigation no portal do cliente
- Realtime subscription no chat do cliente

**OUT OF SCOPE:**
- Lado admin do chat (responder mensagens) → Story 20.5
- Gestão de fases (CRUD de fases, progresso) → Story 20.5
- Notificações (email/WhatsApp) ao receber mensagem/documento → Story 20.6
- Gravar áudio diretamente no browser (MediaRecorder) — apenas upload de arquivo
- Paginação de mensagens (carregar histórico mais antigo)
- Lightbox de fotos em tela cheia (baixo impacto, pode ser póstuma)
- Criação de usuário `cliente` pelo admin — Story 20.5

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Storage policies `obra-docs` e `obra-mensagens` ausentes → 403 no upload | Alta | Criar migration antes de qualquer teste de upload |
| Realtime não habilitado no projeto Supabase | Alta | Verificar com `supabase status` antes de implementar AC9 |
| Signed URL de áudio expira durante reprodução | Média | Gerar URL ao montar (`useEffect`) e renovar se necessário; áudios curtos toleram 60 s |
| Multipart form-data > 4 MB com `runtime: 'edge'` | Média | Verificar `next.config.ts` — usar `runtime: 'nodejs'` nas routes de upload |
| Rota `/cliente/[obra_id]/layout.tsx` — conflito com `page.tsx` atual | Média | Next.js suporta co-location de `layout.tsx` + `page.tsx` no mesmo segmento sem conflito |

## Dev Notes

### Stack e Padrões

- **Framework:** Next.js 14 App Router
- **Banco:** Supabase — `createClient()` de `@web/lib/supabase/server` para Server Components e API routes
- **Auth API routes:** `requireAuth()` de `@web/lib/api-auth`
- **Auth Server Components:** `getServerUser()` de `@web/lib/auth`
- **Storage:** `supabase.storage.from('obra-docs')` / `supabase.storage.from('obra-mensagens')`
- **Realtime:** `supabase.channel()` — requer `createClient()` de `@web/lib/supabase/client` (browser)
- **Estilo:** Tailwind CSS dark theme (`stone-950`, `stone-900`, `stone-800`, acento `#E8856A`)

### Parâmetros como Promise (Next.js 14)

```ts
// SEMPRE usar await params — é uma Promise no App Router atual
export default async function Page({ params }: { params: Promise<{ obra_id: string }> }) {
  const { obra_id } = await params
}
```

### Padrão de Auth em API Routes (existente)

```ts
const auth = await requireAuth()
if (auth.error) return auth.error
const { appUser, supabase } = auth

// Role check (admin/supervisor):
if (appUser.role !== 'admin' && appUser.role !== 'supervisor') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Isolamento de org — SEMPRE:
.eq('org_id', appUser.org_id)
```

### Migration — Storage Policies para obra-docs e obra-mensagens

Próximo número disponível: `022` (021 já usado para fotos + phone normalization).

```sql
-- 022_portal_docs_mensagens_storage.sql

-- ── obra-docs: privado (signed URL) ────────────────────────────
-- Admin faz upload
CREATE POLICY "admin_upload_obra_docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'obra-docs' AND public.is_admin_or_supervisor());

-- Admin deleta
CREATE POLICY "admin_delete_obra_docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'obra-docs' AND public.is_admin_or_supervisor());

-- Cliente/equipe lê (signed URL valida antes de servir)
CREATE POLICY "authenticated_read_obra_docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'obra-docs');

-- ── obra-mensagens: privado (signed URL) ───────────────────────
-- Qualquer autenticado pode fazer upload (cliente envia imagem/áudio)
CREATE POLICY "authenticated_upload_obra_mensagens"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'obra-mensagens');

-- Qualquer autenticado pode ler
CREATE POLICY "authenticated_read_obra_mensagens"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'obra-mensagens');
```

**IMPORTANTE:** Verificar que `public.is_admin_or_supervisor()` existe (criada na migration `020_portal_cliente.sql`).

### Signed URL (download seguro)

```ts
// No route handler GET /api/cliente/obras/[obra_id]/documentos/[doc_id]/download:
const { data, error } = await supabase.storage
  .from('obra-docs')
  .createSignedUrl(documento.storage_path, 60) // 60 segundos

if (error || !data) return Response.json({ error: 'Falha ao gerar link' }, { status: 500 })
return Response.json({ url: data.signedUrl })
```

### Realtime Subscription

```ts
// Client Component — /cliente/[obra_id]/mensagens/_components/chat-feed.tsx
'use client'
import { createClient } from '@web/lib/supabase/client'

useEffect(() => {
  const supabase = createClient()
  const channel = supabase
    .channel(`obra-mensagens-${obra_id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'obra_mensagens',
        filter: `obra_id=eq.${obra_id}`,
      },
      (payload) => {
        setMensagens(prev => [...prev, payload.new as Mensagem])
        // auto-scroll após render
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [obra_id])
```

### INSERT em obra_mensagens (API cliente)

```ts
// POST /api/cliente/obras/[obra_id]/mensagens/route.ts
const auth = await requireAuth()
if (auth.error) return auth.error
const { appUser, supabase } = auth

// appUser.id é o ID na tabela `users` (não o auth UUID)
const { data: mensagem } = await supabase
  .from('obra_mensagens')
  .insert({
    obra_id,
    org_id: appUser.org_id,   // ← sempre do appUser, nunca do body
    sender_id: appUser.id,    // ← FK → users.id (não auth.uid)
    sender_type: 'cliente',
    content: body.content,
    message_type: 'text',
  })
  .select()
  .single()
```

**IMPORTANTE:** `requireAuth()` retorna `appUser` com `{ id, role, org_id }` da tabela `users`. Usar `appUser.id` (não `user.id` do auth) como `sender_id`, pois `obra_mensagens.sender_id` é FK para `users.id`.

### Upload de Documento (Admin)

```ts
// POST /api/admin/obras/[obra_id]/documentos/route.ts
const formData = await req.formData()
const file = formData.get('file') as File
const name = formData.get('name') as string
const category = (formData.get('category') as string) ?? 'Outros'

// Validação de tamanho (50 MB)
if (file.size > 50 * 1024 * 1024) {
  return NextResponse.json({ error: 'Arquivo muito grande (máx. 50 MB)' }, { status: 400 })
}

const ext = file.name.split('.').pop()
const storagePath = `obra-docs/${obra_id}/${crypto.randomUUID()}-${file.name}`

const bytes = await file.arrayBuffer()
const { error: uploadError } = await supabase.storage
  .from('obra-docs')
  .upload(storagePath, Buffer.from(bytes), {
    contentType: file.type,
    upsert: false,
  })
```

### Bottom Tab Navigation

A página `/cliente/[obra_id]/page.tsx` existe sem layout de grupo. Para adicionar navegação
sem quebrar a rota existente:

1. Criar `/cliente/[obra_id]/layout.tsx` (Next.js suporta `layout.tsx` + `page.tsx` no mesmo
   segmento — o layout envolve tanto o `page.tsx` quanto os sub-segmentos)
2. O layout adiciona a bottom tab bar abaixo do `{children}`

```tsx
// /cliente/[obra_id]/layout.tsx
export default async function ObraLayout({ children, params }: {
  children: React.ReactNode
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  return (
    <div className="flex min-h-screen flex-col bg-stone-950 pb-16">
      {children}
      <ObraTabNav obra_id={obra_id} /> {/* sticky bottom, Client Component */}
    </div>
  )
}
```

### Tamanho legível de arquivo

```ts
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

### Schema Relevante (migrations 018-020)

```sql
-- obra_documentos (020_portal_cliente.sql)
obra_documentos.id, obra_documentos.obra_id, obra_documentos.org_id
obra_documentos.uploaded_by (FK → users.id)
obra_documentos.name (varchar 255), obra_documentos.filename
obra_documentos.storage_path ('obra-docs/{obra_id}/{uuid}-{filename}')
obra_documentos.category (varchar 100) -- 'ART/RRT' | 'Contratos' | 'Memoriais' | 'Outros'
obra_documentos.file_size_bytes (integer), obra_documentos.created_at

-- obra_mensagens (020_portal_cliente.sql)
obra_mensagens.id, obra_mensagens.obra_id, obra_mensagens.org_id
obra_mensagens.sender_id (FK → users.id), obra_mensagens.sender_type ('cliente' | 'equipe')
obra_mensagens.content (text, nullable para image/audio)
obra_mensagens.message_type ('text' | 'image' | 'audio')
obra_mensagens.storage_path (nullable, para image/audio)
obra_mensagens.read_at (nullable), obra_mensagens.created_at
```

### Insights de Stories Anteriores

- `params` sempre é `Promise<{ obra_id: string }>` → usar `await params`
- `requireAuth()` retorna `{ error: NextResponse }` ou `{ supabase, user, appUser }`
- RLS em `obra_documentos` e `obra_mensagens` já existe (migration 020) — `createClient()` do servidor aplica automaticamente
- Bucket `obra-docs` e `obra-mensagens` já criados (migration 020) — faltam apenas as storage policies
- Admin detalhe da obra (`/dashboard/obras/[obra_id]/page.tsx`) **não tem tabs** — são seções flat. Esta story deve criar a UI de tabs (Fotos / Documentos) e reorganizar o conteúdo existente dentro das tabs. Usar `useState<'fotos' | 'documentos'>` simples com botões de seleção no topo da página.
- URL pública só funciona para buckets públicos (`obra-fotos`). Para buckets privados, usar signed URL

### Estrutura de Arquivos a Criar

```
supabase/migrations/
└── 022_portal_docs_mensagens_storage.sql  ← Storage policies obra-docs + obra-mensagens

packages/web/src/app/
├── api/
│   ├── admin/obras/[obra_id]/
│   │   └── documentos/
│   │       ├── route.ts                   ← POST upload doc, GET lista
│   │       └── [doc_id]/
│   │           └── route.ts               ← DELETE documento
│   └── cliente/obras/[obra_id]/
│       ├── mensagens/
│       │   ├── route.ts                   ← POST enviar mensagem texto
│       │   └── upload/
│       │       └── route.ts               ← POST upload imagem/áudio
│       └── documentos/
│           └── [doc_id]/
│               └── download/
│                   └── route.ts           ← GET signed URL
├── cliente/[obra_id]/
│   ├── layout.tsx                         ← CRIAR: bottom tab navigation
│   ├── documentos/
│   │   └── page.tsx                       ← CRIAR: lista documentos + download
│   └── mensagens/
│       ├── page.tsx                       ← CRIAR: Server Component (dados iniciais)
│       └── _components/
│           ├── chat-feed.tsx              ← CRIAR: Client Component (Realtime + input)
│           └── obra-tab-nav.tsx           ← CRIAR: Client Component (tabs navegação)
└── dashboard/obras/[obra_id]/
    └── _components/
        └── doc-upload-form.tsx            ← CRIAR: Client Component upload documentos
```

### Arquivos a Modificar

```
packages/web/src/app/dashboard/obras/[obra_id]/page.tsx
  ← Adicionar tab "Documentos" + listar obra_documentos + slot <DocUploadForm>
```

## Tasks / Subtasks

- [x] **Task 1 — Migration storage policies** (AC: 1, 7)
  - [x] Criar `supabase/migrations/022_portal_docs_mensagens_storage.sql`
  - [x] `DROP POLICY IF EXISTS` antes de `CREATE POLICY` (idempotente)
  - [x] Policies para `obra-docs`: admin upload/delete, authenticated read
  - [x] Policies para `obra-mensagens`: authenticated upload/read
  - [x] Verificar existência de `public.is_admin_or_supervisor()` antes de referenciar

- [x] **Task 2 — API admin documentos** (AC: 1, 2)
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts`
  - [x] `GET`: lista documentos da obra filtrado por `org_id`, ordenado por `created_at DESC`
  - [x] `POST`: `requireAuth()` + role check + `formData()` + validar tamanho ≤ 50 MB + upload Storage + INSERT `obra_documentos`
  - [x] Criar `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/route.ts`
  - [x] `DELETE`: buscar doc, verificar `org_id`, remover Storage, DELETE tabela, retornar 204

- [x] **Task 3 — API cliente download signed URL** (AC: 4)
  - [x] Criar `packages/web/src/app/api/cliente/obras/[obra_id]/documentos/[doc_id]/download/route.ts`
  - [x] `requireAuth()` + buscar documento (RLS garante que pertence ao cliente)
  - [x] `createSignedUrl(storage_path, 60)` + retornar `{ url }`

- [x] **Task 4 — API cliente mensagens — texto** (AC: 6)
  - [x] Criar `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/route.ts`
  - [x] `requireAuth()` + validar `content` (não vazio, ≤ 2000 chars)
  - [x] INSERT `obra_mensagens` com `sender_type: 'cliente'`, `message_type: 'text'`
  - [x] Retornar 201 com mensagem criada

- [x] **Task 5 — API cliente mensagens — upload mídia** (AC: 7)
  - [x] Criar `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/upload/route.ts`
  - [x] `formData()` + detectar `type` (`image` ou `audio`)
  - [x] Validar tipo MIME e tamanho (10 MB imagem / 20 MB áudio)
  - [x] Upload Storage em `obra-mensagens/{obra_id}/{uuid}.{ext}`
  - [x] INSERT `obra_mensagens` com `message_type = type`, `storage_path`, `content: null`

- [x] **Task 6 — Admin UI: tab Documentos** (AC: 3)
  - [x] Criar `packages/web/src/app/dashboard/obras/[obra_id]/_components/doc-upload-form.tsx`
  - [x] Input de arquivo + campo `name` (obrigatório) + select `category` + botão "Enviar"
  - [x] POST para `/api/admin/obras/[obra_id]/documentos` + `router.refresh()`
  - [x] Modificar `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`:
    - [x] Adicionar query `obra_documentos` (nome, categoria, tamanho, data)
    - [x] Criar `ObraDetailTabs` (Client Component) com tabs Fotos/Documentos + `DocDeleteButton`

- [x] **Task 7 — Bottom tab navigation** (AC: 11)
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx` (Client Component)
  - [x] Usar `usePathname()` para detectar aba ativa
  - [x] Tabs: `Obra` (`/cliente/${obra_id}`), `Documentos` (`/cliente/${obra_id}/documentos`), `Mensagens` (`/cliente/${obra_id}/mensagens`)
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/layout.tsx` com `pb-16` no wrapper + `<ObraTabNav>`

- [x] **Task 8 — Página cliente Documentos** (AC: 5)
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/documentos/page.tsx` (Server Component)
  - [x] Query `obra_documentos` via Supabase (RLS aplica automaticamente)
  - [x] Tabs de categoria dinâmicos via searchParams `?categoria=`
  - [x] Lista com `formatBytes()`, ícone, botão "↓ Baixar" via `/download-redirect` endpoint
  - [x] Estado vazio adequado

- [x] **Task 9 — Página + chat cliente Mensagens** (AC: 8, 9, 10)
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` (Server Component)
    - [x] Busca mensagens iniciais via Supabase direto (ordered por `created_at ASC`)
    - [x] Passa para `<ChatFeed>` como prop `initialMensagens`
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` (Client Component)
    - [x] Estado: `mensagens` inicializado com `initialMensagens`
    - [x] Realtime subscription (canal `obra-mensagens-{obra_id}`, INSERT event, dedup por id)
    - [x] `useRef` para container + auto-scroll no mount e ao receber mensagem
    - [x] Renderizar mensagens por tipo (texto / imagem signed / áudio signed)
    - [x] Input: `<textarea>` com auto-resize + Enter to send + Shift+Enter newline
    - [x] Botão 📎 com file picker `accept="image/*,audio/*"` → upload + mensagem
    - [x] Estado de loading e erro inline

- [x] **Task 10 — Type-check e lint** (AC: 12, 13)
  - [x] `pnpm run type-check` → 0 erros
  - [x] `pnpm run lint` → 0 erros/avisos nos arquivos novos

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml`.
> Validação de qualidade via processo manual (`@qa` executa QA gate).

## Definition of Done

- [ ] Migration `022_portal_docs_mensagens_storage.sql` aplicada sem erros em dev
- [ ] Admin consegue fazer upload e excluir documentos pelo painel
- [ ] Cliente vê lista de documentos filtrada por categoria e baixa via signed URL
- [ ] Cliente envia mensagem de texto e ela aparece no feed
- [ ] Cliente envia imagem/áudio e aparecem no chat com player/thumbnail
- [ ] Realtime: mensagem da equipe (inserida diretamente no banco) aparece sem refresh
- [ ] Bottom tab navigation funcional entre as 3 abas do portal
- [ ] `pnpm run type-check` passa sem erros
- [ ] `pnpm run lint` passa sem erros

## File List

### Criados
- `supabase/migrations/022_portal_docs_mensagens_storage.sql` — Storage policies obra-docs e obra-mensagens
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts` — GET lista + POST upload doc
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/route.ts` — DELETE doc
- `packages/web/src/app/api/cliente/obras/[obra_id]/documentos/[doc_id]/download/route.ts` — GET signed URL JSON
- `packages/web/src/app/api/cliente/obras/[obra_id]/documentos/[doc_id]/download-redirect/route.ts` — GET 302 redirect para signed URL
- `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/route.ts` — POST mensagem texto
- `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/upload/route.ts` — POST upload imagem/áudio
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — Layout com bottom tab nav
- `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx` — Bottom nav Client Component
- `packages/web/src/app/cliente/[obra_id]/documentos/page.tsx` — Página documentos + filtros
- `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` — Página mensagens Server Component
- `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` — ChatFeed Realtime Client Component
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/doc-upload-form.tsx` — Upload de documentos
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/doc-delete-button.tsx` — Delete de documentos
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` — Tabs Fotos/Documentos

### Modificados
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` — Refatorado para usar ObraDetailTabs + query documentos

## QA Results

**Gate Decision: PASS**
**Data:** 2026-05-05
**Reviewer:** Quinn (@qa)

### Checklist

| Check | Status |
|-------|--------|
| Code review (padrões, legibilidade) | ✅ PASS |
| Validações e testes inline | ✅ PASS |
| Acceptance Criteria (AC1–AC13) | ✅ PASS |
| Sem regressões | ✅ PASS |
| Performance (Realtime cleanup, TTL URLs) | ✅ PASS |
| Segurança OWASP (auth, org isolation, no injection) | ✅ PASS |
| Lint e type-check (15 arquivos novos) | ✅ PASS |

### Issues

| Severidade | Descrição |
|-----------|-----------|
| LOW | `DocDeleteButton` não checa status HTTP do DELETE — falha silenciosa em erro de rede. Sem impacto de segurança. |
| LOW | Signed URLs de mídia com TTL 300s — expiram em páginas idle >5min. Risco documentado na story como aceitável. |
| INFO | AC4 especifica `{ url }` mas página usa `/download-redirect` (302 redirect). Ambas as rotas existem; implementação mais limpa que o especificado. |

### Conclusão

Sem issues HIGH/CRITICAL. Segurança verificada: `requireAuth()` + role check em todas as routes admin; `sender_id`/`org_id` sempre do `appUser` (nunca do body); RLS Supabase aplicada server-side; rollback no Storage implementado nos dois endpoints de upload. Story pronta para `@devops *push`.

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-05 | River (@sm) | Story criada — Draft |
| 2026-05-05 | Pax (@po) | Validação GO — C-001 (AC8 wording), C-002 (INSERT pattern mensagens), C-003 (tabs no admin) corrigidos; status → Ready |
| 2026-05-05 | Dex (@dev) | Implementação completa: migration 022, 6 API routes, 2 páginas portal, ChatFeed Realtime, tabs admin, bottom nav. type-check e lint limpos. Commit 0f8281a. Status → InReview |
| 2026-05-05 | Quinn (@qa) | QA Gate: PASS — sem issues HIGH/CRITICAL. 2 issues LOW documentados. Status → Done (aguarda push @devops) |

---
epic: 20
story: 20.6
title: Central de Notificações do Portal do Cliente
status: InReview
priority: P3
created_at: 2026-05-06
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [notification_delivery, preference_settings, email_template]
complexity: M
estimated_hours: 5
depends_on: ["20.4", "20.5"]
blocks: []
---

# Story 20.6 — Central de Notificações do Portal do Cliente

## Contexto

**Epic 20 — Portal do Cliente**

Stories 20.1a (schema + RLS), 20.1b (auth + middleware), 20.2 (portal visão geral), 20.3
(admin upload de fotos), 20.4 (documentos + chat realtime) e 20.5 (painel admin gestão
completa de obras) estão implementadas. O cliente já acessa o portal, troca mensagens e
baixa documentos. O admin já faz upload, gerencia fases e responde clientes pelo painel.

O elo que falta é a **notificação proativa**: quando o admin adiciona uma foto, disponibiliza
um documento, responde no chat ou atualiza o progresso da obra, o cliente não recebe nenhum
alerta — precisa entrar no portal para descobrir. Esta story fecha essa lacuna.

Dois pilares:

1. **Preferências** — Página no portal do cliente para configurar canais (email, WhatsApp) e
   tipos de notificação (nova foto, novo documento, nova mensagem, progresso atualizado).
   Lê e escreve na tabela `obra_notificacao_prefs` (criada na migration 020 de Story 20.1a).

2. **Dispatch** — Após cada operação admin relevante, um utilitário de notificação identifica
   os clientes vinculados à obra, consulta as preferências de cada um e dispara email via
   Resend (já configurado) e/ou WhatsApp via Graph API (com fallback silencioso).

As notificações são **fire-and-forget**: não bloqueiam a resposta da API admin, não retornam
erros ao usuário admin se falharem, e logam falhas no console do servidor para observabilidade.

## Story Statement

**Como** cliente da Trifold,
**Quero** receber notificações por email (e opcionalmente WhatsApp) quando há atualizações
na minha obra — novas fotos, documentos, mensagens da equipe ou progresso atualizado —
**Para que** eu não precise entrar no portal para descobrir novidades e me mantenha
informado de forma proativa.

## Acceptance Criteria

### Preferências de Notificação

- [x] **AC1:** `GET /api/cliente/obras/[obra_id]/notificacoes` retorna as preferências do
  usuário autenticado:
  - Busca em `obra_notificacao_prefs` onde `user_id = appUser.id`
  - Se não existir: retorna defaults `{ email_enabled: true, whatsapp_enabled: false,
    notify_nova_foto: true, notify_novo_documento: true, notify_nova_mensagem: true,
    notify_progresso: true }`
  - Retorna `{ prefs: ObraNotificacaoPrefs }` com 200

- [x] **AC2:** `PATCH /api/cliente/obras/[obra_id]/notificacoes` salva preferências:
  - Body: subset de campos (`email_enabled`, `whatsapp_enabled`, `notify_nova_foto`,
    `notify_novo_documento`, `notify_nova_mensagem`, `notify_progresso`) mais campo opcional
    `phone` (string | null)
  - Upsert em `obra_notificacao_prefs` (INSERT se não existir, UPDATE se existir) usando
    `ON CONFLICT (user_id) DO UPDATE`
  - Se `phone` presente no body: fazer UPDATE em `users` → `SET phone = $phone WHERE id = appUser.id`
  - Retorna `{ prefs: ObraNotificacaoPrefs }` com 200
  - Apenas usuário autenticado pode editar suas próprias prefs (RLS já garante; adicionar
    check `user_id = appUser.id` no servidor)

- [x] **AC3:** Página `/cliente/[obra_id]/notificacoes/page.tsx` (Client Component):
  - Carrega prefs via `GET` ao montar
  - Exibe:
    ```
    [Canais]
      ☑ E-mail  (email do usuário — read-only, exibido como label)
      ☐ WhatsApp
           [campo de texto] Número (+55 XX XXXXX-XXXX) — visível apenas se whatsapp_enabled
    [Notificar quando:]
      ☑ Nova foto adicionada
      ☑ Novo documento disponível
      ☑ Nova mensagem da equipe
      ☑ Progresso da obra atualizado
    [Botão] Salvar preferências
    ```
  - Salva via `PATCH` ao submeter; exibe feedback de sucesso/erro inline
  - Tab "Notificações" adicionada à bottom nav do portal (`obra-tab-nav.tsx`)

### Disparo de Notificações — Email

- [x] **AC4:** Email disparado quando admin faz upload de foto (se `notify_nova_foto = true`
  e `email_enabled = true` para o cliente):
  - Modificar `POST /api/admin/obras/[obra_id]/fotos/route.ts`
  - Após INSERT bem-sucedido: chamar `notifyClientes(supabase, obraId, 'nova_foto', obraName)`
    de forma fire-and-forget (não aguardar; não propagar erros)

- [x] **AC5:** Email disparado quando admin faz upload de documento (se `notify_novo_documento
  = true` e `email_enabled = true`):
  - Modificar `POST /api/admin/obras/[obra_id]/documentos/route.ts`
  - Após INSERT bem-sucedido: chamar `notifyClientes(supabase, obraId, 'novo_documento', obraName)`

- [x] **AC6:** Email disparado quando equipe envia mensagem (se `notify_nova_mensagem = true`
  e `email_enabled = true`):
  - Modificar `POST /api/admin/obras/[obra_id]/mensagens/route.ts`
  - Após INSERT bem-sucedido: chamar `notifyClientes(supabase, obraId, 'nova_mensagem', obraName)`

- [x] **AC7:** Email disparado quando admin atualiza o progresso da obra (se `notify_progresso
  = true` e `email_enabled = true`):
  - Modificar `PATCH /api/admin/obras/[obra_id]/route.ts`
  - Apenas disparar se `progress_pct` estiver nos campos a atualizar (ignorar edições de
    name/description/status que não incluam progresso)
  - Chamar `notifyClientes(supabase, obraId, 'progresso', obraName)`

- [x] **AC8:** Template de email com estrutura visual mínima:
  - Assunto: `"Atualização na sua obra — {obraName}"`
  - Corpo HTML: logo Trifold (texto "Trifold" estilizado) + descrição do evento + link CTA
    "Ver no Portal" apontando para `${NEXT_PUBLIC_APP_URL}/cliente/{obra_id}`
  - Usar `sendEmail()` de `@web/lib/email` (já configurado com Resend)

### Disparo de Notificações — WhatsApp

- [x] **AC9:** WhatsApp disparado para clientes com `whatsapp_enabled = true` e
  `users.phone` preenchido:
  - Mensagem: `"Olá {nome}! Há uma atualização na sua obra {obraName}: {descricaoEvento}.
    Acesse o portal: {link}"`
  - Usar `whatsapp_config` filtrada por `org_id` da obra para obter `phone_number_id` e
    `access_token`; enviar via Graph API `v21.0`
  - `org_id` obtido internamente em `notifyClientes` via query em `obras.org_id`

- [x] **AC10:** Se WhatsApp indisponível (config ausente, erro de rede, API retorna erro):
  - Capturar exceção no bloco try/catch
  - Logar no console: `[notificacoes] WhatsApp skip: {motivo}`
  - Não retornar erro; não bloquear email nem a operação admin original

- [x] **AC11:** `pnpm run type-check` passa sem erros nos arquivos novos e modificados

- [x] **AC12:** `pnpm run lint` passa sem erros nos arquivos novos e modificados

## Escopo

**IN SCOPE:**
- Utility `lib/notificacoes.ts` com `notifyClientes()` (email + WhatsApp fire-and-forget)
- API GET/PATCH `/api/cliente/obras/[obra_id]/notificacoes` — preferências do usuário
- Página `/cliente/[obra_id]/notificacoes/page.tsx` — UI de configuração
- Integração do notify nas 4 rotas admin (fotos, documentos, mensagens, PATCH obra)
- Adição de "Notificações" na bottom tab nav do portal

**OUT OF SCOPE:**
- Notificações push (PWA) → Stories 10-1 e 10-2 já existem em `docs/stories/active/`
- Read receipts / confirmação de leitura de notificação
- Histórico de notificações enviadas (log de auditoria)
- Notificações para múltiplas obras de um mesmo cliente (prefs são globais por usuário)
- Configuração de frequência (imediato sempre; batching = futuro)
- WhatsApp Business templates aprovados (usar mensagem texto livre; válido para contas com sessão ativa)

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `whatsapp_config` ausente para a org → crash no notifyClientes | Alta | try/catch em todo o bloco WhatsApp; verificar config antes de tentar envio |
| `users.phone` em formato não normalizado → rejeição pelo Graph API | Média | Usar o campo como-está; documentar que deve ser formato internacional (`+55...`) |
| `NEXT_PUBLIC_APP_URL` não configurado em produção → CTA com URL vazia | Média | Usar fallback `'https://app.trifold.com.br'` se env não definida |
| fire-and-forget oculta falhas de email → cliente nunca recebeu | Baixa | `console.error` com detalhes suficientes para debug; Resend dashboard tem logs |
| RLS em `obra_notificacao_prefs` bloqueia INSERT do servidor | Baixa | Usar `createAdminClient()` no utilitário (service role bypassa RLS) |

## Dev Notes

### Stack e Padrões

- **Framework:** Next.js 14 App Router
- **Auth em API routes:** `requireAuth()` de `@web/lib/api-auth`
- **Auth em Server Components:** `getServerUser()` de `@web/lib/auth`
- **Admin client (bypassa RLS):** `createAdminClient()` de `@web/lib/supabase/admin`
- **Email:** `sendEmail()` de `@web/lib/email` — `{ to, subject, html }` → `{ id, error? }`
- **Supabase client (server):** `createClient()` de `@web/lib/supabase/server`
- **Estilo portal:** Tailwind dark theme (`stone-950`, `stone-900`, `stone-800`, acento `#E8856A`)

### Schema Relevante (migration 020 — já existente)

```sql
-- obra_notificacao_prefs (020_portal_cliente.sql)
id uuid PRIMARY KEY
user_id uuid UNIQUE NOT NULL REFERENCES users(id)
email_enabled boolean NOT NULL DEFAULT true
whatsapp_enabled boolean NOT NULL DEFAULT false
notify_nova_foto boolean NOT NULL DEFAULT true
notify_novo_documento boolean NOT NULL DEFAULT true
notify_nova_mensagem boolean NOT NULL DEFAULT true
notify_progresso boolean NOT NULL DEFAULT true
created_at timestamptz
updated_at timestamptz

-- users (001_base_schema.sql — já existente)
users.phone varchar(50)  -- número do cliente para WhatsApp
users.email varchar(255)
users.name varchar(255)
```

**Nenhuma migration nova é necessária** — `obra_notificacao_prefs` já existe na migration 020.

### Utility de Notificação

```ts
// packages/web/src/lib/notificacoes.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@web/lib/email'
import { createAdminClient } from '@web/lib/supabase/admin'

type EventoNotificacao = 'nova_foto' | 'novo_documento' | 'nova_mensagem' | 'progresso'

const EVENTO_LABEL: Record<EventoNotificacao, string> = {
  nova_foto:       'Nova foto adicionada à sua obra',
  novo_documento:  'Novo documento disponível',
  nova_mensagem:   'Nova mensagem da equipe Trifold',
  progresso:       'Progresso da obra atualizado',
}

const EVENTO_PREF_KEY: Record<EventoNotificacao, keyof ObraNotificacaoPrefs> = {
  nova_foto:       'notify_nova_foto',
  novo_documento:  'notify_novo_documento',
  nova_mensagem:   'notify_nova_mensagem',
  progresso:       'notify_progresso',
}

export async function notifyClientes(
  supabase: SupabaseClient,
  obraId: string,
  evento: EventoNotificacao,
  obraName: string,
): Promise<void> {
  try {
    // Admin client para leitura cross-RLS
    const admin = createAdminClient()

    // 1. Buscar org_id da obra + clientes vinculados
    const { data: obra } = await admin
      .from('obras')
      .select('org_id')
      .eq('id', obraId)
      .single()

    const orgId = obra?.org_id

    const { data: vinculos } = await admin
      .from('cliente_obras')
      .select('user_id')
      .eq('obra_id', obraId)

    if (!vinculos?.length) return

    const userIds = vinculos.map(v => v.user_id)

    // 2. Buscar prefs + dados do usuário
    const { data: clientes } = await admin
      .from('obra_notificacao_prefs')
      .select('user_id, email_enabled, whatsapp_enabled, notify_nova_foto, notify_novo_documento, notify_nova_mensagem, notify_progresso, users(name, email, phone)')
      .in('user_id', userIds)

    const prefKey = EVENTO_PREF_KEY[evento]
    const descricao = EVENTO_LABEL[evento]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.trifold.com.br'
    const link = `${appUrl}/cliente/${obraId}`

    for (const pref of clientes ?? []) {
      const user = Array.isArray(pref.users) ? pref.users[0] : pref.users
      if (!user) continue
      if (!pref[prefKey]) continue

      // Email
      if (pref.email_enabled) {
        sendEmail({
          to: user.email,
          subject: `Atualização na sua obra — ${obraName}`,
          html: buildEmailHtml({ nome: user.name, obraName, descricao, link }),
        }).catch(err => console.error('[notificacoes] email error:', err))
      }

      // WhatsApp (fire-and-forget, falha silenciosa)
      if (pref.whatsapp_enabled && user.phone && orgId) {
        sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, link)
          .catch(err => console.error('[notificacoes] WhatsApp skip:', err))
      }
    }
  } catch (err) {
    console.error('[notificacoes] notifyClientes error:', err)
  }
}
```

> **IMPORTANTE:** `notifyClientes` usa `createAdminClient()` internamente para bypassa RLS ao
> ler prefs de todos os clientes vinculados. Isso é seguro pois a função é chamada apenas de
> routes admin (já autenticadas e com role check).

### Clientes sem prefs cadastradas

A tabela `obra_notificacao_prefs` só tem linha se o cliente acessou a página de preferências.
No `notifyClientes`, usar `LEFT JOIN` lógico: buscar clientes vinculados → filtrar pelos que
têm prefs. Clientes sem prefs **não** recebem notificação (opt-in implícito exige configuração).

Alternativa mais amigável: no `notifyClientes`, para clientes sem prefs, criar a linha com
defaults antes de enviar. Mas isso aumenta a complexidade — usar a abordagem simples (sem prefs
= sem notificação) para o MVP. Documentar como melhoria futura.

### WhatsApp via Graph API

```ts
async function sendWhatsApp(
  admin: SupabaseClient,
  orgId: string,
  phone: string,
  nome: string,
  obraName: string,
  descricao: string,
  link: string,
): Promise<void> {
  // Buscar config WhatsApp filtrada por org_id (multi-org safe)
  const { data: config } = await admin
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('org_id', orgId)
    .single()

  if (!config?.phone_number_id || !config?.access_token) {
    throw new Error('whatsapp_config não encontrada')
  }

  const body = `Olá ${nome}! Há uma atualização na sua obra ${obraName}: ${descricao}. Acesse o portal: ${link}`
  const url = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp API error: ${res.status} ${err}`)
  }
}
```

### Template de Email

```ts
function buildEmailHtml(params: {
  nome: string
  obraName: string
  descricao: string
  link: string
}): string {
  const { nome, obraName, descricao, link } = params
  return `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #0F0F0F; padding: 24px; text-align: center;">
      <span style="color: #E8856A; font-size: 22px; font-weight: bold; letter-spacing: 2px;">TRIFOLD</span>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #333; font-size: 16px;">Olá, <strong>${nome}</strong>!</p>
      <p style="color: #555; font-size: 15px;">Há uma novidade na sua obra <strong>${obraName}</strong>:</p>
      <p style="color: #E8856A; font-size: 15px; font-weight: 600;">${descricao}</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${link}"
           style="background: #E8856A; color: #fff; padding: 12px 28px; border-radius: 6px;
                  text-decoration: none; font-weight: 600; font-size: 15px;">
          Ver no Portal
        </a>
      </div>
      <p style="color: #999; font-size: 12px;">
        Para ajustar suas notificações, acesse as configurações no portal.<br>
        Você recebeu este email pois é cliente Trifold.
      </p>
    </div>
  </div>
</body>
</html>`
}
```

### Integração nas APIs Admin (padrão fire-and-forget)

```ts
// Após INSERT bem-sucedido na route admin, chamar sem await:
// Buscar obraName antes do fire-and-forget para ter o nome disponível
const { data: obra } = await supabase.from('obras').select('name').eq('id', obra_id).single()

// Fire-and-forget — não bloqueia resposta
notifyClientes(supabase, obra_id, 'nova_foto', obra?.name ?? 'Obra').catch(() => {})

return NextResponse.json({ foto: novaFoto }, { status: 201 })
```

### API de Preferências — Padrão de Upsert

```ts
// PATCH /api/cliente/obras/[obra_id]/notificacoes/route.ts
const auth = await requireAuth()
if (auth.error) return auth.error
const { appUser, supabase } = auth

const body = await req.json()
const allowed = ['email_enabled', 'whatsapp_enabled', 'notify_nova_foto',
                 'notify_novo_documento', 'notify_nova_mensagem', 'notify_progresso']
const updates: Record<string, unknown> = {}
for (const key of allowed) {
  if (typeof body[key] === 'boolean') updates[key] = body[key]
}

const { data: prefs, error } = await supabase
  .from('obra_notificacao_prefs')
  .upsert(
    { user_id: appUser.id, ...updates, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  .select()
  .single()
```

### Rota de Notificações — Verificação de Obra

O `[obra_id]` na rota de preferências é usado para derivar o link do CTA no futuro, mas as
prefs são por `user_id` (não por obra). O endpoint deve verificar que a obra pertence ao
cliente autenticado antes de aceitar (usar RLS via `cliente_obras`).

```ts
// Verificar vínculo: cliente pode ver/editar prefs por obra vinculada
const { data: vinculo } = await supabase
  .from('cliente_obras')
  .select('obra_id')
  .eq('obra_id', obra_id)
  .eq('user_id', appUser.id)
  .single()

if (!vinculo) return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
```

### Bottom Tab Nav — Adição de "Notificações"

```ts
// packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx
// Adicionar ao array de tabs:
{ href: `/cliente/${obra_id}/notificacoes`, label: 'Notificações', icon: BellIcon }
```

### Parâmetros — Server vs Client Component (Next.js 14)

```ts
// Server Component (page.tsx assíncrono) → await params
export default async function Page({ params }: { params: Promise<{ obra_id: string }> }) {
  const { obra_id } = await params
}

// Client Component ("use client") → useParams() do next/navigation
'use client'
import { useParams } from 'next/navigation'

export default function NotificacoesPage() {
  const { obra_id } = useParams<{ obra_id: string }>()
  // usar obra_id normalmente
}
```

A página `/notificacoes/page.tsx` é Client Component — usar `useParams()`, não `await params`.

### Estrutura de Arquivos a Criar

```
packages/web/src/
├── lib/
│   └── notificacoes.ts                              ← CRIAR: utility notifyClientes + helpers
└── app/
    ├── api/
    │   └── cliente/obras/[obra_id]/
    │       └── notificacoes/
    │           └── route.ts                         ← CRIAR: GET prefs + PATCH upsert
    └── cliente/[obra_id]/
        └── notificacoes/
            └── page.tsx                             ← CRIAR: Client Component UI preferências
```

### Arquivos a Modificar

```
packages/web/src/app/api/admin/obras/[obra_id]/fotos/route.ts
  ← Adicionar notifyClientes fire-and-forget após INSERT foto bem-sucedido

packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts
  ← Adicionar notifyClientes fire-and-forget após INSERT documento bem-sucedido

packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts
  ← Adicionar notifyClientes fire-and-forget após INSERT mensagem bem-sucedido

packages/web/src/app/api/admin/obras/[obra_id]/route.ts (PATCH)
  ← Adicionar notifyClientes fire-and-forget apenas se progress_pct nos updates

packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx
  ← Adicionar tab "Notificações" com link para /notificacoes
```

## Tasks / Subtasks

- [x] **Task 1 — Utility de notificação** (AC: 4, 5, 6, 7, 8, 9, 10)
  - [x] Criar `packages/web/src/lib/notificacoes.ts`
  - [x] Implementar `notifyClientes(supabase, obraId, evento, obraName)` — busca vinculos, prefs, dispara email/WhatsApp
  - [x] Implementar `buildEmailHtml()` — template HTML com logo Trifold e CTA "Ver no Portal"
  - [x] Implementar `sendWhatsApp()` — fetch Graph API v21.0 com try/catch + log silencioso
  - [x] Garantir que toda a função `notifyClientes` é envolta em try/catch — nunca propaga erro
  - [x] Usar `createAdminClient()` internamente para leitura cross-RLS de prefs

- [x] **Task 2 — API de preferências** (AC: 1, 2)
  - [x] Criar `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts`
  - [x] `GET`: `requireAuth()` + verificar vínculo `cliente_obras` + buscar `obra_notificacao_prefs` (retornar defaults se não existir)
  - [x] `PATCH`: `requireAuth()` + verificar vínculo + sanitizar campos booleanos + upsert `obra_notificacao_prefs` + retornar prefs atualizadas
  - [x] Se `phone` presente no body: `supabase.from('users').update({ phone }).eq('id', appUser.id)` (salva número WhatsApp do cliente)

- [x] **Task 3 — UI de preferências** (AC: 3)
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx` (Client Component `"use client"`)
  - [x] Carregar prefs via `fetch GET /api/cliente/obras/${obra_id}/notificacoes` no `useEffect`
  - [x] Checkboxes para todos os 6 campos boolean com estado local
  - [x] Campo de texto para phone (visível apenas se `whatsapp_enabled = true`)
  - [x] Botão "Salvar preferências" → `PATCH` → feedback inline ("Salvo!" / mensagem de erro)
  - [x] Estado de loading durante carregamento e salvamento

- [x] **Task 4 — Integrar notify: fotos admin** (AC: 4)
  - [x] Modificar `POST /api/admin/obras/[obra_id]/fotos/route.ts`
  - [x] Após INSERT bem-sucedido: buscar `obra.name`, chamar `notifyClientes(..., 'nova_foto', obraName).catch(() => {})`

- [x] **Task 5 — Integrar notify: documentos admin** (AC: 5)
  - [x] Modificar `POST /api/admin/obras/[obra_id]/documentos/route.ts`
  - [x] Após INSERT bem-sucedido: `notifyClientes(..., 'novo_documento', obraName).catch(() => {})`

- [x] **Task 6 — Integrar notify: mensagens admin** (AC: 6)
  - [x] Modificar `POST /api/admin/obras/[obra_id]/mensagens/route.ts`
  - [x] Após INSERT bem-sucedido: `notifyClientes(..., 'nova_mensagem', obraName).catch(() => {})`

- [x] **Task 7 — Integrar notify: progresso admin** (AC: 7)
  - [x] Modificar `PATCH /api/admin/obras/[obra_id]/route.ts`
  - [x] Verificar se `updates.progress_pct !== undefined` antes de chamar notify
  - [x] `notifyClientes(..., 'progresso', obraName).catch(() => {})`

- [x] **Task 8 — Bottom tab nav: aba Notificações** (AC: 3)
  - [x] Modificar `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx`
  - [x] Adicionar tab com ícone de sino (Bell do lucide-react) e label "Notificações"
  - [x] Link: `/cliente/${obra_id}/notificacoes`

- [x] **Task 9 — Type-check e lint** (AC: 11, 12)
  - [x] `pnpm run type-check` → 0 erros
  - [x] `pnpm run lint` → 0 erros/avisos nos arquivos novos e modificados

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml`.
> Validação de qualidade via processo manual (`@qa` executa QA gate).

## Definition of Done

- [x] `notifyClientes()` funciona: dado `obraId` com clientes e prefs configuradas, o email é disparado
- [x] API GET retorna prefs reais (ou defaults) para usuário autenticado
- [x] API PATCH persiste as prefs em `obra_notificacao_prefs` (upsert correto)
- [x] UI de preferências carrega, exibe e salva via API
- [x] Admin faz upload de foto → cliente com prefs padrão recebe email
- [x] Admin faz upload de documento → cliente recebe email (se habilitado)
- [x] Admin envia mensagem → cliente recebe email (se habilitado)
- [x] Admin atualiza `progress_pct` → cliente recebe email (se habilitado)
- [x] WhatsApp: se `whatsapp_config` ausente ou falhar → log + skip, operação admin não afetada
- [x] Tab "Notificações" aparece na bottom nav do portal do cliente
- [x] `pnpm run type-check` passa sem erros
- [x] `pnpm run lint` passa sem erros

## File List

### A Criar
- `packages/web/src/lib/notificacoes.ts` — Utility `notifyClientes`, `buildEmailHtml`, `sendWhatsApp`
- `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts` — GET prefs + PATCH upsert
- `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx` — Client Component UI de preferências

### A Modificar
- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/route.ts` — fire-and-forget notify nova_foto
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts` — fire-and-forget notify novo_documento
- `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` — fire-and-forget notify nova_mensagem
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` — fire-and-forget notify progresso (quando progress_pct presente)
- `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx` — adicionar tab Notificações

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-06 | River (@sm) | Story criada — Draft |
| 2026-05-06 | Pax (@po) | Validação GO — C-001 (phone sem persistência → PATCH salva users.phone), C-002 (whatsapp_config sem org filter → filtrar por org_id da obra), C-003 (useParams para Client Component documentado) corrigidos; status → Ready |
| 2026-05-06 | Dex (@dev) | Implementação completa — 9 tasks concluídas, 9 arquivos criados/modificados, type-check e lint passando; status → InReview |

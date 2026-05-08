---
epic: 22
story: 22.2
title: Portal do Cliente — Push Notifications
status: Done
priority: P2
created_at: 2026-05-06
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [push_delivery, subscription_rls, preference_integration, vapid_security]
complexity: G
estimated_hours: 5
depends_on: ["22.1"]
blocks: []
---

# Story 22.2 — Portal do Cliente: Push Notifications

## Contexto

**Epic 22 — Portal do Cliente: PWA e Push Notifications**

Com Story 22.1 completa, o portal é uma PWA instalável com service worker ativo. O service worker
`sw.js` já tem o handler `push` ausente — esta story o adiciona junto com toda a infraestrutura
de backend.

**Infraestrutura existente relevante:**

- `packages/web/src/lib/notificacoes.ts` — `notifyClientes(obraId, evento, obraName)` já é chamado
  pelos 4 admin routes (fotos, documentos, mensagens, PATCH obra). Ele lê `obra_notificacao_prefs`
  e dispara email + WhatsApp. Push será adicionado aqui — **sem tocar nos routes admin**.
- `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts` — GET/PATCH de prefs.
  Precisa incluir `push_enabled` no SELECT e no `PREF_BOOL_FIELDS`.
- `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx` — página de preferências do cliente.
  Precisa do toggle `push_enabled`.
- `packages/web/public/sw.js` — tem install + activate + fetch. Precisa do handler `push` e
  `notificationclick`.
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — layout do portal, onde `PushPrompt` será
  incluído.
- `public_user_id()` e `is_cliente()` — helpers RLS disponíveis (migrations 004 e 020).

**Variáveis de ambiente necessárias (gerar uma vez):**
```bash
# Gerar: cd packages/web && npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...   # exposta ao cliente — seguro
VAPID_PRIVATE_KEY=...              # JAMAIS no client bundle
VAPID_SUBJECT=mailto:tech@trifold.eng.br
```

## Story Statement

**Como** cliente da Trifold com obra em andamento e portal instalado,
**Quero** receber notificações push no celular quando houver atualizações na minha obra,
**Para que** eu seja alertado instantaneamente sem precisar abrir o app ou verificar email.

## Acceptance Criteria

- [ ] **AC1:** Migration 023 aplicada — `push_subscriptions` criada com RLS; coluna
  `push_enabled boolean NOT NULL DEFAULT false` adicionada em `obra_notificacao_prefs`.

- [ ] **AC2:** Banner de permissão (`PushPrompt`) aparece no portal para clientes com
  `Notification.permission === 'default'` e desaparece após concessão ou descarte.

- [ ] **AC3:** `POST /api/push/subscribe` salva subscription em `push_subscriptions`
  (endpoint, p256dh, auth, device_info) vinculada ao `user_id` do cliente autenticado.

- [ ] **AC4:** `DELETE /api/push/subscribe` remove a subscription pelo `endpoint` para o
  cliente autenticado.

- [ ] **AC5:** Push enviado quando admin adiciona foto, **se** `push_enabled = true` E
  `notify_nova_foto = true` nas prefs do cliente vinculado.

- [ ] **AC6:** Push enviado quando admin envia mensagem na obra,  **se** `push_enabled = true`
  E `notify_nova_mensagem = true`.

- [ ] **AC7:** Clique na notificação push abre a tela relevante do portal
  (`/cliente/{obra_id}/mensagens`, `/cliente/{obra_id}/fotos`, etc.).

- [ ] **AC8:** Subscription expirada (HTTP 410 da API de push) removida silenciosamente do banco
  sem retornar erro ao usuário ou ao admin.

- [ ] **AC9:** Toggle `push_enabled` funciona na Central de Notificações
  (`/cliente/[obra_id]/notificacoes`) — salva via PATCH e reflete estado atual.

- [ ] **AC10:** `VAPID_PRIVATE_KEY` **nunca** aparece em resposta de API, log de servidor ou
  bundle do cliente. Verificar que `push-service.ts` é server-only e não é importado por
  nenhum client component.

## Escopo

**IN SCOPE:**
- Migration 023: `push_subscriptions` + `obra_notificacao_prefs.push_enabled`
- `packages/web/public/sw.js` — adicionar handler `push` e `notificationclick`
- `packages/web/src/lib/server/push-service.ts` — `sendPushToUser()` server-side
- `packages/web/src/app/api/push/subscribe/route.ts` — POST + DELETE
- `packages/web/src/lib/notificacoes.ts` — integrar push dispatch em `notifyClientes()`
- `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts` — incluir `push_enabled`
- `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx` — toggle push_enabled
- `packages/web/src/components/portal/push-prompt.tsx` — banner de permissão
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — incluir `<PushPrompt />`
- Instalar dependência `web-push` + `@types/web-push` em `packages/web`

**OUT OF SCOPE:**
- Notificações push para admins/corretores
- Push para eventos além dos 4 mapeados (nova_foto, novo_documento, nova_mensagem, progresso)
- Cache avançado de assets (responsabilidade futura)
- Testes de entrega de push em dispositivo físico

## Dev Notes

### Migration 023: `supabase/migrations/023_push_notifications.sql`

```sql
-- Adicionar push_enabled em obra_notificacao_prefs
ALTER TABLE obra_notificacao_prefs
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false;

-- Tabela de subscriptions push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  device_info  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- RLS: cliente gerencia apenas suas próprias subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_manage_self" ON push_subscriptions
  FOR ALL USING (user_id = public.public_user_id());
```

### sw.js — Adicionar handlers push e notificationclick (ADITIVO)

Adicionar **após** o handler `fetch` existente. O arquivo já tem `install`, `activate` e `fetch`.

```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Trifold', {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/cliente' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
```

### Instalar dependência

```bash
pnpm --filter @trifold/web add web-push
pnpm --filter @trifold/web add -D @types/web-push
```

### `packages/web/src/lib/server/push-service.ts` (CRIAR)

```typescript
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  await Promise.allSettled(
    (subs ?? []).map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
        .catch((err: { statusCode?: number }) => {
          if (err.statusCode === 410) {
            // Subscription expirada — remover silenciosamente
            supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint)
              .then(() => {})
          }
        })
    )
  )
}
```

**CRÍTICO:** `push-service.ts` usa `VAPID_PRIVATE_KEY` — é **server-only**. Nunca importar em
arquivos `"use client"`. A pasta `lib/server/` sinaliza isso por convenção.

### `packages/web/src/app/api/push/subscribe/route.ts` (CRIAR)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@web/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const body = await req.json()
  const { endpoint, p256dh, auth: authKey } = body

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const deviceInfo = req.headers.get('user-agent') ?? undefined

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: appUser.id,
      endpoint,
      p256dh,
      auth: authKey,
      device_info: deviceInfo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', appUser.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
```

### Modificar `packages/web/src/lib/notificacoes.ts`

**1.** Adicionar `push_enabled` à interface `ObraNotificacaoPrefs`:
```typescript
interface ObraNotificacaoPrefs {
  user_id: string
  email_enabled: boolean
  whatsapp_enabled: boolean
  push_enabled: boolean      // ← ADICIONAR
  notify_nova_foto: boolean
  // ... resto igual
}
```

**2.** Adicionar mapeamento de URL por evento (antes de `notifyClientes`):
```typescript
const EVENTO_URL_PATH: Record<EventoNotificacao, string> = {
  nova_foto: '/fotos',
  novo_documento: '/documentos',
  nova_mensagem: '/mensagens',
  progresso: '',
}
```

**3.** Expandir `.select()` em `notifyClientes` para incluir `push_enabled`:
```typescript
const { data: prefs } = await admin
  .from("obra_notificacao_prefs")
  .select(
    "user_id, email_enabled, whatsapp_enabled, push_enabled, notify_nova_foto, ..."
  )
  .in("user_id", userIds)
```

**4.** Adicionar import estático no topo de `notificacoes.ts` (ambos são módulos server-side):
```typescript
import { sendPushToUser } from '@web/lib/server/push-service'
```

**5.** No loop de envio, adicionar bloco push após o bloco WhatsApp:
```typescript
if (pref.push_enabled) {
  sendPushToUser(admin, pref.user_id, {
    title: descricao,
    body: `Atualização em ${obraName}`,
    url: `${appUrl}/cliente/${obraId}${EVENTO_URL_PATH[evento]}`,
  }).catch((err) => console.error('[notificacoes] push error:', err))
}
```

**Por que import estático (não dinâmico):** `notificacoes.ts` é importado exclusivamente por API
routes (server-side). Não há risco de `VAPID_PRIVATE_KEY` chegar ao bundle do cliente. Import
estático é mais simples e mantém tipagem TypeScript correta.

### Modificar `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts`

**1.** Adicionar `"push_enabled"` ao array `PREF_BOOL_FIELDS`:
```typescript
const PREF_BOOL_FIELDS = [
  "email_enabled",
  "whatsapp_enabled",
  "push_enabled",         // ← ADICIONAR
  "notify_nova_foto",
  // ... resto igual
] as const
```

**2.** Adicionar `push_enabled: false` ao `DEFAULT_PREFS`.

**3.** Incluir `push_enabled` na string `.select()` do GET e no retorno do PATCH.

### `packages/web/src/components/portal/push-prompt.tsx` (CRIAR)

```tsx
'use client'

import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

export function PushPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Registrar SW (idempotente — seguro chamar em toda montagem)
    // Necessário para ativar offline fallback (Story 22.1) e push (Story 22.2)
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'default' ||
      sessionStorage.getItem('push-dismissed') === '1'
    ) return
    setVisible(true)
  }, [])

  async function handleActivate() {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') { setVisible(false); return }

    const reg = await navigator.serviceWorker.ready
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
        auth: arrayBufferToBase64(sub.getKey('auth')!),
      }),
    })

    setVisible(false)
  }

  function handleDismiss() {
    sessionStorage.setItem('push-dismissed', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="flex items-center justify-between gap-3 bg-stone-900 px-4 py-3 text-sm">
      <span className="text-stone-300">
        🔔 Receba notificações quando sua obra for atualizada.
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={handleActivate}
          className="rounded bg-[#e8856a] px-3 py-1 font-medium text-white hover:bg-[#d4745a]"
        >
          Ativar
        </button>
        <button
          onClick={handleDismiss}
          className="rounded px-3 py-1 text-stone-400 hover:text-stone-200"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
```

### Modificar `packages/web/src/app/cliente/[obra_id]/layout.tsx`

Adicionar `PushPrompt` acima de `{children}`:

```tsx
import type { Metadata } from "next"
import { ObraTabNav } from "./_components/obra-tab-nav"
import { PushPrompt } from "@web/components/portal/push-prompt"

export const metadata: Metadata = { ... } // inalterado

export default async function ObraLayout({ children, params }) {
  const { obra_id } = await params
  return (
    <div className="flex min-h-screen flex-col bg-stone-950 pb-16">
      <PushPrompt />
      {children}
      <ObraTabNav obraId={obra_id} />
    </div>
  )
}
```

### Modificar `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx`

**1.** Adicionar `push_enabled: boolean` à interface `NotifPrefs`.

**2.** Adicionar `push_enabled: false` ao `DEFAULT_PREFS`.

**3.** Adicionar toggle no formulário — após o bloco WhatsApp, antes do botão de salvar:

```tsx
{/* Push Notifications */}
<div className="...">
  <div className="flex items-center justify-between">
    <div>
      <p className="font-medium text-stone-100">Notificações push</p>
      <p className="text-xs text-stone-400">No celular, via app instalado</p>
    </div>
    <button
      type="button"
      onClick={() => toggle('push_enabled')}
      className={`... ${prefs.push_enabled ? 'bg-[#e8856a]' : 'bg-stone-700'}`}
    >
      ...
    </button>
  </div>
</div>
```

O visual do toggle deve seguir o padrão dos outros toggles já presentes na página
(email_enabled, whatsapp_enabled) — usar o mesmo padrão de classes existentes.

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `VAPID_PRIVATE_KEY` vazar para client bundle | Alta | `push-service.ts` em `lib/server/`, dynamic import em `notificacoes.ts` |
| iOS Safari < 16.4 não suporta push web | Baixa | Degradação graciosa — `PushPrompt` só aparece se browser suporta; sem funcionalidade quebrada |
| `push-service.ts` importado em "use client" acidentalmente | Alta | Dynamic import no `notificacoes.ts`; garantir que nenhum client component importa `lib/server/` |
| 410 Gone acumular antes de limpeza | Baixa | `sendPushToUser` remove silenciosamente no 410 |
| `web-push` types incompatíveis com TypeScript strict | Baixa | `@types/web-push` resolve — verificar type-check |
| SW nunca registrado → `serviceWorker.ready` nunca resolve | Alta | `PushPrompt` registra `'/sw.js'` no `useEffect` (idempotente); corrige também Story 22.1 AC2/AC5 |

## Tasks / Subtasks

- [x] **Task 1 — Migration 023** (AC1)
  - [x] Criar `supabase/migrations/023_push_notifications.sql` com conteúdo exato do Dev Notes
  - [x] Verificar que `public.public_user_id()` é referenciada corretamente na policy

- [x] **Task 2 — sw.js: handlers push e notificationclick** (AC7)
  - [x] Adicionar handlers `push` e `notificationclick` ao final de `packages/web/public/sw.js`
  - [x] Confirmar que não há handlers duplicados

- [x] **Task 3 — Instalar web-push e criar push-service.ts** (AC5, AC6, AC8)
  - [x] `pnpm --filter @trifold/web add web-push`
  - [x] `pnpm --filter @trifold/web add -D @types/web-push`
  - [x] Criar `packages/web/src/lib/server/push-service.ts` com código exato do Dev Notes
  - [x] Confirmar que `VAPID_PRIVATE_KEY` só é lido em server context

- [x] **Task 4 — Criar /api/push/subscribe** (AC3, AC4)
  - [x] Criar `packages/web/src/app/api/push/subscribe/route.ts` com POST + DELETE
  - [x] POST: upsert em `push_subscriptions`; DELETE: remove por endpoint + user_id

- [x] **Task 5 — Modificar notificacoes.ts** (AC5, AC6, AC7, AC8)
  - [x] Adicionar `push_enabled` à interface `ObraNotificacaoPrefs`
  - [x] Adicionar `EVENTO_URL_PATH` record
  - [x] Expandir `.select()` para incluir `push_enabled`
  - [x] Adicionar bloco push no loop com static import de `push-service.ts`

- [x] **Task 6 — Modificar notificacoes API route** (AC9)
  - [x] Adicionar `"push_enabled"` ao `PREF_BOOL_FIELDS`
  - [x] Adicionar `push_enabled: false` ao `DEFAULT_PREFS`
  - [x] Incluir `push_enabled` no `.select()` do GET e no retorno do PATCH

- [x] **Task 7 — Criar push-prompt.tsx e atualizar layout** (AC2, AC9)
  - [x] Criar `packages/web/src/components/portal/push-prompt.tsx` com código do Dev Notes
  - [x] Confirmar que `useEffect` registra `'/sw.js'` antes de verificar `Notification.permission`
  - [x] Adicionar `<PushPrompt />` em `packages/web/src/app/cliente/[obra_id]/layout.tsx`
  - [x] Adicionar toggle `push_enabled` em `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx`

- [x] **Task 8 — Validações finais** (AC10)
  - [x] `pnpm --filter @trifold/web run type-check` — zero erros nos arquivos desta story
  - [x] `pnpm --filter @trifold/web run lint` — zero erros nos arquivos desta story (12 pré-existentes em email-* não relacionados)
  - [x] Grep por importações de `push-service` em client components — zero (apenas em `notificacoes.ts`)
  - [x] Confirmar que `VAPID_PRIVATE_KEY` não aparece em nenhum arquivo de response ou log

## 🤖 CodeRabbit Integration

### Story Type Analysis
- **Primary Type:** Security-sensitive (VAPID keys, push endpoints)
- **Complexity:** Medium — migration + 5 novos/modificados arquivos server + 2 client
- **Max Iterations:** 2 | **Severity:** CRITICAL only

### CodeRabbit Focus Areas
- `VAPID_PRIVATE_KEY` não pode aparecer em nenhum client bundle ou resposta de API
- `push-service.ts` não deve ser importado diretamente por client components
- RLS em `push_subscriptions` — policy usando `public_user_id()` correto
- `POST /api/push/subscribe` sem autenticação = vulnerabilidade — `requireAuth()` obrigatório
- 410 cleanup não bloqueia response de envio (`Promise.allSettled` + `.catch`)

## Dev Agent Record

### Status
Done

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Task 1: Migration 023 criada — `push_subscriptions` com RLS via `public_user_id()` + `push_enabled` adicionado a `obra_notificacao_prefs`.
- Task 2: `sw.js` atualizado com handlers `push` e `notificationclick` após o handler `fetch` existente. Sem handlers duplicados.
- Task 3: `web-push` + `@types/web-push` instalados. `push-service.ts` criado em `lib/server/` — `VAPID_PRIVATE_KEY` exclusivo de server context.
- Task 4: `api/push/subscribe/route.ts` criado com POST (upsert via `onConflict: 'user_id,endpoint'`) e DELETE protegidos por `requireAuth()`.
- Task 5: `notificacoes.ts` — `push_enabled` na interface, `EVENTO_URL_PATH` record, `.select()` expandido, bloco push com import estático de `sendPushToUser`.
- Task 6: `notificacoes/route.ts` — `push_enabled` em `PREF_BOOL_FIELDS`, `DEFAULT_PREFS` e strings `.select()` de GET/PATCH.
- Task 7: `push-prompt.tsx` criado com SW registration no useEffect (async IIFE para satisfazer lint rule). `<PushPrompt />` adicionado ao layout. Toggle `push_enabled` adicionado à página de notificações.
- Task 8: type-check PASS (zero erros). lint — zero erros em arquivos desta story; 12 pré-existentes em email-* não relacionados. `push-service` importado exclusivamente por `notificacoes.ts` (server-only). `VAPID_PRIVATE_KEY` apenas em `lib/server/push-service.ts`.

### Debug Log References
_nenhum_

### File List
- `supabase/migrations/023_push_notifications.sql` — criar
- `packages/web/public/sw.js` — modificar (handlers push + notificationclick)
- `packages/web/src/lib/server/push-service.ts` — criar
- `packages/web/src/app/api/push/subscribe/route.ts` — criar
- `packages/web/src/lib/notificacoes.ts` — modificar
- `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts` — modificar
- `packages/web/src/components/portal/push-prompt.tsx` — criar
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — modificar
- `packages/web/src/app/api/push/subscribe/route.ts` — criado
- `packages/web/src/components/portal/push-prompt.tsx` — criado
- `packages/web/src/app/cliente/[obra_id]/notificacoes/page.tsx` — modificar

## QA Results

### Review Date: 2026-05-06

### Reviewed By: Quinn (@qa)

**Checks executados:**

| Check | Status |
|-------|--------|
| Code review | ✅ PASS |
| Unit tests | ⚠️ MEDIUM — push infra sem cobertura (deferred) |
| Acceptance criteria (AC1-AC10) | ✅ PASS — todos verificados |
| Regressões | ✅ PASS — email/WhatsApp intocados, sw.js handlers únicos |
| Performance | ✅ PASS — push fire-and-forget, sem bloqueio |
| Segurança | ✅ PASS — VAPID_PRIVATE_KEY server-only, auth em todos os routes |
| Documentação | ✅ PASS |

**MNT-001 (medium):** `handleActivate` em `push-prompt.tsx` não captura falhas do POST — estado inconsistente silencioso se API falhar. Fix: try/catch + feedback.

**TEST-001 (medium):** Zero testes para `sendPushToUser`, subscribe route e sw.js push handlers — deferred para próximo sprint.

**MNT-002 (low):** `arrayBufferToBase64` usa spread de `Uint8Array` — seguro para chaves push (≤43 bytes), não escalável.

**OPS-001 (low):** `webpush.setVapidDetails()` no topo do módulo — documentar VAPID_* como required em `.env.example`.

### Gate Status

Gate: PASS → docs/qa/gates/22.2-portal-cliente-push-notifications.yml

## Change Log

| Data | Agente | Descrição |
|------|--------|-----------|
| 2026-05-06 | River (@sm) | Story 22.2 criada — Push Notifications para Portal do Cliente |
| 2026-05-06 | Pax (@po) | Validação GO (9/10) — 2 fixes aplicados inline: (1) SW registration adicionado ao PushPrompt useEffect — corrige AC2/AC3/AC7 e retroativamente Story 22.1 AC2/AC5; (2) dynamic import substituído por static import em notificacoes.ts. Status: Draft → Ready |
| 2026-05-06 | Dex (@dev) | Implementação completa — 9 arquivos criados/modificados. type-check + lint PASS (12 erros email-* pré-existentes). VAPID_PRIVATE_KEY verificado server-only. Status: Ready → Ready for Review |
| 2026-05-06 | Quinn (@qa) | QA Gate PASS — todos os 10 ACs verificados. 4 issues medium/low não-bloqueantes. Status: Ready for Review → Done |
| 2026-05-08 | @po | Story fechada — QA Gate PASS (2026-05-06), todos os arquivos verificados | — |

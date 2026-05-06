---
epic: 22
title: Portal do Cliente — PWA e Push Notifications
status: Draft
created_at: 2026-05-06
updated_at: 2026-05-06
created_by: Morgan (@pm)
priority: High
objetivo_negocio:
  - Transformar o portal do cliente em app instalável (sem App Store)
  - Entregar notificações nativas no celular quando a obra é atualizada
  - Aumentar engajamento e percepção de qualidade pelo cliente final
depends_on:
  - Epic 20 completo (schema obras, obra_notificacao_prefs, auth cliente)
  - manifest.json e sw.js já existem em packages/web/public/
stories_planned: [22.1, 22.2]
---

# Epic 22 — Portal do Cliente: PWA e Push Notifications

## Objetivo do Epic

Transformar o Portal do Cliente (`/cliente/*`) em uma Progressive Web App instalável com suporte a push notifications nativas. O cliente poderá adicionar o portal à tela inicial do celular e receber alertas instantâneos quando a obra for atualizada — sem depender de email.

## Contexto do Sistema Existente

- **Portal do Cliente:** `/cliente/[obra_id]` — 5 telas funcionais (Epic 20)
- **Notificações existentes:** email via Resend (Epic 20, Story 20.6) + prefs em `obra_notificacao_prefs`
- **PWA base:** `manifest.json` (básico, sem scope `/cliente`) + `sw.js` (fetch only) já existem
- **Auth cliente:** `app_metadata.role = 'cliente'` no JWT; `users.phone` disponível
- **Infraestrutura push:** nenhuma — sem `push_subscriptions`, sem VAPID keys, sem web-push

## Decisões de Arquitetura

### Manifest separado para o Portal
O `manifest.json` existente tem `start_url: "/"` (CRM/admin). O portal do cliente precisa de
scope separado. Estratégia: criar `/cliente/manifest.json` e linká-lo no `layout.tsx` do
portal (`/cliente/[obra_id]/layout.tsx`).

### Service Worker compartilhado
O `sw.js` existente é minimal e serve de base. Adicionar o push event handler sem quebrar
o comportamento existente de fetch.

### Push integrado com obra_notificacao_prefs
A tabela `obra_notificacao_prefs` (Epic 20) já armazena `email_enabled`, `whatsapp_enabled`
e os 4 `notify_*` flags. Push notifications seguem os mesmos flags — **não criar nova tabela
de preferências**. Adicionar coluna `push_enabled boolean DEFAULT false` em `obra_notificacao_prefs`.

### VAPID keys
Geradas uma vez e armazenadas em variáveis de ambiente:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — exposta ao cliente
- `VAPID_PRIVATE_KEY` — apenas server-side
- `VAPID_SUBJECT` — `mailto:tech@trifold.eng.br`

## Nova Arquitetura de Dados

### Alteração em `obra_notificacao_prefs` (migration):
```sql
ALTER TABLE obra_notificacao_prefs
  ADD COLUMN push_enabled boolean NOT NULL DEFAULT false;
```

### Nova tabela `push_subscriptions`:
```sql
CREATE TABLE push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_info text,  -- user agent string
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- RLS: cliente só acessa suas próprias subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subs_manage_self" ON push_subscriptions
  FOR ALL USING (user_id = public_user_id());
```

## Rotas / Arquivos Novos

| Artefato | Tipo | Descrição |
|----------|------|-----------|
| `packages/web/public/cliente-manifest.json` | Novo | Manifest PWA do portal do cliente |
| `packages/web/src/app/cliente/[obra_id]/layout.tsx` | Modificar | Linkar cliente-manifest + meta PWA |
| `packages/web/public/sw.js` | Modificar | Adicionar push event handler |
| `packages/web/src/app/api/push/subscribe/route.ts` | Novo | POST (subscribe) + DELETE (unsubscribe) |
| `packages/web/src/app/api/push/send/route.ts` | Novo | POST interno para enviar push |
| `packages/web/src/lib/server/push-service.ts` | Novo | web-push server-side |
| `packages/web/src/components/portal/push-prompt.tsx` | Novo | UI permissão de push |
| `supabase/migrations/022_push_notifications.sql` | Novo | push_subscriptions + coluna push_enabled |

## Stories

---

### Story 22.1 — Portal do Cliente PWA: Manifest, Offline e Instalação

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[manifest_correctness, sw_scope, installability, offline_fallback]`
**Complexidade:** S (2h)
**Prioridade:** P1 — base para 22.2

**Descrição:**

Configurar o Portal do Cliente como PWA instalável. Reutiliza `sw.js` existente (sem
quebrar comportamento atual) e cria manifest dedicado para `/cliente`.

**`packages/web/public/cliente-manifest.json`:**
```json
{
  "name": "Trifold — Minha Obra",
  "short_name": "Minha Obra",
  "description": "Acompanhe o progresso da sua obra em tempo real",
  "start_url": "/cliente",
  "scope": "/cliente",
  "display": "standalone",
  "background_color": "#0c0a09",
  "theme_color": "#e8856a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**`packages/web/src/app/cliente/[obra_id]/layout.tsx` — adicionar no `<head>`:**
```tsx
// Next.js metadata API
export const metadata: Metadata = {
  manifest: "/cliente-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Minha Obra",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}
```

**`packages/web/public/sw.js` — adicionar offline fallback para /cliente:**
```js
const OFFLINE_PAGE = '/cliente/offline'

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' &&
      event.request.url.includes('/cliente')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_PAGE))
    )
    return
  }
  // comportamento existente inalterado
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
```

**`packages/web/src/app/cliente/offline/page.tsx`:**
Página simples dark theme: "Você está offline. Conecte-se para ver sua obra."

**Acceptance Criteria:**
- [ ] AC1: `cliente-manifest.json` acessível em `/cliente-manifest.json` com `scope: "/cliente"`
- [ ] AC2: Portal exibe prompt "Adicionar à tela inicial" em Chrome Android após 2 visitas
- [ ] AC3: App instalado abre direto em `/cliente` (standalone, sem chrome do browser)
- [ ] AC4: `theme_color: "#e8856a"` aparece na status bar do Android/iOS
- [ ] AC5: Offline: acessar `/cliente/[obra_id]` sem internet → página offline (não tela em branco)
- [ ] AC6: `sw.js` existente não regride — `/dashboard` e demais rotas funcionam normalmente
- [ ] AC7: Apple meta tags presentes (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title`)

**CodeRabbit Integration:**
- **Primary Type:** PWA configuration + service worker
- **Complexity:** Small — 1 manifest novo, 1 modificação sw.js, 1 página offline
- **Max Iterations:** 2 | **Severity:** CRITICAL only

**Risco:** BAIXO — modificação aditiva ao `sw.js`; scope separado evita conflito com CRM

---

### Story 22.2 — Portal do Cliente Push Notifications

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[push_delivery, subscription_rls, preference_integration, vapid_security]`
**Complexidade:** G (5h)
**Prioridade:** P2 — após 22.1

**Descrição:**

Infraestrutura completa de push notifications para o portal. O cliente autoriza notificações,
a subscription é salva no banco, e o servidor envia push quando admin realiza ações na obra.
Integrado com `obra_notificacao_prefs` existente.

**Dependências de ambiente:**
```bash
# Gerar VAPID keys: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tech@trifold.eng.br
```

**`packages/web/public/sw.js` — adicionar push handler:**
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

**`packages/web/src/lib/server/push-service.ts`:**
```typescript
import webpush from 'web-push'

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
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch((err) => {
        if (err.statusCode === 410) {
          // Subscription expirada — remover silenciosamente
          supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    )
  )
}
```

**`packages/web/src/components/portal/push-prompt.tsx`:**
Banner não-intrusivo no topo do portal:
"🔔 Receba notificações quando sua obra for atualizada. [Ativar] [Agora não]"
- Só aparece se `Notification.permission === 'default'` e push não está ativo
- Ao clicar "Ativar": solicita permissão → chama `POST /api/push/subscribe` → salva subscription

**Eventos que disparam push (integrar nos API routes existentes de admin):**
| Evento | API Route | Payload push |
|--------|-----------|-------------|
| Nova foto adicionada | `POST /api/admin/obras/[obra_id]/fotos` | "📸 Nova foto da sua obra!" |
| Novo documento | `POST /api/admin/obras/[obra_id]/documentos` | "📄 Novo documento disponível" |
| Nova mensagem equipe | `POST /api/admin/obras/[obra_id]/mensagens` | "💬 Mensagem da equipe Trifold" |
| Progresso atualizado | `PATCH /api/admin/obras/[obra_id]` | "🏗️ Progresso da obra atualizado" |

**Regra de envio:** só envia push se `obra_notificacao_prefs.push_enabled = true` E o flag
específico (`notify_nova_foto`, etc.) estiver ativo. Mesmo padrão do email (Story 20.6).

**Acceptance Criteria:**
- [ ] AC1: Migration 022 aplicada — `push_subscriptions` criada com RLS; `obra_notificacao_prefs.push_enabled` adicionada
- [ ] AC2: Banner de permissão aparece no portal para usuários sem push ativo
- [ ] AC3: `POST /api/push/subscribe` salva subscription em `push_subscriptions`
- [ ] AC4: `DELETE /api/push/subscribe` remove subscription
- [ ] AC5: Push enviado quando admin adiciona foto (se `push_enabled=true` e `notify_nova_foto=true`)
- [ ] AC6: Push enviado quando equipe envia mensagem no chat da obra
- [ ] AC7: Click na notificação abre a tela relevante do portal (`/cliente/[obra_id]/mensagens`, etc.)
- [ ] AC8: Subscription expirada (410 Gone) removida silenciosamente sem erro para o usuário
- [ ] AC9: `push_enabled` pode ser toggled na Central de Notificações existente (`/cliente/notificacoes`)
- [ ] AC10: VAPID keys nunca expostas em logs ou respostas de API

**CodeRabbit Integration:**
- **Primary Type:** Security-sensitive (VAPID keys, push endpoints)
- **Complexity:** Medium — migration + 4 novos arquivos + integrações em routes existentes
- **Max Iterations:** 2 | **Severity:** CRITICAL only (VAPID exposure, SQL injection)
- **Focus:** VAPID_PRIVATE_KEY nunca em client bundle; RLS em push_subscriptions; 410 cleanup

**Risco:** MÉDIO — VAPID keys devem ser apenas server-side; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` é seguro expor (é a chave pública por design)

---

## Compatibilidade

- [x] `sw.js` existente: modificações aditivas (não remove handlers existentes)
- [x] `manifest.json` existente: não modificado — criado novo `cliente-manifest.json` separado
- [x] `obra_notificacao_prefs`: apenas ADD COLUMN (não-breaking)
- [x] Routes admin existentes: push dispatch via `Promise.allSettled` (best-effort, não bloqueia resposta)

## Estimativa e Sequência

| Story | Executor | Complexidade | Estimativa | Bloqueada por |
|-------|----------|-------------|------------|---------------|
| 22.1 — PWA Manifest + Offline | @dev | S | 2h | — |
| 22.2 — Push Notifications | @dev | G | 5h | 22.1 (sw.js com push handler base) |

**Total estimado: ~7h**

**Sequência:**
```
22.1 (PWA base) → 22.2 (push infra + eventos)
```

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `VAPID_PRIVATE_KEY` vazar para o client bundle | Alta | Nunca usar em client components; apenas em Server Actions e API routes |
| iOS Safari suporte limitado (< 16.4) | Baixa | Degradação graciosa — push só funciona em iOS 16.4+; funcionalidade não-crítica |
| sw.js quebrar rotas do CRM/admin | Média | Scope separado em `cliente-manifest.json`; testes em `/dashboard` após mudanças no `sw.js` |
| Push subscriptions acumular após logout | Baixa | DELETE subscription no logout do cliente |

## Definition of Done

- [ ] Story 22.1: portal instalável em Android e iOS com offline fallback
- [ ] Story 22.2: push notification chega no celular ao adicionar foto/mensagem na obra
- [ ] QA gate PASS em ambas as stories
- [ ] `@devops push` após QA gate aprovado

## Handoff para @sm

> Criar stories detalhadas para o **Epic 22 — Portal do Cliente PWA e Push Notifications**.
>
> **Sequência obrigatória:** 22.1 → 22.2
>
> **Stack:** Next.js App Router, Supabase, TypeScript, Web Push API, `web-push` npm package
>
> **Infraestrutura existente para reutilizar:**
> - `packages/web/public/manifest.json` — existente, NÃO modificar (CRM/admin)
> - `packages/web/public/sw.js` — existente, APENAS adicionar handlers (nunca remover)
> - `obra_notificacao_prefs` — adicionar coluna `push_enabled` (não criar nova tabela)
> - Padrão de API route admin: `packages/web/src/app/api/admin/obras/[obra_id]/`
> - Padrão de auth: `requireAuth()` de `@web/lib/auth`
>
> **Decisões arquiteturais validadas:**
> - Manifest separado: `/cliente-manifest.json` com `scope: "/cliente"`
> - Push integrado com `obra_notificacao_prefs` — mesmos flags de email (notify_nova_foto, etc.)
> - Best-effort push via `Promise.allSettled` — nunca bloqueia operação do admin
> - VAPID_PRIVATE_KEY exclusivamente server-side
> - Número de migration: 022 (verificar última migration em supabase/migrations/ antes de criar)
>
> **Design:** dark theme portal (`stone-950`, acento `#e8856a`). Prompt push não-intrusivo.

— Morgan, planejando o futuro 📊

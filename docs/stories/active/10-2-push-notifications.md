status: Done

# Story 10.2 — Push Notifications

## Contexto
O corretor precisa ser notificado em tempo real no celular sobre eventos importantes: novo lead designado, agendamento detectado pela IA, lembrete de visita, lead respondeu mensagem. Push notifications via Web Push API funcionam em Android (Chrome) e iOS 16.4+ (Safari). O backend armazena subscriptions e envia notificacoes via biblioteca web-push. Sem isso, o corretor precisaria ficar checando o CRM manualmente.

## Acceptance Criteria
- [ ] AC1: Tabela `push_subscriptions` criada: id, user_id (FK profiles), endpoint, p256dh, auth, device_info (user agent), created_at, active (boolean)
- [ ] AC2: No primeiro login no PWA, solicitar permissao de notificacao com UI explicativa: "Ative notificacoes para receber alertas de novos leads e visitas"
- [ ] AC3: Subscription salva no backend via `POST /api/push/subscribe`
- [ ] AC4: Endpoint `POST /api/push/send` (interno) envia notificacao para usuario especifico
- [ ] AC5: Notificacao enviada quando: novo lead designado ao corretor (Story 4.6)
- [ ] AC6: Notificacao enviada quando: agendamento detectado pela IA (Story 9.2)
- [ ] AC7: Notificacao enviada quando: lembrete de visita 30min antes (complementar ao lembrete do lead — Story 9.5)
- [ ] AC8: Notificacao enviada quando: lead respondeu mensagem (nova mensagem no webhook)
- [ ] AC9: Service worker intercepta push event e exibe notificacao com titulo, body e icone Trifold
- [ ] AC10: Click na notificacao abre a pagina relevante (detalhe do lead, agenda, etc)
- [ ] AC11: Unsubscribe: endpoint `DELETE /api/push/subscribe` e cleanup de subscriptions invalidas (410 Gone)
- [ ] AC12: VAPID keys configuradas via env vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/push/subscribe/route.ts` — POST (subscribe) e DELETE (unsubscribe)
- `packages/web/src/app/api/push/send/route.ts` — POST (enviar notificacao — uso interno)
- `packages/web/src/lib/push-notifications.ts` — Logica client-side (solicitar permissao, subscribe)
- `packages/web/src/components/notifications/push-prompt.tsx` — UI de solicitacao de permissao
- `packages/web/public/sw.js` — Adicionar push event handler (estender Story 10.1)
- `packages/web/src/lib/server/push-service.ts` — Logica server-side (enviar via web-push)

### Schema:
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_info TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_push_sub_endpoint ON push_subscriptions(endpoint);
CREATE INDEX idx_push_sub_user ON push_subscriptions(user_id, active);
```

### Client-side subscription:
```typescript
// push-notifications.ts
export async function requestPushPermission(): Promise<PushSubscription | null> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
  });

  // Salvar no backend
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
      device_info: navigator.userAgent
    })
  });

  return subscription;
}
```

### Service Worker push handler:
```javascript
// Adicionar ao sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    tag: data.tag || 'default', // Agrupar notificacoes do mesmo tipo
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Trifold CRM', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
```

### Server-side send:
```typescript
// push-service.ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:suporte@trifold.com.br',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushNotification(userId: string, payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);

  for (const sub of subscriptions || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (error: any) {
      if (error.statusCode === 410) {
        // Subscription expirou — desativar
        await supabase.from('push_subscriptions')
          .update({ active: false })
          .eq('endpoint', sub.endpoint);
      }
    }
  }
}
```

### Tipos de notificacao:
```typescript
// Mapear eventos para notificacoes
const NOTIFICATION_TYPES = {
  new_lead_assigned: {
    title: 'Novo lead!',
    body: (data: any) => `${data.leadName} foi designado para voce. Empreendimento: ${data.propertyName}`,
    url: (data: any) => `/corretor/leads/${data.leadId}`,
    tag: 'new-lead'
  },
  appointment_detected: {
    title: 'Visita agendada!',
    body: (data: any) => `Visita com ${data.leadName} em ${data.date} as ${data.time}`,
    url: () => '/corretor/agenda',
    tag: 'appointment'
  },
  visit_reminder: {
    title: 'Visita em 30min!',
    body: (data: any) => `${data.leadName} - ${data.propertyName} as ${data.time}`,
    url: () => '/corretor/agenda',
    tag: 'reminder'
  },
  lead_replied: {
    title: 'Lead respondeu!',
    body: (data: any) => `${data.leadName} enviou mensagem`,
    url: (data: any) => `/corretor/leads/${data.leadId}`,
    tag: 'message'
  }
};
```

### Gerar VAPID keys:
```bash
npx web-push generate-vapid-keys
# Salvar no .env.local e Vercel env vars
```

## Dependencias
- Depende de: 10.1 (service worker registrado), 6.1 (login corretor — user autenticado)
- Bloqueia: nenhuma (stories 9.2, 9.5, 4.6 podem usar push como canal adicional)

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

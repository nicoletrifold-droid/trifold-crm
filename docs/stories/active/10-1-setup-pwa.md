status: Done

# Story 10.1 — Setup PWA (Manifest, Service Worker, Icons)

## Contexto
O corretor vive no celular — ele conversa com leads pelo WhatsApp Business App e precisa acessar o CRM rapidamente para ver agenda e leads. Uma PWA (Progressive Web App) permite que o CRM funcione como app nativo no celular, com icone na tela inicial, sem precisar publicar na App Store. O Next.js suporta PWA nativamente. A PWA precisa funcionar em iOS 16.4+ (suporte a push notifications) e Android.

## Acceptance Criteria
- [ ] AC1: `manifest.json` configurado com nome "Trifold CRM", short_name "Trifold", cores da Trifold (laranja #F97316 como theme_color), display "standalone"
- [ ] AC2: Icones gerados em todos os tamanhos necessarios: 72, 96, 128, 144, 152, 192, 384, 512 (PNG)
- [ ] AC3: Apple touch icons configurados para iOS (180x180)
- [ ] AC4: Service worker registrado com cache strategy: stale-while-revalidate para paginas, cache-first para assets estaticos
- [ ] AC5: Splash screen configurado para iOS (apple-mobile-web-app-capable, status-bar-style)
- [ ] AC6: App instalavel: "Adicionar a tela de inicio" funciona em Chrome Android e Safari iOS
- [ ] AC7: Offline fallback: pagina basica "Voce esta offline. Conecte-se para acessar o Trifold CRM" quando sem internet
- [ ] AC8: Cache de dados basicos offline: ultimo estado da agenda do dia (read-only)
- [ ] AC9: `next.config.js` configurado com headers PWA (Service-Worker-Allowed)
- [ ] AC10: Meta tags necessarias no `layout.tsx`: viewport, theme-color, apple-mobile-web-app-capable
- [ ] AC11: Lighthouse PWA score >= 90

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/public/manifest.json` — Manifesto PWA
- `packages/web/public/sw.js` — Service Worker (ou usar next-pwa)
- `packages/web/public/icons/` — Diretorio com icones em varios tamanhos
- `packages/web/src/app/layout.tsx` — Adicionar meta tags PWA
- `packages/web/src/app/offline/page.tsx` — Pagina offline fallback
- `packages/web/next.config.js` — Config PWA

### Manifest:
```json
{
  "name": "Trifold CRM",
  "short_name": "Trifold",
  "description": "CRM Imobiliario com IA",
  "start_url": "/corretor/agenda",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#F97316",
  "background_color": "#FFFFFF",
  "icons": [
    { "src": "/icons/icon-72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "/icons/icon-96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "/icons/icon-128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### Service Worker (basico):
```javascript
// sw.js
const CACHE_NAME = 'trifold-crm-v1';
const OFFLINE_URL = '/offline';

// Pre-cache pagina offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});
```

### Meta tags no layout.tsx:
```tsx
// Adicionar no <head> do layout.tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#F97316" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Trifold CRM" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

### Abordagem recomendada:
- Usar `@ducanh2912/next-pwa` (fork atualizado do next-pwa, compativel com Next.js 14+)
- Ou implementar manualmente com service worker custom para maior controle
- Para MVP: service worker manual e suficiente — sem Workbox

## Dependencias
- Depende de: 1.3 (Vercel deploy — app acessivel), 6.1 (login corretor — rota /corretor existe)
- Bloqueia: 10.2 (push notifications precisam de service worker), 10.3 (agenda mobile), 10.4 (leads mobile)

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |

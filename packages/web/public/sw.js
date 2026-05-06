const OFFLINE_PAGE = '/cliente/offline'
const OFFLINE_CACHE = 'trifold-offline-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_PAGE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' &&
      event.request.url.includes('/cliente')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_PAGE))
    )
    return
  }
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  )
})

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

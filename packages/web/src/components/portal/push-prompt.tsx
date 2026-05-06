'use client'

import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const array = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i)
  }
  return array
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

export function PushPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    void (async () => {
      if (!('serviceWorker' in navigator)) return
      await navigator.serviceWorker.register('/sw.js').catch(() => {})
      if (
        typeof Notification === 'undefined' ||
        Notification.permission !== 'default' ||
        sessionStorage.getItem('push-dismissed') === '1'
      ) return
      setVisible(true)
    })()
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

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

async function subscribe() {
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
}

type Stage = 'hidden' | 'soft' | 'hard' | 'done'

export function PushPrompt() {
  const [stage, setStage] = useState<Stage>('hidden')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (typeof Notification === 'undefined') return

    // Permission already granted — silent re-subscription, no banner
    if (Notification.permission === 'granted') {
      void subscribe().catch(() => {})
      return
    }

    // Permission permanently denied — do nothing
    if (Notification.permission === 'denied') return

    // Soft-declined recently
    const declinedUntil = localStorage.getItem('push-soft-declined-until')
    if (declinedUntil && Date.now() < Number(declinedUntil)) return

    // Dismissed this session
    if (sessionStorage.getItem('push-dismissed') === '1') return

    // Show soft prompt after 10 s to avoid assault by prompts
    const timer = setTimeout(() => {
      // Re-check in case conditions changed during the delay
      if (
        Notification.permission === 'default' &&
        !sessionStorage.getItem('push-dismissed')
      ) {
        setStage('soft')
      }
    }, 10_000)

    return () => clearTimeout(timer)
  }, [])

  async function handleSoftAccept() {
    setStage('hard')
    const permission = await Notification.requestPermission()

    if (permission === 'granted') {
      await subscribe().catch(() => {})
    } else {
      sessionStorage.setItem('push-dismissed', '1')
    }

    setStage('done')
  }

  function handleSoftDecline() {
    localStorage.setItem(
      'push-soft-declined-until',
      String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    )
    setStage('done')
  }

  if (stage === 'hidden' || stage === 'hard' || stage === 'done') return null

  return (
    <div
      role="region"
      aria-label="Ativar notificações"
      className="fixed bottom-16 left-0 right-0 z-50 flex items-center justify-between gap-3 border-t border-stone-800 bg-stone-900 px-4 py-3 text-sm motion-safe:animate-[slideUp_0.2s_ease-out] lg:bottom-0"
    >
      <span className="text-stone-300">
        Quer saber quando sua obra avançar? Receba fotos e atualizações direto no celular.
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => void handleSoftAccept()}
          className="rounded bg-[#e8856a] px-3 py-1 font-medium text-white hover:bg-[#d4745a]"
        >
          Sim, quero receber
        </button>
        <button
          onClick={handleSoftDecline}
          className="rounded px-3 py-1 text-stone-400 hover:text-stone-200"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { BellRing, X } from "lucide-react"

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(b64)
  const array = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i)
  return array
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

async function subscribe() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: arrayBufferToBase64(sub.getKey("p256dh")!),
      auth: arrayBufferToBase64(sub.getKey("auth")!),
    }),
  })
}

export function BrokerPushPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return

    if (Notification.permission === "granted") {
      void subscribe().catch(() => {})
      return
    }
    if (Notification.permission === "denied") return

    const declined = localStorage.getItem("broker-push-declined-until")
    if (declined && Date.now() < Number(declined)) return
    if (sessionStorage.getItem("broker-push-dismissed") === "1") return

    const timer = setTimeout(() => {
      if (Notification.permission === "default" && !sessionStorage.getItem("broker-push-dismissed")) {
        setVisible(true)
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  async function handleAccept() {
    setVisible(false)
    const permission = await Notification.requestPermission()
    if (permission === "granted") void subscribe().catch(() => {})
    else sessionStorage.setItem("broker-push-dismissed", "1")
  }

  function handleDecline() {
    localStorage.setItem("broker-push-declined-until", String(Date.now() + 7 * 24 * 60 * 60 * 1000))
    sessionStorage.setItem("broker-push-dismissed", "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
      <div className="flex items-start gap-3 rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-2xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
          <BellRing className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-100">Ativar notificações</p>
          <p className="mt-0.5 text-xs text-stone-400">
            Receba alertas de novos leads direto no celular, mesmo com o app fechado.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void handleAccept()}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-orange-700"
            >
              Ativar
            </button>
            <button
              onClick={handleDecline}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 hover:text-stone-200"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          onClick={handleDecline}
          className="shrink-0 rounded-lg p-1 text-stone-500 hover:text-stone-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

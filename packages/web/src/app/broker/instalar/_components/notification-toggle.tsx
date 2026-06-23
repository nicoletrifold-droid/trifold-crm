"use client"

import { useState, useEffect, useCallback } from "react"
import { BellRing, BellOff, Loader2, Check } from "lucide-react"

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

type State = "loading" | "unsupported" | "off" | "on" | "denied"

/**
 * Story 75-34 — Liga/desliga as notificações push do corretor manualmente,
 * sem depender do card automático (que some por 7 dias se recusado). Mostra o
 * estado atual e trata bloqueio/iOS.
 */
export function NotificationToggle() {
  const [state, setState] = useState<State>("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      typeof Notification === "undefined" ||
      !("PushManager" in window)
    ) {
      setState("unsupported")
      return
    }
    if (Notification.permission === "denied") {
      setState("denied")
      return
    }
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setState(sub && Notification.permission === "granted" ? "on" : "off")
    } catch {
      setState("off")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off")
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: arrayBufferToBase64(sub.getKey("p256dh")!),
          auth: arrayBufferToBase64(sub.getKey("auth")!),
        }),
      })
      if (!res.ok) throw new Error()
      setState("on")
    } catch {
      setError("Não foi possível ativar. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState("off")
    } catch {
      setError("Não foi possível desativar. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
          {state === "on" ? (
            <BellRing className="h-5 w-5 text-orange-400" />
          ) : (
            <BellOff className="h-5 w-5 text-stone-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-stone-100">Notificações</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">
            Avisos de novos leads no celular, mesmo com o app fechado.
          </p>

          <div className="mt-3">
            {state === "loading" && (
              <span className="inline-flex items-center gap-2 text-xs text-stone-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
              </span>
            )}

            {state === "on" && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-400">
                  <Check className="h-3.5 w-3.5" /> Ativadas
                </span>
                <button
                  onClick={() => void disable()}
                  disabled={busy}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 hover:text-stone-200 disabled:opacity-50"
                >
                  {busy ? "…" : "Desativar"}
                </button>
              </div>
            )}

            {state === "off" && (
              <button
                onClick={() => void enable()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                Ativar notificações
              </button>
            )}

            {state === "denied" && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Notificações bloqueadas neste navegador. Toque no 🔒 ao lado do endereço → Notificações → Permitir, e recarregue a página.
              </p>
            )}

            {state === "unsupported" && (
              <p className="rounded-lg bg-stone-800 px-3 py-2 text-xs text-stone-400">
                Para receber notificações no iPhone, instale o app na tela inicial (passos abaixo). No computador, use Chrome ou Edge.
              </p>
            )}

            {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Smartphone, X } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function BrokerInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Já está instalado como PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return

    const declined = localStorage.getItem("broker-install-declined-until")
    if (declined && Date.now() < Number(declined)) return
    if (sessionStorage.getItem("broker-install-dismissed") === "1") return

    function handleBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      const timer = setTimeout(() => {
        if (!sessionStorage.getItem("broker-install-dismissed")) {
          setVisible(true)
        }
      }, 8000)
      return () => clearTimeout(timer)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    setVisible(false)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "dismissed") {
      localStorage.setItem("broker-install-declined-until", String(Date.now() + 7 * 24 * 60 * 60 * 1000))
    }
    setDeferredPrompt(null)
  }

  function handleDecline() {
    localStorage.setItem("broker-install-declined-until", String(Date.now() + 7 * 24 * 60 * 60 * 1000))
    sessionStorage.setItem("broker-install-dismissed", "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
      <div className="flex items-start gap-3 rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-2xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
          <Smartphone className="h-4 w-4 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-100">Instalar o app</p>
          <p className="mt-0.5 text-xs text-stone-400">
            Acesse o CRM direto da tela inicial, sem precisar abrir o navegador.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void handleInstall()}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-orange-700"
            >
              Instalar
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

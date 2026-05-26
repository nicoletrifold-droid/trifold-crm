'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'

export function PwaUpdateToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleUpdate = () => setVisible(true)
    window.addEventListener('pwa-update-available', handleUpdate)
    return () => window.removeEventListener('pwa-update-available', handleUpdate)
  }, [])

  function handleUpdate() {
    const sw = navigator.serviceWorker

    // Must attach listener before sending postMessage to avoid missing the event
    sw.addEventListener('controllerchange', () => {
      window.location.reload()
    }, { once: true })

    sw.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })

    setVisible(false)
  }

  function handleDismiss() {
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-stone-700 bg-stone-900 px-4 py-3 text-sm shadow-lg motion-safe:animate-[slideUp_0.2s_ease-out]"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-[#e8856a]" />
      <span className="text-stone-200">Nova versão disponível</span>
      <button
        onClick={handleUpdate}
        className="rounded bg-[#e8856a] px-3 py-1 font-medium text-white hover:bg-[#d4745a]"
      >
        Atualizar agora
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Fechar"
        className="text-stone-400 hover:text-stone-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

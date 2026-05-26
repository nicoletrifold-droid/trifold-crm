'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (localStorage.getItem('pwa-install-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt) return null

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'dismissed') localStorage.setItem('pwa-install-dismissed', '1')
    setPrompt(null)
  }

  function handleDismiss() {
    localStorage.setItem('pwa-install-dismissed', '1')
    setPrompt(null)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-orange-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-500/15">
          <svg className="h-4 w-4 text-orange-600 dark:text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-stone-100">Instalar Trifold CRM</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">Acesso rápido na tela inicial</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleInstall}
              className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
            >
              Instalar
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

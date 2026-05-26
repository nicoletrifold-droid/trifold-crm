'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface AndroidInstallPromptProps {
  variant?: 'crm' | 'portal'
}

function isAndroid() {
  return /android/i.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
}

const DISMISS_KEY = 'android-install-dismissed-until'

export function AndroidInstallPrompt({ variant = 'crm' }: AndroidInstallPromptProps) {
  const [visible, setVisible] = useState(false)
  const [hasNativePrompt, setHasNativePrompt] = useState(false)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const titleId = useId()
  const pathname = usePathname()

  const isPortal = variant === 'portal'
  // CRM variant: não mostrar em rotas do portal (evita double-render com a versão portal)
  const isOnPortal = pathname?.startsWith('/cliente/') ?? false
  const skip = !isPortal && isOnPortal

  useEffect(() => {
    if (skip || !isAndroid() || isStandalone()) return

    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() < Number(dismissed)) return

    // Captura o evento nativo do Chrome (permite acionar a instalação direto)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setHasNativePrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    let scrolled = false
    function show() { setVisible(true) }
    function handleScroll() {
      if (!scrolled && window.scrollY > 200) { scrolled = true; show() }
    }

    const timer = setTimeout(show, 5_000)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [skip])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setVisible(false)
    }
    if (visible) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible])

  if (skip) return null

  function dismiss(days: number) {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000))
    setVisible(false)
  }

  async function handleInstall() {
    if (deferredPrompt.current) {
      // Chrome Android: acionar a instalação nativa direto
      await deferredPrompt.current.prompt()
      const { outcome } = await deferredPrompt.current.userChoice
      if (outcome === 'accepted') {
        setVisible(false)
        return
      }
    }
    // Fallback: fechar o modal (usuário verá os passos manuais)
    dismiss(30)
  }

  if (!visible) return null

  const accent = isPortal ? 'bg-[#e8856a]' : 'bg-orange-600'
  const accentHover = isPortal ? 'hover:bg-[#d4745a]' : 'hover:bg-orange-700'
  const bg = isPortal ? 'bg-stone-900 text-stone-100' : 'bg-white text-gray-900'
  const handle = isPortal ? 'bg-stone-600' : 'bg-gray-300'
  const stepText = isPortal ? 'text-stone-300' : 'text-gray-600'
  const laterText = isPortal ? 'text-stone-400 hover:text-stone-200' : 'text-gray-500 hover:text-gray-700'
  const closeText = isPortal ? 'text-stone-400 hover:text-stone-200' : 'text-gray-400 hover:text-gray-600'

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out] ${bg}`}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className={`h-1 w-10 rounded-full ${handle}`} />
      </div>

      <div className="px-6 pb-8 pt-2">
        <div className="mb-4 flex items-start justify-between">
          <h2 id={titleId} className="text-lg font-semibold">
            Instalar na tela inicial
          </h2>
          <button
            onClick={() => dismiss(3)}
            aria-label="Fechar"
            className={`rounded-full p-1 ${closeText}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {hasNativePrompt ? (
          // Chrome Android: instrução simplificada + botão que aciona instalação nativa
          <p className={`mb-6 text-sm ${stepText}`}>
            Toque em <strong>Instalar</strong> abaixo para adicionar o app à sua tela inicial com um toque.
          </p>
        ) : (
          // Outros navegadores Android: passo a passo manual
          <ol className="mb-6 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${accent} text-white`}>1</span>
              <span className={stepText}>
                Toque no menu <strong>⋮</strong> no canto superior direito do Chrome
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${accent} text-white`}>2</span>
              <span className={stepText}>
                Toque em <strong>Adicionar à tela inicial</strong>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${accent} text-white`}>3</span>
              <span className={stepText}>
                Confirme tocando em <strong>Instalar</strong> na janela que aparecer
              </span>
            </li>
          </ol>
        )}

        <div className="flex gap-3">
          <button
            onClick={hasNativePrompt ? handleInstall : () => dismiss(30)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white ${accent} ${accentHover}`}
          >
            {hasNativePrompt ? 'Instalar agora' : 'Entendi'}
          </button>
          <button
            onClick={() => dismiss(3)}
            className={`rounded-xl px-4 py-3 text-sm ${laterText}`}
          >
            Mais tarde
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useId } from 'react'
import { X } from 'lucide-react'

interface IosInstallPromptProps {
  variant?: 'crm' | 'portal'
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  )
}

export function IosInstallPrompt({ variant = 'crm' }: IosInstallPromptProps) {
  const [visible, setVisible] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!isIos() || isStandalone()) return

    const dismissedUntil = localStorage.getItem('ios-install-dismissed-until')
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return

    let scrolled = false

    function show() {
      setVisible(true)
    }

    function handleScroll() {
      if (!scrolled && window.scrollY > 200) {
        scrolled = true
        show()
      }
    }

    // Show after 15 s or after 200px scroll, whichever comes first
    const timer = setTimeout(show, 15_000)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setVisible(false)
    }
    if (visible) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible])

  function dismiss(days: number) {
    localStorage.setItem(
      'ios-install-dismissed-until',
      String(Date.now() + days * 24 * 60 * 60 * 1000),
    )
    setVisible(false)
  }

  if (!visible) return null

  const isPortal = variant === 'portal'

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out] ${
        isPortal ? 'bg-stone-900 text-stone-100' : 'bg-white text-gray-900'
      }`}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className={`h-1 w-10 rounded-full ${isPortal ? 'bg-stone-600' : 'bg-gray-300'}`} />
      </div>

      <div className="px-6 pb-8 pt-2">
        <div className="mb-4 flex items-start justify-between">
          <h2 id={titleId} className="text-lg font-semibold">
            Instalar na tela inicial
          </h2>
          <button
            onClick={() => dismiss(3)}
            aria-label="Fechar"
            className={`rounded-full p-1 ${isPortal ? 'text-stone-400 hover:text-stone-200' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mb-6 space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isPortal ? 'bg-[#e8856a] text-white' : 'bg-orange-600 text-white'
            }`}>1</span>
            <span className={isPortal ? 'text-stone-300' : 'text-gray-600'}>
              Toque no botão <strong>Compartilhar</strong> <span aria-hidden>↑</span> na barra do Safari
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isPortal ? 'bg-[#e8856a] text-white' : 'bg-orange-600 text-white'
            }`}>2</span>
            <span className={isPortal ? 'text-stone-300' : 'text-gray-600'}>
              Role a lista de ações para baixo
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isPortal ? 'bg-[#e8856a] text-white' : 'bg-orange-600 text-white'
            }`}>3</span>
            <span className={isPortal ? 'text-stone-300' : 'text-gray-600'}>
              Toque em <strong>Adicionar à Tela de Início</strong> <span aria-hidden>＋</span>
            </span>
          </li>
        </ol>

        <div className="flex gap-3">
          <button
            onClick={() => dismiss(30)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
              isPortal
                ? 'bg-[#e8856a] text-white hover:bg-[#d4745a]'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            Entendi
          </button>
          <button
            onClick={() => dismiss(3)}
            className={`rounded-xl px-4 py-3 text-sm ${
              isPortal ? 'text-stone-400 hover:text-stone-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Mais tarde
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      window.location.href = '/cliente'
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  function handleRetry() {
    setRetrying(true)
    window.location.href = '/cliente'
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-950 px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-stone-800">
        <svg
          className="h-10 w-10 text-stone-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
          />
        </svg>
      </div>

      <h1 className="mb-2 text-xl font-semibold text-stone-100">Sem conexão</h1>
      <p className="mb-8 max-w-xs text-sm text-stone-400">
        Você está offline. Conecte-se à internet para acompanhar o progresso da sua obra.
      </p>

      <button
        onClick={handleRetry}
        disabled={retrying}
        className="rounded-lg bg-[#e8856a] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#d4745a] disabled:opacity-60"
      >
        {retrying ? 'Reconectando…' : 'Tentar novamente'}
      </button>

      <p className="mt-6 text-xs text-stone-600">
        A página vai recarregar automaticamente quando a conexão voltar.
      </p>
    </div>
  )
}

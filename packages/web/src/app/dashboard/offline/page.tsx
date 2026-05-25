'use client'

import { useEffect } from 'react'
import { WifiOff } from 'lucide-react'

export default function DashboardOfflinePage() {
  useEffect(() => {
    const handleOnline = () => {
      window.location.href = '/dashboard'
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center gap-6 px-4">
      <WifiOff className="h-16 w-16 text-gray-400 dark:text-stone-500" strokeWidth={1.5} />
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-stone-100">
          Sem conexão
        </h1>
        <p className="text-gray-500 dark:text-stone-400 max-w-sm">
          Você está offline. O CRM voltará automaticamente quando a conexão for restabelecida.
        </p>
      </div>
      <button
        onClick={() => { window.location.href = '/dashboard' }}
        className="px-5 py-2.5 rounded-lg bg-gray-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-stone-200 transition-colors"
      >
        Tentar novamente
      </button>
      <p className="text-xs text-gray-400 dark:text-stone-600">
        A página recarrega automaticamente ao reconectar.
      </p>
    </div>
  )
}

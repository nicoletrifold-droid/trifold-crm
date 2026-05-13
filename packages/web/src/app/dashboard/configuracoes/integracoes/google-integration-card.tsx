"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function GoogleIntegrationCard({ connected }: { connected: boolean }) {
  const router = useRouter()
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await fetch("/api/auth/google/disconnect", { method: "POST" })
      router.refresh()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Google Forms</h2>
          <p className="text-sm text-gray-500 dark:text-stone-400">
            Conecte sua conta Google para importar respostas de formularios automaticamente
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            connected
              ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
              : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
          }`}
        >
          {connected ? "Conectado" : "Desconectado"}
        </span>
      </div>

      {connected ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-700 dark:text-green-300">
            Conta Google vinculada com sucesso
          </span>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/15"
          >
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-gray-400 dark:text-stone-500">
            Conecte a conta Google da Trifold para que o sistema leia automaticamente as respostas dos formularios vinculados as campanhas.
          </p>
          <a
            href="/api/auth/google"
            className="inline-flex rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Conectar Google
          </a>
        </div>
      )}
    </div>
  )
}

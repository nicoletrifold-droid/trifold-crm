"use client"

import { useEffect } from "react"

export default function ObraError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[cliente/obra/error]", error.message, error.digest)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-950 px-6 text-center">
      <p className="text-sm font-medium text-stone-300">
        Erro ao carregar a página.
      </p>
      <p className="max-w-xs text-xs text-stone-500">{error.message}</p>
      {error.digest && (
        <p className="font-mono text-xs text-stone-600">{error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-medium text-white"
      >
        Tentar novamente
      </button>
    </div>
  )
}

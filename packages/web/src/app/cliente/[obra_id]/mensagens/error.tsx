"use client"

import { useEffect } from "react"

export default function MensagensError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[mensagens/error]", error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-stone-950 px-6 text-center">
      <p className="text-sm font-medium text-stone-300">
        Não foi possível carregar as mensagens.
      </p>
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

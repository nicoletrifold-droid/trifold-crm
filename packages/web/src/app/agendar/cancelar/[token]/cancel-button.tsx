"use client"

import { useState } from "react"

interface CancelButtonProps {
  token: string
}

export function CancelButton({ token }: CancelButtonProps) {
  const [state, setState] = useState<"idle" | "confirming" | "loading" | "done" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleCancel() {
    setState("loading")
    try {
      const res = await fetch(`/api/appointments/cancel/${token}`, { method: "POST" })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Erro ao cancelar")
      }
      setState("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido")
      setState("error")
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-4 text-center">
        <p className="text-lg font-semibold text-green-400">Compromisso cancelado com sucesso</p>
        <p className="mt-1 text-sm text-stone-400">
          Você receberá uma confirmação em breve.
        </p>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-center">
          <p className="text-sm text-red-400">{errorMsg}</p>
        </div>
        <button
          onClick={() => setState("idle")}
          className="w-full rounded-xl border border-stone-700 px-6 py-3 text-sm text-stone-400 hover:border-stone-600 hover:text-stone-300 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (state === "confirming") {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm text-stone-300">
          Tem certeza que deseja cancelar este compromisso?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setState("idle")}
            className="flex-1 rounded-xl border border-stone-700 px-6 py-3 text-sm font-medium text-stone-300 hover:border-stone-600 hover:text-white transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Sim, cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setState("confirming")}
      disabled={state === "loading"}
      className="w-full rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
    >
      {state === "loading" ? "Cancelando..." : "Confirmar cancelamento"}
    </button>
  )
}

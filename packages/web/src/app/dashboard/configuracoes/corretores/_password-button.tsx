"use client"

import { useState, useRef, useEffect } from "react"
import { Lock } from "lucide-react"

export function PasswordButton({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"manual" | "invite">("invite")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setMessage(null)
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    if (mode === "invite") {
      const res = await fetch(`/api/users/${userId}/reset-password`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      setMessage(res.ok
        ? { text: "Link enviado por e-mail.", ok: true }
        : { text: (json as { error?: string }).error ?? "Erro ao enviar link.", ok: false }
      )
    } else {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: password }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ text: "Senha alterada.", ok: true })
        setPassword("")
      } else {
        setMessage({ text: (json as { error?: string }).error ?? "Erro ao alterar senha.", ok: false })
      }
    }

    setSaving(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setMessage(null) }}
        title="Alterar senha"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
      >
        <Lock className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-stone-200 bg-white p-4 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Senha de acesso
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`pw-mode-${userId}`}
                  value="invite"
                  checked={mode === "invite"}
                  onChange={() => setMode("invite")}
                  className="h-3.5 w-3.5 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-stone-700 dark:text-stone-300">Enviar link por e-mail</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`pw-mode-${userId}`}
                  value="manual"
                  checked={mode === "manual"}
                  onChange={() => setMode("manual")}
                  className="h-3.5 w-3.5 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-stone-700 dark:text-stone-300">Definir senha agora</span>
              </label>
            </div>

            {mode === "invite" ? (
              <p className="rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                Link enviado para <strong className="text-stone-700 dark:text-stone-300">{email}</strong>. Expira em 24h.
              </p>
            ) : (
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nova senha (mín. 8 caracteres)"
                className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              />
            )}

            {message && (
              <p className={`text-xs ${message.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-orange-600 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? "Aguarde..." : mode === "invite" ? "Enviar link" : "Salvar senha"}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
